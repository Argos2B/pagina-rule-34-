import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role

from .models import Post

User = get_user_model()


def make_test_image(name="test.png", fmt="PNG", size=(10, 10)):
    buffer = io.BytesIO()
    Image.new("RGB", size, color="red").save(buffer, format=fmt)
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/png")


class PostCreationTests(APITestCase):
    def setUp(self):
        self.author = User.objects.create_user(username="author", email="author@example.com", password="S3curePassw0rd!")
        self.other_user = User.objects.create_user(username="other", email="other@example.com", password="S3curePassw0rd!")
        self.moderator = User.objects.create_user(
            username="moderator", email="mod@example.com", password="S3curePassw0rd!", role=Role.MODERATOR
        )

    def test_create_post_requires_auth(self):
        response = self.client.post("/api/posts/", {"title": "Hello", "image": make_test_image()}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_post_authenticated(self):
        self.client.force_authenticate(self.author)
        response = self.client.post(
            "/api/posts/",
            {"title": "Hello world", "description": "desc", "image": make_test_image()},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        post = Post.objects.get(id=response.data["id"])
        self.assertEqual(post.author, self.author)

    def test_reject_invalid_file_extension(self):
        self.client.force_authenticate(self.author)
        fake_file = SimpleUploadedFile("malicious.exe", b"not an image", content_type="application/octet-stream")
        response = self.client.post(
            "/api/posts/", {"title": "Bad file", "image": fake_file}, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_fake_image_with_image_extension(self):
        self.client.force_authenticate(self.author)
        # A .png extension but the content is not a real image (MIME sniffing must catch this).
        fake_file = SimpleUploadedFile("fake.png", b"this is not really a png file", content_type="image/png")
        response = self.client.post(
            "/api/posts/", {"title": "Fake image", "image": fake_file}, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PostOwnershipTests(APITestCase):
    def setUp(self):
        self.author = User.objects.create_user(username="author2", email="author2@example.com", password="S3curePassw0rd!")
        self.other_user = User.objects.create_user(username="other2", email="other2@example.com", password="S3curePassw0rd!")
        self.moderator = User.objects.create_user(
            username="mod2", email="mod2@example.com", password="S3curePassw0rd!", role=Role.MODERATOR
        )
        self.post = Post.objects.create(title="Original", author=self.author, image=make_test_image())

    def test_owner_can_update_post(self):
        self.client.force_authenticate(self.author)
        response = self.client.patch(f"/api/posts/{self.post.id}/", {"title": "Updated"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.post.refresh_from_db()
        self.assertEqual(self.post.title, "Updated")

    def test_non_owner_cannot_update_post(self):
        self.client.force_authenticate(self.other_user)
        response = self.client.patch(f"/api/posts/{self.post.id}/", {"title": "Hacked"})
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        self.post.refresh_from_db()
        self.assertEqual(self.post.title, "Original")

    def test_owner_can_delete_post_soft_delete(self):
        self.client.force_authenticate(self.author)
        response = self.client.delete(f"/api/posts/{self.post.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.post.refresh_from_db()
        self.assertTrue(self.post.is_deleted)

    def test_non_owner_cannot_delete_post(self):
        self.client.force_authenticate(self.other_user)
        response = self.client.delete(f"/api/posts/{self.post.id}/")
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        self.post.refresh_from_db()
        self.assertFalse(self.post.is_deleted)

    def test_moderator_can_hide_post(self):
        self.client.force_authenticate(self.moderator)
        response = self.client.post(f"/api/posts/{self.post.id}/hide/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.post.refresh_from_db()
        self.assertEqual(self.post.status, Post.Status.HIDDEN)

    def test_regular_user_cannot_hide_post(self):
        self.client.force_authenticate(self.other_user)
        response = self.client.post(f"/api/posts/{self.post.id}/hide/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_reassign_author_via_payload(self):
        # "author" must stay read-only: sending a different author id in the
        # payload must not let a user hijack authorship of an existing post.
        self.client.force_authenticate(self.author)
        response = self.client.patch(f"/api/posts/{self.post.id}/", {"author": self.other_user.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.post.refresh_from_db()
        self.assertEqual(self.post.author_id, self.author.id)

    def test_deleted_post_not_reachable_even_by_owner(self):
        self.client.force_authenticate(self.author)
        delete_response = self.client.delete(f"/api/posts/{self.post.id}/")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)

        get_response = self.client.get(f"/api/posts/{self.post.id}/")
        self.assertEqual(get_response.status_code, status.HTTP_404_NOT_FOUND)

        patch_response = self.client.patch(f"/api/posts/{self.post.id}/", {"title": "resurrected"})
        self.assertEqual(patch_response.status_code, status.HTTP_404_NOT_FOUND)


class PostVisibilityTests(APITestCase):
    def setUp(self):
        self.author = User.objects.create_user(username="author5", email="author5@example.com", password="S3curePassw0rd!")
        self.stranger = User.objects.create_user(username="stranger5", email="stranger5@example.com", password="S3curePassw0rd!")
        self.unlisted_post = Post.objects.create(
            title="Unlisted",
            author=self.author,
            image=make_test_image(),
            visibility=Post.Visibility.UNLISTED,
        )

    def test_unlisted_post_not_in_public_list(self):
        self.client.force_authenticate(self.stranger)
        response = self.client.get("/api/posts/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = [item["id"] for item in response.data["results"]]
        self.assertNotIn(self.unlisted_post.id, returned_ids)

    def test_unlisted_post_reachable_by_direct_link(self):
        self.client.force_authenticate(self.stranger)
        response = self.client.get(f"/api/posts/{self.unlisted_post.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
