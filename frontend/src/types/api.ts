/**
 * TypeScript types mirroring the real Django REST Framework contract.
 * Every field here corresponds to an actual serializer field in the backend
 * (see accounts/serializers.py, posts/serializers.py, interactions/serializers.py,
 * moderation/serializers.py). Do not add fields that don't exist on the backend.
 */

export type Role = "user" | "moderator" | "admin" | "superadmin";

export type PostStatus = "draft" | "published" | "hidden";

export type PostVisibility = "public" | "unlisted" | "private";

export type ReportTargetType = "post" | "comment" | "user";

export type ReportStatus = "pending" | "reviewed" | "rejected" | "actioned";

/** Generic DRF PageNumberPagination envelope. */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Safe-to-expose public profile (UserPublicSerializer), returned by
 * GET /api/users/by-username/:username/ (added to the backend specifically
 * to support the frontend's public profile page — see project notes). */
export interface PublicUser {
  id: number;
  username: string;
  avatar: string | null;
  biography: string;
  role: Role;
  date_joined: string;
}

/** GET/PATCH /api/auth/me/ (MeSerializer) */
export interface Me {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  biography: string;
  role: Role;
  is_email_verified: boolean;
  date_joined: string;
}

/** Admin user administration (UserAdminSerializer), GET/PATCH /api/users/ */
export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: Role;
  is_active: boolean;
  is_email_verified: boolean;
  date_joined: string;
}

/** POST /api/auth/register/ request body */
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
}

/** POST /api/auth/register/ response body (RegisterSerializer output) */
export interface RegisterResponse {
  id: number;
  username: string;
  email: string;
}

/** POST /api/auth/login/ response (SimpleJWT TokenObtainPairView) */
export interface LoginResponse {
  access: string;
  refresh: string;
}

/** POST /api/auth/token/refresh/ response. With ROTATE_REFRESH_TOKENS=True the
 * backend also returns a new "refresh" token. */
export interface RefreshResponse {
  access: string;
  refresh?: string;
}

/** Category (CategorySerializer) */
export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  created_at: string;
}

/** Tag (TagSerializer) */
export interface Tag {
  id: number;
  name: string;
  slug: string;
}

/** Post (PostSerializer). "tags" is accepted/returned as an array of tag name
 * strings (TagField uses slug_field="name" and auto-creates unknown tags). */
export interface Post {
  id: number;
  title: string;
  description: string;
  image: string;
  author: number;
  author_username: string;
  category: number | null;
  category_name: string | null;
  tags: string[];
  status: PostStatus;
  visibility: PostVisibility;
  created_at: string;
  updated_at: string;
}

/** Favorite (FavoriteSerializer) */
export interface Favorite {
  id: number;
  post: number;
  created_at: string;
}

/** Comment (CommentSerializer) */
export interface Comment {
  id: number;
  post: number;
  author: number;
  author_username: string;
  content: string;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
}

/** Report (ReportSerializer) */
export interface Report {
  id: number;
  reporter: number;
  reporter_username: string;
  target_type: ReportTargetType;
  post: number | null;
  comment: number | null;
  reported_user: number | null;
  reason: string;
  details: string;
  status: ReportStatus;
  created_at: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
}

/** AuditLog (AuditLogSerializer), read-only, GET /api/moderation/audit-logs/ */
export interface AuditLog {
  id: number;
  actor: number | null;
  actor_username: string | null;
  action: string;
  target_type: string;
  target_id: string;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** GET /api/moderation/stats/ (StatsView) */
export interface ModerationStats {
  users_total: number;
  users_active: number;
  posts_total: number;
  posts_published: number;
  posts_hidden: number;
  comments_total: number;
  reports_pending: number;
}

/** Generic shape of a DRF validation error response, e.g.
 * { "field_name": ["message"] } or { "detail": "message" }. */
export type ApiErrorBody = Record<string, string[] | string> & {
  detail?: string;
};
