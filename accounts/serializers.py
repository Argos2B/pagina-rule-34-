from django.contrib.auth import password_validation
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Role, User
from .tokens import email_verification_token_generator


class EmailOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Allow users to sign in with either username or email address."""

    def validate(self, attrs):
        login_value = attrs.get(self.username_field, "")
        if "@" in login_value:
            user = User.objects.filter(email__iexact=login_value).only("username").first()
            if user is not None:
                attrs[self.username_field] = user.username
        return super().validate(attrs)


class UserPublicSerializer(serializers.ModelSerializer):
    """Read-only, safe-to-expose representation of a user."""

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "avatar",
            "biography",
            "role",
            "date_joined",
        ]
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    password_confirm = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "password_confirm"]

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Ya existe una cuenta con este correo.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Las contraseñas no coinciden."})
        password_validation.validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        user = User(**validated_data, role=Role.USER)
        user.set_password(password)
        user.save()
        return user


class MeSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "avatar",
            "biography",
            "role",
            "is_email_verified",
            "date_joined",
        ]
        read_only_fields = ["id", "username", "role", "is_email_verified", "date_joined"]

    def update(self, instance, validated_data):
        new_email = validated_data.get("email")
        if new_email and new_email.lower() != instance.email.lower():
            if User.objects.exclude(pk=instance.pk).filter(email__iexact=new_email).exists():
                raise serializers.ValidationError({"email": "Ya existe una cuenta con este correo."})
            instance.is_email_verified = False
        return super().update(instance, validated_data)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("La contraseña actual es incorrecta.")
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, user=self.context["request"].user)
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class _UidTokenSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()

    def _get_user(self):
        try:
            uid = force_str(urlsafe_base64_decode(self.initial_data.get("uid", "")))
            return User.objects.get(pk=uid)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return None


class PasswordResetConfirmSerializer(_UidTokenSerializer):
    new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = self._get_user()
        if user is None or not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError("El enlace de recuperación no es válido o ha expirado.")
        password_validation.validate_password(attrs["new_password"], user=user)
        attrs["user"] = user
        return attrs

    def save(self, **kwargs):
        user = self.validated_data["user"]
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class EmailVerificationConfirmSerializer(_UidTokenSerializer):
    def validate(self, attrs):
        user = self._get_user()
        if user is None or not email_verification_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError("El enlace de verificación no es válido o ha expirado.")
        attrs["user"] = user
        return attrs

    def save(self, **kwargs):
        user = self.validated_data["user"]
        user.is_email_verified = True
        user.save(update_fields=["is_email_verified"])
        return user


class UserAdminSerializer(serializers.ModelSerializer):
    """Used by admins/superadmins to administer accounts."""

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "role",
            "is_active",
            "is_email_verified",
            "date_joined",
        ]
        read_only_fields = ["id", "username", "email", "is_email_verified", "date_joined"]
