from rest_framework import serializers

from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    text = serializers.CharField(source="body", required=False, allow_blank=True)
    image_url = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation",
            "sender",
            "sender_name",
            "text",
            "image_url",
            "is_read",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "conversation",
            "sender",
            "sender_name",
            "image_url",
            "is_read",
            "created_at",
        ]

    def get_sender_name(self, obj):
        if obj.sender:
            return (
                getattr(obj.sender, "get_full_name", lambda: "")()
                or getattr(obj.sender, "username", "")
                or getattr(obj.sender, "email", "")
            )
        return ""

    def get_image_url(self, obj):
        if not obj.attachment:
            return ""

        request = self.context.get("request")

        try:
            url = obj.attachment.url
            if request:
                return request.build_absolute_uri(url)
            return url
        except ValueError:
            return ""

    def get_is_read(self, obj):
        return obj.read_at is not None


class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    booking_title = serializers.CharField(
        source="booking.title",
        read_only=True,
    )

    customer = serializers.IntegerField(
        source="booking.client.user_id",
        read_only=True,
    )

    provider = serializers.SerializerMethodField()
    other_user_name = serializers.SerializerMethodField()
    other_user_photo = serializers.SerializerMethodField()
    service_title = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "booking",
            "booking_title",
            "customer",
            "provider",
            "other_user_name",
            "other_user_photo",
            "service_title",
            "last_message",
            "unread_count",
            "is_active",
            "created_at",
            "messages",
        ]

    def _current_user(self):
        request = self.context.get("request")
        return request.user if request else None

    def _other_user(self, obj):
        user = self._current_user()

        if not user:
            return None

        booking = obj.booking

        if booking.client and booking.client.user_id == user.id:
            if booking.freelancer:
                return booking.freelancer.user
            return None

        if booking.freelancer and booking.freelancer.user_id == user.id:
            return booking.client.user

        return None

    def get_provider(self, obj):
        if obj.booking.freelancer:
            return obj.booking.freelancer.user_id
        return None

    def get_other_user_name(self, obj):
        user = self._other_user(obj)

        if not user:
            return ""

        return (
            user.get_full_name()
            or user.username
            or user.email
            or ""
        )

    def get_other_user_photo(self, obj):
        user = self._other_user(obj)

        if not user:
            return ""

        profile = getattr(user, "client_profile", None)

        if profile is None:
            profile = getattr(user, "freelancer_profile", None)

        if profile is None:
            return ""

        photo = getattr(profile, "avatar", None)

        if not photo:
            return ""

        try:
            request = self.context.get("request")
            url = photo.url

            if request:
                return request.build_absolute_uri(url)

            return url
        except ValueError:
            return ""

    def get_service_title(self, obj):
        booking = obj.booking

        if booking.service:
            return getattr(booking.service, "title", "") or str(
                booking.service
            )

        return booking.title or ""

    def get_last_message(self, obj):
        message = (
            obj.messages
            .order_by("-created_at")
            .first()
        )

        if not message:
            return None

        return MessageSerializer(
            message,
            context=self.context,
        ).data

    def get_unread_count(self, obj):
        user = self._current_user()

        if not user:
            return 0

        return obj.messages.exclude(
            sender=user
        ).filter(
            read_at__isnull=True
        ).count()

    def get_is_active(self, obj):
        return obj.booking.status not in [
            "REJECTED",
            "CANCELLED",
            "EXPIRED",
            "COMPLETED",
            "REVIEWED",
        ]