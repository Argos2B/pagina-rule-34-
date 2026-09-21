import { describe, expect, it } from "vitest";
import { ApiError } from "../utils/apiError";

describe("ApiError", () => {
  it("prefers the 'detail' field when present", () => {
    const error = new ApiError("failed", 400, { detail: "Custom message" });
    expect(error.displayMessage).toBe("Custom message");
  });

  it("falls back to the first field error array", () => {
    const error = new ApiError("failed", 400, { username: ["Ya existe un usuario con ese nombre."] });
    expect(error.displayMessage).toBe("Ya existe un usuario con ese nombre.");
  });

  it("falls back to a generic status-based message when no body is present", () => {
    const error = new ApiError("failed", 401, null);
    expect(error.displayMessage).toBe("Debes iniciar sesión para continuar.");
  });

  it("returns a default message for unknown statuses", () => {
    const error = new ApiError("failed", 999, null);
    expect(error.displayMessage).toBe("Ocurrió un error inesperado. Intenta de nuevo.");
  });

  it("extracts field errors excluding 'detail'", () => {
    const error = new ApiError("failed", 400, {
      detail: "General error",
      email: ["Correo inválido."],
      password: ["Muy corta."],
    });
    expect(error.fieldErrors).toEqual({
      email: ["Correo inválido."],
      password: ["Muy corta."],
    });
  });
});
