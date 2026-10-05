from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import ClientProfile, FreelancerProfile, KYCVerification, User
from bookings.models import ProjectBooking
from reviews.models import Dispute, Review
from catalog.models import Availability, Category, Service
from chats.models import Conversation
from notifications.models import Notification
from payments.models import Payment


class MarketplaceFlowTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.admin = User.objects.create_superuser(
            username="admin", email="admin@example.test", password="AdminPass123!"
        )
        self.customer = self.make_user("customer", User.Role.CLIENT)
        self.other_customer = self.make_user("other-customer", User.Role.CLIENT)
        self.provider = self.make_user("provider", User.Role.FREELANCER)
        self.pending_provider = self.make_user("pending-provider", User.Role.FREELANCER)
        self.other_provider = self.make_user("other-provider", User.Role.FREELANCER)

        self.category = Category.objects.create(name="Web Development", slug="web-development")
        self.pending_category = Category.objects.create(name="Cleaning", slug="cleaning")
        self.approved_profile = FreelancerProfile.objects.get(user=self.provider)
        self.pending_profile = FreelancerProfile.objects.get(user=self.pending_provider)
        self.other_profile = FreelancerProfile.objects.get(user=self.other_provider)
        self.approved_kyc = self.make_kyc(self.approved_profile, KYCVerification.Status.APPROVED)
        self.pending_kyc = self.make_kyc(self.pending_profile, KYCVerification.Status.PENDING)
        self.other_kyc = self.make_kyc(self.other_profile, KYCVerification.Status.APPROVED)

        self.service = self.make_service(self.approved_profile, self.category, "Landing page")
        self.other_service = self.make_service(self.other_profile, self.category, "Other service")
        self.draft_service = Service.objects.create(
            freelancer=self.pending_profile,
            category=self.pending_category,
            title="Unpublished cleaning",
            description="Draft listing",
            service_mode=Service.Mode.LOCAL,
            starting_price=Decimal("50.00"),
            status=Service.Status.DRAFT,
        )

    def make_user(self, name, role):
        user = User.objects.create_user(
            username=name,
            email=f"{name}@example.test",
            password="Passw0rd!",
            role=role,
            is_otp_verified=True,
        )
        return user

    def make_kyc(self, profile, status):
        return KYCVerification.objects.create(
            freelancer=profile,
            legal_name=f"{profile.user.username} Person",
            document_type="National ID",
            document_number=f"ID-{profile.user_id}",
            document_front=SimpleUploadedFile("front.txt", b"mock id", content_type="text/plain"),
            status=status,
        )

    def make_service(self, profile, category, title):
        return Service.objects.create(
            freelancer=profile,
            category=category,
            title=title,
            description="Professional service",
            service_mode=Service.Mode.BOTH,
            starting_price=Decimal("100.00"),
            delivery_days=5,
            status=Service.Status.PUBLISHED,
        )

    def authenticate(self, user):
        self.api.force_authenticate(user=user)

    def create_booking(self):
        self.authenticate(self.customer)
        response = self.api.post(
            "/api/bookings/projects/",
            {
                "service": self.service.pk,
                "booking_type": "FIXED_SERVICE",
                "service_mode": "REMOTE",
                "title": "Build my landing page",
                "requirements": "Responsive layout and contact form",
                "description": "A launch page for a local business",
                "proposed_price": "80.00",
                "revision_limit": 2,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.data["id"]

    @patch("payments.services.requests.get")
    def test_complete_counter_offer_revision_payment_and_review_flow(self, gateway_get):
        booking_id = self.create_booking()
        booking = ProjectBooking.objects.get(pk=booking_id)
        self.assertEqual(booking.status, ProjectBooking.Status.PENDING_PROVIDER_RESPONSE)
        self.assertEqual(booking.freelancer_id, self.approved_profile.pk)
        self.assertTrue(Conversation.objects.filter(booking=booking).exists())
        self.assertTrue(Notification.objects.filter(user=self.provider, event_type="BOOKING_REQUESTED").exists())

        self.authenticate(self.provider)
        counter = self.api.post(
            f"/api/bookings/projects/{booking_id}/counter-offer/",
            {
                "amount": "95.00",
                "scope": "Responsive landing page",
                "message": "Includes two revision rounds",
                "revision_limit": 2,
            },
            format="json",
        )
        self.assertEqual(counter.status_code, 200, counter.content)
        self.assertEqual(counter.data["status"], ProjectBooking.Status.COUNTER_OFFER)
        self.assertTrue(Notification.objects.filter(user=self.customer, event_type="COUNTER_OFFER").exists())

        self.authenticate(self.customer)
        agreement = self.api.post(f"/api/bookings/projects/{booking_id}/accept/", {}, format="json")
        self.assertEqual(agreement.status_code, 200, agreement.content)
        self.assertEqual(agreement.data["status"], ProjectBooking.Status.AGREEMENT)
        self.assertEqual(agreement.data["agreed_price"], "95.00")

        initiated = self.api.post("/api/payments/payments/initiate/", {"booking": booking_id}, format="json")
        self.assertEqual(initiated.status_code, 200, initiated.content)
        self.assertEqual(initiated.data["payment"]["amount"], "95.00")
        self.assertEqual(ProjectBooking.objects.get(pk=booking_id).status, ProjectBooking.Status.PAYMENT_PENDING)
        payment_id = initiated.data["payment"]["id"]
        payment = Payment.objects.get(pk=payment_id)
        gateway_get.return_value = GatewayResponse(
            {
                "status": "COMPLETE",
                "transaction_uuid": payment.transaction_uuid,
                "total_amount": "95.00",
                "product_code": "EPAYTEST",
                "ref_id": "gateway-ref-1",
            }
        )
        verified = self.api.post(
            f"/api/payments/payments/{payment_id}/verify/",
            {"force_success": False},
            format="json",
        )
        self.assertEqual(verified.status_code, 200, verified.content)
        self.assertEqual(verified.data["status"], Payment.Status.SUCCESS)
        self.assertEqual(ProjectBooking.objects.get(pk=booking_id).status, ProjectBooking.Status.CONFIRMED)

        self.authenticate(self.provider)
        started = self.api.post(f"/api/bookings/projects/{booking_id}/start-work/", {}, format="json")
        self.assertEqual(started.status_code, 200, started.content)
        self.assertEqual(started.data["status"], ProjectBooking.Status.IN_PROGRESS)
        delivered = self.api.post(
            f"/api/bookings/projects/{booking_id}/deliver/",
            {"title": "First delivery", "note": "Preview is ready."},
            format="json",
        )
        self.assertEqual(delivered.status_code, 200, delivered.content)
        self.assertEqual(delivered.data["status"], ProjectBooking.Status.DELIVERABLE_SENT)

        self.authenticate(self.customer)
        revision = self.api.post(
            f"/api/bookings/projects/{booking_id}/revision/",
            {"message": "Please adjust the mobile hero spacing."},
            format="json",
        )
        self.assertEqual(revision.status_code, 200, revision.content)
        self.assertEqual(revision.data["status"], ProjectBooking.Status.REVISION_REQUESTED)
        self.assertEqual(revision.data["revisions_used"], 1)

        self.authenticate(self.provider)
        redelivered = self.api.post(
            f"/api/bookings/projects/{booking_id}/deliver/",
            {"title": "Revised delivery", "note": "Spacing has been adjusted."},
            format="json",
        )
        self.assertEqual(redelivered.status_code, 200, redelivered.content)
        self.assertEqual(redelivered.data["status"], ProjectBooking.Status.DELIVERABLE_SENT)

        self.authenticate(self.customer)
        completed = self.api.post(f"/api/bookings/projects/{booking_id}/complete/", {}, format="json")
        self.assertEqual(completed.status_code, 200, completed.content)
        self.assertEqual(completed.data["status"], ProjectBooking.Status.COMPLETED)

        review = self.api.post(
            "/api/reviews/reviews/",
            {"booking": booking_id, "rating": 5, "comment": "Excellent work."},
            format="json",
        )
        self.assertEqual(review.status_code, 201, review.content)
        self.assertEqual(ProjectBooking.objects.get(pk=booking_id).status, ProjectBooking.Status.REVIEWED)
        self.approved_profile.refresh_from_db()
        self.assertEqual(self.approved_profile.rating_average, Decimal("5.00"))
        self.assertTrue(Notification.objects.filter(user=self.provider, event_type="NEW_REVIEW").exists())

    def test_local_booking_requires_future_published_availability_and_blocks_overlap(self):
        local_service = self.make_service(self.approved_profile, self.category, "Local consultation")
        local_service.service_mode = Service.Mode.LOCAL
        local_service.save(update_fields=["service_mode"])
        appointment_day = timezone.localdate() + timedelta(days=3)
        start = timezone.make_aware(
            datetime.combine(appointment_day, time(10, 0)),
            timezone.get_current_timezone(),
        )
        end = start + timedelta(hours=1)
        Availability.objects.create(
            freelancer=self.approved_profile,
            weekday=appointment_day.weekday(),
            start_time=time(9, 0),
            end_time=time(12, 0),
        )
        self.authenticate(self.customer)

        payload = {
            "service": local_service.pk,
            "booking_type": "LOCAL_APPOINTMENT",
            "service_mode": "LOCAL",
            "title": "Local consultation",
            "proposed_price": "100.00",
            "appointment_start": start.isoformat(),
            "appointment_end": end.isoformat(),
            "location_city": "Janakpur",
        }
        created = self.api.post("/api/bookings/projects/", payload, format="json")
        self.assertEqual(created.status_code, 201, created.content)

        overlap_payload = {
            **payload,
            "title": "Overlapping consultation",
            "appointment_start": (start + timedelta(minutes=30)).isoformat(),
            "appointment_end": (end + timedelta(minutes=30)).isoformat(),
        }
        overlap = self.api.post("/api/bookings/projects/", overlap_payload, format="json")
        self.assertEqual(overlap.status_code, 400, overlap.content)
        self.assertIn("overlaps an existing booking", str(overlap.data))

        past_payload = {
            **payload,
            "appointment_start": (timezone.now() - timedelta(days=1)).isoformat(),
            "appointment_end": (timezone.now() - timedelta(days=1) + timedelta(hours=1)).isoformat(),
        }
        past = self.api.post("/api/bookings/projects/", past_payload, format="json")
        self.assertEqual(past.status_code, 400, past.content)
        self.assertIn("future appointment", str(past.data))

    def test_published_listing_cannot_be_booked_after_provider_kyc_is_revoked(self):
        self.approved_kyc.status = KYCVerification.Status.REJECTED
        self.approved_kyc.save(update_fields=["status"])
        self.authenticate(self.customer)
        response = self.api.post(
            "/api/bookings/projects/",
            {
                "service": self.service.pk,
                "booking_type": "FIXED_SERVICE",
                "service_mode": "REMOTE",
                "title": "Booking after KYC revocation",
                "proposed_price": "100.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("not currently approved", str(response.data))

    def test_pending_provider_can_access_dashboard_but_cannot_publish(self):
        self.authenticate(self.pending_provider)
        profile_response = self.api.get("/api/auth/freelancer-profile/")
        self.assertEqual(profile_response.status_code, 200)
        self.assertEqual(profile_response.data["kyc_status"], KYCVerification.Status.PENDING)

        payload = {
            "category": self.pending_category.pk,
            "title": "Pending provider service",
            "description": "Cannot publish before approval",
            "service_mode": "LOCAL",
            "starting_price": "75.00",
            "status": "PUBLISHED",
        }
        blocked = self.api.post("/api/catalog/services/", payload, format="json")
        self.assertEqual(blocked.status_code, 400, blocked.content)
        self.assertIn("KYC approval is required", str(blocked.data))

        payload["status"] = "DRAFT"
        draft = self.api.post("/api/catalog/services/", payload, format="json")
        self.assertEqual(draft.status_code, 201, draft.content)
        self.assertFalse(draft.data["is_active"])

        approved_id = self.draft_service.pk
        self.authenticate(self.admin)
        review = self.api.post(
            f"/api/auth/kyc/{self.pending_kyc.pk}/review/",
            {"status": "APPROVED"},
            format="json",
        )
        self.assertEqual(review.status_code, 200, review.content)
        self.assertEqual(review.data["status"], KYCVerification.Status.APPROVED)

        self.authenticate(self.pending_provider)
        published = self.api.patch(
            f"/api/catalog/services/{approved_id}/",
            {"status": "PUBLISHED"},
            format="json",
        )
        self.assertEqual(published.status_code, 200, published.content)
        self.assertTrue(published.data["is_active"])

    def test_service_ownership_and_role_permissions(self):
        self.authenticate(self.provider)
        forbidden_update = self.api.patch(
            f"/api/catalog/services/{self.other_service.pk}/",
            {"title": "Hijacked"},
            format="json",
        )
        self.assertEqual(forbidden_update.status_code, 404)

        self.authenticate(self.customer)
        create_service = self.api.post(
            "/api/catalog/services/",
            {
                "category": self.category.pk,
                "title": "Customer listing",
                "description": "Invalid role",
                "starting_price": "5.00",
                "status": "PUBLISHED",
            },
            format="json",
        )
        self.assertEqual(create_service.status_code, 403)
        self.assertEqual(self.api.get("/api/catalog/services/").status_code, 200)

    def test_booking_access_and_arbitrary_status_changes_are_blocked(self):
        booking_id = self.create_booking()
        self.authenticate(self.other_customer)
        detail = self.api.get(f"/api/bookings/projects/{booking_id}/")
        self.assertEqual(detail.status_code, 404)
        patch = self.api.patch(
            f"/api/bookings/projects/{booking_id}/",
            {"status": "CONFIRMED"},
            format="json",
        )
        self.assertEqual(patch.status_code, 405)

        self.authenticate(self.other_provider)
        chat = self.api.get(f"/api/chat/conversations/booking/{booking_id}/")
        self.assertEqual(chat.status_code, 404)
        accept = self.api.post(f"/api/bookings/projects/{booking_id}/accept/", {}, format="json")
        self.assertEqual(accept.status_code, 404)

        self.authenticate(self.provider)
        provider_cannot_book = self.api.post(
            "/api/bookings/projects/",
            {"service": self.service.pk, "service_mode": "REMOTE", "proposed_price": "20.00"},
            format="json",
        )
        self.assertEqual(provider_cannot_book.status_code, 403)

    @patch("payments.services.requests.get")
    def test_failed_payment_never_confirms_booking_and_client_cannot_force_success(self, gateway_get):
        booking_id = self.create_booking()
        self.authenticate(self.provider)
        accepted = self.api.post(f"/api/bookings/projects/{booking_id}/accept/", {}, format="json")
        self.assertEqual(accepted.status_code, 200, accepted.content)
        self.authenticate(self.customer)
        initiated = self.api.post("/api/payments/payments/initiate/", {"booking": booking_id}, format="json")
        self.assertEqual(initiated.status_code, 200, initiated.content)
        payment = Payment.objects.get(pk=initiated.data["payment"]["id"])
        gateway_get.return_value = GatewayResponse({"status": "FAILED", "transaction_uuid": payment.transaction_uuid})
        result = self.api.post(
            f"/api/payments/payments/{payment.pk}/verify/",
            {"force_success": True, "status": "COMPLETE"},
            format="json",
        )
        self.assertEqual(result.status_code, 200, result.content)
        self.assertEqual(result.data["status"], Payment.Status.FAILED)
        self.assertEqual(ProjectBooking.objects.get(pk=booking_id).status, ProjectBooking.Status.PAYMENT_FAILED)

    @patch("payments.services.requests.get")
    def test_gateway_success_without_matching_transaction_identity_is_not_accepted(self, gateway_get):
        booking_id = self.create_booking()
        self.authenticate(self.provider)
        accepted = self.api.post(f"/api/bookings/projects/{booking_id}/accept/", {}, format="json")
        self.assertEqual(accepted.status_code, 200, accepted.content)
        self.authenticate(self.customer)
        initiated = self.api.post("/api/payments/payments/initiate/", {"booking": booking_id}, format="json")
        self.assertEqual(initiated.status_code, 200, initiated.content)
        payment_id = initiated.data["payment"]["id"]
        gateway_get.return_value = GatewayResponse({"status": "COMPLETE"})

        verified = self.api.post(f"/api/payments/payments/{payment_id}/verify/", {}, format="json")
        self.assertEqual(verified.status_code, 200, verified.content)
        self.assertEqual(verified.data["status"], Payment.Status.PENDING)
        self.assertEqual(ProjectBooking.objects.get(pk=booking_id).status, ProjectBooking.Status.PAYMENT_PENDING)

    def test_reviews_and_disputes_cannot_be_reassigned_or_forged(self):
        client_profile = ClientProfile.objects.get(user=self.customer)
        booking = ProjectBooking.objects.create(
            client=client_profile,
            freelancer=self.approved_profile,
            service=self.service,
            category=self.category,
            booking_type=ProjectBooking.BookingType.FIXED_SERVICE,
            service_mode=ProjectBooking.ServiceMode.REMOTE,
            title="Completed booking for moderation test",
            proposed_price=Decimal("100.00"),
            agreed_price=Decimal("100.00"),
            status=ProjectBooking.Status.COMPLETED,
        )
        review = Review.objects.create(
            booking=booking,
            reviewer=self.customer,
            freelancer=self.approved_profile,
            rating=5,
            comment="Good work",
        )

        self.authenticate(self.customer)
        forged_review = self.api.patch(
            f"/api/reviews/reviews/{review.pk}/",
            {"rating": 1, "booking": self.other_service.pk},
            format="json",
        )
        self.assertEqual(forged_review.status_code, 405)

        opened = self.api.post(
            "/api/reviews/disputes/",
            {"booking": booking.pk, "reason": "I need an administrator to review this."},
            format="json",
        )
        self.assertEqual(opened.status_code, 201, opened.content)
        dispute_id = opened.data["id"]
        self.assertEqual(ProjectBooking.objects.get(pk=booking.pk).status, ProjectBooking.Status.DISPUTED)

        self.authenticate(self.other_customer)
        reassigned = self.api.patch(
            f"/api/reviews/disputes/{dispute_id}/",
            {"booking": self.service.pk},
            format="json",
        )
        self.assertEqual(reassigned.status_code, 405)

        self.authenticate(self.admin)
        invalid_resolution = self.api.post(
            f"/api/reviews/disputes/{dispute_id}/resolve/",
            {"status": "OPEN", "resolution": "Not a final decision."},
            format="json",
        )
        self.assertEqual(invalid_resolution.status_code, 400)
        dispute = Dispute.objects.get(pk=dispute_id)
        self.assertEqual(dispute.status, Dispute.Status.OPEN)

        resolved = self.api.post(
            f"/api/reviews/disputes/{dispute_id}/resolve/",
            {
                "status": "RESOLVED",
                "resolution": "Resolved after administrator review.",
                "booking_status": ProjectBooking.Status.CANCELLED,
            },
            format="json",
        )
        self.assertEqual(resolved.status_code, 200, resolved.content)
        self.assertEqual(Dispute.objects.get(pk=dispute_id).status, Dispute.Status.RESOLVED)
        self.assertEqual(ProjectBooking.objects.get(pk=booking.pk).status, ProjectBooking.Status.CANCELLED)

    def test_disabled_account_cannot_use_existing_access_or_refresh_tokens(self):
        access_token = str(RefreshToken.for_user(self.customer).access_token)
        refresh_token = str(RefreshToken.for_user(self.customer))
        self.customer.is_active_account = False
        self.customer.save(update_fields=["is_active_account"])
        api = APIClient()

        protected = api.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {access_token}")
        refreshed = api.post("/api/auth/token/refresh/", {"refresh": refresh_token}, format="json")
        self.assertEqual(protected.status_code, 401)
        self.assertEqual(refreshed.status_code, 401)

    @override_settings(OTP_DEBUG_RETURN=True)
    @patch("accounts.views.send_mail")
    def test_password_reset_uses_one_time_email_code_and_new_password(self, send_mail):
        requested = self.api.post(
            "/api/auth/password/reset/request/",
            {"email": self.customer.email},
            format="json",
        )
        self.assertEqual(requested.status_code, 200, requested.content)
        self.assertIn("If the account exists", requested.data["message"])

        code = requested.data["debug_otp"]
        wrong_code = "000001" if code != "000001" else "000002"
        invalid = self.api.post(
            "/api/auth/password/reset/",
            {"email": self.customer.email, "code": wrong_code, "new_password": "NewStrongPass123!"},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)

        confirmed = self.api.post(
            "/api/auth/password/reset/",
            {"email": self.customer.email, "code": code, "new_password": "NewStrongPass123!"},
            format="json",
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.content)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.check_password("NewStrongPass123!"))
        replayed = self.api.post(
            "/api/auth/password/reset/",
            {"email": self.customer.email, "code": code, "new_password": "AnotherStrongPass123!"},
            format="json",
        )
        self.assertEqual(replayed.status_code, 400)

    def test_kyc_review_is_admin_only_and_rejected_applications_can_resubmit(self):
        self.authenticate(self.pending_provider)
        reject_as_provider = self.api.post(
            f"/api/auth/kyc/{self.pending_kyc.pk}/review/",
            {"status": "APPROVED"},
            format="json",
        )
        self.assertEqual(reject_as_provider.status_code, 403)

        self.authenticate(self.admin)
        rejected = self.api.post(
            f"/api/auth/kyc/{self.pending_kyc.pk}/review/",
            {"status": "REJECTED", "rejection_reason": "Document image is unreadable."},
            format="json",
        )
        self.assertEqual(rejected.status_code, 200, rejected.content)
        self.assertEqual(rejected.data["rejection_reason"], "Document image is unreadable.")

        self.authenticate(self.pending_provider)
        form = {
            "legal_name": "Pending Provider",
            "document_type": "National ID",
            "document_number": "NEW-ID-004",
            "document_front": SimpleUploadedFile("new-front.txt", b"clear id", content_type="text/plain"),
        }
        resubmitted = self.api.post("/api/auth/kyc/", form, format="multipart")
        self.assertEqual(resubmitted.status_code, 200, resubmitted.content)
        self.assertEqual(resubmitted.data["status"], KYCVerification.Status.PENDING)
        self.assertEqual(resubmitted.data["rejection_reason"], "")


class GatewayResponse:
    status_code = 200
    content = b"{}"

    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        return None

    def json(self):
        return self._data
