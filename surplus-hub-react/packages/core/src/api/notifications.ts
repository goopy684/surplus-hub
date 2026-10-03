import { apiClient, unwrapApiData, unwrapApiMeta } from "./client";
import { parseOptionalNumber } from "./utils";
import {
  DeviceTokenPayload,
  Notification,
  NotificationPreferences,
  NotificationsPageMeta,
  NotificationsResponse,
} from "../types";

const readRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const readBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
};

const normalizeIso = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) return value;
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
};

const mapNotification = (raw: unknown): Notification => {
  const item = readRecord(raw);
  // 백엔드 reference_id는 Optional[int]라 와이어에는 숫자로 실려 온다. 문자열/숫자 모두 받아 문자열로 정규화한다.
  const referenceId = item.referenceId ?? item.reference_id;
  return {
    id: String(item.id ?? ""),
    type: readString(item.type ?? item.notification_type) || "SYSTEM",
    title: readString(item.title) || "",
    message: readString(item.message ?? item.body ?? item.content) || "",
    isRead: readBoolean(item.isRead ?? item.is_read, false),
    referenceId: readString(referenceId) ?? parseOptionalNumber(referenceId)?.toString(),
    referenceType: readString(item.referenceType ?? item.reference_type),
    createdAt: normalizeIso(item.createdAt ?? item.created_at),
  };
};

const readOptionalBoolean = (value: unknown): boolean | undefined =>
  value === undefined || value === null ? undefined : readBoolean(value);

// offset 모드는 page/totalCount, cursor 모드는 nextCursor/hasMore만 채워진다.
// 없는 필드는 undefined로 남겨 소비자가 모드를 구분할 수 있게 한다.
const mapPageMeta = (payload: unknown): NotificationsPageMeta | undefined => {
  const meta = unwrapApiMeta(payload);
  if (!meta) return undefined;
  return {
    nextCursor: parseOptionalNumber(meta.nextCursor ?? meta.next_cursor),
    hasMore: readOptionalBoolean(meta.hasMore ?? meta.has_more),
    totalCount: parseOptionalNumber(meta.totalCount ?? meta.total_count),
    page: parseOptionalNumber(meta.page),
    limit: parseOptionalNumber(meta.limit),
    hasNextPage: readOptionalBoolean(meta.hasNextPage ?? meta.has_next_page),
    totalPages: parseOptionalNumber(meta.totalPages ?? meta.total_pages),
  };
};

export interface NotificationsQueryParams {
  page?: number;
  limit?: number;
  cursor?: number;
}

export const fetchNotifications = async (
  params?: NotificationsQueryParams
): Promise<NotificationsResponse> => {
  // `queryFn: fetchNotifications`처럼 react-query 컨텍스트가 넘어와도 무해하게 무시한다.
  const query: Record<string, number> = {};
  for (const key of ["page", "limit", "cursor"] as const) {
    const value = params?.[key];
    if (typeof value === "number") query[key] = value;
  }
  const response = await apiClient.get("/api/v1/notifications/", { params: query });
  const rawItems = unwrapApiData<unknown[]>(response.data);
  const data = Array.isArray(rawItems) ? rawItems.map(mapNotification) : [];
  return { data, meta: mapPageMeta(response.data) };
};

export const markAsRead = async (id: string): Promise<void> => {
  await apiClient.patch(`/api/v1/notifications/${id}/read`);
};

export const markAllAsRead = async (): Promise<void> => {
  await apiClient.patch("/api/v1/notifications/read-all");
};

export const registerDeviceToken = async (payload: DeviceTokenPayload): Promise<void> => {
  await apiClient.post("/api/v1/notifications/device-token", payload);
};

export const unregisterDeviceToken = async (payload: DeviceTokenPayload): Promise<void> => {
  await apiClient.delete("/api/v1/notifications/device-token", { data: payload });
};

const mapPreferences = (raw: unknown): NotificationPreferences => {
  const item = readRecord(raw);
  return {
    pushEnabled: readBoolean(item.pushEnabled ?? item.push_enabled, true),
    pushChat: readBoolean(item.pushChat ?? item.push_chat, true),
    pushMaterial: readBoolean(item.pushMaterial ?? item.push_material, true),
    pushCommunity: readBoolean(item.pushCommunity ?? item.push_community, true),
    pushMarketing: readBoolean(item.pushMarketing ?? item.push_marketing, false),
  };
};

export const fetchNotificationPreferences = async (): Promise<NotificationPreferences> => {
  const response = await apiClient.get("/api/v1/notifications/preferences");
  return mapPreferences(unwrapApiData<unknown>(response.data));
};

export const updateNotificationPreferences = async (
  patch: Partial<NotificationPreferences>
): Promise<NotificationPreferences> => {
  const response = await apiClient.patch("/api/v1/notifications/preferences", patch);
  return mapPreferences(unwrapApiData<unknown>(response.data));
};

export const fetchUnreadCount = async (): Promise<number> => {
  const response = await apiClient.get("/api/v1/notifications/unread-count");
  const raw = readRecord(unwrapApiData<unknown>(response.data));
  const count = raw.count ?? raw.unreadCount ?? raw.unread_count;
  if (typeof count === "number") return count;
  if (typeof count === "string") {
    const parsed = Number(count);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};
