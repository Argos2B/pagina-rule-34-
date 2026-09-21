import type { Role } from "../types/api";

const ROLE_RANK: Record<Role, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  superadmin: 3,
};

/** Whether `role` meets or exceeds `minimum` in the role hierarchy.
 *
 * IMPORTANT: this is a UI-only convenience (show/hide buttons and nav links).
 * It must never be treated as a security boundary — the backend independently
 * enforces every permission check regardless of what the frontend renders.
 */
export function hasRoleAtLeast(role: Role | undefined, minimum: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function isModeratorOrAbove(role: Role | undefined): boolean {
  return hasRoleAtLeast(role, "moderator");
}

export function isAdminOrAbove(role: Role | undefined): boolean {
  return hasRoleAtLeast(role, "admin");
}
