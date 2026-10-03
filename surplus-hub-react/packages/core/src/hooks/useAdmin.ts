import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
  UseMutationResult,
} from "@tanstack/react-query";
import {
  fetchDashboardSummary,
  fetchAdminUserStats,
  fetchAdminMaterialStats,
  fetchAdminTransactionStats,
  fetchAdminUsers,
  fetchAdminUserDetail,
  fetchManagedUsers,
  fetchManagedUserDetail,
  updateUserRole,
  fetchReports,
  updateReport,
  fetchBannedWords,
  createBannedWord,
  deleteBannedWord,
  createSanction,
  deleteSanction,
  createAdminNote,
  fetchAdminNotes,
  fetchModerationQueue,
  bulkProcessReports,
  createReport,
  fetchAuditLogs,
  exportCsv,
  sendAdminPush,
  fetchPushStats,
  fetchPushHistory,
} from "../api";
import type { AdminPushPayload, AdminPushResult, PushStats, PushHistoryItem } from "../api";
import {
  AdminUser,
  AdminRole,
  AdminUserDetail,
  AdminUserListResponse,
  AdminNote,
  DashboardSummary,
  StatsResponse,
  Report,
  ReportListResponse,
  BannedWord,
  UserSanction,
  ModerationQueueItem,
  AuditLog,
} from "../types";

export const useDashboardSummary = (): UseQueryResult<DashboardSummary> => {
  return useQuery<DashboardSummary>({
    queryKey: ["admin", "dashboard"],
    queryFn: fetchDashboardSummary,
  });
};

export const useAdminUserStats = (
  period: "day" | "week" | "month" = "week"
): UseQueryResult<StatsResponse> => {
  return useQuery<StatsResponse>({
    queryKey: ["admin", "stats", "users", period],
    queryFn: () => fetchAdminUserStats(period),
  });
};

export const useAdminMaterialStats = (
  period: "day" | "week" | "month" = "week"
): UseQueryResult<StatsResponse> => {
  return useQuery<StatsResponse>({
    queryKey: ["admin", "stats", "materials", period],
    queryFn: () => fetchAdminMaterialStats(period),
  });
};

export const useAdminTransactionStats = (
  period: "day" | "week" | "month" = "week"
): UseQueryResult<StatsResponse> => {
  return useQuery<StatsResponse>({
    queryKey: ["admin", "stats", "transactions", period],
    queryFn: () => fetchAdminTransactionStats(period),
  });
};

// 관리자 역할 유저 목록 (GET /admin/roles)
export const useAdminUsers = (
  params: { skip?: number; limit?: number } = {}
): UseQueryResult<AdminUserListResponse> => {
  return useQuery<AdminUserListResponse>({
    queryKey: ["admin", "users", params],
    queryFn: () => fetchAdminUsers(params),
  });
};

export const useAdminUserDetail = (id: number): UseQueryResult<AdminUser> => {
  return useQuery<AdminUser>({
    queryKey: ["admin", "user", id],
    queryFn: () => fetchAdminUserDetail(id),
    enabled: !!id,
  });
};

// 전체 사용자 관리 목록 (GET /admin/users)
export const useManagedUsers = (
  params: {
    skip?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    adminRole?: string;
  } = {}
): UseQueryResult<AdminUserListResponse> => {
  return useQuery<AdminUserListResponse>({
    queryKey: ["admin", "managedUsers", params],
    queryFn: () => fetchManagedUsers(params),
  });
};

export const useManagedUserDetail = (id: number): UseQueryResult<AdminUserDetail> => {
  return useQuery<AdminUserDetail>({
    queryKey: ["admin", "managedUser", id],
    queryFn: () => fetchManagedUserDetail(id),
    enabled: !!id,
  });
};

export const useReports = (
  params: { skip?: number; limit?: number; status?: string } = {}
): UseQueryResult<ReportListResponse> => {
  return useQuery<ReportListResponse>({
    queryKey: ["admin", "reports", params],
    queryFn: () => fetchReports(params),
  });
};

