export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "MODERATOR";

export interface AdminUser {
  id: number;
  email: string;
  name: string | null;
  adminRole: AdminRole | null;
  isActive: boolean;
  createdAt: string | null;
}

export interface DashboardSummary {
  totalUsers: number;
  newUsersToday: number;
  dau: number;
  wau: number;
  mau: number;
  totalMaterials: number;
  activeMaterials: number;
  totalTransactions: number;
  completedTransactions: number;
  completedTransactionAmount: number;
  pendingReports: number;
}

export interface StatsDataPoint {
  date: string;
  count: number;
}

export interface StatsResponse {
  data: StatsDataPoint[];
  period: "day" | "week" | "month";
}

export interface Report {
  id: number;
  reporterId: number;
  targetType: "user" | "material" | "post" | "comment";
  targetId: number;
  reason: string;
  description?: string | null;
  status: "pending" | "reviewed" | "resolved" | "dismissed";
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: number | null;
}

export interface UserSanction {
  id: number;
  userId: number;
  adminId: number;
  sanctionType: "WARNING" | "SUSPENSION" | "BAN";
  reason: string;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface BannedWord {
  id: number;
  word: string;
  createdBy?: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface AdminUserListResponse {
  data: AdminUser[];
  meta?: { totalCount?: number; page?: number; hasNextPage?: boolean };
}

export interface ReportListResponse {
  data: Report[];
  meta?: { totalCount?: number; page?: number; hasNextPage?: boolean };
}

export interface AuditLog {
  id: number;
  adminId: number;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  details?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface AdminNote {
  id: number;
  userId: number;
  adminId: number;
  content: string;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUser {
  sanctions?: UserSanction[];
  adminNotes?: AdminNote[];
}

export interface ModerationQueueItem {
  id: number;
  itemType: string;
  targetType: string;
  targetId: number;
  reason: string;
  status: string;
  createdAt: string;
}

export interface CreateReportInput {
  targetType: "user" | "material" | "post" | "comment";
  targetId: number;
  reason: string;
  description?: string;
}
