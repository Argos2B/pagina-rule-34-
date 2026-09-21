# Identity Verification & Age Gating System

## Overview

**Universo 34** implements a robust identity verification and age gating system to ensure only adults can upload content. This document explains the architecture, endpoints, security properties, and how to integrate with production identity verification providers.

### Key Properties

- ✅ **Privacy-First**: No document images, selfies, or biometric data stored locally
- ✅ **Secure**: HMAC-signed webhooks, IDOR protection, replay attack prevention
- ✅ **Modular**: Provider abstraction allows switching between providers
- ✅ **Audited**: All verification events logged with security audit trail
- ✅ **Production-Ready**: Mock provider for development, enforced provider requirement for production

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Flow                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  User Account (accounts.User)                                   │
│        ↓                                                          │
│  OneToOne ↔ UserVerification                                    │
│        ↓                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Verification Layers (ALL must be True to publish):      │   │
│  │  • age_verified (date of birth from ID)                │   │
│  │  • identity_verified (document authentic)              │   │
│  │  • face_match_verified (selfie matches ID photo)       │   │
│  │  • liveness_verified (selfie is live person)           │   │
│  │  • status == VERIFIED                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│        ↓                                                          │
│  Can Create Posts? Yes → Verified                               │
│                   No  → Show status to user                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Provider Abstraction

The system uses an abstract provider interface to support multiple identity verification services:

```python
class IdentityVerificationProvider:
    def create_session(user_id: int, metadata: dict) → SessionResult
    def get_status(session_id: str) → VerificationResult
    def process_webhook(payload: bytes, signature: str) → VerificationResult
    def cancel_session(session_id: str) → bool
    def delete_verification_data(session_id: str) → bool  # GDPR
```

**Available Providers:**
- **MockIdentityVerificationProvider** (development/testing only)
- Placeholder classes for: StripeIdentity, Veriff, Onfido (implement as needed)

---

## Data Model

### UserVerification

Stores the outcome of identity verification. Designed for privacy and minimal data retention.

```python
class UserVerification(Model):
    user = OneToOneField(User)
    status = CharField(  # NOT_STARTED, PENDING, VERIFIED, REJECTED, MANUAL_REVIEW, EXPIRED, BLOCKED
    provider = CharField()  # "mock", "stripe_identity", etc.
    provider_reference = CharField()  # Session ID from provider
    
    # Verification flags (set by provider, never by user)
    age_verified = BooleanField()
    identity_verified = BooleanField()
    face_match_verified = BooleanField()
    liveness_verified = BooleanField()
    
    # Metadata (privacy-safe, minimal)
    document_type = CharField()  # CEDULA, DIMEX, PASSPORT, DRIVERS_LICENSE
    document_country = CharField()  # ISO 3166-1 alpha-2
    
    # Timestamps
    verification_started_at = DateTimeField()
    verified_at = DateTimeField()
    expires_at = DateTimeField()
    
    rejection_reason = TextField()
    
    @property
    def is_fully_verified(self) → bool:
        """Central predicate for publish eligibility."""
        return (
            self.status == VERIFIED
            and self.age_verified and self.identity_verified
            and self.face_match_verified and self.liveness_verified
        )
```

**Privacy Design:**
- ❌ NO document images, selfies, or biometric templates stored
- ❌ NO full document numbers stored (provider handles this)
- ✅ Only verification result, provider reference, and timestamps

### SecurityAuditLog

Every verification-related event is logged for compliance auditing.

```python
class SecurityAuditLog(Model):
    user_id = IntegerField()
    event = CharField()  # verification_started, verification_rejected, publish_blocked_unverified, etc.
    metadata = JSONField()  # Never contains secrets, keys, images, or doc numbers
    ip_address = GenericIPAddressField()
    created_at = DateTimeField(auto_now_add=True)
```

### WebhookEvent (Idempotency Log)

Prevents replay attacks by storing SHA-256 hash of webhook signatures.

```python
class WebhookEvent(Model):
    event_id_hash = CharField(unique=True)  # SHA-256(signature)
    provider = CharField()
    received_at = DateTimeField(auto_now_add=True)
```

---

## API Endpoints

### GET /api/verification/status/

Get current user's verification status.

**Authentication:** JWT Token (Required)

**Response (200 OK):**

```json
{
  "status": "verified|pending|rejected|manual_review|expired|blocked|not_started",
  "age_verified": true,
  "identity_verified": true,
  "face_match_verified": true,
  "liveness_verified": true,
  "verification_started_at": "2026-09-20T10:00:00Z",
  "verified_at": "2026-09-20T11:30:00Z",
  "expires_at": "2027-09-20T11:30:00Z",
  "rejection_reason": "",
  "provider": "stripe_identity",
  "document_type": "cedula",
  "document_country": "CR"
}
```

**IDOR Protection:** User always reads their own record, never another user's.

---

### POST /api/verification/start/

Initiate identity verification session.

**Authentication:** JWT Token (Required)

