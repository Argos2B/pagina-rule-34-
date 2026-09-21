import type { ApiErrorBody } from "../types/api";

/**
 * Normalized error thrown by the API client for every failed request.
 * Components can rely on this shape instead of digging into Axios internals.
 */
export class ApiError extends Error {
  readonly status: number | null;
  readonly body: ApiErrorBody | null;

  constructor(message: string, status: number | null, body: ApiErrorBody | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  /** Human-readable message suitable for direct display in the UI. */
  get displayMessage(): string {
    if (this.body?.detail && typeof this.body.detail === "string") {
      return this.body.detail;
    }
    if (this.body) {
      const firstFieldErrors = Object.values(this.body).find(
        (value): value is string[] => Array.isArray(value) && value.length > 0,
      );
      if (firstFieldErrors) {
        return firstFieldErrors[0];
      }
    }
    switch (this.status) {
      case 400:
        return "La solicitud contiene datos inválidos.";
      case 401:
        return "Debes iniciar sesión para continuar.";
      case 403:
        return "No tienes permiso para realizar esta acción.";
      case 404:
        return "No se encontró el recurso solicitado.";
      case 409:
        return "Existe un conflicto con el estado actual del recurso.";
      case 413:
        return "El archivo o la solicitud es demasiado grande.";
      case 429:
        return "Demasiadas solicitudes. Intenta de nuevo en unos minutos.";
      case 500:
        return "Ocurrió un error en el servidor. Intenta de nuevo más tarde.";
      default:
        return "Ocurrió un error inesperado. Intenta de nuevo.";
    }
  }

  /** Field-level validation errors, e.g. { username: ["ya existe"] }. */
  get fieldErrors(): Record<string, string[]> {
    if (!this.body) return {};
    const result: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(this.body)) {
      if (key !== "detail" && Array.isArray(value)) {
        result[key] = value;
      }
    }
    return result;
  }
}
