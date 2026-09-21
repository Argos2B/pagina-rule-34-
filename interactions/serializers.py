from rest_framework import serializers

from posts.models import Post

from .models import Comment, Favorite, Report


def _ensure_post_is_accessible(post: Post, user) -> None:
    """Raise a validation error unless ``user`` is allowed to view ``post``.

    Prevents an IDOR-style bypass where a user could favorite/comment on a
    private or unlisted-to-them post just by knowing/guessing its numeric ID,
    even though they could never actually retrieve that post via the API.
    """
    if post.is_deleted:
        raise serializers.ValidationError("Esta publicación ya no está disponible.")

    if post.author_id == user.id or getattr(user, "is_moderator", False):
        return

    is_public = post.status == Post.Status.PUBLISHED and post.visibility in (
        Post.Visibility.PUBLIC,
        Post.Visibility.UNLISTED,
    )
    if not is_public:
        raise serializers.ValidationError("No tienes permiso para interactuar con esta publicación.")


class FavoriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Favorite
        fields = ["id", "post", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_post(self, post):
        _ensure_post_is_accessible(post, self.context["request"].user)
        return post

    def create(self, validated_data):
        user = self.context["request"].user
        favorite, _created = Favorite.objects.get_or_create(user=user, post=validated_data["post"])
        return favorite


class CommentSerializer(serializers.ModelSerializer):
    author_username = serializers.CharField(source="author.username", read_only=True)

    class Meta:
        model = Comment
        fields = [
            "id",
            "post",
            "author",
            "author_username",
            "content",
            "is_hidden",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "author", "is_hidden", "created_at", "updated_at"]

    def validate_post(self, post):
        _ensure_post_is_accessible(post, self.context["request"].user)
        return post


class ReportSerializer(serializers.ModelSerializer):
    reporter_username = serializers.CharField(source="reporter.username", read_only=True)

    class Meta:
        model = Report
        fields = [
            "id",
            "reporter",
            "reporter_username",
            "target_type",
            "post",
            "comment",
            "reported_user",
            "reason",
            "details",
            "status",
            "created_at",
            "reviewed_by",
            "reviewed_at",
        ]
        read_only_fields = ["id", "reporter", "status", "created_at", "reviewed_by", "reviewed_at"]

    def validate(self, attrs):
        target_type = attrs.get("target_type")
        target_map = {
            "post": attrs.get("post"),
            "comment": attrs.get("comment"),
            "user": attrs.get("reported_user"),
        }
        if not target_map.get(target_type):
            raise serializers.ValidationError(
                f"Debes indicar el campo correspondiente para target_type='{target_type}'."
            )
        return attrs


class ReportResolveSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[Report.Status.REVIEWED, Report.Status.REJECTED, Report.Status.ACTIONED])
    note = serializers.CharField(required=False, allow_blank=True)
