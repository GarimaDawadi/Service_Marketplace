from rest_framework import serializers

from accounts.models import KYCVerification
from accounts.serializers import FreelancerProfileSerializer
from .models import (
    Availability,
    Category,
    PortfolioItem,
    Service,
    ServiceArea,
    ServiceImage,
    Skill,
    SubCategory,
)


class SubCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SubCategory
        fields = "__all__"


class CategorySerializer(serializers.ModelSerializer):
    subcategories = SubCategorySerializer(many=True, read_only=True)

    class Meta:
        model = Category
        fields = "__all__"


class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = "__all__"


class ServiceImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ServiceImage
        fields = ("id", "service", "image", "image_url", "caption", "sort_order")
        read_only_fields = ("service", "image_url")

    def get_image_url(self, obj):
        if not obj.image:
            return ""
        request = self.context.get("request")
        return request.build_absolute_uri(obj.image.url) if request else obj.image.url


class ServiceSerializer(serializers.ModelSerializer):
    images = ServiceImageSerializer(many=True, read_only=True)
    freelancer_detail = FreelancerProfileSerializer(source="freelancer", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    provider = serializers.IntegerField(source="freelancer_id", read_only=True)
    provider_name = serializers.SerializerMethodField()
    provider_verified = serializers.BooleanField(source="freelancer.is_verified", read_only=True)
    avg_rating = serializers.DecimalField(
        source="freelancer.rating_average", max_digits=4, decimal_places=2, read_only=True
    )
    review_count = serializers.IntegerField(source="freelancer.rating_count", read_only=True)
    price = serializers.DecimalField(
        source="starting_price", max_digits=12, decimal_places=2, read_only=True
    )

    class Meta:
        model = Service
        fields = "__all__"
        read_only_fields = ("freelancer", "is_active", "created_at", "updated_at")

    def get_provider_name(self, obj):
        profile = obj.freelancer
        return profile.user.get_full_name() or profile.user.username or profile.user.email

    def validate_status(self, value):
        if value != Service.Status.PUBLISHED:
            return value
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Sign in as a provider before publishing a service.")
        approved = KYCVerification.objects.filter(
            freelancer__user_id=request.user.pk,
            status=KYCVerification.Status.APPROVED,
        ).exists()
        if not approved:
            raise serializers.ValidationError("KYC approval is required before publishing services.")
        return value


class PortfolioItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioItem
        fields = "__all__"
        read_only_fields = ("freelancer",)


class AvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Availability
        fields = "__all__"
        read_only_fields = ("freelancer",)


class ServiceAreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceArea
        fields = "__all__"
        read_only_fields = ("freelancer",)
