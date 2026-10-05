from django.core import signing
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils.html import escape
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsOTPVerified
from bookings.models import ProjectBooking

from .models import LedgerTransaction, Payment
from .services import create_payment, esewa_form_fields, signed_checkout_url, verify_esewa


class PaymentCallbackThrottle(ScopedRateThrottle):
    scope_attr = "payment_callback_scope"


class PaymentInitiationSerializer(serializers.Serializer):
    booking = serializers.PrimaryKeyRelatedField(queryset=ProjectBooking.objects.all())


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = (
            "id",
            "booking",
            "payer",
            "amount",
            "gateway",
            "status",
            "transaction_uuid",
            "gateway_ref",
            "created_at",
            "verified_at",
        )
        read_only_fields = fields


class LedgerSerializer(serializers.ModelSerializer):
    class Meta:
        model = LedgerTransaction
        fields = "__all__"
        read_only_fields = fields


def _gateway_return_url(configured_url, request, transaction_uuid):
    base = configured_url.strip() or request.build_absolute_uri(reverse("payment-return"))
    parts = urlsplit(base)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["transaction_uuid"] = transaction_uuid
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def gateway_checkout_fields(payment, request):
    fields = esewa_form_fields(payment)
    fields["success_url"] = _gateway_return_url(fields["success_url"], request, payment.transaction_uuid)
    fields["failure_url"] = _gateway_return_url(fields["failure_url"], request, payment.transaction_uuid)
    return fields


class PaymentCheckoutView(APIView):
    """Short-lived signed web handoff used to POST the signed checkout to eSewa."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "payment_checkout"

    def get(self, request, payment_id):
        token = request.query_params.get("token", "")
        try:
            signed_id = signing.TimestampSigner(salt="payment-checkout").unsign(token, max_age=15 * 60)
        except signing.BadSignature:
            return Response({"detail": "Checkout link is invalid or expired."}, status=status.HTTP_403_FORBIDDEN)
        if signed_id != str(payment_id):
            return Response({"detail": "Checkout link is invalid."}, status=status.HTTP_403_FORBIDDEN)

        payment = get_object_or_404(Payment.objects.select_related("booking"), pk=payment_id)
        if payment.status not in (Payment.Status.PENDING, Payment.Status.INITIATED):
            return Response({"detail": "This payment is no longer pending."}, status=status.HTTP_409_CONFLICT)

        fields = gateway_checkout_fields(payment, request)
        inputs = "".join(
            f'<input type="hidden" name="{escape(str(key))}" value="{escape(str(value))}">'
            for key, value in fields.items()
            if key not in ("form_url", "checkout_url")
        )
        html = (
            "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            "<title>Secure payment</title></head><body style=\"font:16px sans-serif;text-align:center;padding:2rem\">"
            "<p>Connecting to eSewa securely…</p>"
            f'<form id="payment" method="post" action="{escape(fields["form_url"])}">{inputs}'
            '<button type="submit">Continue to eSewa</button></form>'
            '<script>document.getElementById("payment").submit();</script></body></html>'
        )
        return HttpResponse(html)


class PaymentReturnView(APIView):
    """Verify the gateway result on the server, then return the user to the app."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "payment_return"

    def get(self, request):
        transaction_uuid = request.query_params.get("transaction_uuid", "")
        payment = get_object_or_404(
            Payment.objects.select_related("booking"), transaction_uuid=transaction_uuid
        )
        payment = verify_esewa(payment)
        destination = (
            "service-marketplace:///payment-return"
            f"?bookingId={payment.booking_id}&paymentId={payment.pk}&status={payment.status}"
        )
        response = HttpResponse(status=302)
        response["Location"] = destination
        return response


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    payment_callback_scope = "payment_callback"
    filterset_fields = ["booking"]

    def get_queryset(self):
        qs = Payment.objects.select_related("booking", "payer", "booking__freelancer__user")
        user = self.request.user
        if user.role == User.Role.ADMIN or user.is_staff:
            return qs
        return qs.filter(payer=user) | qs.filter(booking__freelancer__user=user)

    @action(detail=False, methods=["post"])
    def initiate(self, request):
        serializer = PaymentInitiationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = serializer.validated_data["booking"]
        if booking.client.user_id != request.user.id:
            return Response({"detail": "Only the booking customer can pay."}, status=403)
        try:
            payment = create_payment(booking, request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        checkout_url = signed_checkout_url(payment, request)
        return Response({
            "payment": PaymentSerializer(payment).data,
            "esewa": gateway_checkout_fields(payment, request),
            "checkout_url": checkout_url,
        })

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        payment = self.get_object()
        payment = verify_esewa(payment)
        return Response(PaymentSerializer(payment).data)

    @action(
        detail=False,
        methods=["post"],
        permission_classes=[permissions.AllowAny],
        throttle_classes=[PaymentCallbackThrottle],
    )
    def callback(self, request):
        """Public gateway callback; the server still verifies with eSewa before success."""
        txn = request.data.get("transaction_uuid") or request.query_params.get("transaction_uuid")
        payment = get_object_or_404(Payment, transaction_uuid=txn)
        payment = verify_esewa(payment)
        return Response({"payment_id": payment.pk, "booking_id": payment.booking_id, "status": payment.status})


class LedgerViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LedgerSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]

    def get_queryset(self):
        qs = LedgerTransaction.objects.select_related("payment", "booking")
        user = self.request.user
        if user.role == User.Role.ADMIN or user.is_staff:
            return qs
        return qs.filter(booking__client__user=user) | qs.filter(booking__freelancer__user=user)
