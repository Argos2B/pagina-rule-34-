from django.contrib.auth.tokens import PasswordResetTokenGenerator


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """Signed, single-use token used to verify a user's email address.

    Reuses Django's battle-tested ``PasswordResetTokenGenerator`` hashing
    scheme, but mixes in ``is_email_verified`` so the token becomes invalid
    as soon as it has been used once (and rotates if the email changes).
    """

    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{user.email}{user.is_email_verified}{timestamp}"


email_verification_token_generator = EmailVerificationTokenGenerator()
