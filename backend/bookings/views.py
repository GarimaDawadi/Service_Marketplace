from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import ClientProfile, User
from accounts.permissions import IsClient, IsOTPVerified
from catalog.models import Service
from chats.models import Conversation
from notifications.services import notify

from .models import (
    BookingAttachment,
    CounterOffer,
    Deliverable,
    Milestone,
    ProjectBooking,
    RevisionRequest,
)
from .serializers import (
    BookingAttachmentSerializer,
    BookingCreateSerializer,
    CounterCreateSerializer,
    DecisionSerializer,
    DeliverableSerializer,
    MilestoneSerializer,
    ProjectBookingSerializer,
    RevisionSerializer,
)
from .state_machine import LOCKED_AFTER_PAYMENT, transition


def _is_client(user, booking):
    return bool(booking.client_id and booking.client.user_id == user.id)


def _is_freelancer(user, booking):
    return bool(booking.freelancer_id and booking.freelancer.user_id == user.id)


def _ensure_conversation(booking):
    if booking.freelancer_id:
        Conversation.objects.get_or_create(booking=booking)


def _booking_data(booking, request):
    return ProjectBookingSerializer(booking, context={"request": request}).data


def _conflict(message):
    return Response({"detail": message}, status=status.HTTP_409_CONFLICT)


class ProjectBookingViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectBookingSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["status", "booking_type", "service_mode", "category"]
    search_fields = ["title", "requirements", "description"]

    def get_queryset(self):
        qs = (
            ProjectBooking.objects.select_related(
                "client__user", "freelancer__user", "service", "category"
            ).prefetch_related(
                "attachments", "counter_offers", "milestones", "deliverables", "revision_requests"
            )
        )
        user = self.request.user
        if user.role == User.Role.ADMIN or user.is_staff:
            return qs
        if user.role == User.Role.CLIENT:
            return qs.filter(client__user=user)
        if user.role == User.Role.FREELANCER:
            return qs.filter(freelancer__user=user)
        return qs.none()

    def get_permissions(self):
        permissions_list = [permissions.IsAuthenticated(), IsOTPVerified()]
        if self.action == "create":
            permissions_list.append(IsClient())
        return permissions_list

    def get_serializer_class(self):
        if self.action == "create":
            return BookingCreateSerializer
        return ProjectBookingSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        service = serializer.validated_data["service"]
        if service.status != Service.Status.PUBLISHED or not service.is_active:
            from rest_framework.exceptions import ValidationError as DRFValidationError
            raise DRFValidationError({"service": "This service is not available for booking."})

        client, _ = ClientProfile.objects.get_or_create(user=self.request.user)
        booking = serializer.save(
            client=client,
            freelancer=service.freelancer,
            category=service.category,
            status=ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
        )
        _ensure_conversation(booking)
        notify(
            service.freelancer.user,
            "New booking request",
            f"{booking.title} is waiting for your response.",
            "BOOKING_REQUESTED",
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(
            _booking_data(serializer.instance, request),
            status=status.HTTP_201_CREATED,
        )

    def _lock_booking(self, booking):
        return ProjectBooking.objects.select_for_update().select_related(
            "client__user", "freelancer__user", "service", "category"
        ).get(pk=booking.pk)

    def _transition(self, booking, new_status, update_fields=None):
        try:
            transition(booking, new_status)
        except ValidationError as exc:
            message = exc.messages[0] if hasattr(exc, "messages") else str(exc)
            return _conflict(message)
        fields = set(update_fields or [])
        fields.update(("status", "updated_at"))
        booking.save(update_fields=list(fields))
        return Response(_booking_data(booking, self.request))

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def accept(self, request, pk=None):
        booking = self._lock_booking(self.get_object())
        if booking.status == ProjectBooking.Status.PENDING_PROVIDER_RESPONSE:
            if not _is_freelancer(request.user, booking):
                return Response({"detail": "Only the assigned provider can accept."}, status=403)
            booking.agreed_price = booking.proposed_price
            _ensure_conversation(booking)
            response = self._transition(
                booking, ProjectBooking.Status.AGREEMENT, update_fields=["agreed_price"]
            )
            if response.status_code < 300:
                notify(booking.client.user, "Provider accepted", f"Your request for {booking.title} was accepted.", "BOOKING_ACCEPTED")
            return response

        if booking.status == ProjectBooking.Status.COUNTER_OFFER:
            if not _is_client(request.user, booking):
                return Response({"detail": "Only the customer can accept a counter-offer."}, status=403)
            active = booking.counter_offers.filter(status=CounterOffer.Status.ACTIVE).first()
            if not active:
                return _conflict("No active counter-offer is available.")
            with transaction.atomic():
                active.status = CounterOffer.Status.ACCEPTED
                active.save(update_fields=["status"])
                booking.agreed_price = active.amount
                if active.revision_limit is not None:
                    booking.revision_limit = active.revision_limit
                if active.deadline:
                    booking.deadline = active.deadline
                fields = ["agreed_price"]
                if active.revision_limit is not None:
                    fields.append("revision_limit")
                if active.deadline:
                    fields.append("deadline")
                try:
                    transition(booking, ProjectBooking.Status.AGREEMENT)
                except ValidationError as exc:
                    return _conflict(exc.messages[0])
                fields.extend(["status", "updated_at"])
                booking.save(update_fields=fields)
            notify(booking.freelancer.user, "Counter-offer accepted", f"The customer accepted your offer for {booking.title}.", "COUNTER_OFFER_ACCEPTED")
            return Response(_booking_data(booking, request))

        return _conflict("There is no booking offer to accept in this state.")

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def reject(self, request, pk=None):
        booking = self._lock_booking(self.get_object())
        serializer = DecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.validated_data.get("message", "")

        if booking.status == ProjectBooking.Status.PENDING_PROVIDER_RESPONSE:
            if not _is_freelancer(request.user, booking):
                return Response({"detail": "Only the assigned provider can reject."}, status=403)
            booking.rejection_reason = message
            response = self._transition(
                booking, ProjectBooking.Status.REJECTED, update_fields=["rejection_reason"]
            )
            if response.status_code < 300:
                notify(booking.client.user, "Provider rejected request", message or f"Your request for {booking.title} was declined.", "BOOKING_REJECTED")
            return response

        if booking.status == ProjectBooking.Status.COUNTER_OFFER:
            if not _is_client(request.user, booking):
                return Response({"detail": "Only the customer can reject a counter-offer."}, status=403)
            booking.counter_offers.filter(status=CounterOffer.Status.ACTIVE).update(
                status=CounterOffer.Status.REJECTED
            )
            response = self._transition(booking, ProjectBooking.Status.REJECTED)
            if response.status_code < 300:
                notify(booking.freelancer.user, "Counter-offer rejected", f"The customer declined the offer for {booking.title}.", "COUNTER_OFFER_REJECTED")
            return response

        return _conflict("This booking cannot be rejected in its current state.")

    @action(detail=True, methods=["post"], url_path="counter-offer")
    @transaction.atomic
    def counter_offer(self, request, pk=None):
        booking = self._lock_booking(self.get_object())
        if booking.status not in (
            ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
            ProjectBooking.Status.COUNTER_OFFER,
        ):
            return _conflict("Counter-offers are closed for this booking.")
        if not _is_freelancer(request.user, booking):
            return Response({"detail": "Only the assigned provider can make a counter-offer."}, status=403)

        serializer = CounterCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            booking.counter_offers.filter(status=CounterOffer.Status.ACTIVE).update(
                status=CounterOffer.Status.SUPERSEDED
            )
            CounterOffer.objects.create(
                booking=booking,
                created_by=request.user,
                amount=data["amount"],
                message=data.get("message", ""),
                scope=data.get("scope", ""),
                deadline=data.get("deadline"),
                revision_limit=data.get("revision_limit"),
                additional_requirements=data.get("additional_requirements", ""),
            )
            if booking.status == ProjectBooking.Status.PENDING_PROVIDER_RESPONSE:
                transition(booking, ProjectBooking.Status.COUNTER_OFFER)
                booking.save(update_fields=["status", "updated_at"])
        notify(booking.client.user, "Provider made a counter-offer", f"Review the new offer for {booking.title}.", "COUNTER_OFFER")
        return Response(_booking_data(booking, request))

    @action(detail=True, methods=["post"])
    def start_payment(self, request, pk=None):
        """Create a real payment transaction; this endpoint never confirms a booking."""
        booking = self.get_object()
        if not _is_client(request.user, booking):
            return Response({"detail": "Only the customer can pay for this booking."}, status=403)
        if booking.status not in (ProjectBooking.Status.AGREEMENT, ProjectBooking.Status.PAYMENT_FAILED):
            return _conflict("An accepted agreement is required before payment.")
        from payments.services import create_payment, signed_checkout_url
        from payments.views import PaymentSerializer, gateway_checkout_fields
        try:
            payment = create_payment(booking, request.user)
        except ValueError as exc:
            return _conflict(str(exc))
        return Response({
            "payment": PaymentSerializer(payment).data,
            "esewa": gateway_checkout_fields(payment, request),
            "checkout_url": signed_checkout_url(payment, request),
        })

    @action(detail=True, methods=["post"], url_path="start-work")
    @transaction.atomic
    def start_work(self, request, pk=None):
        booking = self._lock_booking(self.get_object())
        if not _is_freelancer(request.user, booking):
            return Response({"detail": "Only the assigned provider can start work."}, status=403)
        if booking.status != ProjectBooking.Status.CONFIRMED:
            return _conflict("The booking must have a verified payment before work starts.")
        response = self._transition(booking, ProjectBooking.Status.IN_PROGRESS)
        if response.status_code < 300:
            notify(booking.client.user, "Provider started work", f"Work has started on {booking.title}.", "WORK_STARTED")
        return response

    @action(detail=True, methods=["post"], url_path="deliver")
    @transaction.atomic
    def submit_deliverable(self, request, pk=None):
        booking = self._lock_booking(self.get_object())
        if not _is_freelancer(request.user, booking):
            return Response({"detail": "Only the assigned provider can submit work."}, status=403)
        if booking.status not in (ProjectBooking.Status.IN_PROGRESS, ProjectBooking.Status.REVISION_REQUESTED):
            return _conflict("Work can only be delivered while in progress or after a revision request.")

        serializer = DeliverableSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if not any(data.get(field) for field in ("title", "note", "description", "link_url", "file")):
            return Response({"detail": "Provide a deliverable title, note, file, or link."}, status=400)

        with transaction.atomic():
            serializer.save(booking=booking, uploaded_by=request.user)
            if booking.status == ProjectBooking.Status.REVISION_REQUESTED:
                transition(booking, ProjectBooking.Status.IN_PROGRESS)
            transition(booking, ProjectBooking.Status.DELIVERABLE_SENT)
            booking.save(update_fields=["status", "updated_at"])
        notify(booking.client.user, "Work delivered", f"Your provider submitted work for {booking.title}.", "DELIVERABLE_RECEIVED")
        return Response(_booking_data(booking, request))

    def _complete_booking(self, booking, request):
        if not _is_client(request.user, booking):
            return Response({"detail": "Only the customer can accept the delivered work."}, status=403)
        if booking.status != ProjectBooking.Status.DELIVERABLE_SENT:
            return _conflict("A submitted deliverable is required before completing the booking.")
        with transaction.atomic():
            try:
                transition(booking, ProjectBooking.Status.COMPLETED)
            except ValidationError as exc:
                return _conflict(exc.messages[0])
            booking.completed_at = timezone.now()
            booking.save(update_fields=["status", "completed_at", "updated_at"])
            if booking.freelancer_id:
                booking.freelancer.completed_jobs += 1
                booking.freelancer.save(update_fields=["completed_jobs"])
            from payments.services import settle_booking
            settle_booking(booking)
        notify(booking.freelancer.user, "Booking completed", f"The customer accepted the work for {booking.title}.", "BOOKING_COMPLETED")
        notify(booking.client.user, "Booking completed", f"You completed {booking.title}. You can now leave a review.", "BOOKING_COMPLETED")
        return Response(_booking_data(booking, request))

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def complete(self, request, pk=None):
        return self._complete_booking(self._lock_booking(self.get_object()), request)

    @action(detail=True, methods=["post"], url_path="approve")
    @transaction.atomic
    def approve(self, request, pk=None):
        """Backward-compatible route; same guarded completion action."""
        return self._complete_booking(self._lock_booking(self.get_object()), request)

    @action(detail=True, methods=["post"], url_path="revision")
    @transaction.atomic
    def request_revision(self, request, pk=None):
        booking = self._lock_booking(self.get_object())
        if not _is_client(request.user, booking):
            return Response({"detail": "Only the customer can request a revision."}, status=403)
        serializer = RevisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if booking.status != ProjectBooking.Status.DELIVERABLE_SENT:
            return _conflict("A delivered work item is required before requesting a revision.")
        if booking.revisions_used >= booking.revision_limit:
            return _conflict("The revision limit has been reached.")
        with transaction.atomic():
            RevisionRequest.objects.create(
                booking=booking,
                requested_by=request.user,
                message=serializer.validated_data["message"],
            )
            booking.revisions_used += 1
            transition(booking, ProjectBooking.Status.REVISION_REQUESTED)
            booking.save(update_fields=["status", "revisions_used", "updated_at"])
        notify(booking.freelancer.user, "Revision requested", f"The customer requested a revision for {booking.title}.", "REVISION_REQUESTED")
        return Response(_booking_data(booking, request))

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def cancel(self, request, pk=None):
        booking = self._lock_booking(self.get_object())
        if not (_is_client(request.user, booking) or _is_freelancer(request.user, booking) or request.user.is_staff):
            return Response({"detail": "You are not a participant in this booking."}, status=403)
        if booking.status in LOCKED_AFTER_PAYMENT:
            return _conflict("Paid bookings must use the dispute/refund workflow and cannot be cancelled here.")
        return self._transition(booking, ProjectBooking.Status.CANCELLED)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def expire(self, request, pk=None):
        if request.user.role != User.Role.ADMIN and not request.user.is_staff:
            return Response({"detail": "Admin access is required."}, status=403)
        return self._transition(self._lock_booking(self.get_object()), ProjectBooking.Status.EXPIRED)


class AttachmentViewSet(viewsets.ModelViewSet):
    serializer_class = BookingAttachmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = BookingAttachment.objects.select_related("booking", "uploaded_by")
        user = self.request.user
        if user.role == User.Role.ADMIN or user.is_staff:
            return qs
        return qs.filter(booking__client__user=user) | qs.filter(booking__freelancer__user=user)

    def perform_create(self, serializer):
        booking = get_object_or_404(ProjectBooking, pk=self.request.data.get("booking"))
        if not (_is_client(self.request.user, booking) or _is_freelancer(self.request.user, booking)):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only booking participants can attach files.")
        serializer.save(
            booking=booking,
            uploaded_by=self.request.user,
            original_name=getattr(self.request.FILES.get("file"), "name", ""),
        )


class MilestoneViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MilestoneSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]

    def get_queryset(self):
        qs = Milestone.objects.select_related("booking")
        user = self.request.user
        if user.role == User.Role.ADMIN or user.is_staff:
            return qs
        return qs.filter(booking__client__user=user) | qs.filter(booking__freelancer__user=user)
