import tempfile

from django.core.management import call_command
from django.test import TestCase, override_settings

from accounts.models import FreelancerProfile, KYCVerification, User
from bookings.models import ProjectBooking
from catalog.models import Service
from chats.models import Conversation
from catalog.management.commands.seed_demo_marketplace import CUSTOMER_EMAIL, PROVIDER_EMAIL


class DemoMarketplaceSeedTests(TestCase):
    def test_development_demo_seed_is_safe_and_idempotent(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(DEBUG=True, MEDIA_ROOT=media_root):
                call_command("seed_demo_marketplace", verbosity=0)
                call_command("seed_demo_marketplace", verbosity=0)

        provider = User.objects.get(email=PROVIDER_EMAIL)
        customer = User.objects.get(email=CUSTOMER_EMAIL)
        provider_profile = FreelancerProfile.objects.get(user=provider)
        kyc = KYCVerification.objects.get(freelancer=provider_profile)
        self.assertTrue(provider.is_otp_verified)
        self.assertTrue(provider.check_password("DemoPass123!"))
        self.assertEqual(kyc.status, KYCVerification.Status.APPROVED)
        self.assertTrue(kyc.document_front.name.startswith("kyc/"))
        self.assertTrue(kyc.document_front.name.endswith(".txt"))
        self.assertEqual(Service.objects.filter(freelancer=provider_profile, status=Service.Status.PUBLISHED).count(), 2)
        self.assertEqual(ProjectBooking.objects.filter(client__user=customer).count(), 1)
        self.assertEqual(Conversation.objects.filter(booking__client__user=customer).count(), 1)
