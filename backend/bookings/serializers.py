from datetime import timedelta
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from .models import (
    BookingAttachment,
    CounterOffer,
    Deliverable,
    Milestone,
    ProjectBooking,
)


class BookingAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = BookingAttachment
        fields = "__all__"
        read_only_fields = ("booking", "uploaded_by", "uploaded_at", "original_name")


class CounterOfferSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True)

    class Meta:
        model = CounterOffer
        fields = "__all__"
        read_only_fields = ("booking", "created_by", "status", "created_at")


class MilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Milestone
        fields = "__all__"
        read_only_fields = ("booking",)


class DeliverableSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Deliverable
        fields = "__all__"
        read_only_fields = ("booking", "uploaded_by", "created_at")

    def get_file_url(self, obj):
        if not obj.file:
            return ""
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url


class ProjectBookingSerializer(serializers.ModelSerializer):
    attachments = BookingAttachmentSerializer(many=True, read_only=True)
    counter_offers = CounterOfferSerializer(many=True, read_only=True)
    milestones = MilestoneSerializer(many=True, read_only=True)
    deliverables = DeliverableSerializer(many=True, read_only=True)
    client_name = serializers.CharField(source="client.full_name", read_only=True)
    client_email = serializers.EmailField(source="client.user.email", read_only=True)
    freelancer_name = serializers.CharField(source="freelancer.user.username", read_only=True)
    service_title = serializers.CharField(source="service.title", read_only=True)
    can_review = serializers.SerializerMethodField()

    class Meta:
        model = ProjectBooking
        fields = "__all__"
        read_only_fields = (
            "client",
            "freelancer",
            "service",
            "category",
            "agreed_price",
            "status",
            "paid_at",
            "completed_at",
            "revisions_used",
            "created_at",
            "updated_at",
        )

    def get_can_review(self, obj):
        return obj.status == ProjectBooking.Status.COMPLETED and not hasattr(obj, "review")


