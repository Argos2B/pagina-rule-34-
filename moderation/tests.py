import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role
from posts.models import Post

from .models import AuditLog

User = get_user_model()


def make_test_image():
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), color="green").save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile("test.png", buffer.read(), content_type="image/png")


class AuditLogTests(APITestCase):
    def setUp(self):
        self.author = User.objects.create_user(username="author4", email="author4@example.com", password="S3curePassw0rd!")
        self.moderator = User.objects.create_user(
            username="mod4", email="mod4@example.com", password="S3curePassw0rd!", role=Role.MODERATOR
        )
        self.admin = User.objects.create_user(
            username="admin4", email="admin4@example.com", password="S3curePassw0rd!", role=Role.ADMIN
        )
        self.post = Post.objects.create(title="Post", author=self.author, image=make_test_image())

    def test_hiding_post_creates_audit_log(self):
        self.client.force_authenticate(self.moderator)
        response = self.client.post(f"/api/posts/{self.post.id}/hide/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            AuditLog.objects.filter(action="post.hide", actor=self.moderator, target_id=str(self.post.id)).exists()
        )

    def test_audit_log_list_restricted_to_admin(self):
        AuditLog.objects.create(actor=self.moderator, action="post.hide", target_type="post", target_id="1")

        response = self.client.get("/api/moderation/audit-logs/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(self.moderator)
        response = self.client.get("/api/moderation/audit-logs/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/moderation/audit-logs/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_stats_view_requires_moderator(self):
        response = self.client.get("/api/moderation/stats/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(self.moderator)
        response = self.client.get("/api/moderation/stats/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("posts_total", response.data)
