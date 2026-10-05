import base64
import hashlib
import hmac
import uuid
from decimal import Decimal, InvalidOperation

import requests
from django.conf import settings
from django.core import signing
from django.urls import reverse
from django.db import transaction
from django.utils import timezone

from bookings.models import ProjectBooking
from bookings.state_machine import transition
from notifications.services import notify

from .models import LedgerTransaction, Payment


def _signed_payload(total_amount, transaction_uuid, product_code):
    message = f"total_amount={total_amount},transaction_uuid={transaction_uuid},product_code={product_code}"
    digest = hmac.new(
        settings.ESEWA_SECRET_KEY.encode(), message.encode(), hashlib.sha256
    ).digest()
    return base64.b64encode(digest).decode()


@transaction.atomic
def create_payment(booking: ProjectBooking, payer) -> Payment:
    booking = ProjectBooking.objects.select_for_update().select_related("client__user").get(pk=booking.pk)
    if booking.client.user_id != payer.id:
        raise ValueError("Only the booking customer can pay.")
    if booking.status not in (
        ProjectBooking.Status.AGREEMENT,
        ProjectBooking.Status.PAYMENT_PENDING,
        ProjectBooking.Status.PAYMENT_FAILED,
    ):
        raise ValueError("Payment can only be created after an accepted agreement.")
    if not booking.agreed_price or booking.agreed_price <= 0:
        raise ValueError("A positive agreed price is required.")

    existing = booking.payments.order_by("-created_at").first()
    if existing and existing.status == Payment.Status.SUCCESS:
        raise ValueError("This booking is already paid.")
    if existing and existing.status in (Payment.Status.PENDING, Payment.Status.INITIATED):
        return existing

    transaction_uuid = str(uuid.uuid4())
    payment = Payment.objects.create(
        booking=booking,
        payer=payer,
        amount=booking.agreed_price,
        transaction_uuid=transaction_uuid,
        idempotency_key=f"booking-{booking.pk}-{transaction_uuid}",
        signature=_signed_payload(
            str(booking.agreed_price), transaction_uuid, settings.ESEWA_MERCHANT_CODE
        ),
        status=Payment.Status.PENDING,
    )

    if booking.status in (ProjectBooking.Status.AGREEMENT, ProjectBooking.Status.PAYMENT_FAILED):
        transition(booking, ProjectBooking.Status.PAYMENT_PENDING)
        booking.save(update_fields=["status", "updated_at"])
    return payment


def esewa_form_fields(payment: Payment):
    amount = payment.amount
    return {
        "amount": str(amount),
        "tax_amount": "0",
        "total_amount": str(amount),
        "transaction_uuid": payment.transaction_uuid,
        "product_code": settings.ESEWA_MERCHANT_CODE,
        "product_service_charge": "0",
        "product_delivery_charge": "0",
        "success_url": settings.ESEWA_SUCCESS_URL,
        "failure_url": settings.ESEWA_FAILURE_URL,
        "signed_field_names": "total_amount,transaction_uuid,product_code",
        "signature": payment.signature,
        "form_url": settings.ESEWA_FORM_URL,
    }


def signed_checkout_url(payment: Payment, request) -> str:
    token = signing.TimestampSigner(salt="payment-checkout").sign(str(payment.pk))
    checkout = request.build_absolute_uri(
        reverse("payment-checkout", kwargs={"payment_id": payment.pk})
    )
    return f"{checkout}?token={token}"


def _amount_matches(gateway_amount, expected):
    if gateway_amount in (None, ""):
        return False
    try:
        return Decimal(str(gateway_amount)) == Decimal(expected)
    except (InvalidOperation, TypeError):
        return False


