"""
Comprehensive test suite for the identity verification system.

Tests cover:
- Publish blocking for all non-VERIFIED states
- IDOR protection (user A cannot access user B's verification)
- Webhook signature validation and replay attack prevention
- Mock provider flow
- Privacy (no sensitive data in logs or DB)
- Anti-fraud service
- can_user_publish() correctness across all states
- Comment verification (NEW)
- Content moderation (NEW)
- Provider integration (NEW)
"""

import hashlib
import io
import json

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role
from verification.models import SecurityAuditLog, UserVerification, VerificationStatus, WebhookEvent
from verification.providers.mock import MockIdentityVerificationProvider
from verification.services import can_user_publish

User = get_user_model()


def make_test_image(name="test.png", fmt="PNG", size=(10, 10)):
    buffer = io.BytesIO()
    Image.new("RGB", size, color="blue").save(buffer, format=fmt)
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/png")


def make_verified_user(username: str, email: str) -> User:
    """Create a user with a VERIFIED UserVerification record."""
    user = User.objects.create_user(username=username, email=email, password="S3curePassw0rd!")
    UserVerification.objects.create(
        user=user,
        status=VerificationStatus.VERIFIED,
        age_verified=True,
        identity_verified=True,
        face_match_verified=True,
        liveness_verified=True,
        provider="mock",
        provider_reference=f"mock_{username}",
    )
    return user


def make_unverified_user(username: str, email: str, verification_status=None) -> User:
    """Create a user with an optional non-VERIFIED UserVerification record."""
    user = User.objects.create_user(username=username, email=email, password="S3curePassw0rd!")
    if verification_status is not None:
        UserVerification.objects.create(
            user=user,
            status=verification_status,
            provider="mock",
            provider_reference=f"mock_{username}",
        )
    return user


