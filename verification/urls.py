"""
URL endpoints for identity verification system.

Endpoints:
- GET /api/verification/status/ — Get user's verification status
- POST /api/verification/start/ — Start a new verification session
- POST /api/verification/webhook/ — Receive webhook from identity provider
- POST /api/verification/mock/complete/ — Dev-only: complete mock verification
"""

from django.urls import path
from .views import (
    VerificationStatusView,
    VerificationStartView,
    VerificationWebhookView,
    MockCompleteView,
)

urlpatterns = [
    path("verification/status/", VerificationStatusView.as_view(), name="verification-status"),
    path("verification/start/", VerificationStartView.as_view(), name="verification-start"),
    path("verification/webhook/", VerificationWebhookView.as_view(), name="verification-webhook"),
    path("verification/mock/complete/", MockCompleteView.as_view(), name="verification-mock-complete"),
]
