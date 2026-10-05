import os
import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models
class User(AbstractUser):
    class Role(models.TextChoices):
        CLIENT = "CLIENT", "Client"
        FREELANCER = "FREELANCER", "Freelancer"
        ADMIN = "ADMIN", "Admin"
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CLIENT)
    phone = models.CharField(max_length=32, blank=True)
    is_otp_verified = models.BooleanField(default=False)
    is_active_account = models.BooleanField(default=True)
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]
    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = self.Role.ADMIN
            self.is_otp_verified = True
        super().save(*args, **kwargs)
    def __str__(self):
        return f"{self.email} ({self.role})"
class ClientProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="client_profile")
    full_name = models.CharField(max_length=160, blank=True)
    bio = models.TextField(blank=True)
    location = models.CharField(max_length=255, blank=True)
    address = models.TextField(blank=True)
    avatar = models.ImageField(upload_to="avatars/clients/", blank=True, null=True)
    def __str__(self):
        return self.full_name or self.user.email
class FreelancerProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="freelancer_profile")
    professional_title = models.CharField(max_length=160, blank=True)
    bio = models.TextField(blank=True)
    experience_years = models.PositiveIntegerField(default=0)
    languages = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=255, blank=True)
    education = models.TextField(blank=True)
    certifications = models.TextField(blank=True)
    avatar = models.ImageField(upload_to="avatars/freelancers/", blank=True, null=True)
    skills = models.ManyToManyField("catalog.Skill", blank=True, related_name="freelancers")
    rating_average = models.DecimalField(max_digits=4, decimal_places=2, default=0)
    rating_count = models.PositiveIntegerField(default=0)
    completed_jobs = models.PositiveIntegerField(default=0)
    response_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    average_response_minutes = models.PositiveIntegerField(default=0)
    is_available = models.BooleanField(default=True)
    @property
    def is_verified(self):
        kyc = getattr(self, "kyc", None)
        return bool(kyc and kyc.status == KYCVerification.Status.APPROVED)
    def __str__(self):
        return self.professional_title or self.user.email
def kyc_document_upload_path(instance, filename):
    extension = os.path.splitext(filename)[1].lower()
    if len(extension) > 12 or not extension[1:].isalnum():
        extension = ""
    return f"kyc/{uuid.uuid4().hex}{extension}"


class KYCVerification(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
    freelancer = models.OneToOneField(
        FreelancerProfile, on_delete=models.CASCADE, related_name="kyc"
    )
    legal_name = models.CharField(max_length=160)
    document_type = models.CharField(max_length=80)
    document_number = models.CharField(max_length=80)
    document_front = models.FileField(upload_to=kyc_document_upload_path)
    document_back = models.FileField(upload_to=kyc_document_upload_path, blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    rejection_reason = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="kyc_reviews"
    )
    def __str__(self):
        return f"KYC {self.freelancer} ({self.status})"
class OTPCode(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="otp_codes")
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(blank=True, null=True)
    purpose = models.CharField(max_length=40, default="login")
    class Meta:
        ordering = ["-created_at"]