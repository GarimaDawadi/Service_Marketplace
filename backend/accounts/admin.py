from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils import timezone

from notifications.services import notify

from .models import ClientProfile, FreelancerProfile, KYCVerification, OTPCode, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Marketplace", {"fields": ("role", "phone", "is_otp_verified", "is_active_account")}),
    )
    list_display = ("email", "username", "role", "is_otp_verified", "is_staff", "is_active_account")
    list_filter = ("role", "is_otp_verified", "is_staff", "is_active_account")
    search_fields = ("email", "username", "phone")


@admin.register(KYCVerification)
class KYCVerificationAdmin(admin.ModelAdmin):
    list_display = ("freelancer", "status", "submitted_at", "reviewed_at", "reviewed_by")
    list_filter = ("status", "submitted_at")
    search_fields = ("freelancer__user__email", "legal_name", "document_number")
    readonly_fields = ("submitted_at", "reviewed_at", "reviewed_by")
    actions = ("approve_selected", "reject_selected")

    @admin.action(description="Approve selected provider KYC")
    def approve_selected(self, request, queryset):
        for kyc in queryset:
            kyc.status = KYCVerification.Status.APPROVED
            kyc.rejection_reason = ""
            kyc.reviewed_at = timezone.now()
            kyc.reviewed_by = request.user
            kyc.save(update_fields=["status", "rejection_reason", "reviewed_at", "reviewed_by"])
            notify(kyc.freelancer.user, "KYC approved", "Your identity verification is approved. You can publish services.", "KYC_APPROVED")

    @admin.action(description="Reject selected KYC (provider can resubmit)")
    def reject_selected(self, request, queryset):
        reason = "Please review the submitted details and documents, then resubmit your KYC."
        for kyc in queryset:
            kyc.status = KYCVerification.Status.REJECTED
            kyc.rejection_reason = reason
            kyc.reviewed_at = timezone.now()
            kyc.reviewed_by = request.user
            kyc.save(update_fields=["status", "rejection_reason", "reviewed_at", "reviewed_by"])
            notify(kyc.freelancer.user, "KYC needs changes", reason, "KYC_REJECTED")


@admin.register(ClientProfile)
class ClientProfileAdmin(admin.ModelAdmin):
    list_display = ("full_name", "user", "location")
    search_fields = ("full_name", "user__email", "location")


@admin.register(FreelancerProfile)
class FreelancerProfileAdmin(admin.ModelAdmin):
    list_display = ("professional_title", "user", "location", "rating_average", "rating_count")
    search_fields = ("professional_title", "user__email", "location")


@admin.register(OTPCode)
class OTPCodeAdmin(admin.ModelAdmin):
    list_display = ("user", "purpose", "created_at", "expires_at", "consumed_at")
    list_filter = ("purpose", "created_at")
    readonly_fields = ("user", "code_hash", "created_at", "expires_at", "consumed_at", "purpose")
