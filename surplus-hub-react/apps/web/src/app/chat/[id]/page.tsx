"use client";

import {
  useChatMessages,
  useChatRoomDetail,
  useCurrentUser,
  useSendMessage,
  useChatWebSocket,
  getChatSuggestions,
  translateText,
  QUICK_REPLIES,
  TRANSLATION_LANGUAGES,
} from "@repo/core";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "../../../components/AuthGate";

const MATERIAL_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "판매중",
  RESERVED: "예약중",
  SOLD: "판매완료",
};

const TRANSLATE_LANG_KEY = "chat_translate_lang";

function TranslationText({ content, getTranslation }: { content: string; getTranslation: (c: string) => Promise<string> }) {
  const [text, setText] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    getTranslation(content).then((r) => {
      if (mounted.current) setText(r);
    });
    return () => { mounted.current = false; };
  }, [content, getTranslation]);

  if (text === null) return <p className="text-muted-foreground text-xs">번역 중...</p>;
  return <p className="text-muted-foreground text-xs">{text}</p>;
}

function ChatRoomContent({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data, isLoading } = useChatMessages(params.id);
  const roomQuery = useChatRoomDetail(params.id);
  const room = roomQuery?.data ?? null;
  const { data: currentUser } = useCurrentUser();
  const { mutate: sendMessage } = useSendMessage();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI features state
  const [showTranslation, setShowTranslation] = useState(false);
  const [showScamWarning, setShowScamWarning] = useState(true);
  const [translateLang, setTranslateLang] = useState("en");

  // 토큰 관리 (클라이언트 사이드에서만 localStorage 접근)
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const accessToken = localStorage.getItem("access_token") || localStorage.getItem("clerk_token");
      setToken(accessToken);
    }
    try {
      const saved = localStorage.getItem(TRANSLATE_LANG_KEY);
      if (saved && TRANSLATION_LANGUAGES.some((l) => l.code === saved)) setTranslateLang(saved);
    } catch {
      // 저장소 접근 불가 시 기본 언어 유지
    }
  }, []);

  const handleTranslateLangChange = (code: string) => {
    setTranslateLang(code);
    try {
      localStorage.setItem(TRANSLATE_LANG_KEY, code);
    } catch {
      // 저장 실패해도 현재 세션 선택은 유지
    }
  };

  // WebSocket 연결
  const { isConnected, sendTextMessage, sendReadReceipt, sendTyping, typingUser } = useChatWebSocket({
    roomId: params.id,
    token,
    enabled: !!token,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [data]);

  // 읽음 처리: 채팅방 진입 시 + 새 메시지 수신 시
  useEffect(() => {
    if (isConnected) {
      sendReadReceipt();
    }
  }, [isConnected, data]);

  // 타이핑 인디케이터 전송 (debounce)
  const handleTyping = useCallback(() => {
    if (!isConnected) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    sendTyping();

    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 2000);
  }, [isConnected, sendTyping]);

  // cleanup typing timeout
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // 메시지 전송: WS 연결 시 WebSocket, 아니면 REST fallback
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    if (isConnected) {
      sendTextMessage(message);
    } else {
      sendMessage({ roomId: params.id, content: message });
    }
    setMessage("");
  };

  // AI Smart Reply 전송
  const handleSmartReply = (reply: string) => {
    if (isConnected) {
      sendTextMessage(reply);
    } else {
      sendMessage({ roomId: params.id, content: reply });
    }
  };

  // 스캠 경고 감지
  const hasScamKeywords = data?.data.some((msg) =>
    msg.content.includes("계좌") || msg.content.includes("입금")
  );

  // Translation cache (useRef로 불필요한 리렌더 방지)
  const translationsRef = useRef<Record<string, string>>({});
  // translationVersion은 번역 완료 시 리렌더를 강제하기 위한 카운터
  const [, setTranslationVersion] = useState(0);

  const getTranslation = useCallback(async (content: string): Promise<string> => {
    const cacheKey = `${translateLang}:${content}`;
    const cached = translationsRef.current[cacheKey];
    if (cached) return cached;
    try {
      const result = await translateText(content, translateLang);
      translationsRef.current[cacheKey] = result;
      setTranslationVersion((v) => v + 1); // 리렌더 트리거
      return result;
    } catch {
      return `Translation: ${content}`;
    }
  }, [translateLang]);

  // AI Smart Replies — 기본 빠른 답장 뒤에 중복 없이 붙인다
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [smartRepliesLoading, setSmartRepliesLoading] = useState(false);

  // 채팅방 진입 시 또는 새 메시지 수신 시 AI 추천 답변 로딩 (언마운트 안전 처리)
  useEffect(() => {
    const messages = data?.data;
    if (!messages || messages.length === 0) return;

    let cancelled = false;
    setSmartRepliesLoading(true);
    void (async () => {
      try {
        const result = await getChatSuggestions(
          params.id,
          messages.map((msg) => ({ content: msg.content, senderId: msg.senderId }))
        );
        if (!cancelled && result.suggestions.length > 0) {
          setSmartReplies(result.suggestions);
        }
      } catch {
        // 실패 시 기본 빠른 답장만 노출
      } finally {
        if (!cancelled) {
          setSmartRepliesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.id, data?.data]);

  const replyChips = Array.from(new Set<string>([...QUICK_REPLIES, ...smartReplies]));

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] md:h-[calc(100dvh-65px)] bg-paper">
      {/* Header */}
      <div className="bg-surface px-4 py-2 flex items-center border-b border-line-2 sticky top-0 z-10 w-full">
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="mr-1 -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-[17px] font-extrabold tracking-[-0.4px] text-foreground">채팅</h1>
        {/* 연결 상태 인디케이터 */}
        {isConnected && (
          <span className="ml-2 w-2.5 h-2.5 rounded-full bg-primary inline-block" />
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Translation toggle button */}
          <button
            onClick={() => setShowTranslation(!showTranslation)}
            type="button"
            aria-pressed={showTranslation}
            className={`flex h-9 items-center gap-1.5 px-3.5 rounded-chip text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              showTranslation
                ? "bg-ink text-surface"
                : "border border-line bg-surface text-foreground hover:bg-field"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-3.5 h-3.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
              />
            </svg>
            번역
          </button>
          {/* More options button */}
          <button className="p-2 rounded-full hover:bg-field text-muted-foreground transition-colors">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* 거래 자재 미니 카드 (P3-1) */}
      {room?.materialId ? (
        room.materialTitle ? (
          <Link
            href={`/material/${room.materialId}`}
            data-testid="chat-material-card"
            className="flex items-center gap-3 border-b border-line-2 bg-surface px-4 py-2.5 transition-colors hover:bg-field"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-thumb border border-line bg-field">
              {room.materialImageUrl ? (
                <img
                  src={room.materialImageUrl}
                  alt={room.materialTitle}
                  className="h-full w-full object-cover"
                />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.6}
                  stroke="currentColor"
                  className="h-5 w-5 text-muted-foreground"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                  />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {room.materialStatus && (
                  <span className="shrink-0 rounded-chip border border-line bg-card px-2 py-0.5 text-[11px] font-bold text-foreground">
                    {MATERIAL_STATUS_LABELS[room.materialStatus] ?? room.materialStatus}
                  </span>
                )}
                <p className="truncate text-sm font-bold text-foreground">{room.materialTitle}</p>
              </div>
              <p className="mt-0.5 text-xs font-bold text-primary">
                {room.materialPrice !== undefined
                  ? room.materialPrice > 0
                    ? `${room.materialPrice.toLocaleString()}원`
                    : "무료나눔"
                  : "자재 상세 보기"}
              </p>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-4 w-4 shrink-0 text-muted-foreground"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        ) : (
          <div
            data-testid="chat-material-deleted"
            className="flex items-center gap-2 border-b border-line-2 bg-field px-4 py-2.5 text-xs font-medium text-muted-foreground"
          >
            삭제된 자재입니다
          </div>
        )
      ) : null}

      {showTranslation && (
        <div className="flex items-center gap-2 border-b border-line-2 bg-surface px-4 py-2">
          <label htmlFor="chat-translate-lang" className="text-xs font-semibold text-muted-foreground">
            번역 언어
          </label>
          <select
            id="chat-translate-lang"
            value={translateLang}
            onChange={(e) => handleTranslateLangChange(e.target.value)}
            className="h-9 rounded-chip border border-line bg-surface px-3 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {TRANSLATION_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Scam Warning Banner */}
      {hasScamKeywords && showScamWarning && (
        <div className="mx-4 mt-4 bg-destructive/10 border border-destructive/20 rounded-card p-4">
          <div className="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <div className="flex-1">
              <h3 className="text-destructive font-bold text-sm mb-1">안전거래 알림</h3>
              <p className="text-destructive/80 text-xs">
                외부 계좌 입금은 사기 피해 위험이 있습니다. 앱 내 안전결제를 이용해주세요.
              </p>
            </div>
            <button
              onClick={() => setShowScamWarning(false)}
              className="text-destructive/60 hover:text-destructive p-1"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {data?.data.map((msg, index) => {
          const isMe = currentUser ? msg.senderId === currentUser.id : msg.senderId === "me";
          // 최근 20개 메시지만 번역 표시 (rate limit 초과 방지)
          const totalMessages = data.data.length;
          const canTranslate = index >= totalMessages - 20;
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[70%]">
                <div
                  className={`rounded-card p-3 ${
                    isMe
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-field text-foreground rounded-bl-md"
                  }`}
                >
                  <p>{msg.content}</p>
                  <p className={`text-xs mt-1 text-right ${isMe ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {/* Translation display: 최근 20개 메시지만 번역 */}
                {showTranslation && (
                  <div className="mt-2 bg-field rounded-btn px-3 py-2 flex items-start gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.8}
                      stroke="currentColor"
                      className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
                      />
                    </svg>
                    {canTranslate ? (
                      <TranslationText key={translateLang} content={msg.content} getTranslation={getTranslation} />
                    ) : (
                      <p className="text-muted-foreground text-xs">번역 대기 중...</p>
                    )}
                  </div>
                )}
                {/* 읽음 표시 */}
                {isMe && msg.isRead && (
                  <p className="text-xs text-muted-foreground text-right mt-0.5">읽음</p>
                )}
              </div>
            </div>
          );
        })}
        {/* 타이핑 인디케이터 */}
        {typingUser && (
          <div className="flex justify-start">
            <div className="bg-surface text-muted-foreground border border-line-2 rounded-card rounded-tl-none px-4 py-2 text-sm">
              {typingUser}님이 입력 중
              <span className="inline-flex ml-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 빠른 답장 + AI 추천 답장 Chips */}
      <div className="bg-surface border-t border-line px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
            className="w-3.5 h-3.5 text-primary"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
            />
          </svg>
          <span className="text-muted-foreground text-xs font-semibold">빠른 답장</span>
          {smartRepliesLoading && (
            <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {replyChips.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => handleSmartReply(reply)}
              className="flex-shrink-0 border border-line bg-surface text-foreground rounded-full px-4 py-2 text-xs font-medium hover:bg-field transition-colors"
            >
              {reply}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={handleSend}
        className="bg-surface px-4 py-3 pb-safe border-t border-line-2 flex items-center gap-2 w-full"
      >
        <input
          type="text"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            handleTyping();
          }}
          placeholder="메시지를 입력하세요..."
          aria-label="메시지 입력"
          className="h-11 flex-1 rounded-chip border border-transparent bg-field px-4 text-[15px] placeholder:text-ink-3 focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 outline-none"
        />
        <button
          type="submit"
          aria-label="보내기"
          className="bg-primary text-primary-foreground rounded-full w-11 h-11 flex items-center justify-center hover:bg-primary-dark active:bg-primary-dark transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
            />
          </svg>
        </button>
      </form>
    </div>
  );
}

export default function ChatRoomPage({ params }: { params: { id: string } }) {
  return (
    <AuthGate title="채팅은 로그인 후 이용 가능합니다">
      <ChatRoomContent params={params} />
    </AuthGate>
  );
}
