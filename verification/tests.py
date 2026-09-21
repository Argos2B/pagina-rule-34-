from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from verification.models import UserVerification, VerificationStatus
from verification.services import can_user_publish

User = get_user_model()


class VerificationPausedEndpointTests(APITestCase):
    def test_verification_endpoints_are_not_exposed(self):
        user = User.objects.create_user("paused", "paused@example.com", "S3curePassw0rd!")
        self.client.force_authenticate(user)

        for path in (
            "/api/verification/status/",
            "/api/verification/start/",
            "/api/verification/webhook/",
            "/api/verification/mock/complete/",
        ):
            response = self.client.get(path)
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class VerificationPausedPublishHookTests(TestCase):
    def test_authenticated_user_can_publish_without_identity_verification(self):
        user = User.objects.create_user("publisher", "publisher@example.com", "S3curePassw0rd!")

        allowed, reason = can_user_publish(user)

        self.assertTrue(allowed)
        self.assertEqual(reason, "")

    def test_unauthenticated_user_still_fails_publish_hook(self):
        class AnonymousLikeUser:
            is_authenticated = False

        allowed, reason = can_user_publish(AnonymousLikeUser())

        self.assertFalse(allowed)
        self.assertEqual(reason, "unauthenticated")


class VerificationDormantModelTests(TestCase):
    def test_user_verification_model_remains_available_for_future_provider(self):
        user = User.objects.create_user("future", "future@example.com", "S3curePassw0rd!")

        verification = UserVerification.objects.create(
            user=user,
            status=VerificationStatus.NOT_STARTED,
            provider="",
            provider_reference="",
        )

        self.assertEqual(verification.status, VerificationStatus.NOT_STARTED)
        self.assertFalse(verification.is_fully_verified)

    def test_model_still_avoids_storing_sensitive_document_assets(self):
        field_names = {field.name for field in UserVerification._meta.get_fields()}
        forbidden_fields = {
            "document_image",
            "document_scan",
            "selfie",
            "face_image",
            "document_number",
            "id_number",
            "national_id",
        }

        self.assertFalse(forbidden_fields & field_names)
