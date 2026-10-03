"use client";

import { useState } from "react";
import type { AdminPushPayload } from "@repo/core";
import { usePushStats, usePushHistory, useSendAdminPush } from "@repo/core";

type Target = AdminPushPayload["target"];

const TARGET_LABELS: Record<string, string> = {
  all: "전체 사용자",
  users: "특정 사용자",
  role: "역할별",
};

const TARGETS: Target[] = ["all", "users", "role"];

// "1, 2, x, 3" → [1, 2, 3] (빈 값·숫자 아닌 값은 버리고, 중복은 하나로 합친다)
function parseUserIds(raw: string): number[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
    ),
  ];
}

export default function AdminNotificationsPage() {
  const { data: stats, isLoading: statsLoading, isError: statsError } = usePushStats();
  const { data: history, isLoading: historyLoading } = usePushHistory();
  const sendPush = useSendAdminPush();

  const [target, setTarget] = useState<Target>("all");
  const [userIdsRaw, setUserIdsRaw] = useState("");
  const [role, setRole] = useState("");
  const [type, setType] = useState<"SYSTEM" | "MARKETING">("SYSTEM");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const userIds = parseUserIds(userIdsRaw);
  const isValid =
    !!title.trim() &&
    !!body.trim() &&
    (target !== "users" || userIds.length > 0) &&
    (target !== "role" || !!role.trim());

  const tokens = stats?.deviceTokens;
  const cards = [
    { label: "총 알림", value: stats?.totalNotifications ?? 0, sub: undefined as string | undefined },
    { label: "미읽음 알림", value: stats?.unreadNotifications ?? 0, sub: undefined },
    {
      label: "활성 기기 토큰",
      value: tokens?.active ?? 0,
      sub: tokens
        ? `iOS ${tokens.ios} · Android ${tokens.android} · Expo ${tokens.expo} · Web ${tokens.web} (등록 ${tokens.total})`
        : undefined,
    },
    { label: "최근 7일 발송", value: stats?.sentLast7Days ?? 0, sub: undefined },
  ];

  const handleSubmit = () => {
    if (!isValid) return;

    // 발송은 되돌릴 수 없다 — 대상과 대략적인 규모를 확인시킨다.
    const estimate =
      target === "users"
        ? `${userIds.length}명`
        : target === "all" && tokens
          ? `활성 기기 ${tokens.active.toLocaleString()}대`
          : null;
    const confirmed = window.confirm(
      `${TARGET_LABELS[target]}에게 푸시를 발송합니다${estimate ? ` (${estimate})` : ""}.\n발송은 되돌릴 수 없습니다. 계속하시겠습니까?`
    );
    if (!confirmed) return;

    sendPush.mutate({
      title: title.trim(),
      body: body.trim(),
      target,
      type,
      ...(target === "users" ? { userIds } : {}),
      ...(target === "role" ? { role: role.trim() } : {}),
    });
  };

  const result = sendPush.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">푸시 알림</h1>
        <p className="mt-1 text-sm text-muted-foreground">사용자에게 푸시 알림을 발송하고 현황을 확인합니다.</p>
      </div>

      {/* 통계 */}
      {statsError && (
        <div className="rounded-thumb border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          푸시 통계를 불러오는 데 실패했습니다. 잠시 후 다시 시도해주세요.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-thumb border border-border bg-card p-5 card-shadow">
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            {statsLoading ? (
              <div className="mt-2 h-8 w-24 animate-pulse rounded bg-muted" />
            ) : (
              <p className="mt-1 text-2xl font-bold tabular text-foreground">{card.value.toLocaleString()}</p>
            )}
            {card.sub && <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* 발송 폼 */}
      <section className="rounded-thumb border border-border bg-card p-5 card-shadow">
        <h2 className="text-sm font-semibold text-foreground">푸시 발송</h2>
        <p className="mt-1 text-xs text-muted-foreground">발송된 알림은 취소할 수 없습니다.</p>

        {/* 대상 */}
        <div className="mt-4">
          <p className="text-xs font-medium text-foreground">대상</p>
          <div className="mt-2 flex gap-1 rounded-btn border border-border bg-card p-1">
            {TARGETS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                aria-pressed={target === t}
                className={`rounded-chip px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
                  target === t ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {TARGET_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {target === "users" && (
          <div className="mt-3">
            <label htmlFor="push-user-ids" className="text-xs font-medium text-foreground">
              사용자 ID (쉼표로 구분)
            </label>
            <input
              id="push-user-ids"
              type="text"
              value={userIdsRaw}
              onChange={(e) => setUserIdsRaw(e.target.value)}
              placeholder="예: 1, 2, 3"
              className="mt-1 w-full rounded-field border border-border bg-field px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1 text-xs text-muted-foreground">인식된 ID {userIds.length}개: {userIds.join(", ") || "없음"}</p>
          </div>
        )}

        {target === "role" && (
          <div className="mt-3">
            <label htmlFor="push-role" className="text-xs font-medium text-foreground">
              역할
            </label>
            <input
              id="push-role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="예: seller"
              className="mt-1 w-full rounded-field border border-border bg-field px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}

        {/* 유형 */}
        <div className="mt-4">
          <label htmlFor="push-type" className="text-xs font-medium text-foreground">
            유형
          </label>
          <select
            id="push-type"
            value={type}
            onChange={(e) => setType(e.target.value as "SYSTEM" | "MARKETING")}
            className="mt-1 block rounded-field border border-border bg-card px-2 py-1.5 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="SYSTEM">시스템 공지</option>
            <option value="MARKETING">마케팅</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            마케팅 알림은 정보통신망법에 따라 수신 동의(pushMarketing)한 사용자에게만 발송됩니다.
          </p>
        </div>

        {/* 제목 */}
        <div className="mt-4">
          <label htmlFor="push-title" className="text-xs font-medium text-foreground">
            제목
          </label>
          <input
            id="push-title"
            type="text"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-field border border-border bg-field px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground tabular">{title.length}/100</p>
        </div>

        {/* 본문 */}
        <div className="mt-2">
          <label htmlFor="push-body" className="text-xs font-medium text-foreground">
            본문
          </label>
          <textarea
            id="push-body"
            rows={4}
            value={body}
            maxLength={500}
            onChange={(e) => setBody(e.target.value)}
            className="mt-1 w-full rounded-field border border-border bg-field px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground tabular">{body.length}/500</p>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || sendPush.isPending}
          className="mt-4 rounded-btn bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary-dark focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendPush.isPending ? "발송 중..." : "발송"}
        </button>

        {sendPush.isError && (
          <p className="mt-3 rounded-field border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            발송에 실패했습니다. 권한이 없거나 서버 오류일 수 있습니다.
            {sendPush.error?.message ? ` (${sendPush.error.message})` : ""}
          </p>
        )}

        {result && (
          <div className="mt-3 rounded-field border border-olive-bd bg-olive-bg px-3 py-2 text-xs text-olive-tx">
            <p className="font-bold">발송 완료</p>
            <p className="mt-1 tabular">
              대상 {result.targeted} · 생성 {result.created} · 발송 {result.pushed} · 실패 {result.failed} · 제외{" "}
              {result.skipped}
            </p>
            <p className="mt-0.5">제외는 수신 거부 또는 등록된 기기 없음입니다.</p>
          </div>
        )}
      </section>

      {/* 최근 발송 이력 */}
      <section className="rounded-thumb border border-border bg-card p-5 card-shadow">
        <h2 className="text-sm font-semibold text-foreground">최근 발송 이력</h2>
        <div className="mt-4 space-y-2">
          {historyLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-field bg-muted" />
            ))
          ) : (history ?? []).length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">발송 이력이 없습니다.</p>
          ) : (
            (history ?? []).map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-field bg-muted/50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.body}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {TARGET_LABELS[item.target] ?? item.target} · <span className="tabular">{item.targeted}</span>명
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">{item.adminName || `관리자 #${item.adminId}`}</p>
                  <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("ko-KR")}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
