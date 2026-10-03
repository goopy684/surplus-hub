import { apiClient, unwrapApiData } from "./client";
import { normalizeIso, readNumber, readRecord, readString } from "./utils";
import {
  AdminUser,
  AdminRole,
  AdminUserDetail,
  AdminUserListResponse,
  DashboardSummary,
  StatsResponse,
  Report,
  ReportListResponse,
  BannedWord,
  UserSanction,
  AuditLog,
  AdminNote,
  ModerationQueueItem,
} from "../types";

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const fetchDashboardSummary = async (): Promise<DashboardSummary> => {
  const response = await apiClient.get("/api/v1/admin/dashboard/summary");
  return unwrapApiData<DashboardSummary>(response.data);
};

export const fetchAdminUserStats = async (
  period: "day" | "week" | "month" = "week"
): Promise<StatsResponse> => {
  const response = await apiClient.get("/api/v1/admin/dashboard/stats/users", {
    params: { period },
  });
  return unwrapApiData<StatsResponse>(response.data);
};

export const fetchAdminMaterialStats = async (
  period: "day" | "week" | "month" = "week"
): Promise<StatsResponse> => {
  const response = await apiClient.get("/api/v1/admin/dashboard/stats/materials", {
    params: { period },
  });
  return unwrapApiData<StatsResponse>(response.data);
};

export const fetchAdminTransactionStats = async (
  period: "day" | "week" | "month" = "week"
): Promise<StatsResponse> => {
  const response = await apiClient.get("/api/v1/admin/dashboard/stats/transactions", {
    params: { period },
  });
  return unwrapApiData<StatsResponse>(response.data);
};

// ─── Admin Role Users (GET /admin/roles) ─────────────────────────────────────

export const fetchAdminUsers = async (
  params: { skip?: number; limit?: number } = {}
): Promise<AdminUserListResponse> => {
  const response = await apiClient.get("/api/v1/admin/roles", {
    params: { skip: params.skip ?? 0, limit: params.limit ?? 50 },
  });
  // Backend returns: { status, data: { items: [], total: N } }
  const raw = unwrapApiData<{ items: AdminUser[]; total: number }>(response.data);
  return {
    data: Array.isArray(raw?.items) ? raw.items : [],
    meta: { totalCount: raw?.total },
  };
};

export const fetchAdminUserDetail = async (id: number): Promise<AdminUser> => {
  const response = await apiClient.get(`/api/v1/admin/roles/${id}`);
  return unwrapApiData<AdminUser>(response.data);
};

export const updateUserRole = async (
  userId: number,
  role: AdminRole
): Promise<AdminUser> => {
  const response = await apiClient.put(`/api/v1/admin/roles/${userId}/role`, {
    adminRole: role,
  });
  return unwrapApiData<AdminUser>(response.data);
};

// ─── Managed Users (GET /admin/users) ────────────────────────────────────────

export const fetchManagedUsers = async (
  params: {
    skip?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    adminRole?: string;
  } = {}
): Promise<AdminUserListResponse> => {
  const response = await apiClient.get("/api/v1/admin/users", {
    params: {
      skip: params.skip ?? 0,
      limit: params.limit ?? 50,
      ...(params.search ? { search: params.search } : {}),
      // 백엔드 파라미터명: is_active (snake_case)
      ...(params.isActive !== undefined ? { is_active: params.isActive } : {}),
      ...(params.adminRole ? { admin_role: params.adminRole } : {}),
    },
  });
  const raw = unwrapApiData<{ items: AdminUser[]; total: number }>(response.data);
  return {
    data: Array.isArray(raw?.items) ? raw.items : [],
    meta: { totalCount: raw?.total },
  };
};

export const fetchManagedUserDetail = async (id: number): Promise<AdminUserDetail> => {
  const response = await apiClient.get(`/api/v1/admin/users/${id}`);
  return unwrapApiData<AdminUserDetail>(response.data);
};

export const createAdminNote = async (
  userId: number,
  content: string
): Promise<AdminNote> => {
  const response = await apiClient.post(`/api/v1/admin/users/${userId}/notes`, { content });
  return unwrapApiData<AdminNote>(response.data);
};