class BookingCreateSerializer(serializers.ModelSerializer):
    service = serializers.PrimaryKeyRelatedField(
        queryset=ProjectBooking._meta.get_field("service").remote_field.model.objects.all()
    )

    class Meta:
        model = ProjectBooking
        fields = (
            "service",
            "booking_type",
            "service_mode",
            "title",
            "requirements",
            "description",
            "proposed_price",
            "deadline",
            "appointment_start",
            "appointment_end",
            "location_address",
            "location_city",
            "latitude",
            "longitude",
            "revision_limit",
        )
        extra_kwargs = {
            "title": {"required": False, "allow_blank": True},
            "proposed_price": {"required": False, "min_value": Decimal("0.01")},
            "revision_limit": {"min_value": 0, "max_value": 20},
        }

    def validate_service(self, service):
        from accounts.models import KYCVerification
        from catalog.models import Service

        if service.status != Service.Status.PUBLISHED or not service.is_active:
            raise serializers.ValidationError("This service is not available for booking.")
        if not KYCVerification.objects.filter(
            freelancer_id=service.freelancer_id,
            status=KYCVerification.Status.APPROVED,
        ).exists():
            raise serializers.ValidationError("This provider is not currently approved to accept bookings.")
        return service

    def validate(self, attrs):
        from catalog.models import Service

        service = attrs["service"]
        selected_mode = attrs.get("service_mode")
        deadline = attrs.get("deadline")
        if deadline and deadline <= timezone.now():
            raise serializers.ValidationError({"deadline": "Choose a future deadline."})
        if selected_mode == ProjectBooking.ServiceMode.LOCAL and service.service_mode not in (
            Service.Mode.LOCAL,
            Service.Mode.BOTH,
        ):
            raise serializers.ValidationError({"service_mode": "This service is not offered locally."})
        if selected_mode == ProjectBooking.ServiceMode.REMOTE and service.service_mode not in (
            Service.Mode.REMOTE,
            Service.Mode.BOTH,
        ):
            raise serializers.ValidationError({"service_mode": "This service is not offered remotely."})

        is_local = selected_mode == ProjectBooking.ServiceMode.LOCAL
        if is_local and not attrs.get("location_address") and not attrs.get("location_city"):
            raise serializers.ValidationError({"location_address": "A location is required for local services."})
        if is_local and not attrs.get("appointment_start"):
            raise serializers.ValidationError({"appointment_start": "Choose a preferred date and time."})

        if is_local:
            from catalog.models import Availability

            start = attrs["appointment_start"]
            end = attrs.get("appointment_end")
            if start <= timezone.now():
                raise serializers.ValidationError({"appointment_start": "Choose a future appointment time."})
            if end is None and service.duration_minutes:
                end = start + timedelta(minutes=service.duration_minutes)
                attrs["appointment_end"] = end
            if end is None:
                raise serializers.ValidationError({
                    "appointment_end": "Choose an end time or set a duration on this service."
                })
            if end <= start:
                raise serializers.ValidationError({"appointment_end": "End time must be after the start time."})

            local_start = timezone.localtime(start)
            local_end = timezone.localtime(end)
            if local_end.date() != local_start.date():
                raise serializers.ValidationError({
                    "appointment_end": "An appointment must end on the same local date it starts."
                })
            schedule = Availability.objects.filter(
                freelancer=service.freelancer,
                is_blocked=False,
                start_time__lte=local_start.time(),
                end_time__gte=local_end.time(),
            ).filter(
                Q(specific_date=local_start.date(), weekday__isnull=True)
                | Q(specific_date__isnull=True, weekday=local_start.weekday())
            )
            if not schedule.exists():
                raise serializers.ValidationError({
                    "appointment_start": "The selected time is outside the provider's published availability."
                })

            active_statuses = [
                ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
                ProjectBooking.Status.COUNTER_OFFER,
                ProjectBooking.Status.AGREEMENT,
                ProjectBooking.Status.PAYMENT_PENDING,
                ProjectBooking.Status.PAYMENT_FAILED,
                ProjectBooking.Status.CONFIRMED,
                ProjectBooking.Status.IN_PROGRESS,
                ProjectBooking.Status.DELIVERABLE_SENT,
                ProjectBooking.Status.REVISION_REQUESTED,
                ProjectBooking.Status.DISPUTED,
            ]
            overlap = ProjectBooking.objects.filter(
                freelancer=service.freelancer,
                status__in=active_statuses,
                appointment_start__lt=end,
            ).filter(
                Q(appointment_end__gt=start)
                | Q(appointment_end__isnull=True)
            )
            if overlap.exists():
                raise serializers.ValidationError({
                    "appointment_start": "This time overlaps an existing booking. Choose another time."
                })

        attrs["title"] = attrs.get("title") or service.title
        attrs["proposed_price"] = attrs.get("proposed_price") or service.starting_price
        attrs["booking_type"] = attrs.get("booking_type") or ProjectBooking.BookingType.FIXED_SERVICE
        attrs["revision_limit"] = attrs.get("revision_limit", 1)
        return attrs


class DecisionSerializer(serializers.Serializer):
    message = serializers.CharField(required=False, allow_blank=True, max_length=500)


class CounterCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    message = serializers.CharField(required=False, allow_blank=True)
    scope = serializers.CharField(required=False, allow_blank=True)
    deadline = serializers.DateTimeField(required=False, allow_null=True)
    revision_limit = serializers.IntegerField(required=False, min_value=0, max_value=20)
    additional_requirements = serializers.CharField(required=False, allow_blank=True)


    def validate_deadline(self, value):
        if value is not None and value <= timezone.now():
            raise serializers.ValidationError("Choose a future deadline.")
        return value


class RevisionSerializer(serializers.Serializer):
    message = serializers.CharField(min_length=1, max_length=4000)
