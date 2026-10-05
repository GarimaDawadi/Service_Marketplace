from django.contrib.auth.password_validation import validate_password

from rest_framework import serializers

from catalog.models import Skill

from .models import (
    ClientProfile,
    FreelancerProfile,
    KYCVerification,
    User,
)


class UserSerializer(serializers.ModelSerializer):
    profile_photo = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "role",
            "phone",
            "is_otp_verified",
            "is_active_account",
            "date_joined",
            "profile_photo",
        )
        read_only_fields = (
            "id",
            "role",
            "is_otp_verified",
            "is_active_account",
            "date_joined",
            "profile_photo",
        )

    def get_profile_photo(self, obj):
        profile = getattr(obj, "client_profile", None) or getattr(obj, "freelancer_profile", None)
        avatar = getattr(profile, "avatar", None) if profile else None
        if not avatar:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(avatar.url) if request else avatar.url


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    role = serializers.ChoiceField(
        choices=[
            User.Role.CLIENT,
            User.Role.FREELANCER,
        ]
    )

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "password",
            "role",
            "phone",
        )

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")

        user = User(**validated_data)
        user.set_password(password)
        user.save()

        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=8)
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class OTPRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)


class OTPVerifySerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)
    code = serializers.CharField(max_length=8)


# ============================================================
# PROFILE UPDATE
# ============================================================

class ProfileUpdateSerializer(serializers.Serializer):
    username = serializers.CharField(
        required=False,
        allow_blank=False,
        max_length=150,
    )

    email = serializers.EmailField(
        required=False,
    )

    phone = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=32,
    )

    full_name = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=160,
    )

    bio = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    location = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255,
    )

    address = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    professional_title = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=160,
    )

    experience_years = serializers.IntegerField(
        required=False,
        min_value=0,
    )

    languages = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255,
    )

    education = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    certifications = serializers.CharField(
        required=False,
        allow_blank=True,
    )


# ============================================================
# PASSWORD
# ============================================================

class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(
        write_only=True,
        required=True,
    )

    new_password = serializers.CharField(
        write_only=True,
        required=True,
    )

    def validate_new_password(self, value):
        validate_password(
            value,
            self.context["request"].user,
        )
        return value


# ============================================================
# EXISTING PROFILE SERIALIZERS
# ============================================================

class ClientProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = ClientProfile
        fields = "__all__"
        read_only_fields = ("user",)


class FreelancerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    is_verified = serializers.BooleanField(read_only=True)
    kyc_status = serializers.SerializerMethodField()
    rejection_reason = serializers.SerializerMethodField()
    profile_completed = serializers.SerializerMethodField()

    skill_ids = serializers.PrimaryKeyRelatedField(
        source="skills",
        many=True,
        queryset=Skill.objects.all(),
        required=False,
    )

    class Meta:
        model = FreelancerProfile

        fields = (
            "id",
            "user",
            "professional_title",
            "bio",
            "experience_years",
            "languages",
            "location",
            "education",
            "certifications",
            "avatar",
            "skill_ids",
            "rating_average",
            "rating_count",
            "completed_jobs",
            "response_rate",
            "average_response_minutes",
            "is_available",
            "is_verified",
            "kyc_status",
            "rejection_reason",
            "profile_completed",
        )

        read_only_fields = (
            "user",
            "rating_average",
            "rating_count",
            "completed_jobs",
            "response_rate",
            "average_response_minutes",
            "is_verified",
            "kyc_status",
            "rejection_reason",
            "profile_completed",
        )

    def get_kyc_status(self, obj):
        kyc = getattr(obj, "kyc", None)
        return kyc.status if kyc else "NOT_SUBMITTED"

    def get_rejection_reason(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return ""
        if request.user.id != obj.user_id and not request.user.is_staff:
            return ""
        kyc = getattr(obj, "kyc", None)
        return kyc.rejection_reason if kyc else ""

    def get_profile_completed(self, obj):
        return bool(obj.professional_title and obj.location)


class KYCSerializer(serializers.ModelSerializer):
    document_front = serializers.FileField(write_only=True, required=True)
    document_back = serializers.FileField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = KYCVerification
        fields = "__all__"

        read_only_fields = (
            "freelancer",
            "status",
            "rejection_reason",
            "submitted_at",
            "reviewed_at",
            "reviewed_by",
        )


class KYCReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[
            KYCVerification.Status.APPROVED,
            KYCVerification.Status.REJECTED,
        ]
    )

    rejection_reason = serializers.CharField(
        required=False,
        allow_blank=True,
    )