import io
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role
from posts.models import Category, Post, Tag
from .search_contract import SearchMode, SearchQuery, SearchResult, SearchService

User = get_user_model()


def make_test_image(name="test.png", fmt="PNG", size=(10, 10)):
    buffer = io.BytesIO()
    Image.new("RGB", size, color="red").save(buffer, format=fmt)
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/png")


class APIV1BaseTests(APITestCase):
    def test_api_root_returns_envelope(self):
        response = self.client.get("/api/v1/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("success", response.data)
        self.assertNotIn("message", response.data)
        self.assertEqual(response.data["data"]["version"], "v1")
        self.assertIn("errors", response.data)

    def test_health_returns_ok(self):
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("success", response.data)
        self.assertEqual(response.data["data"]["api"], "ok")

    def test_v1_login_works(self):
        User.objects.create_user(username="v1login", email="v1login@example.com", password="S3curePassw0rd!")
        response = self.client.post("/api/v1/auth/login/", {"username": "v1login", "password": "S3curePassw0rd!"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_v1_not_found_is_enveloped(self):
        response = self.client.get("/api/v1/does-not-exist/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("success", response.json())
        self.assertIn("errors", response.json())

    def test_v1_admin_user_endpoint_requires_auth(self):
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_v1_regular_user_cannot_access_user_admin(self):
        user = User.objects.create_user(username="v1normal", email="v1normal@example.com", password="S3curePassw0rd!")
        self.client.force_authenticate(user)
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_v1_user_cannot_patch_other_user(self):
        owner = User.objects.create_user(username="owner", email="owner@example.com", password="S3curePassw0rd!")
        other = User.objects.create_user(username="other", email="other@example.com", password="S3curePassw0rd!")
        self.client.force_authenticate(owner)
        response = self.client.patch(f"/api/v1/users/{other.id}/", {"username": "hijacked"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class SearchViewTests(APITestCase):
    def setUp(self):
        self.author = User.objects.create_user(username="search_author", email="search_author@example.com", password="S3curePassw0rd!")
        self.other = User.objects.create_user(username="other_user", email="other_user@example.com", password="S3curePassw0rd!")
        self.moderator = User.objects.create_user(
            username="search_mod", email="search_mod@example.com", password="S3curePassw0rd!", role=Role.MODERATOR
        )
        self.category = Category.objects.create(name="General", slug="general")
        self.tag = Tag.objects.create(name="nature", slug="nature")

        self.public_post = Post.objects.create(
            title="Example public title",
            description="A public description about nature.",
            author=self.author,
            category=self.category,
            image=make_test_image(),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.PUBLIC,
        )
        self.public_post.tags.add(self.tag)

        self.private_post = Post.objects.create(
            title="Private example",
            description="Private content that should stay hidden.",
            author=self.author,
            category=self.category,
            image=make_test_image(),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.PRIVATE,
        )

        self.draft_post = Post.objects.create(
            title="Draft example",
            description="Draft content not for public search.",
            author=self.author,
            category=self.category,
            image=make_test_image(),
            status=Post.Status.DRAFT,
            visibility=Post.Visibility.PUBLIC,
        )

        self.hidden_post = Post.objects.create(
            title="Hidden example",
            description="Hidden content not for public search.",
            author=self.author,
            category=self.category,
            image=make_test_image(),
            status=Post.Status.HIDDEN,
            visibility=Post.Visibility.PUBLIC,
        )

        self.unlisted_post = Post.objects.create(
            title="Unlisted example",
            description="Unlisted content should not appear in search results.",
            author=self.author,
            category=self.category,
            image=make_test_image(),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.UNLISTED,
        )

    def test_anonymous_search_works_and_uses_v1_envelope(self):
        response = self.client.get("/api/v1/search/", {"q": "example"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("success", response.data)
        self.assertNotIn("message", response.data)
        self.assertIn("data", response.data)
        self.assertIn("meta", response.data)
        self.assertIn("errors", response.data)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertIn(self.public_post.id, ids)
        self.assertNotIn(self.private_post.id, ids)
        self.assertNotIn(self.unlisted_post.id, ids)
        self.assertNotIn(self.draft_post.id, ids)
        self.assertNotIn(self.hidden_post.id, ids)

    def test_authenticated_user_search_works_and_includes_own_content(self):
        self.client.force_authenticate(self.author)
        response = self.client.get("/api/v1/search/", {"q": "example"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertIn(self.public_post.id, ids)
        self.assertIn(self.private_post.id, ids)
        self.assertIn(self.draft_post.id, ids)
        self.assertIn(self.hidden_post.id, ids)
        self.assertIn(self.unlisted_post.id, ids)

    def test_unlisted_posts_are_visible_to_owner_but_hidden_from_other_users(self):
        owner = self.author
        other = self.other
        moderator = self.moderator

        unlisted = Post.objects.create(
            title="Owner only unlisted post",
            description="This post is unlisted and belongs to owner.",
            author=owner,
            category=self.category,
            image=make_test_image(name="owner_unlisted.png"),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.UNLISTED,
        )

        self.client.force_authenticate(owner)
        response = self.client.get("/api/v1/search/", {"q": "Owner only"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(unlisted.id, {item["id"] for item in response.data["data"]["results"]})

        self.client.force_authenticate(other)
        response = self.client.get("/api/v1/search/", {"q": "Owner only"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(unlisted.id, {item["id"] for item in response.data["data"]["results"]})

        self.client.force_authenticate(moderator)
        response = self.client.get("/api/v1/search/", {"q": "Owner only"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(unlisted.id, {item["id"] for item in response.data["data"]["results"]})

        self.client.force_authenticate(None)
        response = self.client.get("/api/v1/search/", {"q": "Owner only"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(unlisted.id, {item["id"] for item in response.data["data"]["results"]})

    def test_search_matches_title_and_description(self):
        response = self.client.get("/api/v1/search/", {"q": "nature"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertIn(self.public_post.id, ids)

        response = self.client.get("/api/v1/search/", {"q": "private content"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertNotIn(self.private_post.id, ids)

    def test_search_empty_query_returns_recent_public_posts(self):
        response = self.client.get("/api/v1/search/", {"q": ""})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["data"]["count"], 1)
        self.assertIn(self.public_post.id, {item["id"] for item in response.data["data"]["results"]})

    def test_search_excludes_deleted_posts(self):
        self.public_post.is_deleted = True
        self.public_post.deleted_at = self.public_post.created_at
        self.public_post.save(update_fields=["is_deleted", "deleted_at"])
        response = self.client.get("/api/v1/search/", {"q": "example"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertNotIn(self.public_post.id, ids)

    def test_search_respects_pagination(self):
        for i in range(25):
            Post.objects.create(
                title=f"Pagination post {i}",
                description=f"Pagination example {i}",
                author=self.author,
                category=self.category,
                image=make_test_image(name=f"p{i}.png"),
                status=Post.Status.PUBLISHED,
                visibility=Post.Visibility.PUBLIC,
            )
        response = self.client.get("/api/v1/search/", {"q": "Pagination", "page": "2", "page_size": "10"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]["results"]), 10)
        self.assertEqual(response.data["data"]["page"], 2)
        self.assertEqual(response.data["data"]["page_size"], 10)

    def test_moderator_search_sees_hidden_and_private_content(self):
        self.client.force_authenticate(self.moderator)
        response = self.client.get("/api/v1/search/", {"q": "example"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertIn(self.private_post.id, ids)
        self.assertIn(self.hidden_post.id, ids)
        self.assertIn(self.draft_post.id, ids)

    def test_search_ignores_client_visibility_and_status_overrides(self):
        response = self.client.get("/api/v1/search/", {"q": "example", "visibility": "private"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertNotIn(self.private_post.id, ids)

        response = self.client.get("/api/v1/search/", {"q": "example", "status": "hidden"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertNotIn(self.hidden_post.id, ids)

    def test_search_filters_by_category_tag_and_author(self):
        other_author = User.objects.create_user(username="filtered_author", email="filtered_author@example.com", password="S3curePassw0rd!")
        other_category = Category.objects.create(name="Travel", slug="travel")
        other_tag = Tag.objects.create(name="beach", slug="beach")

        target = Post.objects.create(
            title="Coastal escape",
            description="A beach holiday story.",
            author=other_author,
            category=other_category,
            image=make_test_image(name="coastal.png"),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.PUBLIC,
        )
        target.tags.add(other_tag)

        response = self.client.get("/api/v1/search/", {"q": "beach", "category": "travel", "tags": "beach", "author": other_author.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertIn(target.id, ids)

    def test_search_ordering_supports_newest_oldest_and_updated(self):
        older = Post.objects.create(
            title="Old post",
            description="Old content.",
            author=self.author,
            category=self.category,
            image=make_test_image(name="old.png"),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.PUBLIC,
        )
        older.created_at = timezone.now() - timedelta(days=2)
        older.updated_at = older.created_at
        older.save(update_fields=["created_at", "updated_at"])

        newer = Post.objects.create(
            title="New post",
            description="New content.",
            author=self.author,
            category=self.category,
            image=make_test_image(name="new.png"),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.PUBLIC,
        )
        newer.created_at = timezone.now() - timedelta(days=1)
        newer.updated_at = newer.created_at
        newer.save(update_fields=["created_at", "updated_at"])

        response = self.client.get("/api/v1/search/", {"ordering": "newest", "q": "content"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["data"]["results"]]
        self.assertLess(ids.index(newer.id), ids.index(older.id))

        response = self.client.get("/api/v1/search/", {"ordering": "oldest", "q": "content"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["data"]["results"]]
        self.assertLess(ids.index(older.id), ids.index(newer.id))

        newer.updated_at = newer.updated_at
        newer.save(update_fields=["updated_at"])
        response = self.client.get("/api/v1/search/", {"ordering": "updated", "q": "content"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["data"]["results"]]
        self.assertLess(ids.index(newer.id), ids.index(older.id))

    def test_search_page_size_is_capped_at_100(self):
        response = self.client.get("/api/v1/search/", {"page_size": "150"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertLessEqual(response.data["data"]["page_size"], 100)
        self.assertEqual(response.data["data"]["page_size"], 100)


class ExploreViewTests(APITestCase):
    def setUp(self):
        self.author = User.objects.create_user(username="explore_author", email="explore_author@example.com", password="S3curePassw0rd!")
        self.other = User.objects.create_user(username="explore_other", email="explore_other@example.com", password="S3curePassw0rd!")
        self.moderator = User.objects.create_user(
            username="explore_mod", email="explore_mod@example.com", password="S3curePassw0rd!", role=Role.MODERATOR
        )
        self.category = Category.objects.create(name="Explore Category", slug="explore-category")
        self.tag1 = Tag.objects.create(name="tag1", slug="tag1")
        self.tag2 = Tag.objects.create(name="tag2", slug="tag2")

        self.public_post = Post.objects.create(
            title="Public explore post",
            description="Public description for explore.",
            author=self.author,
            category=self.category,
            image=make_test_image(name="public_explore.png"),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.PUBLIC,
        )
        self.public_post.tags.add(self.tag1)

        self.draft_post = Post.objects.create(
            title="Draft explore post",
            description="Draft content must not be returned.",
            author=self.author,
            category=self.category,
            image=make_test_image(name="draft_explore.png"),
            status=Post.Status.DRAFT,
            visibility=Post.Visibility.PUBLIC,
        )

        self.hidden_post = Post.objects.create(
            title="Hidden explore post",
            description="Hidden content must not be returned.",
            author=self.author,
            category=self.category,
            image=make_test_image(name="hidden_explore.png"),
            status=Post.Status.HIDDEN,
            visibility=Post.Visibility.PUBLIC,
        )

        self.private_post = Post.objects.create(
            title="Private explore post",
            description="Private content must not be returned.",
            author=self.author,
            category=self.category,
            image=make_test_image(name="private_explore.png"),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.PRIVATE,
        )

        self.unlisted_post = Post.objects.create(
            title="Unlisted explore post",
            description="Unlisted content is owner only.",
            author=self.author,
            category=self.category,
            image=make_test_image(name="unlisted_explore.png"),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.UNLISTED,
        )
        self.unlisted_post.tags.add(self.tag2)

        self.deleted_post = Post.objects.create(
            title="Deleted explore post",
            description="Deleted content must not be returned.",
            author=self.author,
            category=self.category,
            image=make_test_image(name="deleted_explore.png"),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.PUBLIC,
        )
        self.deleted_post.is_deleted = True
        self.deleted_post.deleted_at = timezone.now()
        self.deleted_post.save(update_fields=["is_deleted", "deleted_at"])

    def test_explore_endpoint_works_and_uses_v1_envelope(self):
        response = self.client.get("/api/v1/explore/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("success", response.data)
        self.assertNotIn("message", response.data)
        self.assertIn("data", response.data)
        self.assertIn("meta", response.data)
        self.assertIn("errors", response.data)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertIn(self.public_post.id, ids)
        self.assertNotIn(self.draft_post.id, ids)
        self.assertNotIn(self.hidden_post.id, ids)
        self.assertNotIn(self.private_post.id, ids)
        self.assertNotIn(self.unlisted_post.id, ids)
        self.assertNotIn(self.deleted_post.id, ids)

    def test_authenticated_user_keeps_real_visibility_policy(self):
        self.client.force_authenticate(self.author)
        response = self.client.get("/api/v1/explore/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertIn(self.public_post.id, ids)
        self.assertIn(self.unlisted_post.id, ids)
        self.assertNotIn(self.draft_post.id, ids)
        self.assertNotIn(self.hidden_post.id, ids)
        self.assertNotIn(self.private_post.id, ids)

        self.client.force_authenticate(self.other)
        response = self.client.get("/api/v1/explore/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertIn(self.public_post.id, ids)
        self.assertNotIn(self.unlisted_post.id, ids)
        self.assertNotIn(self.private_post.id, ids)
        self.assertNotIn(self.hidden_post.id, ids)
        self.assertNotIn(self.draft_post.id, ids)

    def test_moderator_keeps_existing_privileges(self):
        self.client.force_authenticate(self.moderator)
        response = self.client.get("/api/v1/explore/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertIn(self.public_post.id, ids)
        self.assertIn(self.private_post.id, ids)
        self.assertIn(self.hidden_post.id, ids)
        self.assertIn(self.draft_post.id, ids)
        self.assertIn(self.unlisted_post.id, ids)
        self.assertNotIn(self.deleted_post.id, ids)

    def test_explore_filters_by_category_and_tags(self):
        response = self.client.get("/api/v1/explore/", {"category": self.category.id, "tags": "tag1,tag2"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data["data"]["results"]}
        self.assertIn(self.public_post.id, ids)
        self.assertIn(self.unlisted_post.id, ids)

    def test_explore_supports_real_ordering(self):
        older = Post.objects.create(
            title="Older explore post",
            description="Old explore content.",
            author=self.author,
            category=self.category,
            image=make_test_image(name="older_explore.png"),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.PUBLIC,
        )
        older.created_at = timezone.now() - timedelta(days=2)
        older.updated_at = older.created_at
        older.save(update_fields=["created_at", "updated_at"])

        newer = Post.objects.create(
            title="Newer explore post",
            description="New explore content.",
            author=self.author,
            category=self.category,
            image=make_test_image(name="newer_explore.png"),
            status=Post.Status.PUBLISHED,
            visibility=Post.Visibility.PUBLIC,
        )
        newer.created_at = timezone.now() - timedelta(days=1)
        newer.updated_at = newer.created_at
        newer.save(update_fields=["created_at", "updated_at"])

        response = self.client.get("/api/v1/explore/", {"ordering": "newest"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["data"]["results"]]
        self.assertLess(ids.index(newer.id), ids.index(older.id))

        response = self.client.get("/api/v1/explore/", {"ordering": "oldest"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["data"]["results"]]
        self.assertLess(ids.index(older.id), ids.index(newer.id))

        newer.updated_at = timezone.now()
        newer.save(update_fields=["updated_at"])
        response = self.client.get("/api/v1/explore/", {"ordering": "updated"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["data"]["results"]]
        self.assertLess(ids.index(newer.id), ids.index(older.id))

    def test_explore_invalid_ordering_falls_back_to_safe_default(self):
        response = self.client.get("/api/v1/explore/", {"ordering": "author_id"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data["data"])

    def test_explore_pagination_works(self):
        for i in range(25):
            Post.objects.create(
                title=f"Explore paginate {i}",
                description=f"Explore pagination detail {i}",
                author=self.author,
                category=self.category,
                image=make_test_image(name=f"page_{i}.png"),
                status=Post.Status.PUBLISHED,
                visibility=Post.Visibility.PUBLIC,
            )

        response = self.client.get("/api/v1/explore/", {"page": "2", "page_size": "10"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["data"]["results"]), 10)
        self.assertEqual(response.data["data"]["page"], 2)
        self.assertEqual(response.data["data"]["page_size"], 10)

    def test_explore_preserves_search_routes(self):
        response = self.client.get("/api/v1/search/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self.client.get("/api/v1/search/contract/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class SearchContractTests(TestCase):
    def test_search_mode_accepts_only_defined_values(self):
        self.assertEqual(SearchMode.TRADITIONAL.value, "traditional")
        self.assertEqual(SearchMode.SEMANTIC.value, "semantic")
        self.assertEqual(SearchMode.HYBRID.value, "hybrid")
        self.assertEqual(SearchMode.AI.value, "ai")

    def test_search_query_builds_valid_contract(self):
        query = SearchQuery(
            query="test",
            mode=SearchMode.TRADITIONAL,
            filters={"status": "published"},
            tags=["tag1"],
            categories=["general"],
            author=1,
            visibility="public",
            ordering="-created_at",
            pagination={"page": 1, "page_size": 20},
            include_related=True,
            language="es",
        )
        self.assertEqual(query.mode, SearchMode.TRADITIONAL)
        self.assertEqual(query.query, "test")
        self.assertTrue(query.include_related)

    def test_search_service_handles_traditional_query(self):
        query = SearchQuery(query="welcome", mode=SearchMode.TRADITIONAL, pagination={"page": 1, "page_size": 10})
        result = SearchService().execute(query)
        self.assertIsInstance(result, SearchResult)
        self.assertEqual(result.mode, SearchMode.TRADITIONAL)

    def test_search_service_rejects_non_traditional_modes_without_providers(self):
        query = SearchQuery(query="welcome", mode=SearchMode.SEMANTIC)
        with self.assertRaises(ValueError):
            SearchService().execute(query)

    def test_search_contract_available(self):
        response = self.client.get("/api/v1/search/contract/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("success", response.json())
        self.assertIn("search_modes", response.json()["data"])