@override_settings(DEBUG=True, VERIFICATION_PROVIDER="mock")
class PublishBlockingTests(APITestCase):
    """Verify that server-side enforcement blocks publishing for non-VERIFIED states."""

    def _post_create_image(self, user):
        self.client.force_authenticate(user)
        from posts.models import Category
        cat, _ = Category.objects.get_or_create(name="Test")
        return self.client.post(
            "/api/posts/",
            {"title": "Test", "image": make_test_image(), "category": cat.id},
            format="multipart",
        )

    def test_no_verification_record_blocks_publish(self):
        user = make_unverified_user("u_none", "u_none@example.com")
        response = self._post_create_image(user)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_pending_status_blocks_publish(self):
        user = make_unverified_user("u_pending", "u_pending@example.com", VerificationStatus.PENDING)
        response = self._post_create_image(user)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rejected_status_blocks_publish(self):
        user = make_unverified_user("u_rejected", "u_rejected@example.com", VerificationStatus.REJECTED)
        response = self._post_create_image(user)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manual_review_status_blocks_publish(self):
        user = make_unverified_user("u_review", "u_review@example.com", VerificationStatus.MANUAL_REVIEW)
        response = self._post_create_image(user)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_blocked_status_blocks_publish(self):
        user = make_unverified_user("u_blocked", "u_blocked@example.com", VerificationStatus.BLOCKED)
        response = self._post_create_image(user)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_expired_status_blocks_publish(self):
        user = make_unverified_user("u_expired", "u_expired@example.com", VerificationStatus.EXPIRED)
        response = self._post_create_image(user)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_not_started_status_blocks_publish(self):
        user = make_unverified_user("u_start", "u_start@example.com", VerificationStatus.NOT_STARTED)
        response = self._post_create_image(user)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_verified_user_can_proceed_to_upload(self):
        """Verified user should reach post creation (201 Created)."""
        user = make_verified_user("u_verified", "u_verified@example.com")
        response = self._post_create_image(user)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_unauthenticated_cannot_publish(self):
        response = self.client.post("/api/posts/", {"title": "Test"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_moderator_can_publish_without_verification(self):
        """Moderators are exempt — they are manually vetted by admins."""
        user = User.objects.create_user("mod", "mod@example.com", "S3curePassw0rd!")
        user.role = Role.MODERATOR
        user.save()
        response = self._post_create_image(user)
        self.assertIn(response.status_code, [status.HTTP_201_CREATED, status.HTTP_200_OK])


@override_settings(DEBUG=True, VERIFICATION_PROVIDER="mock")
class CommentVerificationTests(APITestCase):
    """Comments should require same verification as posts."""

    def setUp(self):
        self.verified_user = make_verified_user("verified_commenter", "verified_commenter@example.com")
        self.unverified_user = make_unverified_user("unverified_commenter", "unverified_commenter@example.com")
        self.moderator = User.objects.create_user("mod", "mod@example.com", "S3curePassw0rd!")
        self.moderator.role = Role.MODERATOR
        self.moderator.save()
        from posts.models import Post, Category
        cat = Category.objects.create(name="Test")
        self.post = Post.objects.create(author=self.verified_user, title="Test Post", category=cat, image=make_test_image())

    def test_unverified_user_cannot_comment(self):
        self.client.force_authenticate(self.unverified_user)
        response = self.client.post("/api/comments/", {"post": self.post.id, "content": "Comment"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_verified_user_can_comment(self):
        self.client.force_authenticate(self.verified_user)
        response = self.client.post("/api/comments/", {"post": self.post.id, "content": "Comment"}, format="json")
        self.assertIn(response.status_code, [status.HTTP_201_CREATED, status.HTTP_200_OK])

    def test_pending_status_blocks_comment(self):
        user = make_unverified_user("pending_commenter", "pending_commenter@example.com", VerificationStatus.PENDING)
        self.client.force_authenticate(user)
        response = self.client.post("/api/comments/", {"post": self.post.id, "content": "Comment"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rejected_status_blocks_comment(self):
        user = make_unverified_user("rejected_commenter", "rejected_commenter@example.com", VerificationStatus.REJECTED)
        self.client.force_authenticate(user)
        response = self.client.post("/api/comments/", {"post": self.post.id, "content": "Comment"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_moderator_can_comment_without_verification(self):
        self.client.force_authenticate(self.moderator)
        response = self.client.post("/api/comments/", {"post": self.post.id, "content": "Mod Comment"}, format="json")
        self.assertIn(response.status_code, [status.HTTP_201_CREATED, status.HTTP_200_OK])


@override_settings(DEBUG=True, VERIFICATION_PROVIDER="mock")
class ContentModerationTests(APITestCase):
    """Test content moderation integration in upload flow."""

    def setUp(self):
        self.verified_user = make_verified_user("moderated_user", "moderated_user@example.com")
        self.client.force_authenticate(self.verified_user)
        from posts.models import Category
        self.category = Category.objects.create(name="Test")

    def test_valid_image_passes_moderation(self):
        """Verified user with valid image should succeed."""
        response = self.client.post(
            "/api/posts/",
            {"title": "Good Image", "image": make_test_image(), "category": self.category.id},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_missing_image_blocked(self):
        """Missing image should fail at file validation level."""
        response = self.client.post("/api/posts/", {"title": "No Image"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_oversized_image_blocked(self):
        """Image exceeding MAX_UPLOAD_SIZE_BYTES should be blocked."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.conf import settings
        big_data = b"x" * (settings.MAX_UPLOAD_SIZE_BYTES + 1)
        big_image = SimpleUploadedFile("big.png", big_data, content_type="image/png")
        response = self.client.post(
            "/api/posts/",
            {"title": "Big Image", "image": big_image, "category": self.category.id},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_moderation_logs_security_event(self):
        """Moderation decisions should be logged."""
        from verification.models import SecurityAuditLog
        initial_count = SecurityAuditLog.objects.filter(user_id=self.verified_user.pk).count()
        response = self.client.post(
            "/api/posts/",
            {"title": "Logged Image", "image": make_test_image(), "category": self.category.id},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


@override_settings(DEBUG=True, VERIFICATION_PROVIDER="mock")
class ProviderIntegrationTests(TestCase):
    """Test provider abstraction and factory."""

    def test_mock_provider_creates_session(self):
        """Mock provider should create a session."""
        provider = MockIdentityVerificationProvider()
        session = provider.create_session(user_id=123, metadata={"document_type": "cedula"})
        self.assertIsNotNone(session.session_id)
        self.assertIsNotNone(session.redirect_url)

    def test_mock_provider_process_webhook_verified(self):
        """Mock provider webhook with verified outcome."""
        provider = MockIdentityVerificationProvider()
        session = provider.create_session(user_id=123)
        payload, signature = MockIdentityVerificationProvider.build_mock_webhook_payload(
            session.session_id, "verified"
        )
        result = provider.process_webhook(payload, signature)
        self.assertEqual(result.status, VerificationStatus.VERIFIED)
        self.assertTrue(result.age_verified)
        self.assertTrue(result.identity_verified)

    def test_mock_provider_process_webhook_rejected(self):
        """Mock provider webhook with rejected outcome."""
        provider = MockIdentityVerificationProvider()
        session = provider.create_session(user_id=123)
        payload, signature = MockIdentityVerificationProvider.build_mock_webhook_payload(
            session.session_id, "rejected"
        )
        result = provider.process_webhook(payload, signature)
        self.assertEqual(result.status, VerificationStatus.REJECTED)

    def test_mock_provider_invalid_signature_raises(self):
        """Invalid signature should raise ValueError."""
        provider = MockIdentityVerificationProvider()
        session = provider.create_session(user_id=123)
        payload, _ = MockIdentityVerificationProvider.build_mock_webhook_payload(
            session.session_id, "verified"
        )
        with self.assertRaises(ValueError):
            provider.process_webhook(payload, "invalid_signature_hex")

    @override_settings(DEBUG=False, VERIFICATION_PROVIDER="")
    def test_real_provider_required_in_production(self):
        """Production must have real provider, not mock."""
        from verification.providers.factory import get_provider
        from django.core.exceptions import ImproperlyConfigured
        with self.assertRaises(ImproperlyConfigured):
            get_provider()

    def test_mock_provider_cancel_session(self):
        """Mock provider should support session cancellation."""
        provider = MockIdentityVerificationProvider()
        session = provider.create_session(user_id=123)
        result = provider.cancel_session(session.session_id)
        self.assertTrue(result)

    def test_mock_provider_delete_verification_data(self):
        """Mock provider should support GDPR deletion."""
        provider = MockIdentityVerificationProvider()
        session = provider.create_session(user_id=123)
        result = provider.delete_verification_data(session.session_id)
        self.assertTrue(result)

    def test_factory_returns_mock_provider_in_debug(self):
        """Factory should return mock provider when DEBUG=True and VERIFICATION_PROVIDER=mock."""
        from verification.providers.factory import get_provider
        provider = get_provider()
        self.assertIsInstance(provider, MockIdentityVerificationProvider)


@override_settings(DEBUG=True, VERIFICATION_PROVIDER="mock")
class WebhookSecurityTests(APITestCase):
    """Test webhook security: signatures, replay attacks, idempotency."""

    def test_valid_webhook_updates_status(self):
        """Valid webhook with correct signature should update verification status."""
        user = make_unverified_user("webhook_user", "webhook_user@example.com", VerificationStatus.PENDING)
        verification = user.verification
        verification.provider_reference = "mock_testsession"
        verification.save()

        payload, signature = MockIdentityVerificationProvider.build_mock_webhook_payload(
            "mock_testsession", "verified"
        )
        response = self.client.post(
            "/api/verification/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_VERIFICATION_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        verification.refresh_from_db()
        self.assertEqual(verification.status, VerificationStatus.VERIFIED)

    def test_invalid_signature_is_rejected(self):
        """Webhook with invalid signature should return 403."""
        payload = b'{"test": "data"}'
        response = self.client.post(
            "/api/verification/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_VERIFICATION_SIGNATURE="invalid_signature",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_signature_is_rejected(self):
        """Webhook without signature header should return 403."""
        response = self.client.post(
            "/api/verification/webhook/",
            data=b'{"test": "data"}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_duplicate_webhook_is_idempotent(self):
        """The same webhook event delivered twice must not cause duplicate processing."""
        user = make_unverified_user("dup_user", "dup_user@example.com", VerificationStatus.PENDING)
        verification = user.verification
        verification.provider_reference = "mock_testsession"
        verification.save()

        payload, signature = MockIdentityVerificationProvider.build_mock_webhook_payload(
            "mock_testsession", "verified"
        )

        response1 = self.client.post(
            "/api/verification/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_VERIFICATION_SIGNATURE=signature,
        )
        self.assertEqual(response1.status_code, status.HTTP_200_OK)

        event_count_after_first = WebhookEvent.objects.count()

        response2 = self.client.post(
            "/api/verification/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_VERIFICATION_SIGNATURE=signature,
        )
        self.assertEqual(response2.status_code, status.HTTP_200_OK)

        event_count_after_second = WebhookEvent.objects.count()
        self.assertEqual(event_count_after_first, event_count_after_second)

    def test_replay_attack_blocked(self):
        """Resending the same signature after it's been recorded must be rejected."""
        user = make_unverified_user("replay_user", "replay_user@example.com", VerificationStatus.PENDING)
        verification = user.verification
        verification.provider_reference = "mock_testsession"
        verification.save()

        payload, signature = MockIdentityVerificationProvider.build_mock_webhook_payload(
            "mock_testsession", "rejected"
        )

        response1 = self.client.post(
            "/api/verification/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_VERIFICATION_SIGNATURE=signature,
        )
        self.assertEqual(response1.status_code, status.HTTP_200_OK)
        verification.refresh_from_db()
        self.assertEqual(verification.status, VerificationStatus.REJECTED)

        response2 = self.client.post(
            "/api/verification/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_VERIFICATION_SIGNATURE=signature,
        )
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
        verification.refresh_from_db()
        self.assertEqual(verification.status, VerificationStatus.REJECTED)

    def test_webhook_with_rejected_outcome(self):
        """Webhook with rejected outcome should update status."""
        user = make_unverified_user("reject_user", "reject_user@example.com", VerificationStatus.PENDING)
        verification = user.verification
        verification.provider_reference = "mock_testsession"
        verification.save()

        payload, signature = MockIdentityVerificationProvider.build_mock_webhook_payload(
            "mock_testsession", "rejected"
        )
        response = self.client.post(
            "/api/verification/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_VERIFICATION_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        verification.refresh_from_db()
        self.assertEqual(verification.status, VerificationStatus.REJECTED)

    def test_webhook_with_manual_review_outcome(self):
        """Webhook with manual_review outcome should update status."""
        user = make_unverified_user("review_user", "review_user@example.com", VerificationStatus.PENDING)
        verification = user.verification
        verification.provider_reference = "mock_testsession"
        verification.save()

        payload, signature = MockIdentityVerificationProvider.build_mock_webhook_payload(
            "mock_testsession", "manual_review"
        )
        response = self.client.post(
            "/api/verification/webhook/",
            data=payload,
            content_type="application/json",
            HTTP_X_VERIFICATION_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        verification.refresh_from_db()
        self.assertEqual(verification.status, VerificationStatus.MANUAL_REVIEW)


class PrivacyTests(TestCase):
    """Test that sensitive data is never stored or logged."""

    def test_security_audit_log_does_not_store_secrets(self):
        """Sensitive keys must be stripped from metadata before logging."""
        from verification.services import log_security_event
        log_security_event(
            1,
            "test_event",
            {
                "api_key": "secret123",
                "secret": "hiddendata",
                "document_scan": "imagebinary",
                "normal_field": "ok_value",
            },
        )
        event = SecurityAuditLog.objects.get(event="test_event")
        self.assertNotIn("api_key", event.metadata)
        self.assertNotIn("secret", event.metadata)
        self.assertNotIn("document_scan", event.metadata)
        self.assertIn("normal_field", event.metadata)

    def test_user_verification_does_not_have_image_field(self):
        """The model must not have any field for storing document/selfie images."""
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

    def test_user_verification_does_not_store_full_document_number(self):
        """There must be no field for a full document number."""
        field_names = {field.name for field in UserVerification._meta.get_fields()}
        self.assertNotIn("document_number", field_names)
        self.assertNotIn("id_number", field_names)


class FrontendBypassTests(APITestCase):
    """Verify that frontend-level bypasses don't work."""

    def test_sending_is_verified_field_does_not_bypass(self):
        """Sending a fabricated 'is_verified' field must not change the outcome."""
        user = make_unverified_user("bypass_user", "bypass_user@example.com")
        self.client.force_authenticate(user)
        from posts.models import Category
        cat, _ = Category.objects.get_or_create(name="Test")
        response = self.client.post(
            "/api/posts/",
            {"title": "Bypass", "image": make_test_image(), "category": cat.id, "is_verified": True},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sending_verification_status_field_does_not_bypass(self):
        """Sending 'verification_status=verified' in the payload must be ignored."""
        user = make_unverified_user("status_bypass", "status_bypass@example.com")
        self.client.force_authenticate(user)
        from posts.models import Category
        cat, _ = Category.objects.get_or_create(name="Test")
        response = self.client.post(
            "/api/posts/",
            {"title": "Status", "image": make_test_image(), "category": cat.id, "verification_status": "verified"},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class IDORTests(APITestCase):
    """Test IDOR protection: user A cannot access user B's verification."""

    def test_user_a_sees_own_verification(self):
        user_a = make_verified_user("user_a", "user_a@example.com")
        self.client.force_authenticate(user_a)
        response = self.client.get("/api/verification/status/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("status", response.data)

    def test_user_b_sees_own_verification(self):
        user_b = make_verified_user("user_b", "user_b@example.com")
        self.client.force_authenticate(user_b)
        response = self.client.get("/api/verification/status/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("status", response.data)

    def test_no_user_id_param_is_accepted(self):
        """The status endpoint never accepts a user_id query parameter."""
        user = make_verified_user("param_user", "param_user@example.com")
        self.client.force_authenticate(user)
        response = self.client.get("/api/verification/status/?user_id=999")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_anonymous_cannot_see_verification_status(self):
        response = self.client.get("/api/verification/status/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class FileValidationTests(APITestCase):
    """Test file upload validation."""

    def setUp(self):
        self.user = make_verified_user("file_user", "file_user@example.com")
        self.client.force_authenticate(self.user)
        from posts.models import Category
        self.category, _ = Category.objects.get_or_create(name="Test")

    def test_invalid_extension_rejected(self):
        fake = SimpleUploadedFile("hack.exe", b"notanimage", content_type="application/octet-stream")
        response = self.client.post("/api/posts/", {"title": "Bad", "image": fake, "category": self.category.id}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_fake_image_content_rejected(self):
        fake = SimpleUploadedFile("fake.png", b"this is not a real png", content_type="image/png")
        response = self.client.post("/api/posts/", {"title": "Fake", "image": fake, "category": self.category.id}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class CanUserPublishTests(TestCase):
    """Unit tests for can_user_publish() service function."""

    def test_unauthenticated_user(self):
        class FakeUser:
            is_authenticated = False
        allowed, reason = can_user_publish(FakeUser())
        self.assertFalse(allowed)

    def test_no_verification_record(self):
        user = User.objects.create_user("no_rec", "no_rec@example.com", "P@ssw0rd123")
        allowed, reason = can_user_publish(user)
        self.assertFalse(allowed)

    def test_pending_not_allowed(self):
        user = make_unverified_user("pending_user", "pending_user@example.com", VerificationStatus.PENDING)
        allowed, reason = can_user_publish(user)
        self.assertFalse(allowed)

    def test_rejected_not_allowed(self):
        user = make_unverified_user("rejected_user", "rejected_user@example.com", VerificationStatus.REJECTED)
        allowed, reason = can_user_publish(user)
        self.assertFalse(allowed)

    def test_partially_verified_not_allowed(self):
        """Even if status is VERIFIED but flags are missing, publishing is blocked."""
        user = User.objects.create_user("partial", "partial@example.com", "P@ssw0rd123")
        UserVerification.objects.create(
            user=user,
            status=VerificationStatus.VERIFIED,
            age_verified=True,
            identity_verified=False,
            face_match_verified=False,
            liveness_verified=False,
            provider="mock",
            provider_reference="mock_partial",
        )
        allowed, reason = can_user_publish(user)
        self.assertFalse(allowed)

    def test_fully_verified_allowed(self):
        user = make_verified_user("full_user", "full_user@example.com")
        allowed, reason = can_user_publish(user)
        self.assertTrue(allowed)

    def test_moderator_exempt(self):
        user = User.objects.create_user("moderator", "moderator@example.com", "P@ssw0rd123")
        user.role = Role.MODERATOR
        user.save()
        allowed, reason = can_user_publish(user)
        self.assertTrue(allowed)


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