def verify_esewa(payment: Payment) -> Payment:
    """Ask eSewa's server-to-server status API; client callback fields never prove payment."""
    if payment.status == Payment.Status.SUCCESS:
        return payment

    try:
        response = requests.get(
            settings.ESEWA_STATUS_URL,
            params={
                "product_code": settings.ESEWA_MERCHANT_CODE,
                "total_amount": str(payment.amount),
                "transaction_uuid": payment.transaction_uuid,
            },
            timeout=20,
        )
        response.raise_for_status()
        data = response.json() if response.content else {}
        if not isinstance(data, dict):
            data = {}
    except (requests.RequestException, ValueError) as exc:
        # A network failure is not a payment failure. Leave the transaction pending
        # so the customer can retry verification after the gateway is reachable.
        payment.raw_payload = {"verification_error": str(exc)}
        payment.save(update_fields=["raw_payload"])
        return payment

    payment.raw_payload = {"status_api": data}
    gateway_status = str(data.get("status", "")).strip().upper()
    returned_uuid = data.get("transaction_uuid") or data.get("transaction_id")
    returned_product = data.get("product_code")
    valid_identity = (
        str(returned_uuid or "") == payment.transaction_uuid
        and str(returned_product or "") == settings.ESEWA_MERCHANT_CODE
        and _amount_matches(data.get("total_amount"), payment.amount)
    )
    success = gateway_status == "COMPLETE" and valid_identity
    definite_failure = gateway_status in {"NOT_FOUND", "FAILED", "CANCELED", "CANCELLED"}

    with transaction.atomic():
        locked = Payment.objects.select_for_update().select_related("booking").get(pk=payment.pk)
        if locked.status == Payment.Status.SUCCESS:
            return locked
        locked.raw_payload = payment.raw_payload
        if success:
            if locked.amount != locked.booking.agreed_price:
                locked.status = Payment.Status.FAILED
                locked.save(update_fields=["status", "raw_payload"])
                _mark_booking_payment_failed(locked.booking)
                return locked
            mark_success(locked, str(data.get("ref_id") or ""))
        elif definite_failure:
            locked.status = Payment.Status.FAILED
            locked.save(update_fields=["status", "raw_payload"])
            _mark_booking_payment_failed(locked.booking)
        else:
            locked.save(update_fields=["raw_payload"])
        return locked


def _mark_booking_payment_failed(booking):
    if booking.status == ProjectBooking.Status.PAYMENT_PENDING:
        transition(booking, ProjectBooking.Status.PAYMENT_FAILED)
        booking.save(update_fields=["status", "updated_at"])
    notify(booking.client.user, "Payment failed", f"Payment for {booking.title} could not be confirmed. You can retry.", "PAYMENT_FAILED")


def mark_success(payment: Payment, gateway_ref: str = ""):
    if payment.status == Payment.Status.SUCCESS:
        return payment
    booking = ProjectBooking.objects.select_for_update().select_related(
        "client__user", "freelancer__user"
    ).get(pk=payment.booking_id)
    if payment.amount != booking.agreed_price:
        raise ValueError("Payment amount does not match the accepted booking amount.")

    payment.status = Payment.Status.SUCCESS
    payment.gateway_ref = gateway_ref or payment.gateway_ref
    payment.verified_at = timezone.now()
    payment.save(update_fields=["status", "gateway_ref", "verified_at", "raw_payload"])

    LedgerTransaction.objects.get_or_create(
        payment=payment,
        kind=LedgerTransaction.Kind.CHARGE,
        defaults={"booking": booking, "amount": payment.amount, "note": "Customer payment captured"},
    )
    LedgerTransaction.objects.get_or_create(
        payment=payment,
        kind=LedgerTransaction.Kind.ESCROW_HOLD,
        defaults={"booking": booking, "amount": payment.amount, "note": "Held until booking completion"},
    )

    if booking.status in (ProjectBooking.Status.PAYMENT_PENDING, ProjectBooking.Status.PAYMENT_FAILED):
        transition(booking, ProjectBooking.Status.CONFIRMED)
        booking.paid_at = timezone.now()
        booking.save(update_fields=["status", "paid_at", "updated_at"])

    from chats.models import Conversation
    Conversation.objects.get_or_create(booking=booking)
    notify(booking.client.user, "Payment confirmed", f"Payment for {booking.title} was verified.", "PAYMENT_SUCCESS")
    if booking.freelancer_id:
        notify(booking.freelancer.user, "Payment completed", f"{booking.title} is ready to start.", "PAYMENT_SUCCESS")
    return payment


def settle_booking(booking: ProjectBooking):
    payment = booking.payments.filter(status=Payment.Status.SUCCESS).first()
    if not payment or booking.transactions.filter(kind=LedgerTransaction.Kind.SETTLEMENT).exists():
        return
    LedgerTransaction.objects.create(
        payment=payment,
        booking=booking,
        kind=LedgerTransaction.Kind.SETTLEMENT,
        amount=payment.amount,
        note="Released to provider after customer completion",
    )
