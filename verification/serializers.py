"""
Serializers for the verification app.

Privacy-first: no serializer exposes document images, selfies, biometrics,
full document numbers, or internal provider secrets.
"""

from rest_framework import serializers

from .models import DocumentType, UserVerification, VerificationStatus


class VerificationStatusSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for a user's own verification status.

    Exposed at GET /api/verification/status/ — returns only what the
    frontend needs to display the correct state to the user.
    """

    class Meta:
        model = UserVerification
        fields = [
            "status",
            "provider",
            "document_type",
            "document_country",
            "age_verified",
            "identity_verified",
            "face_match_verified",
            "liveness_verified",
            "verification_started_at",
            "verified_at",
            "expires_at",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class StartVerificationSerializer(serializers.Serializer):
    """
    Request body for POST /api/verification/start/.

    The document_type field is optional — the user may select it in the
    provider's hosted UI instead. Including it here improves UX by
    pre-selecting the document type in the provider's flow.
    """

    document_type = serializers.ChoiceField(
        choices=DocumentType.choices,
        required=False,
        allow_blank=True,
    )

    def validate_document_type(self, value):
        # Normalize empty string to empty string (not stored until provider confirms)
        return value or ""


class MockCompleteSerializer(serializers.Serializer):
    """
    Request body for POST /api/verification/mock/complete/

    Only available when DEBUG=True. Used by tests and the dev UI to
    advance a verification session to a specific outcome.
    """

    session_id = serializers.CharField(max_length=200)
    outcome = serializers.ChoiceField(
        choices=["verified", "rejected", "manual_review", "expired", "pending"],
        default="verified",
    )
