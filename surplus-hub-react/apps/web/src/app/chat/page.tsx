"use client";

import { useChatRooms } from "@repo/core";
import Link from "next/link";
import { AuthGate } from "../../components/AuthGate";

function ChatListContent() {
  const { data, isLoading, error } = useChatRooms();
  const chatRooms = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-center text-destructive">채팅 목록을 불러오는데 실패했습니다.</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Mobile only */}
      <div className="bg-card px-4 py-4 md:hidden">
        <h1 className="text-lg font-bold text-foreground">채팅</h1>
      </div>

      {!chatRooms || chatRooms.length === 0 ? (
        <div className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center px-4 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="h-10 w-10 opacity-40"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-muted-foreground">아직 채팅이 없습니다</p>
          <p className="mt-1 text-xs text-muted-foreground">관심 자재에서 채팅을 시작해보세요</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {chatRooms.map((room) => (
            <Link
              key={room.id}
              href={`/chat/${room.id}`}
              className="flex items-start p-4 transition-colors hover:bg-muted active:bg-accent"
            >
              <div className="relative mr-4 flex-shrink-0">
                <div className="h-12 w-12 overflow-hidden rounded-full bg-muted">
                  <img
                    src={room.otherUser.avatarUrl}
                    alt={room.otherUser.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="truncate text-sm font-bold text-foreground">{room.otherUser.name}</h3>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {new Date(room.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <div className="flex items-start justify-between">
                  <p className="truncate pr-2 text-sm leading-snug text-muted-foreground">
                    {room.lastMessage?.content || "대화를 시작해보세요"}
                  </p>
                  {room.unreadCount > 0 && (
                    <span className="tabular mt-0.5 flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                      {room.unreadCount}
                    </span>
                  )}
                </div>
              </div>

              <div className="ml-3 h-10 w-10 flex-shrink-0 overflow-hidden rounded-thumb border border-border bg-muted">
                <div className="h-full w-full bg-muted"></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatListPage() {
  return (
    <AuthGate title="채팅은 로그인 후 이용 가능합니다">
      <ChatListContent />
    </AuthGate>
  );
}