export const useAuditLogs = (
  params: { skip?: number; limit?: number; adminId?: number } = {}
): UseQueryResult<{ items: AuditLog[]; total: number }> => {
  return useQuery<{ items: AuditLog[]; total: number }>({
    queryKey: ["admin", "auditLogs", params],
    queryFn: () => fetchAuditLogs(params),
  });
};

export const useBannedWords = (): UseQueryResult<BannedWord[]> => {
  return useQuery<BannedWord[]>({
    queryKey: ["admin", "bannedWords"],
    queryFn: fetchBannedWords,
  });
};

export const useUpdateUserRole = (): UseMutationResult<
  AdminUser,
  Error,
  { userId: number; role: AdminRole }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }) => updateUserRole(userId, role),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "user", variables.userId] });
    },
  });
};

export const useUpdateReport = (): UseMutationResult<
  Report,
  Error,
  { id: number; data: { status: Report["status"] } }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => updateReport(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
  });
};

export const useCreateSanction = (): UseMutationResult<
  UserSanction,
  Error,
  { userId: number; data: { sanctionType: UserSanction["sanctionType"]; reason: string; expiresAt?: string } }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }) => createSanction(userId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "user", variables.userId] });
    },
  });
};

export const useDeleteSanction = (): UseMutationResult<
  void,
  Error,
  { userId: number; sanctionId: number }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, sanctionId }) => deleteSanction(userId, sanctionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "user", variables.userId] });
    },
  });
};

export const useCreateBannedWord = (): UseMutationResult<BannedWord, Error, string> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (word: string) => createBannedWord(word),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "bannedWords"] });
    },
  });
};

export const useDeleteBannedWord = (): UseMutationResult<void, Error, number> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteBannedWord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "bannedWords"] });
    },
  });
};

export const useExportCsv = (): UseMutationResult<
  Blob,
  Error,
  "users" | "materials" | "transactions"
> => {
  return useMutation({
    mutationFn: (type) => exportCsv(type),
  });
};

export const useCreateAdminNote = (): UseMutationResult<
  AdminNote,
  Error,
  { userId: number; content: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, content }) => createAdminNote(userId, content),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "notes", variables.userId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "managedUser", variables.userId] });
    },
  });
};

export const useAdminNotes = (userId: number): UseQueryResult<AdminNote[]> => {
  return useQuery<AdminNote[]>({
    queryKey: ["admin", "notes", userId],
    queryFn: () => fetchAdminNotes(userId),
    enabled: !!userId,
  });
};

export const useModerationQueue = (
  params: { skip?: number; limit?: number } = {}
): UseQueryResult<{ items: ModerationQueueItem[]; total: number }> => {
  return useQuery<{ items: ModerationQueueItem[]; total: number }>({
    queryKey: ["admin", "moderationQueue", params],
    queryFn: () => fetchModerationQueue(params),
  });
};

export const useBulkProcessReports = (): UseMutationResult<
  number,
  Error,
  { ids: number[]; action: "dismiss" | "resolve" | "review" }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, action }) => bulkProcessReports(ids, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "moderationQueue"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
  });
};

// ─── Push Notifications ───────────────────────────────────────────────────────

export const useSendAdminPush = (): UseMutationResult<
  AdminPushResult,
  Error,
  AdminPushPayload
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AdminPushPayload) => sendAdminPush(payload),
    onSuccess: () => {
      // ["admin", "push", ...] 하위 stats·history를 한 번에 무효화
      queryClient.invalidateQueries({ queryKey: ["admin", "push"] });
    },
  });
};

export const usePushStats = (): UseQueryResult<PushStats> => {
  return useQuery<PushStats>({
    queryKey: ["admin", "push", "stats"],
    queryFn: fetchPushStats,
  });
};

export const usePushHistory = (limit = 20): UseQueryResult<PushHistoryItem[]> => {
  return useQuery<PushHistoryItem[]>({
    queryKey: ["admin", "push", "history", limit],
    queryFn: () => fetchPushHistory(limit),
  });
};

export const useCreateReport = (): UseMutationResult<
  Report,
  Error,
  { targetType: "user" | "material" | "post" | "comment"; targetId: number; reason: string; description?: string }
> => {
  return useMutation({
    mutationFn: (data) => createReport(data),
  });
};
