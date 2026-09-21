import { apiClient } from "./client";
import type {
  LoginResponse,
  Me,
  PublicUser,
  RegisterRequest,
  RegisterResponse,
} from "../types/api";

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/auth/login/", { username, password });
  return data;
}

export async function getPublicUser(username: string): Promise<PublicUser> {
  const { data } = await apiClient.get<PublicUser>(`/users/by-username/${encodeURIComponent(username)}/`);
  return data;
}

export async function register(payload: RegisterRequest): Promise<RegisterResponse> {
  const { data } = await apiClient.post<RegisterResponse>("/auth/register/", payload);
  return data;
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post("/auth/logout/", { refresh: refreshToken });
}

export async function getMe(): Promise<Me> {
  const { data } = await apiClient.get<Me>("/auth/me/");
  return data;
}

export async function updateMe(payload: Partial<Pick<Me, "email" | "biography">>): Promise<Me> {
  const { data } = await apiClient.patch<Me>("/auth/me/", payload);
  return data;
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiClient.post("/auth/me/change-password/", {
    old_password: oldPassword,
    new_password: newPassword,
  });
}

export async function requestPasswordReset(email: string): Promise<string> {
  const { data } = await apiClient.post<{ detail: string }>("/auth/password-reset/", { email });
  return data.detail;
}

export async function confirmPasswordReset(uid: string, token: string, newPassword: string): Promise<void> {
  await apiClient.post("/auth/password-reset/confirm/", { uid, token, new_password: newPassword });
}

export async function requestEmailVerification(): Promise<void> {
  await apiClient.post("/auth/email/verify/request/");
}

export async function confirmEmailVerification(uid: string, token: string): Promise<void> {
  await apiClient.post("/auth/email/verify/confirm/", { uid, token });
}
