from datetime import datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management import BaseCommand, CommandError, call_command
from django.utils import timezone
from django.utils.text import slugify

from accounts.models import ClientProfile, FreelancerProfile, KYCVerification, User
from bookings.models import ProjectBooking
from catalog.models import Availability, Category, Service
from chats.models import Conversation


PROVIDER_EMAIL = "provider@demo.service-marketplace.test"
CUSTOMER_EMAIL = "customer@demo.service-marketplace.test"
DEMO_PASSWORD = "DemoPass123!"


class Command(BaseCommand):
    help = "Seed development-only demo accounts, KYC-approved sample listings, availability and a booking."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("This demo seed is available only when DEBUG=True.")

        call_command("seed_catalog", verbosity=0)
        provider = self._get_user(
            email=PROVIDER_EMAIL,
            username="demo_provider",
            role=User.Role.FREELANCER,
            phone="9800000001",
        )
        customer = self._get_user(
            email=CUSTOMER_EMAIL,
            username="demo_customer",
            role=User.Role.CLIENT,
            phone="9800000002",
        )
        provider_profile, _ = FreelancerProfile.objects.get_or_create(
            user=provider,
            defaults={
                "professional_title": "Home and Digital Services Provider",
                "bio": "Development-only demo profile. Replace with real provider information before launch.",
                "experience_years": 4,
                "languages": "Nepali, English",
                "location": "Janakpur",
            },
        )
        client_profile, _ = ClientProfile.objects.get_or_create(
            user=customer,
            defaults={"full_name": "Demo Customer", "location": "Janakpur"},
        )
        self._approve_demo_kyc(provider_profile)

        local_category = Category.objects.get(slug=slugify("Home & Local Services"))
        remote_category = Category.objects.get(slug=slugify("Web Development"))
        local_service = self._get_service(
            provider_profile,
            local_category,
            title="Home electrical repair in Janakpur",
            description="Development sample listing for small electrical repairs and fixture installation.",
            price=Decimal("1200.00"),
            mode=Service.Mode.LOCAL,
            location="Janakpur",
        )
        self._get_service(
            provider_profile,
            remote_category,
            title="Responsive website setup",
            description="Development sample listing for a small business website setup.",
            price=Decimal("8500.00"),
            mode=Service.Mode.REMOTE,
            location="Nepal",
        )
        for weekday in range(7):
            Availability.objects.get_or_create(
                freelancer=provider_profile,
                weekday=weekday,
                specific_date=None,
                start_time=time(9, 0),
                end_time=time(18, 0),
                defaults={"is_blocked": False, "note": "Demo hours"},
            )

        appointment_date = timezone.localdate() + timedelta(days=2)
        start = timezone.make_aware(
            datetime.combine(appointment_date, time(10, 0)),
            timezone.get_current_timezone(),
        )
        end = timezone.make_aware(
            datetime.combine(appointment_date, time(11, 0)),
            timezone.get_current_timezone(),
        )
        booking, created = ProjectBooking.objects.get_or_create(
            client=client_profile,
            service=local_service,
            title="Demo electrical repair request",
            defaults={
                "freelancer": provider_profile,
                "category": local_category,
                "booking_type": ProjectBooking.BookingType.LOCAL_APPOINTMENT,
                "service_mode": ProjectBooking.ServiceMode.LOCAL,
                "requirements": "Development-only sample booking. No payment has been made.",
                "proposed_price": local_service.starting_price,
                "appointment_start": start,
                "appointment_end": end,
                "location_city": "Janakpur",
                "location_address": "Demo address — replace before use",
                "status": ProjectBooking.Status.PENDING_PROVIDER_RESPONSE,
            },
        )
        Conversation.objects.get_or_create(booking=booking)

        self.stdout.write(self.style.SUCCESS("Development demo marketplace seeded."))
        self.stdout.write(f"Provider: {PROVIDER_EMAIL} / {DEMO_PASSWORD}")
        self.stdout.write(f"Customer: {CUSTOMER_EMAIL} / {DEMO_PASSWORD}")
        if created:
            self.stdout.write(f"Created pending sample booking #{booking.pk}.")
        else:
            self.stdout.write(f"Sample booking already exists: #{booking.pk}.")
        self.stdout.write(self.style.WARNING("Demo KYC approval and identity placeholder are for local development only."))

    def _get_user(self, *, email, username, role, phone):
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "username": username,
                "role": role,
                "phone": phone,
                "is_otp_verified": True,
                "is_active_account": True,
            },
        )
        changed_fields = []
        if user.role != role:
            user.role = role
            changed_fields.append("role")
        if not user.phone:
            user.phone = phone
            changed_fields.append("phone")
        if not user.is_otp_verified:
            user.is_otp_verified = True
            changed_fields.append("is_otp_verified")
        if not user.is_active_account:
            user.is_active_account = True
            changed_fields.append("is_active_account")
        if created or not user.has_usable_password():
            user.set_password(DEMO_PASSWORD)
            changed_fields.append("password")
        if changed_fields:
            user.save(update_fields=list(set(changed_fields)))
        return user

    def _approve_demo_kyc(self, profile):
        kyc, created = KYCVerification.objects.get_or_create(
            freelancer=profile,
            defaults={
                "legal_name": "Demo Provider (Development Only)",
                "document_type": "DEMO PLACEHOLDER — NOT A REAL ID",
                "document_number": f"DEMO-{profile.user_id}",
                "document_front": ContentFile(
                    b"Development-only placeholder. This is not an identity document.",
                    name=f"demo-identity-{profile.user_id}.txt",
                ),
                "status": KYCVerification.Status.APPROVED,
            },
        )
        if not kyc.document_front:
            kyc.document_front.save(
                f"demo-identity-{profile.user_id}.txt",
                ContentFile(b"Development-only placeholder. This is not an identity document."),
                save=False,
            )
        if kyc.status != KYCVerification.Status.APPROVED:
            kyc.status = KYCVerification.Status.APPROVED
            kyc.rejection_reason = ""
            kyc.reviewed_at = timezone.now()
            kyc.save(update_fields=["status", "rejection_reason", "reviewed_at", "document_front"])
        elif created:
            kyc.save(update_fields=["document_front"])

    def _get_service(self, freelancer, category, *, title, description, price, mode, location):
        service, created = Service.objects.get_or_create(
            freelancer=freelancer,
            title=title,
            defaults={
                "category": category,
                "description": description,
                "starting_price": price,
                "service_mode": mode,
                "location": location,
                "status": Service.Status.PUBLISHED,
            },
        )
        if not created and (service.status != Service.Status.PUBLISHED or not service.is_active):
            service.status = Service.Status.PUBLISHED
            service.is_active = True
            service.save(update_fields=["status", "is_active", "updated_at"])
        return service
