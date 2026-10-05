from django.shortcuts import get_object_or_404
from rest_framework import permissions, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from accounts.models import FreelancerProfile, KYCVerification, User
from accounts.permissions import IsAdminRole, IsFreelancer, IsOTPVerified

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
from .serializers import (
    AvailabilitySerializer,
    CategorySerializer,
    PortfolioItemSerializer,
    ServiceAreaSerializer,
    ServiceImageSerializer,
    ServiceSerializer,
    SkillSerializer,
    SubCategorySerializer,
)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.filter(is_active=True).prefetch_related("subcategories")
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]
    search_fields = ["name", "description"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAdminRole()]
        return [permissions.AllowAny()]


class SubCategoryViewSet(viewsets.ModelViewSet):
    queryset = SubCategory.objects.select_related("category")
    serializer_class = SubCategorySerializer
    filterset_fields = ["category", "is_active"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAdminRole()]
        return [permissions.AllowAny()]


class SkillViewSet(viewsets.ModelViewSet):
    queryset = Skill.objects.all()
    serializer_class = SkillSerializer
    search_fields = ["name"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAdminRole()]
        return [permissions.AllowAny()]


class ServiceViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["category", "subcategory", "service_mode", "location", "status", "freelancer"]
    search_fields = ["title", "description", "tags", "location"]
    ordering_fields = ["starting_price", "created_at"]

    def get_queryset(self):
        qs = (
            Service.objects.select_related("freelancer__user", "category", "subcategory")
            .prefetch_related("images", "skills")
        )
        user = self.request.user
        is_admin = user.is_authenticated and (user.is_staff or user.role == User.Role.ADMIN)
        if is_admin:
            return qs

        public_services = qs.filter(
            status=Service.Status.PUBLISHED,
            is_active=True,
            freelancer__kyc__status=KYCVerification.Status.APPROVED,
        )
        if user.is_authenticated and user.role == User.Role.FREELANCER:
            own_services = qs.filter(freelancer__user=user)
            if self.action == "list" and self.request.query_params.get("mine") == "1":
                return own_services
            if self.action in ("retrieve", "update", "partial_update", "destroy"):
                if self.action == "retrieve":
                    return public_services | own_services
                return own_services
        return public_services

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAuthenticated(), IsOTPVerified(), IsFreelancer()]
        return [permissions.AllowAny()]

    def perform_create(self, serializer):
        profile, _ = FreelancerProfile.objects.get_or_create(user=self.request.user)
        serializer.save(freelancer=profile)


class ServiceImageViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceImageSerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified, IsFreelancer]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        if self.request.user.is_staff or self.request.user.role == User.Role.ADMIN:
            return ServiceImage.objects.select_related("service", "service__freelancer")
        return ServiceImage.objects.filter(service__freelancer__user=self.request.user)

    def perform_create(self, serializer):
        service = get_object_or_404(
            Service, pk=self.request.data.get("service"), freelancer__user=self.request.user
        )
        serializer.save(service=service)


class PortfolioViewSet(viewsets.ModelViewSet):
    serializer_class = PortfolioItemSerializer
    parser_classes = [MultiPartParser, FormParser]
    filterset_fields = ["freelancer", "is_visible"]

    def get_queryset(self):
        qs = PortfolioItem.objects.select_related("freelancer", "freelancer__user")
        user = self.request.user
        if user.is_authenticated and (user.is_staff or user.role == User.Role.ADMIN):
            return qs
        if user.is_authenticated and user.role == User.Role.FREELANCER:
            if self.action in ("update", "partial_update", "destroy"):
                return qs.filter(freelancer__user=user)
            if self.request.query_params.get("mine") == "1":
                return qs.filter(freelancer__user=user)
        return qs.filter(is_visible=True)

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAuthenticated(), IsOTPVerified(), IsFreelancer()]
        return [permissions.AllowAny()]

    def perform_create(self, serializer):
        profile, _ = FreelancerProfile.objects.get_or_create(user=self.request.user)
        serializer.save(freelancer=profile)


class AvailabilityViewSet(viewsets.ModelViewSet):
    serializer_class = AvailabilitySerializer
    permission_classes = [permissions.IsAuthenticated, IsOTPVerified]

    def get_queryset(self):
        qs = Availability.objects.select_related("freelancer", "freelancer__user", "freelancer__kyc")
        user = self.request.user
        if user.is_authenticated and (user.is_staff or user.role == User.Role.ADMIN):
            return qs
        if user.is_authenticated and user.role == User.Role.FREELANCER:
            return qs.filter(freelancer__user=user)

        # Public schedules expose only unblocked hours for KYC-approved providers.
        # Require an explicit provider id so this endpoint cannot enumerate all schedules.
        freelancer_id = self.request.query_params.get("freelancer")
        if not freelancer_id or not freelancer_id.isdigit():
            return qs.none()
        return qs.filter(
            freelancer_id=freelancer_id,
            freelancer__kyc__status=KYCVerification.Status.APPROVED,
            is_blocked=False,
        )

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAuthenticated(), IsOTPVerified(), IsFreelancer()]
        return [permissions.AllowAny()]

    def perform_create(self, serializer):
        profile, _ = FreelancerProfile.objects.get_or_create(user=self.request.user)
        serializer.save(freelancer=profile)


class ServiceAreaViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceAreaSerializer
    filterset_fields = ["city"]
    search_fields = ["city", "area_name"]

    def get_queryset(self):
        qs = ServiceArea.objects.select_related("freelancer", "freelancer__user")
        user = self.request.user
        if user.is_staff or user.role == User.Role.ADMIN:
            return qs
        if user.role == User.Role.FREELANCER:
            return qs.filter(freelancer__user=user)
        return qs.none()

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAuthenticated(), IsOTPVerified(), IsFreelancer()]
        return [permissions.IsAuthenticated(), IsOTPVerified()]

    def perform_create(self, serializer):
        profile, _ = FreelancerProfile.objects.get_or_create(user=self.request.user)
        serializer.save(freelancer=profile)
