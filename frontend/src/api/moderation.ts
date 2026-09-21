import { apiClient } from "./client";
import type { AuditLog, ModerationStats, PaginatedResponse } from "../types/api";

export interface ListAuditLogsParams {
  page?: number;
  action?: string;
  target_type?: string;
  actor?: number;
}

export async function listAuditLogs(params: ListAuditLogsParams = {}): Promise<PaginatedResponse<AuditLog>> {
  const { data } = await apiClient.get<PaginatedResponse<AuditLog>>("/moderation/audit-logs/", { params });
  return data;
}

export async function getModerationStats(): Promise<ModerationStats> {
  const { data } = await apiClient.get<ModerationStats>("/moderation/stats/");
  return data;
}
