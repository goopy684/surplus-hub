import { apiClient, unwrapApiData, unwrapApiMeta } from "./client";
import {
  ChatMessage,
  ChatMessageQueryParams,
  ChatMessageResponse,
  ChatRoom,
  ChatRoomQueryParams,
  ChatRoomResponse,
} from "../types";

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const readNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }
  return fallback;
};

const readBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
};

const readRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const normalizeIso = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) return value;
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
};

const mapChatMessage = (raw: unknown, roomId: string): ChatMessage => {
  const item = readRecord(raw);

  return {
    id: String(item.id ?? `${roomId}-${Date.now()}`),
    roomId,
    senderId: String(item.senderId ?? item.sender_id ?? "unknown"),
    content: readString(item.content) || "",
    timestamp: normalizeIso(item.timestamp ?? item.createdAt ?? item.created_at),
    isRead: readBoolean(item.isRead ?? item.is_read, false),
  };
};

const mapChatRoom = (raw: unknown): ChatRoom => {
  const room = readRecord(raw);
  const id = String(room.id ?? "");

  const otherUser = readRecord(room.otherUser);
  const otherUserName =
    readString(room.otherUserName ?? room.other_user_name) ||
    readString(otherUser.name) ||
    "Unknown User";
  const otherUserAvatar =
    readString(room.otherUserAvatar ?? room.other_user_avatar) ||
    readString(otherUser.avatarUrl) ||
    readString(otherUser.profileUrl);
  const otherUserId =
    String(room.otherUserId ?? room.other_user_id ?? otherUser.id ?? `room-${id}-user`);

  const lastMessageRaw = room.lastMessage;
  const lastMessageRecord = readRecord(lastMessageRaw);
  const lastMessageContent =
    readString(lastMessageRaw) || readString(lastMessageRecord.content);
  const unreadCount = readNumber(room.unreadCount ?? room.unread_count, 0);

  const updatedAt = normalizeIso(
    room.updatedAt ?? room.updated_at ?? room.lastMessageTime ?? room.last_message_time
  );

  const rawPrice = room.materialPrice ?? room.material_price;
  const materialPrice =
    rawPrice !== undefined && rawPrice !== null ? readNumber(rawPrice, 0) : undefined;
  const materialStatus = readString(room.materialStatus ?? room.material_status);
  const materialImageUrl = readString(room.materialImageUrl ?? room.material_image_url);

  return {
    id,
    materialId:
      room.materialId !== undefined && room.materialId !== null
        ? String(room.materialId)
        : room.material_id !== undefined && room.material_id !== null
          ? String(room.material_id)
          : undefined,
    materialTitle: readString(room.materialTitle ?? room.material_title),
    materialPrice,
    materialStatus,
    materialImageUrl,
    otherUser: {
      id: otherUserId,
      name: otherUserName,
      avatarUrl: otherUserAvatar,
    },
    lastMessage: lastMessageContent
      ? {
          id: String(lastMessageRecord.id ?? `${id}-last-message`),
          roomId: id,
          senderId: String(lastMessageRecord.senderId ?? lastMessageRecord.sender_id ?? otherUserId),
          content: lastMessageContent,
          timestamp: normalizeIso(
            lastMessageRecord.timestamp ??
              lastMessageRecord.createdAt ??
              lastMessageRecord.created_at ??
              room.lastMessageTime ??
              room.last_message_time ??
              room.updatedAt ??
              room.updated_at
          ),
          isRead: unreadCount === 0,
        }
      : undefined,
    unreadCount,
    updatedAt,
  };
};

export const fetchChatRoom = async (roomId: string): Promise<ChatRoom | null> => {
  if (!roomId) return null;
  try {
    const response = await apiClient.get(`/api/v1/chats/rooms/${roomId}`);
    const rawData = unwrapApiData<unknown>(response.data);
    return rawData ? mapChatRoom(rawData) : null;
  } catch {
    return null;
  }
};

export const fetchChatRooms = async (
  params: ChatRoomQueryParams = {}
): Promise<ChatRoomResponse> => {
  const response = await apiClient.get("/api/v1/chats/rooms", {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    },
  });

  const rawItems = unwrapApiData<unknown[]>(response.data);
  const data = Array.isArray(rawItems) ? rawItems.map(mapChatRoom) : [];

  return {
    data,
    meta: unwrapApiMeta(response.data),
  };
};

export const createChatRoom = async (
  materialId: number,
  sellerId: number
): Promise<{ id: string }> => {
  const response = await apiClient.post("/api/v1/chats/rooms", {
    materialId,
    sellerId,
  });

  const rawData = unwrapApiData<Record<string, unknown>>(response.data);
  return {
    id: String(rawData.id ?? ""),
  };
};

export const fetchChatMessages = async (
  roomId: string,
  params: ChatMessageQueryParams = {}
): Promise<ChatMessageResponse> => {
  if (!roomId) return { data: [] };

  const response = await apiClient.get(`/api/v1/chats/rooms/${roomId}/messages`, {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
    },
  });

  const rawItems = unwrapApiData<unknown[]>(response.data);
  const data = Array.isArray(rawItems)
    ? rawItems.map((message) => mapChatMessage(message, roomId))
    : [];

  // API returns newest-first (desc); reverse to oldest-first for chat UI
  data.reverse();

  return {
    data,
    meta: unwrapApiMeta(response.data),
  };
};

export const sendMessage = async (
  roomId: string,
  content: string
): Promise<ChatMessage> => {
  const response = await apiClient.post(`/api/v1/chats/rooms/${roomId}/messages`, {
    content,
    messageType: "TEXT",
  });

  const rawData = unwrapApiData<unknown>(response.data);
  return mapChatMessage(rawData, roomId);
};
