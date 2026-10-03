"use client";

import { useChatMessages, useCurrentUser, useSendMessage, useChatWebSocket, getChatSuggestions, translateText } from "@repo/core";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "../../../components/AuthGate";

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
  const { data: currentUser } = useCurrentUser();
  const { mutate: sendMessage } = useSendMessage();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI features state
  const [showTranslation, setShowTranslation] = useState(false);
  const [showScamWarning, setShowScamWarning] = useState(true);

  // 토큰 관리 (클라이언트 사이드에서만 localStorage 접근)
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const accessToken = localStorage.getItem("access_token") || localStorage.getItem("clerk_token");
      setToken(accessToken);
    }
  }, []);

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
    const cached = translationsRef.current[content];
    if (cached) return cached;
    try {
      const result = await translateText(content, "en");
      translationsRef.current[content] = result;
      setTranslationVersion((v) => v + 1); // 리렌더 트리거
      return result;
    } catch {
      return `Translation: ${content}`;
    }
  }, []);

  // AI Smart Replies
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [smartRepliesLoading, setSmartRepliesLoading] = useState(false);

  const loadSmartReplies = useCallback(async () => {
    if (!data?.data || data.data.length === 0) return;
    setSmartRepliesLoading(true);
    try {
      const result = await getChatSuggestions(
        params.id,
        data.data.map((msg) => ({ content: msg.content, senderId: msg.senderId }))
      );
      if (result.suggestions.length > 0) {
        setSmartReplies(result.suggestions);
      }
    } catch {
      // 실패 시 기본 답변 표시
      setSmartReplies(["네, 가능합니다.", "가격 조정 가능합니다.", "직거래 가능합니다.", "확인하겠습니다."]);
    } finally {
      setSmartRepliesLoading(false);
    }
  }, [params.id, data?.data]);

  // 채팅방 진입 시 또는 새 메시지 수신 시 AI 추천 답변 로딩
  useEffect(() => {
    loadSmartReplies();
  }, [data?.data?.length]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-paper">
      {/* Header */}
      <div className="bg-card px-4 py-3 flex items-center border-b border-border sticky top-0 z-10 w-full">
        <button
          onClick={() => router.back()}
          className="mr-3 p-2 rounded-full hover:bg-field text-muted-foreground transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-foreground">채팅</h1>
        {/* 연결 상태 인디케이터 */}
        {isConnected && (
          <span className="ml-2 w-2.5 h-2.5 rounded-full bg-olive-tx inline-block" />
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Translation toggle button */}
          <button
            onClick={() => setShowTranslation(!showTranslation)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              showTranslation
                ? "bg-accent text-accent-foreground"
                : "border border-border bg-card text-foreground"
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

      {/* Scam Warning Banner */}
      {hasScamKeywords && showScamWarning && (
        <div className="mx-4 mt-4 bg-destructive/10 border border-destructive/20 rounded-xl p-4">
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
                  className={`rounded-2xl p-3 ${
                    isMe
                      ? "bg-accent-soft text-foreground rounded-br-md"
                      : "bg-card text-foreground border border-border rounded-bl-md"
                  }`}
                >
                  <p>{msg.content}</p>
                  <p className="text-xs mt-1 text-right text-muted-foreground">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {/* Translation display: 최근 20개 메시지만 번역 */}
                {showTranslation && (
                  <div className="mt-2 bg-field rounded-lg px-3 py-2 flex items-start gap-2">
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
                      <TranslationText content={msg.content} getTranslation={getTranslation} />
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
            <div className="bg-card text-muted-foreground border border-border rounded-2xl rounded-tl-none px-4 py-2 text-sm">
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

      {/* AI Smart Reply Chips */}
      {smartReplies.length > 0 && (
      <div className="bg-card border-t border-border px-4 py-3">
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
          <span className="text-muted-foreground text-xs font-semibold">AI 추천 답장</span>
          {smartRepliesLoading && (
            <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {smartReplies.map((reply, index) => (
            <button
              key={index}
              onClick={() => handleSmartReply(reply)}
              className="flex-shrink-0 border border-border bg-card text-foreground rounded-full px-4 py-2 text-xs font-medium hover:bg-field transition-colors"
            >
              {reply}
            </button>
          ))}
        </div>
      </div>
      )}

      <form
        onSubmit={handleSend}
        className="bg-card p-4 border-t border-border flex gap-2 w-full"
      >
        <input
          type="text"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            handleTyping();
          }}
          placeholder="메시지를 입력하세요..."
          className="flex-1 border border-border bg-field rounded-full px-4 py-2 focus:ring-2 focus:ring-primary outline-none"
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-full w-10 h-10 flex items-center justify-center hover:opacity-90 transition-opacity flex-shrink-0"
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
