"""Compatibility helpers built around the canonical ProjectBooking model."""

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import CounterOffer, ProjectBooking
from .state_machine import ALLOWED_TRANSITIONS, transition


PENDING_SET = {ProjectBooking.Status.PENDING_PROVIDER_RESPONSE}
PAYABLE_SET = {
    ProjectBooking.Status.AGREEMENT,
    ProjectBooking.Status.PAYMENT_PENDING,
    ProjectBooking.Status.PAYMENT_FAILED,
}
CONFIRMED_SET = {
    ProjectBooking.Status.CONFIRMED,
    ProjectBooking.Status.IN_PROGRESS,
    ProjectBooking.Status.DELIVERABLE_SENT,
    ProjectBooking.Status.REVISION_REQUESTED,
}


def normalize_status(value: str) -> str:
    """Translate status values written by the earlier prototype."""
    return {
        "COUNTER_OFFERED": ProjectBooking.Status.COUNTER_OFFER,
        "AGREEMENT_REACHED": ProjectBooking.Status.AGREEMENT,
        "DELIVERABLE_SUBMITTED": ProjectBooking.Status.DELIVERABLE_SENT,
        "CLIENT_REVIEWING": ProjectBooking.Status.DELIVERABLE_SENT,
    }.get(value, value)


def active_counter(booking: ProjectBooking):
    return booking.counter_offers.filter(status=CounterOffer.Status.ACTIVE).first()


def set_status(booking: ProjectBooking, new_status: str, extra_fields=None):
    new_status = normalize_status(new_status)
    transition(booking, new_status)
    fields = ["status", "updated_at"]
    if extra_fields:
        fields.extend(extra_fields)
    booking.save(update_fields=fields)
    return booking


@transaction.atomic
def lock_booking(booking_id: int) -> ProjectBooking:
    try:
        return ProjectBooking.objects.select_for_update().get(pk=booking_id)
    except ProjectBooking.DoesNotExist as exc:
        raise ValidationError("Project not found.") from exc