**Request Body:**

```json
{
  "document_type": "cedula"  // Optional: pre-select document type
}
```

**Response (201 Created):**

```json
{
  "session_id": "stripe_abc123...",
  "redirect_url": "https://identity.stripe.com/...",
  "status": "pending"
}
```

**Rate Limit:** 5 attempts per user per day

**Flow:**
1. Create provider session
2. Return hosted verification URL to frontend
3. Frontend redirects user to provider's secure UI
4. User completes ID scan + selfie + liveness check
5. Provider sends webhook to our backend

---

### POST /api/verification/webhook/

Receive verification result from provider.

**Authentication:** HMAC signature in `X-Verification-Signature` header

**Request Body (from provider):**

```json
{
  "session_id": "stripe_abc123...",
  "status": "verified|rejected|needs_manual_review",
  "age_verified": true,
  "identity_verified": true,
  "face_match_verified": true,
  "liveness_verified": true,
  "document_type": "cedula",
  "document_country": "CR",
  "rejection_reason": null
}
```

**Security:**
- HMAC-SHA256 signature validation (rejects unsigned/tampered webhooks)
- Signature hash stored for idempotency (same webhook processed once)
- Session ID lookup in DB (never trusts user_id from payload)
- All events logged for audit trail

**Response (200 OK):** Always idempotent

---

### POST /api/verification/mock/complete/ (Development Only)

Manually complete verification for testing.

**⚠️ Only available when DEBUG=True. Returns 404 in production.**

**Authentication:** JWT Token (Required)

**Request Body:**

```json
{
  "session_id": "mock_abc123",
  "outcome": "verified|rejected|manual_review|expired|pending"
}
```

**Response (200 OK):**

```json
{
  "detail": "Mock verification advanced.",
  "status": "verified",
  "is_fully_verified": true
}
```

---

## Publication Protection

### Server-Side Enforcement

All content creation endpoints (posts, comments) use **double-check** authorization:

#### 1. Permission Class

```python
permission_classes=[IsVerifiedToPublish]
```

#### 2. Service-Level Check

```python
def perform_create(self, serializer):
    allowed, reason = can_user_publish(self.request.user)
    if not allowed:
        raise PermissionDenied()
    serializer.save(...)
```

### can_user_publish() Logic

```python
def can_user_publish(user) → (bool, str):
    # Not authenticated
    if not user.is_authenticated:
        return False, "unauthenticated"
    
    # Moderators bypass verification (manually vetted by admins)
    if user.is_moderator:
        return True, ""
    
    # Check verification record exists
    try:
        verification = user.verification
    except UserVerification.DoesNotExist:
        return False, "not_verified"
    
    # Check expiry
    if verification.is_expired:
        return False, "verification_expired"
    
    # Check ALL flags are true AND status is VERIFIED
    if not verification.is_fully_verified:
        return False, "not_verified"
    
    return True, ""
```

### Protected Endpoints

| Endpoint | Verification Required | Notes |
|---|---|---|
| POST /api/posts/ | ✅ Yes | IsVerifiedToPublish |
| POST /api/comments/ | ✅ Yes | IsVerifiedToPublish |
| POST /api/favorites/ | ❌ No | Metadata only |
| POST /api/reports/ | ❌ No | Moderation reports (intentional) |

---

## Security Model

### IDOR Protection

**Threat:** User A tries to access/modify User B's verification.

**Mitigation:**
- All endpoints use `request.user` as the authority
- No user_id parameter from request accepted
- Lookup: `UserVerification.objects.get(user=request.user)`

### Webhook Signature Validation

**Threat:** Attacker sends fake webhook to self-approve verification.

**Mitigation:**
1. Provider signs webhook: `HMAC-SHA256(WEBHOOK_SECRET, payload)`
2. Backend validates before processing
3. Invalid signature → HTTP 403 + security event

```python
expected_sig = hmac.new(
    WEBHOOK_SECRET.encode(), payload, hashlib.sha256
).hexdigest()

if not hmac.compare_digest(signature, expected_sig):
    raise ValueError("Invalid signature")  # Timing-safe comparison
```

### Replay Attack Prevention

**Threat:** Attacker replays a valid webhook multiple times.

