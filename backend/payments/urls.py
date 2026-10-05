from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import LedgerViewSet, PaymentCheckoutView, PaymentReturnView, PaymentViewSet
router = DefaultRouter()
router.register("payments", PaymentViewSet, basename="payment")
router.register("transactions", LedgerViewSet, basename="transaction")
urlpatterns = [
    path("checkout/<int:payment_id>/", PaymentCheckoutView.as_view(), name="payment-checkout"),
    path("return/", PaymentReturnView.as_view(), name="payment-return"),
    path("", include(router.urls)),
]