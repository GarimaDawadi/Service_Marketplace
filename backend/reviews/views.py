from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Avg, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import IsAdminRole, IsOTPVerified
from bookings.models import ProjectBooking
from bookings.state_machine import transition
from notifications.services import notify

from .models import Dispute, Report, Review


class ReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="reviewer.username", read_only=True)
    provider = serializers.IntegerField(source="freelancer_id", read_only=True)
    service_title = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = "__all__"
        read_only_fields = (
            "reviewer",
            "freelancer",
            "is_visible",
            "moderated_by",
            "created_at",
            "updated_at",
        )

    def get_service_title(self, obj):
        return obj.booking.service.title if obj.booking.service_id else obj.booking.title

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Rating must be 1-5.")
        return value


class DisputeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dispute
        fields = "__all__"
        read_only_fields = (
            "opened_by",
            "status",
            "resolution",
            "created_at",
            "resolved_at",
        )


class DisputeResolveSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=(Dispute.Status.UNDER_REVIEW, Dispute.Status.RESOLVED, Dispute.Status.REJECTED),
        required=False,
        default=Dispute.Status.RESOLVED,
    )
    resolution = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    booking_status = serializers.ChoiceField(
        choices=ProjectBooking.Status.choices,
        required=False,
    )

    def validate(self, attrs):
        if attrs["status"] in (Dispute.Status.RESOLVED, Dispute.Status.REJECTED) and not attrs.get("resolution", "").strip():
            raise serializers.ValidationError({"resolution": "Provide a resolution for a final decision."})
        return attrs


class ReviewModerationSerializer(serializers.Serializer):
    is_visible = serializers.BooleanField(required=True)


class ReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = "__all__"
        read_only_fields = (
            "reporter",
            "is_resolved",
            "created_at",
        )


def recalc_freelancer_rating(freelancer):
    agg = freelancer.reviews.filter(is_visible=True).aggregate(
        avg=Avg("rating"),
        count=Count("id"),
    )

    freelancer.rating_average = agg["avg"] or 0
    freelancer.rating_count = agg["count"] or 0

    freelancer.save(
        update_fields=["rating_average", "rating_count"]
    )


class ReviewViewSet(viewsets.ModelViewSet):
    serializer_class = ReviewSerializer
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]
    filterset_fields = [
        "freelancer",
        "rating",
        "is_visible",
    ]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        if self.action == "moderate":
            return [IsAdminRole()]
        return [permissions.IsAuthenticated(), IsOTPVerified()]

    def get_queryset(self):
        qs = Review.objects.select_related(
            "booking__service",
            "freelancer",
            "reviewer",
        )
        user = self.request.user
        if user.is_authenticated and (user.role == User.Role.ADMIN or user.is_staff):
            return qs
        if self.action in ("update", "partial_update", "destroy"):
            return qs.filter(reviewer=user)
        return qs.filter(is_visible=True)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        if request.user.role != User.Role.CLIENT:
            return Response({"detail": "Only customers can submit reviews."}, status=403)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submitted_booking = serializer.validated_data["booking"]
        booking = get_object_or_404(
            ProjectBooking.objects.select_for_update().select_related(
                "client",
                "freelancer",
            ),
            pk=submitted_booking.pk,
        )

        if booking.client.user_id != request.user.id:
            return Response(
                {"detail": "Only the client can review."},
                status=403,
            )

        if booking.status != ProjectBooking.Status.COMPLETED:
            return Response(
                {"detail": "Only completed projects can be reviewed."},
                status=400,
            )

        if hasattr(booking, "review"):
            return Response(
                {"detail": "Review already exists."},
                status=400,
            )

        if not booking.freelancer:
            return Response(
                {"detail": "No freelancer on this booking."},
                status=400,
            )

        review = serializer.save(
            reviewer=request.user,
            freelancer=booking.freelancer,
        )

        transition(
            booking,
            ProjectBooking.Status.REVIEWED,
        )

        booking.save(
            update_fields=["status"]
        )

        recalc_freelancer_rating(
            booking.freelancer
        )
        notify(booking.freelancer.user, "New customer review", f"You received a {review.rating}-star review.", "NEW_REVIEW")

        return Response(
            ReviewSerializer(review).data,
            status=201,
        )

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAdminRole],
    )
    def moderate(self, request, pk=None):
        review = self.get_object()
        serializer = ReviewModerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        review.is_visible = serializer.validated_data["is_visible"]
        review.moderated_by = request.user

        review.save(
            update_fields=[
                "is_visible",
                "moderated_by",
            ]
        )

        recalc_freelancer_rating(
            review.freelancer
        )

        return Response(
            ReviewSerializer(review).data
        )


