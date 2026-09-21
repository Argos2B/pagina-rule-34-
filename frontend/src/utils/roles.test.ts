import { describe, expect, it } from "vitest";
import { hasRoleAtLeast, isAdminOrAbove, isModeratorOrAbove } from "../utils/roles";

describe("role hierarchy utils", () => {
  it("returns false when role is undefined", () => {
    expect(hasRoleAtLeast(undefined, "moderator")).toBe(false);
  });

  it("compares roles by rank", () => {
    expect(hasRoleAtLeast("user", "moderator")).toBe(false);
    expect(hasRoleAtLeast("moderator", "moderator")).toBe(true);
    expect(hasRoleAtLeast("admin", "moderator")).toBe(true);
    expect(hasRoleAtLeast("superadmin", "admin")).toBe(true);
  });

  it("isModeratorOrAbove matches moderator, admin and superadmin only", () => {
    expect(isModeratorOrAbove("user")).toBe(false);
    expect(isModeratorOrAbove("moderator")).toBe(true);
    expect(isModeratorOrAbove("admin")).toBe(true);
  });

  it("isAdminOrAbove excludes moderator", () => {
    expect(isAdminOrAbove("moderator")).toBe(false);
    expect(isAdminOrAbove("admin")).toBe(true);
    expect(isAdminOrAbove("superadmin")).toBe(true);
  });
});
