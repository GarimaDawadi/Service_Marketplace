from django.conf import settings
from django.db import models
class Category(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=80, blank=True)
    is_active = models.BooleanField(default=True)
    default_service_mode = models.CharField(max_length=16, default="BOTH")
    sort_order = models.PositiveIntegerField(default=0)
    class Meta:
        ordering = ["sort_order", "name"]
    def __str__(self):
        return self.name
class SubCategory(models.Model):
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="subcategories")
    name = models.CharField(max_length=120)
    slug = models.SlugField()
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    class Meta:
        unique_together = ("category", "slug")
        ordering = ["name"]
    def __str__(self):
        return f"{self.category.name} / {self.name}"
class Skill(models.Model):
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(unique=True)
    def __str__(self):
        return self.name
class Service(models.Model):
    class Mode(models.TextChoices):
        REMOTE = "REMOTE", "Remote"
        LOCAL = "LOCAL", "Local"
        BOTH = "BOTH", "Both"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        INACTIVE = "INACTIVE", "Inactive"
    freelancer = models.ForeignKey(
        "accounts.FreelancerProfile", on_delete=models.CASCADE, related_name="services"
    )
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="services")
    subcategory = models.ForeignKey(
        SubCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name="services"
    )
    title = models.CharField(max_length=180)
    description = models.TextField()
    service_mode = models.CharField(max_length=16, choices=Mode.choices, default=Mode.REMOTE)
    starting_price = models.DecimalField(max_digits=12, decimal_places=2)
    price_max = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    delivery_days = models.PositiveIntegerField(null=True, blank=True)
    client_requirements = models.TextField(blank=True)
    tags = models.CharField(max_length=255, blank=True)
    skills = models.ManyToManyField(Skill, blank=True, related_name="services")
    location = models.CharField(max_length=255, blank=True)
    travel_radius_km = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    # Kept for compatibility with the first API version; status is canonical.
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        ordering = ["-created_at"]
    def save(self, *args, **kwargs):
        if self.status == self.Status.PUBLISHED:
            from accounts.models import KYCVerification
            approved = KYCVerification.objects.filter(
                freelancer_id=self.freelancer_id,
                status=KYCVerification.Status.APPROVED,
            ).exists()
            if not approved:
                from django.core.exceptions import ValidationError
                raise ValidationError("Provider KYC approval is required before publishing services.")
        self.is_active = self.status == self.Status.PUBLISHED
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title
class ServiceImage(models.Model):
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="services/")
    caption = models.CharField(max_length=160, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
class PortfolioItem(models.Model):
    freelancer = models.ForeignKey(
        "accounts.FreelancerProfile", on_delete=models.CASCADE, related_name="portfolio"
    )
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="portfolio/", blank=True, null=True)
    file = models.FileField(upload_to="portfolio/files/", blank=True, null=True)
    project_link = models.URLField(blank=True)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
    skills = models.ManyToManyField(Skill, blank=True)
    is_visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ["-created_at"]
class Availability(models.Model):
    freelancer = models.ForeignKey(
        "accounts.FreelancerProfile", on_delete=models.CASCADE, related_name="availability"
    )
    weekday = models.PositiveSmallIntegerField(null=True, blank=True, help_text="0=Monday")
    specific_date = models.DateField(null=True, blank=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_blocked = models.BooleanField(default=False)
    note = models.CharField(max_length=160, blank=True)
    class Meta:
        ordering = ["weekday", "specific_date", "start_time"]
class ServiceArea(models.Model):
    freelancer = models.ForeignKey(
        "accounts.FreelancerProfile", on_delete=models.CASCADE, related_name="service_areas"
    )
    city = models.CharField(max_length=120)
    area_name = models.CharField(max_length=160, blank=True)
    travel_radius_km = models.PositiveIntegerField(default=10)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)