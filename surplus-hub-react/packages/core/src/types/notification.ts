export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  referenceId?: string;
  referenceType?: string;
  createdAt: string;
}

export interface NotificationsPageMeta {
  nextCursor?: number | null;
  hasMore?: boolean;
  totalCount?: number;
  page?: number;
  limit?: number;
  hasNextPage?: boolean;
  totalPages?: number;
}

export interface NotificationsResponse {
  data: Notification[];
  unreadCount?: number;
  meta?: NotificationsPageMeta;
}

export type DevicePlatform = "ios" | "android" | "web" | "expo";

export interface DeviceTokenPayload {
  token: string;
  platform: DevicePlatform;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  pushChat: boolean;
  pushMaterial: boolean;
  pushCommunity: boolean;
  pushMarketing: boolean;
}

export interface NotificationTarget {
  kind: "chat" | "material" | "post";
  id: string;
}

const NOTIFICATION_TARGET_KINDS: Record<string, NotificationTarget["kind"]> = {
  chat_room: "chat",
  chatroom: "chat",
  chat: "chat",
  material: "material",
  post: "post",
  community: "post",
};

// 알림 탭 → 화면 이동용 정규화. 라우트 문자열은 앱마다 달라 공유하지 않고 종류/id만 넘긴다.
export const resolveNotificationTarget = (
  input?: {
    referenceType?: string | null;
    referenceId?: string | number | null;
  } | null
): NotificationTarget | null => {
  const kind =
    NOTIFICATION_TARGET_KINDS[String(input?.referenceType ?? "").trim().toLowerCase()];
  const id = String(input?.referenceId ?? "").trim();
  // reference id는 전부 양의 정수 DB id다. NaN·음수·소수·경로 문자열은 죽은 라우트가 되므로 거른다.
  if (!kind || !/^[1-9]\d*$/.test(id)) return null;
  return { kind, id };
};