**Mitigation:**
- Store `WebhookEvent` with `event_id_hash = SHA256(signature)`
- Duplicate signatures ignored (return 200 but don't re-process)

```python
event_hash = hashlib.sha256(signature.encode()).hexdigest()
if WebhookEvent.objects.filter(event_id_hash=event_hash).exists():
    return Response({"detail": "Already processed"})  # Idempotent
```

### Data Minimization

**Stored in Database:**
- Verification status + boolean flags
- Provider name + session ID
- Document type + country (NOT full numbers)
- Timestamps
- Rejection reason

**NOT Stored:**
- ❌ Document images
- ❌ Selfie images
- ❌ Full document numbers
- ❌ Biometric templates
- ❌ API keys or secrets

### Rate Limiting

| Endpoint | Limit | Purpose |
|---|---|---|
| POST /api/verification/start/ | 5/day | Prevent abuse |
| POST /api/verification/webhook/ | 100/min | Generous for provider |

---

## Integration with Real Provider

### Example: Stripe Identity

1. **Sign up:** https://stripe.com/identity
2. **Get credentials:** API Key + Webhook Secret
3. **Create provider class:**

```python
# verification/providers/stripe.py
from .base import IdentityVerificationProvider

class StripeIdentityProvider(IdentityVerificationProvider):
    PROVIDER_NAME = "stripe_identity"
    
    def __init__(self, api_key: str, webhook_secret: str):
        stripe.api_key = api_key
        self.webhook_secret = webhook_secret
    
    def create_session(self, user_id: int, metadata: dict | None = None):
        # Call Stripe SDK
        session = stripe.identity.VerificationSession.create(...)
        return SessionResult(session_id=session.id, redirect_url=session.url)
    
    def process_webhook(self, payload: bytes, signature: str):
        # Validate HMAC + parse
        ...
```

4. **Update factory.py:**

```python
if provider_name == "stripe_identity":
    return StripeIdentityProvider(
        api_key=settings.VERIFICATION_API_KEY,
        webhook_secret=settings.VERIFICATION_WEBHOOK_SECRET,
    )
```

5. **Configure .env:**

```bash
VERIFICATION_PROVIDER=stripe_identity
VERIFICATION_API_KEY=rk_live_...
VERIFICATION_WEBHOOK_SECRET=whsec_...
```

6. **Configure webhook in provider dashboard:**
   - Endpoint: `https://yourdomain.com/api/verification/webhook/`
   - Events: identity verification completed
   - Header: X-Verification-Signature

---

## Testing

### Run Tests

```bash
python manage.py test verification.tests -v 2
python manage.py test verification.tests.CommentVerificationTests -v 2
python manage.py test verification.tests.WebhookSecurityTests -v 2
```

### Manual End-to-End Test

```bash
# 1. Register
curl -X POST http://localhost:8000/api/auth/register/ \
  -d '{"username": "alice", "email": "alice@example.com", "password": "SecureP@ss123"}'

# 2. Check status (should be NOT_STARTED)
curl -X GET http://localhost:8000/api/verification/status/ \
  -H "Authorization: Bearer <token>"

# 3. Start verification
curl -X POST http://localhost:8000/api/verification/start/ \
  -H "Authorization: Bearer <token>" \
  -d '{"document_type": "cedula"}'

# 4. Try to post (should be 403 FORBIDDEN)
curl -X POST http://localhost:8000/api/posts/ \
  -H "Authorization: Bearer <token>" \
  -F "title=Test" -F "image=@image.png"

# 5. Complete verification (mock)
curl -X POST http://localhost:8000/api/verification/mock/complete/ \
  -H "Authorization: Bearer <token>" \
  -d '{"session_id": "<session_id>", "outcome": "verified"}'

# 6. Try to post again (should succeed, 201 CREATED)
curl -X POST http://localhost:8000/api/posts/ \
  -H "Authorization: Bearer <token>" \
  -F "title=Test" -F "image=@image.png"
```

---

## Management Commands

### Cleanup Expired Verifications

```bash
# Dry-run
python manage.py cleanup_expired_verification --days 90

# Actually delete
python manage.py cleanup_expired_verification --days 90 --delete

# Only rejected/blocked
python manage.py cleanup_expired_verification --days 90 --delete --status rejected,blocked
```

### GDPR Data Subject Access Request

```bash
# Dry-run
python manage.py request_verification_deletion 123

# Actually process
python manage.py request_verification_deletion 123 --confirm
```

---

## Environment Variables

```bash
# Identity Verification
VERIFICATION_PROVIDER=mock  # Set to: mock (dev), stripe_identity, veriff, onfido, etc.
VERIFICATION_API_KEY=your-api-key-here
VERIFICATION_WEBHOOK_SECRET=your-webhook-secret-here
VERIFICATION_ENVIRONMENT=development  # development or production

# Content Moderation (optional)
CONTENT_MODERATION_PROVIDER=  # aws_rekognition, azure, etc.
CONTENT_MODERATION_API_KEY=
CONTENT_MODERATION_WEBHOOK_SECRET=
```

---

## Compliance

- ✅ **GDPR:** Data minimization, deletion requests supported
- ✅ **CCPA:** Transparent data usage, opt-out available
- ✅ **Age Verification:** Verified by external provider (not estimated)
- ✅ **Audit Trail:** All events logged for compliance

---

## References

- Django REST Framework: https://www.django-rest-framework.org/
- HMAC Signatures: https://tools.ietf.org/html/rfc2104
- GDPR Data Minimization: https://gdpr-info.eu/art-5-gdpr/
- OWASP: https://owasp.org/

---

**Last Updated:** 2026-09-20  
**Status:** Production-Ready
