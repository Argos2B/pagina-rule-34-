import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import { tokenStorage } from "../auth/tokenStorage";
import { ApiError } from "../utils/apiError";
import type { ApiErrorBody, RefreshResponse } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

/** Registered by AuthContext so the client can clear user state when a
 * refresh ultimately fails (session truly expired), without this module
 * importing React context code directly. */
let onSessionExpired: (() => void) | null = null;
export function setOnSessionExpired(handler: () => void): void {
  onSessionExpired = handler;
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccessToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Single-flight refresh: concurrent 401s share one refresh request instead of
// each firing their own (which would race and blacklist each other's tokens).
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }
  const response = await axios.post<RefreshResponse>(`${API_URL}/auth/token/refresh/`, {
    refresh: refreshToken,
  });
  const { access, refresh } = response.data;
  tokenStorage.setAccessToken(access);
  if (refresh) {
    tokenStorage.setRefreshToken(refresh);
  }
  return access;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const originalRequest = error.config as RetriableConfig | undefined;
    const isAuthEndpoint = originalRequest?.url?.includes("/auth/login") || originalRequest?.url?.includes("/auth/token/refresh");

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
        const newAccessToken = await refreshPromise;
        originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`);
        return apiClient(originalRequest);
      } catch {
        tokenStorage.clear();
        onSessionExpired?.();
        return Promise.reject(new ApiError("Sesión expirada.", 401, error.response?.data ?? null));
      }
    }

    return Promise.reject(
      new ApiError(
        error.message,
        error.response?.status ?? null,
        error.response?.data ?? null,
      ),
    );
  },
);