export const fetchAdminNotes = async (
  userId: number
): Promise<AdminNote[]> => {
  const response = await apiClient.get(`/api/v1/admin/users/${userId}/notes`);
  const raw = unwrapApiData<{ items: AdminNote[]; total: number }>(response.data);
  return Array.isArray(raw?.items) ? raw.items : [];
};

// ─── Reports ─────────────────────────────────────────────────────────────────

export const fetchReports = async (
  params: { skip?: number; limit?: number; status?: string } = {}
): Promise<ReportListResponse> => {
  const response = await apiClient.get("/api/v1/admin/moderation/reports", {
    params: {
      skip: params.skip ?? 0,
      limit: params.limit ?? 50,
      ...(params.status ? { status: params.status } : {}),
    },
  });
  const raw = unwrapApiData<{ items: Report[]; total: number }>(response.data);
  return {
    data: Array.isArray(raw?.items) ? raw.items : [],
    meta: { totalCount: raw?.total },
  };
};

export const updateReport = async (
  id: number,
  data: { status: Report["status"] }
): Promise<Report> => {
  const response = await apiClient.patch(
    `/api/v1/admin/moderation/reports/${id}`,
    { status: data.status }
  );
  return unwrapApiData<Report>(response.data);
};

// ─── Banned Words ─────────────────────────────────────────────────────────────

export const fetchBannedWords = async (): Promise<BannedWord[]> => {
  const response = await apiClient.get("/api/v1/admin/moderation/banned-words");
  const raw = unwrapApiData<{ items: BannedWord[]; total: number }>(response.data);
  return Array.isArray(raw?.items) ? raw.items : [];
};

export const createBannedWord = async (word: string): Promise<BannedWord> => {
  const response = await apiClient.post("/api/v1/admin/moderation/banned-words", { word });
  return unwrapApiData<BannedWord>(response.data);
};

