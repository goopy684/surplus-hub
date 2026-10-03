"use client";

import { useParams, useRouter } from "next/navigation";
import { useEvent } from "@repo/core";

const formatDate = (value: string): string => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
};

const isEventOngoing = (startDate: string, endDate: string): boolean => {
  const now = Date.now();
  return new Date(startDate).getTime() <= now && now <= new Date(endDate).getTime();
};

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = String(params.id ?? "");

  const { data: event, isLoading, error } = useEvent(eventId);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button onClick={() => router.back()} className="p-1">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-foreground">이벤트 상세</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : null}

      {error ? (
        <div className="p-8 text-center text-sm text-destructive">이벤트를 불러오지 못했습니다.</div>
      ) : null}

      {!isLoading && !error && event ? (
        <div>
          {event.imageUrl ? (
            <div className="h-56 w-full overflow-hidden bg-muted">
              <img
                src={event.imageUrl}
                alt={event.title}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-56 w-full items-center justify-center border-b border-border bg-muted">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="h-16 w-16 text-muted-foreground"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
                />
              </svg>
            </div>
          )}

          <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
              {(() => {
                const ongoing = isEventOngoing(event.startDate, event.endDate);
                return (
                  <span
                    className={`inline-block rounded-chip border px-3 py-1 text-xs font-semibold ${
                      ongoing
                        ? "border-olive-bd bg-olive-bg text-olive-tx"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {ongoing ? "진행중" : event.isActive ? "예정" : "종료"}
                  </span>
                );
              })()}
            </div>

            <h2 className="mb-2 text-lg font-bold text-foreground">{event.title}</h2>

            <div className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                />
              </svg>
              <span>{formatDate(event.startDate)} ~ {formatDate(event.endDate)}</span>
            </div>

            <div className="rounded-thumb border border-border bg-card p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{event.description}</p>
            </div>
          </div>
        </div>
      ) : null}

      {!isLoading && !error && !event ? (
        <div className="p-8 text-center text-sm text-muted-foreground">이벤트를 찾을 수 없습니다.</div>
      ) : null}
    </div>
  );
}
