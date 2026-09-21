import { apiClient } from "./client";
import type { AdminUser, PaginatedResponse, Role } from "../types/api";

export interface ListUsersParams {
  page?: number;
  role?: Role;
  is_active?: boolean;
  search?: string;
}

export async function listUsers(params: ListUsersParams = {}): Promise<PaginatedResponse<AdminUser>> {
  const { data } = await apiClient.get<PaginatedResponse<AdminUser>>("/users/", { params });
  return data;
}

export async function getUser(id: number): Promise<AdminUser> {
  const { data } = await apiClient.get<AdminUser>(`/users/${id}/`);
  return data;
}

export async function updateUserRole(id: number, role: Role): Promise<AdminUser> {
  const { data } = await apiClient.patch<AdminUser>(`/users/${id}/`, { role });
  return data;
}

export async function suspendUser(id: number, reason?: string): Promise<AdminUser> {
  const { data } = await apiClient.post<AdminUser>(`/users/${id}/suspend/`, { reason });
  return data;
}

export async function reactivateUser(id: number): Promise<AdminUser> {
  const { data } = await apiClient.post<AdminUser>(`/users/${id}/reactivate/`);
  return data;
}
