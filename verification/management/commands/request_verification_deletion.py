"""
Management command: request_verification_deletion

Processes a GDPR Data Subject Access Request (DSAR) for a user's verification data.

Usage:
    python manage.py request_verification_deletion <user_id>
    python manage.py request_verification_deletion 123

This command:
1. Finds the UserVerification for the specified user_id
2. Calls provider.delete_verification_data() to request erasure
3. Sets status to BLOCKED to prevent re-verification
4. Logs the request in SecurityAuditLog
5. Does NOT delete the record (keeps audit trail)
"""

import logging

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

from verification.models import UserVerification, VerificationStatus
from verification.providers.factory import get_provider
from verification.services import log_security_event

logger = logging.getLogger("verification.security")
User = get_user_model()


class Command(BaseCommand):
    help = "Process GDPR Data Subject Access Request (DSAR) for verification data."

    def add_arguments(self, parser):
        parser.add_argument("user_id", type=int, help="User ID to process DSAR for")
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Confirm deletion (required to actually process)",
        )

    def handle(self, *args, **options):
        user_id = options["user_id"]
        confirm = options["confirm"]

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise CommandError(f"User with ID {user_id} not found")

        self.stdout.write(f"Processing GDPR DSAR for user: {user.username} (ID: {user_id})")
        self.stdout.write(f"Email: {user.email}")

        try:
            verification = user.verification
        except UserVerification.DoesNotExist:
            self.stdout.write(self.style.WARNING("No verification record found for this user."))
            return

        self.stdout.write(f"Current status: {verification.status}")
        self.stdout.write(f"Provider: {verification.provider}")
        self.stdout.write(f"Provider reference: {verification.provider_reference}")

        if not confirm:
            self.stdout.write(self.style.WARNING("\n⚠  DRY-RUN MODE (use --confirm to actually process)"))
            self.stdout.write("Actions that would be taken:")
            self.stdout.write("  1. Request data deletion from provider")
            self.stdout.write("  2. Set verification status to BLOCKED")
            self.stdout.write("  3. Log the DSAR in SecurityAuditLog")
            return

        self.stdout.write("\n🔒 Processing DSAR...\n")

        try:
            if verification.provider_reference:
                provider = get_provider()
                provider.delete_verification_data(verification.provider_reference)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"✓ Requested data deletion from provider: {verification.provider_reference}"
                    )
                )
            else:
                self.stdout.write(self.style.WARNING("No provider reference; skipping provider deletion"))

            verification.status = VerificationStatus.BLOCKED
            verification.save(update_fields=["status", "updated_at"])
            self.stdout.write(self.style.SUCCESS("✓ Set verification status to BLOCKED"))

            log_security_event(
                user_id,
                "verification_gdpr_dsar",
                {"reason": "data_subject_access_request"},
            )
            self.stdout.write(self.style.SUCCESS("✓ Logged DSAR in SecurityAuditLog"))

            self.stdout.write(self.style.SUCCESS("\n✅ GDPR DSAR processed successfully"))
            self.stdout.write(f"User {user.username} (ID: {user_id}) can no longer verify identity.")
            self.stdout.write("To restore access, a superadmin must manually update the verification status.")

        except Exception as exc:
            self.stdout.write(self.style.ERROR(f"\n✗ Error processing DSAR: {exc}"))
            logger.error(f"request_verification_deletion error user_id={user_id}: {exc}")
            raise CommandError(f"DSAR processing failed: {exc}")