class DisputeViewSet(viewsets.ModelViewSet):
    serializer_class = DisputeSerializer
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_queryset(self):
        qs = Dispute.objects.select_related(
            "booking",
            "opened_by",
        )

        user = self.request.user

        if (
            user.role == User.Role.ADMIN
            or user.is_staff
        ):
            return qs

        return (
            qs.filter(opened_by=user)
            | qs.filter(booking__client__user=user)
            | qs.filter(
                booking__freelancer__user=user
            )
        )

    @transaction.atomic
    def perform_create(self, serializer):
        submitted_booking = serializer.validated_data["booking"]
        booking = ProjectBooking.objects.select_for_update().select_related(
            "client__user", "freelancer__user"
        ).get(pk=submitted_booking.pk)
        user = self.request.user
        if not (
            booking.client.user_id == user.id
            or (booking.freelancer_id and booking.freelancer.user_id == user.id)
            or user.role == User.Role.ADMIN
            or user.is_staff
        ):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only booking participants can open a dispute.")

        allowed_statuses = {
            ProjectBooking.Status.CONFIRMED,
            ProjectBooking.Status.IN_PROGRESS,
            ProjectBooking.Status.DELIVERABLE_SENT,
            ProjectBooking.Status.REVISION_REQUESTED,
            ProjectBooking.Status.COMPLETED,
        }
        if booking.status not in allowed_statuses:
            raise DRFValidationError({"booking": "A dispute can only be opened for an active or completed booking."})
        if booking.disputes.filter(status__in=[Dispute.Status.OPEN, Dispute.Status.UNDER_REVIEW]).exists():
            raise DRFValidationError({"booking": "This booking already has an open dispute."})

        try:
            transition(booking, ProjectBooking.Status.DISPUTED)
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, "messages") else str(exc)
            raise DRFValidationError({"booking": message}) from exc
        booking.save(update_fields=["status", "updated_at"])
        dispute = serializer.save(opened_by=user)
        participants = [booking.client.user]
        if booking.freelancer_id:
            participants.append(booking.freelancer.user)
        for participant in participants:
            if participant.pk != user.pk:
                notify(participant, "Booking dispute opened", f"A dispute was opened for {booking.title}.", "DISPUTE_OPENED")

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[IsAdminRole],
    )
    def resolve(self, request, pk=None):
        dispute = self.get_object()
        if dispute.status in (Dispute.Status.RESOLVED, Dispute.Status.REJECTED):
            return Response({"detail": "This dispute has already been closed."}, status=409)

        serializer = DisputeResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision = serializer.validated_data
        next_booking_status = decision.get("booking_status")

        with transaction.atomic():
            if next_booking_status:
                booking = ProjectBooking.objects.select_for_update().get(pk=dispute.booking_id)
                try:
                    transition(booking, next_booking_status)
                except DjangoValidationError as exc:
                    message = exc.messages[0] if hasattr(exc, "messages") else str(exc)
                    raise DRFValidationError({"booking_status": message}) from exc
                booking.save(update_fields=["status", "updated_at"])

            dispute.status = decision["status"]
            dispute.resolution = decision.get("resolution", "").strip()
            dispute.resolved_at = timezone.now() if dispute.status in (Dispute.Status.RESOLVED, Dispute.Status.REJECTED) else None
            dispute.save(update_fields=["status", "resolution", "resolved_at"])

        booking = dispute.booking
        participants = [booking.client.user]
        if booking.freelancer_id:
            participants.append(booking.freelancer.user)
        for participant in participants:
            notify(participant, "Booking dispute updated", f"An administrator updated the dispute for {booking.title}.", "DISPUTE_RESOLVED")
        return Response(DisputeSerializer(dispute).data)


class ReportViewSet(viewsets.ModelViewSet):
    serializer_class = ReportSerializer
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_queryset(self):
        qs = Report.objects.all()

        if (
            self.request.user.role == User.Role.ADMIN
            or self.request.user.is_staff
        ):
            return qs

        return qs.filter(
            reporter=self.request.user
        )

    def perform_create(self, serializer):
        serializer.save(
            reporter=self.request.user
        )