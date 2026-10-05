from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import IsOTPVerified
from notifications.services import notify

from .models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer


CLOSED_STATUSES = {
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
}


def _participant_qs(user):
    qs = Conversation.objects.select_related(
        "booking",
        "booking__client__user",
        "booking__freelancer__user",
        "booking__service",
    )

    return qs.filter(
        booking__client__user=user
    ) | qs.filter(
        booking__freelancer__user=user
    )


def _is_participant(user, conversation):
    booking = conversation.booking

    if booking.client and booking.client.user_id == user.id:
        return True

    if booking.freelancer and booking.freelancer.user_id == user.id:
        return True

    return False


class ConversationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ConversationSerializer

    permission_classes = [
        permissions.IsAuthenticated,
        IsOTPVerified,
    ]

    def get_queryset(self):
        return (
            _participant_qs(self.request.user)
            .prefetch_related("messages")
            .order_by("-created_at")
        )

    @action(
        detail=False,
        methods=["get"],
        url_path=r"booking/(?P<booking_id>\d+)",
    )
    def booking(self, request, booking_id=None):
        """
        Get the conversation for a specific booking.
        Creates it if the booking already has a freelancer.
        """

        queryset = _participant_qs(request.user)

        conversation = queryset.filter(
            booking_id=booking_id
        ).first()

        if not conversation:
            return Response(
                {
                    "detail": "Chat conversation not found."
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(conversation)

        return Response(serializer.data)

    @action(
        detail=True,
        methods=["get"],
        url_path="messages",
    )
    def messages(self, request, pk=None):
        """
        Return all messages in a conversation.
        """

        conversation = self.get_object()

        messages = (
            Message.objects
            .filter(conversation=conversation)
            .select_related("sender")
            .order_by("created_at")
        )

        serializer = MessageSerializer(
            messages,
            many=True,
            context={"request": request},
        )

        return Response(serializer.data)

    @action(
        detail=True,
        methods=["post"],
        url_path="send",
    )
    def send(self, request, pk=None):
        """
        Send a message to the conversation.
        """

        conversation = self.get_object()
        booking = conversation.booking

        if booking.status in CLOSED_STATUSES:
            return Response(
                {
                    "detail": "Chat is closed for this project."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        text = request.data.get("text")

        if text is None:
            text = request.data.get("body", "")

        text = str(text).strip()

        attachment = request.FILES.get("attachment")

        if not text and not attachment:
            return Response(
                {
                    "detail": "Message cannot be empty."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        message = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            body=text,
            attachment=attachment,
        )
        recipient = None
        if booking.client.user_id == request.user.id and booking.freelancer_id:
            recipient = booking.freelancer.user
        elif booking.freelancer_id and booking.freelancer.user_id == request.user.id:
            recipient = booking.client.user
        notify(recipient, "New booking message", f"You received a new message about {booking.title}.", "MESSAGE_RECEIVED")

        serializer = MessageSerializer(
            message,
            context={"request": request},
        )

        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="mark-read",
    )
    def mark_read(self, request, pk=None):
        """
        Mark all messages from the other participant as read.
        """

        conversation = self.get_object()

        updated = (
            Message.objects
            .filter(
                conversation=conversation,
                read_at__isnull=True,
            )
            .exclude(sender=request.user)
            .update(read_at=timezone.now())
        )

        return Response(
            {
                "success": True,
                "marked_read": updated,
            }
        )