"use client";

import { useSharedTriage } from "@repo/core";
import Link from "next/link";
import { TriageReport } from "../../../../components/TriageReport";

// 공유 리포트 — 비로그인 공개 화면 (AuthGate·로그인 전용 훅 사용 금지)
export default function SharedTriageReportPage({ params }: { params: { token: string } }) {
  const { data: diagnosis, isLoading, error } = useSharedTriage(params.token);

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-lg px-5 py-5 pb-28">
        <h1 className="mb-4 text-[13px] font-bold tracking-[-0.2px] text-muted-foreground">자투리 AI 감정 리포트</h1>

        {isLoading ? (
          <div className="space-y-4" aria-busy="true">
            <div className="h-7 w-2/3 animate-pulse rounded bg-field" />
            <div className="h-36 animate-pulse rounded-card bg-field" />
            <div className="h-28 animate-pulse rounded-card bg-field" />
          </div>
        ) : error || !diagnosis ? (
          <p className="py-16 text-center text-base font-medium text-foreground">리포트를 찾을 수 없습니다</p>
        ) : (
          <TriageReport diagnosis={diagnosis} />
        )}

        <Link
          href="/triage"
          className="mt-6 flex min-h-[56px] w-full items-center justify-center rounded-btn bg-primary px-4 text-base font-bold text-primary-foreground transition-colors hover:bg-primary-dark active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          내 창고도 3초 진단하기
        </Link>
      </div>
    </div>
  );
}
