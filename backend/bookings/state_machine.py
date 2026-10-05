from django.core.exceptions import ValidationError

from .models import ProjectBooking as Booking


ALLOWED_TRANSITIONS = {
    Booking.Status.DRAFT: {Booking.Status.PENDING_PROVIDER_RESPONSE, Booking.Status.CANCELLED},
    Booking.Status.PENDING_PROVIDER_RESPONSE: {
        Booking.Status.COUNTER_OFFER,
        Booking.Status.AGREEMENT,
        Booking.Status.REJECTED,
        Booking.Status.EXPIRED,
        Booking.Status.CANCELLED,
    },
    Booking.Status.COUNTER_OFFER: {
        Booking.Status.AGREEMENT,
        Booking.Status.COUNTER_OFFER,
        Booking.Status.REJECTED,
        Booking.Status.CANCELLED,
    },
    Booking.Status.AGREEMENT: {Booking.Status.PAYMENT_PENDING, Booking.Status.CANCELLED},
    Booking.Status.PAYMENT_PENDING: {
        Booking.Status.CONFIRMED,
        Booking.Status.PAYMENT_FAILED,
        Booking.Status.CANCELLED,
    },
    Booking.Status.PAYMENT_FAILED: {Booking.Status.PAYMENT_PENDING, Booking.Status.CANCELLED},
    Booking.Status.CONFIRMED: {
        Booking.Status.IN_PROGRESS,
        Booking.Status.CANCELLED,
        Booking.Status.DISPUTED,
    },
    Booking.Status.IN_PROGRESS: {
        Booking.Status.DELIVERABLE_SENT,
        Booking.Status.DISPUTED,
        Booking.Status.CANCELLED,
    },
    Booking.Status.DELIVERABLE_SENT: {
        Booking.Status.REVISION_REQUESTED,
        Booking.Status.COMPLETED,
        Booking.Status.DISPUTED,
    },
    Booking.Status.REVISION_REQUESTED: {
        Booking.Status.IN_PROGRESS,
        Booking.Status.DISPUTED,
    },
    Booking.Status.COMPLETED: {Booking.Status.REVIEWED, Booking.Status.DISPUTED},
    Booking.Status.REVIEWED: set(),
    Booking.Status.REJECTED: set(),
    Booking.Status.CANCELLED: set(),
    Booking.Status.EXPIRED: set(),
    Booking.Status.DISPUTED: {
        Booking.Status.IN_PROGRESS,
        Booking.Status.COMPLETED,
        Booking.Status.CANCELLED,
    },
}

LOCKED_AFTER_PAYMENT = {
    Booking.Status.CONFIRMED,
    Booking.Status.IN_PROGRESS,
    Booking.Status.DELIVERABLE_SENT,
    Booking.Status.REVISION_REQUESTED,
    Booking.Status.COMPLETED,
    Booking.Status.REVIEWED,
    Booking.Status.DISPUTED,
}


def transition(booking, new_status):
    allowed = ALLOWED_TRANSITIONS.get(booking.status, set())
    if new_status not in allowed:
        raise ValidationError(f"Cannot move from {booking.status} to {new_status}.")
    booking.status = new_status
    return booking
