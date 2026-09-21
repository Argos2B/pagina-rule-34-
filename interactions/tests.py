import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role
from posts.models import Post

from .models import Comment, Favorite, Report

User = get_user_model()


def make_test_image():
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10), color="blue").save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile("test.png", buffer.read(), content_type="image/png")


class InteractionsTestCase(APITestCase):
    def setUp(self):
        self.author = User.objects.create_user(username="author3", email="author3@example.com", password="S3curePassw0rd!")
        self.user = User.objects.create_user(username="user3", email="user3@example.com", password="S3curePassw0rd!")
        self.moderator = User.objects.create_user(
            username="mod3", email="mod3@example.com", password="S3curePassw0rd!", role=Role.MODERATOR
        )
        self.post = Post.objects.create(title="Post", author=self.author, image=make_test_image())


class FavoriteTests(InteractionsTestCase):
    def test_favorite_create_and_duplicate_is_idempotent(self):
        self.client.force_authenticate(self.user)
        response = self.client.post("/api/favorites/", {"post": self.post.id})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response_dup = self.client.post("/api/favorites/", {"post": self.post.id})
        self.assertEqual(response_dup.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Favorite.objects.filter(user=self.user, post=self.post).count(), 1)

    def test_favorite_requires_auth(self):
        response = self.client.post("/api/favorites/", {"post": self.post.id})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class CommentTests(InteractionsTestCase):
    def test_create_comment(self):
        self.client.force_authenticate(self.user)
        response = self.client.post("/api/comments/", {"post": self.post.id, "content": "Nice post!"})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_non_owner_cannot_delete_comment(self):
        comment = Comment.objects.create(post=self.post, author=self.user, content="hi")
        other = User.objects.create_user(username="stranger", email="stranger@example.com", password="S3curePassw0rd!")
        self.client.force_authenticate(other)
        response = self.client.delete(f"/api/comments/{comment.id}/")
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_moderator_can_hide_comment(self):
        comment = Comment.objects.create(post=self.post, author=self.user, content="hi")
        self.client.force_authenticate(self.moderator)
        response = self.client.post(f"/api/comments/{comment.id}/hide/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        comment.refresh_from_db()
        self.assertTrue(comment.is_hidden)


class ReportTests(InteractionsTestCase):
    def test_create_report(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/reports/",
            {"target_type": "post", "post": self.post.id, "reason": "Spam"},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_regular_user_cannot_list_all_reports(self):
        Report.objects.create(reporter=self.author, target_type="post", post=self.post, reason="spam")
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/reports/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 0)

    def test_moderator_can_resolve_report(self):
        report = Report.objects.create(reporter=self.user, target_type="post", post=self.post, reason="spam")
        self.client.force_authenticate(self.moderator)
        response = self.client.post(f"/api/reports/{report.id}/resolve/", {"status": "reviewed"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        report.refresh_from_db()
        self.assertEqual(report.status, Report.Status.REVIEWED)
        self.assertEqual(report.reviewed_by, self.moderator)

    def test_regular_user_cannot_resolve_report(self):
        report = Report.objects.create(reporter=self.user, target_type="post", post=self.post, reason="spam")
        self.client.force_authenticate(self.user)
        response = self.client.post(f"/api/reports/{report.id}/resolve/", {"status": "reviewed"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class PrivatePostInteractionIDORTests(InteractionsTestCase):
    """Regression tests: a user must not be able to favorite/comment on a
    private post owned by someone else just by guessing/knowing its ID.
    """

    def setUp(self):
        super().setUp()
        self.private_post = Post.objects.create(
            title="Secret",
            author=self.author,
            image=make_test_image(),
            visibility=Post.Visibility.PRIVATE,
        )

    def test_stranger_cannot_favorite_private_post(self):
        self.client.force_authenticate(self.user)
        response = self.client.post("/api/favorites/", {"post": self.private_post.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Favorite.objects.filter(user=self.user, post=self.private_post).exists())

    def test_stranger_cannot_comment_on_private_post(self):
        self.client.force_authenticate(self.user)
        response = self.client.post("/api/comments/", {"post": self.private_post.id, "content": "sneaky"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Comment.objects.filter(post=self.private_post).exists())

    def test_owner_can_favorite_and_comment_on_own_private_post(self):
        self.client.force_authenticate(self.author)
        fav_response = self.client.post("/api/favorites/", {"post": self.private_post.id})
        self.assertEqual(fav_response.status_code, status.HTTP_201_CREATED)

        comment_response = self.client.post(
            "/api/comments/", {"post": self.private_post.id, "content": "my own post"}
        )
        self.assertEqual(comment_response.status_code, status.HTTP_201_CREATED)

    def test_moderator_can_favorite_and_comment_on_private_post(self):
        self.client.force_authenticate(self.moderator)
        fav_response = self.client.post("/api/favorites/", {"post": self.private_post.id})
        self.assertEqual(fav_response.status_code, status.HTTP_201_CREATED)

        comment_response = self.client.post(
            "/api/comments/", {"post": self.private_post.id, "content": "moderating"}
        )
        self.assertEqual(comment_response.status_code, status.HTTP_201_CREATED)
