"use client";

import { formatWantedSpec, useCloseWanted, useCurrentUser, useWanted } from "@repo/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReportModal } from "../../../components/ReportModal";

const ENDED_LABELS: Record<string, string> = { CLOSED: "마감", EXPIRED: "기간 만료" };

export default function WantedDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data: wanted, isLoading, error } = useWanted(params.id);
  const { data: currentUser } = useCurrentUser();
  const { mutate: closeWanted, isPending: isClosing } = useCloseWanted();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const isOwner = !!currentUser && !!wanted && currentUser.id === wanted.requester.id;
  const isOpen = wanted?.status === "OPEN";

  const handleClose = () => {
    if (!confirm("요청을 마감할까요? 마감하면 목록과 매칭 알림에서 빠집니다.")) return;
    closeWanted(params.id, {
      onError: () => alert("마감하지 못했습니다. 다시 시도해주세요."),
    });
  };

  const header = (
    <div className="sticky top-0 z-50 flex h-14 items-center gap-1 bg-surface px-2">
      <button
        type="button"
        aria-label="뒤로가기"
        onClick={() => router.back()}
        className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <h1 className="flex-1 text-lg font-extrabold tracking-[-0.4px] text-foreground">구매 요청</h1>
      {wanted && !isOwner ? (
        <button
          type="button"
          onClick={() => setIsReportModalOpen(true)}
          aria-label="구매 요청 신고"
          className="flex h-11 items-center rounded-full px-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-destructive active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          신고
        </button>
      ) : null}
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-paper">
        {header}
        <div className="mx-auto max-w-lg space-y-4 px-5 py-4" aria-busy="true">
          <div className="h-7 w-2/3 animate-pulse rounded bg-field" />
          <div className="h-24 animate-pulse rounded-card bg-field" />
        </div>
      </div>
    );
  }

  if (error || !wanted) {
    return (
      <div className="min-h-screen bg-paper">
        {header}
        <p className="px-5 py-20 text-center text-base text-muted-foreground">구매 요청을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const spec = formatWantedSpec(wanted);
  const endedLabel = ENDED_LABELS[wanted.status];

  return (
    <div className="min-h-screen bg-paper pb-28">
      {header}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        targetType="wanted"
        targetId={Number(wanted.id) || 0}
        targetLabel="구매 요청"
      />

      <div className="mx-auto max-w-lg space-y-6 px-5 py-4">
        <section>
          <div className="flex items-center gap-2">
            {endedLabel ? (
              <span className="rounded-chip border border-line bg-field px-2.5 py-0.5 text-[11.5px] font-bold text-muted-foreground">
                {endedLabel}
              </span>
            ) : null}
            <span className="text-xs font-semibold text-muted-foreground">{wanted.category}</span>
          </div>
          <h2
            className={`mt-1.5 text-[22px] font-extrabold leading-[1.3] tracking-[-0.6px] ${endedLabel ? "text-muted-foreground" : "text-foreground"}`}
          >
            {wanted.title}
          </h2>
          {spec ? <p className="mt-2 text-[15px] font-semibold text-foreground">{spec}</p> : null}
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">
            {[
              wanted.locationAddress,
              `반경 ${wanted.radiusKm}km`,
              `${new Date(wanted.createdAt).toLocaleDateString()} 등록`,
              isOpen ? `${new Date(wanted.expiresAt).toLocaleDateString()}까지` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {wanted.requester.name ? (
            <p className="mt-1 text-[12.5px] text-muted-foreground">요청자 {wanted.requester.name}</p>
          ) : null}
          {wanted.description ? (
            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-[1.6] text-foreground">{wanted.description}</p>
          ) : null}
        </section>

        <section aria-labelledby="wanted-matches-title">
          <h3 id="wanted-matches-title" className="text-[15px] font-extrabold tracking-[-0.3px] text-foreground">
            맞는 매물
          </h3>
          {wanted.matches.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5">
              {wanted.matches.map((item) => (
                <Link
                  key={item.id}
                  href={`/material/${item.id}`}
                  className="flex min-w-0 flex-col gap-2 rounded-thumb focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="aspect-square w-full overflow-hidden rounded-thumb bg-field">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 업로드된 원본 URL을 그대로 보여준다 (홈 그리드와 동일)
                      <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[14px] font-semibold leading-[1.35] text-foreground">{item.title}</p>
                    {item.price > 0 ? (
                      <p className="text-foreground">
                        <span className="num text-[17px] font-bold">{item.price.toLocaleString()}</span>
                        <span className="text-[13px] font-semibold">원</span>
                      </p>
                    ) : (
                      <p className="text-base font-extrabold text-primary">무료나눔</p>
                    )}
                    {item.location ? <p className="truncate text-xs text-muted-foreground">{item.location}</p> : null}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {isOwner && isOpen ? "아직 맞는 매물이 없어요. 올라오면 알림으로 알려드립니다." : "아직 맞는 매물이 없어요."}
            </p>
          )}
        </section>

        {isOpen ? (
          isOwner ? (
            <button
              type="button"
              onClick={handleClose}
              disabled={isClosing}
              className="flex min-h-[48px] w-full items-center justify-center rounded-btn border border-line bg-surface text-sm font-semibold text-foreground transition-colors hover:bg-field active:bg-field disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isClosing ? "마감 중…" : "마감하기"}
            </button>
          ) : (
            <div>
              <Link
                href="/register"
                className="flex min-h-[56px] w-full items-center justify-center rounded-btn bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary-dark active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                맞는 자재 등록하기
              </Link>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                자재를 등록하면 요청자에게 알림이 가고, 매물 채팅으로 연락이 옵니다.
              </p>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