export const deleteBannedWord = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/v1/admin/moderation/banned-words/${id}`);
};

// ─── Sanctions ────────────────────────────────────────────────────────────────

export const createSanction = async (
  userId: number,
  data: { sanctionType: UserSanction["sanctionType"]; reason: string; expiresAt?: string }
): Promise<UserSanction> => {
  const response = await apiClient.post(`/api/v1/admin/users/${userId}/sanctions`, {
    sanctionType: data.sanctionType,
    reason: data.reason,
    ...(data.expiresAt ? { expiresAt: data.expiresAt } : {}),
  });
  return unwrapApiData<UserSanction>(response.data);
};

export const deleteSanction = async (
  userId: number,
  sanctionId: number
): Promise<void> => {
  await apiClient.delete(`/api/v1/admin/users/${userId}/sanctions/${sanctionId}`);
};

// ─── Moderation Queue + Bulk ─────────────────────────────────────────────────

export const fetchModerationQueue = async (
  params: { skip?: number; limit?: number } = {}
): Promise<{ items: ModerationQueueItem[]; total: number }> => {
  const response = await apiClient.get("/api/v1/admin/moderation/queue", {
    params: { skip: params.skip ?? 0, limit: params.limit ?? 50 },
  });
  const raw = unwrapApiData<{ items: ModerationQueueItem[]; total: number }>(response.data);
  return { items: Array.isArray(raw?.items) ? raw.items : [], total: raw?.total ?? 0 };
};

export const bulkProcessReports = async (
  ids: number[],
  action: "dismiss" | "resolve" | "review"
): Promise<number> => {
  const response = await apiClient.post("/api/v1/admin/moderation/bulk", { ids, action });
  const raw = unwrapApiData<{ processed: number }>(response.data);
  return raw?.processed ?? 0;
};

// ─── User Report (사용자용) ───────────────────────────────────────────────────

export const createReport = async (data: {
  targetType: "user" | "material" | "post" | "comment";
  targetId: number;
  reason: string;
  description?: string;
}): Promise<Report> => {
  const response = await apiClient.post("/api/v1/reports", {
    targetType: data.targetType,
    targetId: data.targetId,
    reason: data.reason,
    ...(data.description ? { description: data.description } : {}),
  });
  return unwrapApiData<Report>(response.data);
};

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const fetchAuditLogs = async (
  params: { skip?: number; limit?: number; adminId?: number } = {}
): Promise<{ items: AuditLog[]; total: number }> => {
  const response = await apiClient.get("/api/v1/admin/roles/audit-logs", {
    params: {
      skip: params.skip ?? 0,
      limit: params.limit ?? 50,
      ...(params.adminId ? { admin_id: params.adminId } : {}),
    },
  });
  const raw = unwrapApiData<{ items: AuditLog[]; total: number }>(response.data);
  return { items: Array.isArray(raw?.items) ? raw.items : [], total: raw?.total ?? 0 };
};

// ─── Push Notifications ───────────────────────────────────────────────────────

export interface AdminPushPayload {
  title: string;
  body: string;
  target: "all" | "users" | "role";
  userIds?: number[];
  role?: string;
  type?: "SYSTEM" | "MARKETING";
  referenceType?: string | null;
  referenceId?: number | null;
}

export interface AdminPushResult {
  targeted: number;
  created: number;
  pushed: number;
  failed: number;
  skipped: number;
}

export interface PushDeviceTokenStats {
  total: number;
  active: number;
  ios: number;
  android: number;
  expo: number;
  web: number;
}

export interface PushStats {
  totalNotifications: number;
  unreadNotifications: number;
  deviceTokens: PushDeviceTokenStats;
  sentLast7Days: number;
}

export interface PushHistoryItem {
  id: number;
  adminId: number;
  adminName: string;
  title: string;
  body: string;
  target: string;
  targeted: number;
  createdAt: string;
}

export const sendAdminPush = async (payload: AdminPushPayload): Promise<AdminPushResult> => {
  const response = await apiClient.post("/api/v1/admin/notifications/push", payload);
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  return {
    targeted: readNumber(raw.targeted),
    created: readNumber(raw.created),
    pushed: readNumber(raw.pushed),
    failed: readNumber(raw.failed),
    skipped: readNumber(raw.skipped),
  };
};

export const fetchPushStats = async (): Promise<PushStats> => {
  const response = await apiClient.get("/api/v1/admin/notifications/stats");
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  const tokens = readRecord(raw.deviceTokens ?? raw.device_tokens);
  return {
    totalNotifications: readNumber(raw.totalNotifications ?? raw.total_notifications),
    unreadNotifications: readNumber(raw.unreadNotifications ?? raw.unread_notifications),
    deviceTokens: {
      total: readNumber(tokens.total),
      active: readNumber(tokens.active),
      ios: readNumber(tokens.ios),
      android: readNumber(tokens.android),
      expo: readNumber(tokens.expo),
      web: readNumber(tokens.web),
    },
    sentLast7Days: readNumber(raw.sentLast7Days ?? raw.sent_last_7_days),
  };
};

export const fetchPushHistory = async (limit = 20): Promise<PushHistoryItem[]> => {
  const response = await apiClient.get("/api/v1/admin/notifications/history", {
    params: { limit },
  });
  const raw = unwrapApiData<unknown>(response.data);
  const items = Array.isArray(raw) ? raw : [];
  return items.map((entry) => {
    const item = readRecord(entry);
    return {
      id: readNumber(item.id),
      adminId: readNumber(item.adminId ?? item.admin_id),
      adminName: readString(item.adminName ?? item.admin_name) || "",
      title: readString(item.title) || "",
      body: readString(item.body ?? item.message) || "",
      target: readString(item.target) || "all",
      targeted: readNumber(item.targeted),
      createdAt: normalizeIso(item.createdAt ?? item.created_at),
    };
  });
};

// ─── Export CSV ───────────────────────────────────────────────────────────────

export const exportCsv = async (
  type: "users" | "materials" | "transactions"
): Promise<Blob> => {
  const response = await apiClient.get(`/api/v1/admin/dashboard/export/${type}`, {
    responseType: "blob",
  });
  return response.data as Blob;
};
