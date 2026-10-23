import { PaginationMeta } from "./material";

export interface ChatUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

export interface ChatRoom {
  id: string;
  materialId?: string;
  materialTitle?: string;
  materialPrice?: number;
  materialStatus?: string;
  materialImageUrl?: string;
  otherUser: ChatUser;
  lastMessage?: ChatMessage;
  unreadCount: number;
  updatedAt: string;
}

export interface ChatRoomResponse {
  data: ChatRoom[];
  meta?: PaginationMeta;
}

export interface ChatMessageResponse {
  data: ChatMessage[];
  meta?: PaginationMeta;
}

export interface ChatRoomQueryParams {
  page?: number;
  limit?: number;
}

export interface ChatMessageQueryParams {
  page?: number;
  limit?: number;
}

// --- WebSocket Types ---

export interface WsMessageData {
  id: number;
  content: string;
  messageType: string;
  senderId: number;
  senderName: string;
  isRead: boolean;
  createdAt: string;
}

export interface WsIncomingMessage {
  type: "message";
  data: WsMessageData;
}

export interface WsReadReceipt {
  type: "read_receipt";
  data: { userId: number; readAt: string };
}

export interface WsTypingIndicator {
  type: "typing";
  data: { userId: number; userName: string };
}

export interface WsError {
  type: "error";
  data: { detail: string };
}

export type WsServerMessage =
  | WsIncomingMessage
  | WsReadReceipt
  | WsTypingIndicator
  | WsError;
