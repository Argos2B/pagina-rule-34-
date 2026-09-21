"""
Verification models.

Privacy-first design:
- NO document images, selfies, or biometric data are stored.
- NO full document numbers are stored.
- Only the verification result, provider reference, and minimal metadata are kept.

The actual document/face processing happens entirely on the external provider's
infrastructure (Stripe Identity, Veriff, Onfido, etc.).
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class VerificationStatus(models.TextChoices):
    NOT_STARTED = "not_started", "No iniciada"
    PENDING = "pending", "Pendiente"
    VERIFIED = "verified", "Verificada"
    REJECTED = "rejected", "Rechazada"
    MANUAL_REVIEW = "manual_review", "Revisión manual"
    EXPIRED = "expired", "Expirada"
    BLOCKED = "blocked", "Bloqueada"


class DocumentType(models.TextChoices):
    CEDULA = "cedula", "Cédula de identidad"
    DIMEX = "dimex", "DIMEX"
    PASSPORT = "passport", "Pasaporte"
    DRIVERS_LICENSE = "drivers_license", "Licencia de conducir"
    OTHER = "other", "Otro documento oficial"


class UserVerification(models.Model):
    """
    Stores the outcome of an identity verification process.

    What we store: result, provider reference, document type/country, timestamps,
    boolean flags for each verification layer, rejection reason.

    What we NEVER store: document scans, selfies, biometric templates, full
    document numbers (only first/last 2 chars if strictly required for audit).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="verification",
    )

    status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.NOT_STARTED,
        db_index=True,
    )

    # Provider information — never store actual API keys here
    provider = models.CharField(max_length=50, blank=True)
    provider_reference = models.CharField(max_length=200, blank=True, db_index=True)

    # Document metadata — type and country only, no numbers or images
    document_type = models.CharField(
        max_length=30,
        choices=DocumentType.choices,
        blank=True,
    )
    document_country = models.CharField(max_length=3, blank=True)  # ISO 3166-1 alpha-2/3

    # Verification layer results (set by the trusted provider, not by the user)
    age_verified = models.BooleanField(default=False)
    identity_verified = models.BooleanField(default=False)
    face_match_verified = models.BooleanField(default=False)
    liveness_verified = models.BooleanField(default=False)

    # Timing
    verification_started_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    # Rejection / review
    rejection_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["provider", "provider_reference"]),
        ]

    def __str__(self):
        return f"Verification({self.user_id}, {self.status})"

    @property
    def is_fully_verified(self) -> bool:
        """Central predicate: ALL conditions must hold for a user to be allowed to publish."""
        return (
            self.status == VerificationStatus.VERIFIED
            and self.age_verified
            and self.identity_verified
            and self.face_match_verified
            and self.liveness_verified
        )

    @property
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return timezone.now() > self.expires_at


class WebhookEvent(models.Model):
    """
    Idempotency log for incoming webhook events.

    Stores a hash of the event ID/signature to detect replay attacks and
    duplicate deliveries. No sensitive payload data is retained.
    """

    event_id_hash = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="SHA-256 hash of the provider's event ID — not the ID itself.",
    )
    provider = models.CharField(max_length=50)
    received_at = models.DateTimeField(auto_now_add=True)
    action_taken = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ["-received_at"]

    def __str__(self):
        return f"WebhookEvent({self.provider}, {self.received_at:%Y-%m-%d %H:%M})"


class SecurityAuditLog(models.Model):
    """
    Security-specific audit log separate from the moderation AuditLog.

    Logs identity verification events, publish-block events, and fraud signals.
    NEVER logs document contents, selfies, biometrics, or full document numbers.
    """

    EVENT_CHOICES = [
        ("verification_started", "Verificación iniciada"),
        ("verification_completed", "Verificación completada"),
        ("verification_rejected", "Verificación rechazada"),
        ("verification_manual_review", "Verificación en revisión manual"),
        ("verification_expired", "Verificación expirada"),
        ("publish_blocked_unverified", "Publicación bloqueada — usuario no verificado"),
        ("suspicious_verification", "Actividad sospechosa en verificación"),
        ("moderation_block", "Contenido bloqueado por moderación"),
        ("moderation_review", "Contenido enviado a revisión por moderación"),
        ("webhook_invalid_signature", "Webhook con firma inválida rechazado"),
        ("webhook_replay_attack", "Intento de replay attack detectado"),
        ("idor_attempt", "Intento de acceso a verificación ajena"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.IntegerField(null=True, blank=True, db_index=True)
    event = models.CharField(max_length=50, choices=EVENT_CHOICES, db_index=True)
    # Generic metadata — must never include sensitive data (no keys, no docs)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["event", "created_at"]),
            models.Index(fields=["user_id", "event"]),
        ]

    def __str__(self):
        return f"SecurityAuditLog({self.event}, user={self.user_id}, {self.created_at:%Y-%m-%d %H:%M})"
