from django.utils.text import slugify
from django.db import transaction
from rest_framework import serializers

from .models import Category, Post, Tag


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "created_at"]
        read_only_fields = ["id", "slug", "created_at"]


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "slug"]
        read_only_fields = ["id", "slug"]


class TagField(serializers.SlugRelatedField):
    """Accepts/returns tags by name and auto-creates unknown ones."""

    def __init__(self, **kwargs):
        kwargs.setdefault("slug_field", "name")
        kwargs.setdefault("queryset", Tag.objects.all())
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        # Normalize the incoming tag value: strip whitespace, lower-case
        # and remove any leading '#' characters that users may include.
        name = str(data).strip().lower()
        # remove leading hashmarks often typed by users (e.g. "#aurora")
        name = name.lstrip("#").strip()
        if not name:
            raise serializers.ValidationError("El nombre de la etiqueta no puede estar vacío.")
        tag, _created = Tag.objects.get_or_create(name=name, defaults={"slug": slugify(name)})
        return tag


class PostSerializer(serializers.ModelSerializer):
    author_username = serializers.CharField(source="author.username", read_only=True)
    tags = TagField(many=True, required=False)
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Post

        fields = [
            "id",
            "title",
            "description",
            "image",
            "author",
            "author_username",
            "category",
            "category_name",
            "tags",
            "status",
            "visibility",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "author",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        tags = validated_data.pop("tags", [])
        # Wrap creation in a transaction to avoid partially-created posts
        # in case tag association or subsequent operations fail.
        with transaction.atomic():
            post = Post.objects.create(**validated_data)
            if tags:
                post.tags.set(tags)
        return post

    def update(self, instance, validated_data):
        tags = validated_data.pop("tags", None)
        # Use transaction for update that may touch M2M relationships.
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if tags is not None:
                instance.tags.set(tags)
        return instance
