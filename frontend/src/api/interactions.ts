import { apiClient } from "./client";
import type { Comment, Favorite, PaginatedResponse, Report, ReportStatus, ReportTargetType } from "../types/api";

export async function listFavorites(page = 1): Promise<PaginatedResponse<Favorite>> {
  const { data } = await apiClient.get<PaginatedResponse<Favorite>>("/favorites/", { params: { page } });
  return data;
}

export async function addFavorite(postId: number): Promise<Favorite> {
  const { data } = await apiClient.post<Favorite>("/favorites/", { post: postId });
  return data;
}

export async function removeFavorite(favoriteId: number): Promise<void> {
  await apiClient.delete(`/favorites/${favoriteId}/`);
}

export async function listComments(postId: number): Promise<PaginatedResponse<Comment>> {
  const { data } = await apiClient.get<PaginatedResponse<Comment>>("/comments/", { params: { post: postId } });
  return data;
}

export async function createComment(postId: number, content: string): Promise<Comment> {
  const { data } = await apiClient.post<Comment>("/comments/", { post: postId, content });
  return data;
}

export async function deleteComment(commentId: number): Promise<void> {
  await apiClient.delete(`/comments/${commentId}/`);
}

export async function hideComment(commentId: number, reason?: string): Promise<Comment> {
  const { data } = await apiClient.post<Comment>(`/comments/${commentId}/hide/`, { reason });
  return data;
}

export async function unhideComment(commentId: number): Promise<Comment> {
  const { data } = await apiClient.post<Comment>(`/comments/${commentId}/unhide/`);
  return data;
}

export interface CreateReportPayload {
  target_type: ReportTargetType;
  reason: string;
  details?: string;
  post?: number;
  comment?: number;
  reported_user?: number;
}

export async function listMyReports(page = 1): Promise<PaginatedResponse<Report>> {
  const { data } = await apiClient.get<PaginatedResponse<Report>>("/reports/", { params: { page } });
  return data;
}

export async function createReport(payload: CreateReportPayload): Promise<Report> {
  const { data } = await apiClient.post<Report>("/reports/", payload);
  return data;
}

export async function resolveReport(reportId: number, status: ReportStatus, note?: string): Promise<Report> {
  const { data } = await apiClient.post<Report>(`/reports/${reportId}/resolve/`, { status, note });
  return data;
}
