from django.conf import settings
from django.db import models
class Payment(models.Model):
    class Status(models.TextChoices):
        INITIATED = "INITIATED"
        PENDING = "PENDING"
        SUCCESS = "SUCCESS"
        FAILED = "FAILED"
        CANCELLED = "CANCELLED"
        REFUNDED = "REFUNDED"
    class Gateway(models.TextChoices):
        ESEWA = "ESEWA"
        MANUAL = "MANUAL"
    booking = models.ForeignKey(
        "bookings.ProjectBooking", on_delete=models.CASCADE, related_name="payments"
    )
    payer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    gateway = models.CharField(max_length=16, choices=Gateway.choices, default=Gateway.ESEWA)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.INITIATED)
    transaction_uuid = models.CharField(max_length=80, unique=True)
    gateway_ref = models.CharField(max_length=120, blank=True)
    signature = models.TextField(blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    idempotency_key = models.CharField(max_length=80, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    class Meta:
        ordering = ["-created_at"]
class LedgerTransaction(models.Model):
    class Kind(models.TextChoices):
        CHARGE = "CHARGE"
        ESCROW_HOLD = "ESCROW_HOLD"
        SETTLEMENT = "SETTLEMENT"
        REFUND = "REFUND"
        FEE = "FEE"
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="ledger")
    booking = models.ForeignKey("bookings.ProjectBooking", on_delete=models.CASCADE, related_name="transactions")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ["-created_at"]