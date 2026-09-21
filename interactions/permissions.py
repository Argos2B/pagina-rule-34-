from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsCommentAuthorOrModerator(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True

        user = request.user
        if not (user and user.is_authenticated):
            return False

        return obj.author_id == user.id or user.is_moderator
