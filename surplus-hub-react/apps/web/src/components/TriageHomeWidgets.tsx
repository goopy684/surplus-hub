"use client";

import { useHotDemands } from "@repo/core";
import Link from "next/link";
import { useGrantedCoords } from "../utils/useGrantedCoords";

// 홈 진입점 — 3초 가치진단 배너 + 급구 전광판(데이터 없으면 숨김)
export function TriageHomeWidgets() {
  // 홈 진입만으로 권한 팝업을 띄우지 않는다 — 이미 허용된 경우에만 좌표를 쓴다
  const coords = useGrantedCoords();

  const { data: board } = useHotDemands(coords ?? {});
  const items = board?.items.slice(0, 5) ?? [];
  const showBoard = !!board && (items.length > 0 || board.weeklyDisposalSaved > 0);

  return (
    <div className="space-y-3 px-5 pt-3 md:mb-5 md:px-0 md:pt-0">
      <section className="flex items-center gap-3 rounded-card bg-accent p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-extrabold tracking-[-0.3px] text-accent-foreground">내 창고 자재 3초 가치진단</h2>
          <p className="mt-1 text-[12.5px] leading-[1.5] text-accent-foreground">
            버리기 전에 확인하세요. 사진 한 장이면 폐기·고철·직거래 손익을 비교해 드립니다.
          </p>
        </div>
        <Link
          href="/triage"
          className="inline-flex min-h-[44px] flex-shrink-0 items-center rounded-btn bg-ink px-4 text-sm font-bold text-surface transition-colors hover:bg-ink-2 active:bg-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          진단 시작
        </Link>
      </section>

      {showBoard ? (
        <section aria-labelledby="hot-demand-title" className="rounded-card border border-line p-4">
          <h2 id="hot-demand-title" className="text-[15px] font-extrabold tracking-[-0.3px] text-foreground">
            {board.scope === "nearby" ? `지금 내 주변 ${board.radiusKm}km 급구 품목` : "지금 많이 찾는 급구 품목"}
          </h2>
          {items.length > 0 ? (
            <ol className="mt-2 divide-y divide-line-2">
              {items.map((item, index) => (
                <li key={item.key || item.label} className="flex items-center gap-3 py-2">
                  <span className="num w-5 text-[15px] font-bold text-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{item.label}</span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    유동성 <span className="tabular">{item.liquidityScore}</span>점 · 최근 검색{" "}
                    <span className="tabular">{item.searchCount}</span>회
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          {board.weeklyDisposalSaved > 0 ? (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              이번 주 폐기비 절감{" "}
              <span className="tabular font-bold text-olive-tx">{board.weeklyDisposalSaved.toLocaleString()}원</span>{" "}
              (등록 전환 {board.weeklyListedCount}건 기준 추정)
            </p>
          ) : null}
          <Link
            href="/triage"
            className="mt-2 inline-flex min-h-[44px] items-center gap-1 rounded-btn text-sm font-semibold text-foreground transition-colors hover:text-ink-2 active:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            내 창고에도 있다면 진단해 보기
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        </section>
      ) : null}
    </div>
  );
}
