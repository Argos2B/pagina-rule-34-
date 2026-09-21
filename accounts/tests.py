from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Role
from .tokens import email_verification_token_generator

User = get_user_model()


class RegistrationTests(APITestCase):
    def test_register_success(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "S3curePassw0rd!",
                "password_confirm": "S3curePassw0rd!",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username="newuser")
        self.assertFalse(user.is_email_verified)
        self.assertEqual(user.role, Role.USER)

    def test_register_password_mismatch(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "newuser2",
                "email": "newuser2@example.com",
                "password": "S3curePassw0rd!",
                "password_confirm": "different",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_duplicate_email(self):
        User.objects.create_user(username="existing", email="dup@example.com", password="S3curePassw0rd!")
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "another",
                "email": "dup@example.com",
                "password": "S3curePassw0rd!",
                "password_confirm": "S3curePassw0rd!",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LoginTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="loginuser", email="login@example.com", password="S3curePassw0rd!")

    def test_login_success(self):
        response = self.client.post("/api/auth/login/", {"username": "loginuser", "password": "S3curePassw0rd!"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_accepts_email(self):
        response = self.client.post("/api/auth/login/", {"username": "login@example.com", "password": "S3curePassw0rd!"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_wrong_password(self):
        response = self.client.post("/api/auth/login/", {"username": "loginuser", "password": "wrong"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_inactive_user_rejected(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        response = self.client.post("/api/auth/login/", {"username": "loginuser", "password": "S3curePassw0rd!"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class MeAndPasswordTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="me", email="me@example.com", password="S3curePassw0rd!")

    def test_me_requires_auth(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_profile(self):
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "me")

    def test_change_password(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/auth/me/change-password/",
            {"old_password": "S3curePassw0rd!", "new_password": "NewS3curePassw0rd!"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewS3curePassw0rd!"))

    def test_change_password_wrong_old_password(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/auth/me/change-password/",
            {"old_password": "wrong", "new_password": "NewS3curePassw0rd!"},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PublicUserProfileTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="publicuser", email="publicuser@example.com", password="S3curePassw0rd!")
        self.suspended = User.objects.create_user(
            username="suspendeduser", email="suspended@example.com", password="S3curePassw0rd!", is_active=False
        )

    def test_anonymous_can_view_public_profile(self):
        response = self.client.get("/api/users/by-username/publicuser/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "publicuser")
        self.assertNotIn("email", response.data)
        self.assertNotIn("is_active", response.data)

    def test_unknown_username_returns_404(self):
        response = self.client.get("/api/users/by-username/doesnotexist/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_suspended_user_profile_not_exposed(self):
        response = self.client.get("/api/users/by-username/suspendeduser/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class PasswordResetTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="reset", email="reset@example.com", password="OldPassw0rd!")

    def test_password_reset_flow(self):
        request_response = self.client.post("/api/auth/password-reset/", {"email": "reset@example.com"})
        self.assertEqual(request_response.status_code, status.HTTP_200_OK)

        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        confirm_response = self.client.post(
            "/api/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": "BrandNewPassw0rd!"},
        )
        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("BrandNewPassw0rd!"))

    def test_password_reset_request_unknown_email_returns_200(self):
        # Must not leak whether an email is registered.
        response = self.client.post("/api/auth/password-reset/", {"email": "unknown@example.com"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        FRONTEND_URL="http://localhost:5173",
    )
    def test_password_reset_email_contains_frontend_reset_link(self):
        response = self.client.post("/api/auth/password-reset/", {"email": "reset@example.com"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("http://localhost:5173/reset-password?uid=", mail.outbox[0].body)


class EmailVerificationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="verify", email="verify@example.com", password="S3curePassw0rd!")

    def test_email_verification_confirm(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = email_verification_token_generator.make_token(self.user)

        response = self.client.post("/api/auth/email/verify/confirm/", {"uid": uid, "token": token})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)


class RolePermissionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="plainuser", email="plain@example.com", password="S3curePassw0rd!")
        self.admin = User.objects.create_user(
            username="adminuser", email="admin@example.com", password="S3curePassw0rd!", role=Role.ADMIN
        )
        self.superadmin = User.objects.create_user(
            username="superadmin", email="super@example.com", password="S3curePassw0rd!", role=Role.SUPERADMIN
        )

    def test_regular_user_cannot_list_users(self):
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_cannot_list_users(self):
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_can_list_users(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_admin_cannot_promote_to_admin(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f"/api/users/{self.user.id}/", {"role": Role.ADMIN})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, Role.USER)

    def test_superadmin_can_promote_to_admin(self):
        self.client.force_authenticate(self.superadmin)
        response = self.client.patch(f"/api/users/{self.user.id}/", {"role": Role.ADMIN})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, Role.ADMIN)

    def test_admin_can_suspend_user(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/users/{self.user.id}/suspend/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)

    def test_admin_cannot_suspend_superadmin(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/users/{self.superadmin.id}/suspend/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_deactivate_superadmin_via_direct_patch(self):
        # Regression test: the "suspend" action blocks this, but a plain PATCH
        # to is_active must be blocked too, otherwise it bypasses the rule.
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f"/api/users/{self.superadmin.id}/", {"is_active": False})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.superadmin.refresh_from_db()
        self.assertTrue(self.superadmin.is_active)

    def test_moderator_cannot_access_user_admin_endpoints(self):
        moderator = User.objects.create_user(
            username="mod_role_test", email="mod_role_test@example.com", password="S3curePassw0rd!", role=Role.MODERATOR
        )
        self.client.force_authenticate(moderator)
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
