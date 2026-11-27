"use client";

import { MATERIAL_CATEGORIES, formatWantedSpec, useWantedList } from "@repo/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const CHIP_BASE =
  "flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-chip border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const CHIP_ACTIVE = "border-ink bg-ink font-bold text-surface";
const CHIP_INACTIVE = "border-line bg-surface font-medium text-foreground hover:bg-field active:bg-field";
const PRIMARY_LINK =
  "inline-flex min-h-[44px] items-center rounded-btn bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-dark active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function WantedListPage() {
  const router = useRouter();
  const [category, setCategory] = useState<string | undefined>(undefined);
  const { data, isLoading, error } = useWantedList(category ? { category } : {});
  const items = data?.data ?? [];

  return (
    <div className="min-h-screen bg-canvas pb-28">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line-2 bg-surface px-4 py-2">
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="flex-1 text-[17px] font-extrabold tracking-[-0.4px] text-foreground">구해요</h1>
        <Link href="/wanted/new" className={PRIMARY_LINK}>
          구해요 등록
        </Link>
      </div>

      <nav aria-label="카테고리" className="flex gap-2 overflow-x-auto bg-surface px-4 py-3 scrollbar-hide">
        <button
          type="button"
          aria-pressed={category === undefined}
          onClick={() => setCategory(undefined)}
          className={`${CHIP_BASE} ${category === undefined ? CHIP_ACTIVE : CHIP_INACTIVE}`}
        >
          전체
        </button>
        {MATERIAL_CATEGORIES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={category === option}
            onClick={() => setCategory(option)}
            className={`${CHIP_BASE} ${category === option ? CHIP_ACTIVE : CHIP_INACTIVE}`}
          >
            {option}
          </button>
        ))}
      </nav>

      {isLoading ? (
        <div className="flex items-center justify-center py-20" aria-busy="true">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : error ? (
        <p className="px-4 py-20 text-center text-sm text-destructive">구매 요청을 불러오지 못했습니다.</p>
      ) : items.length === 0 ? (
        <div className="px-5 py-20 text-center">
          <p className="text-base font-bold text-foreground">아직 올라온 구매 요청이 없어요</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            찾는 자재를 먼저 올려두면 맞는 매물이 등록될 때 알려드립니다.
          </p>
          <Link
            href="/wanted/new"
            className="mt-5 inline-flex min-h-[48px] items-center rounded-btn border border-line bg-surface px-6 text-sm font-semibold text-foreground transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            찾는 자재 올리기
          </Link>
        </div>
      ) : (
        <ul className="mx-auto max-w-lg space-y-2.5 px-4 py-4">
          {items.map((item) => {
            const spec = formatWantedSpec(item);
            return (
              <li key={item.id}>
                <Link
                  href={`/wanted/${item.id}`}
                  className="block rounded-card bg-surface p-4 transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="text-xs font-semibold text-muted-foreground">{item.category}</p>
                  <p className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-[1.35] text-foreground">{item.title}</p>
                  {spec ? <p className="mt-1 text-[13px] text-foreground">{spec}</p> : null}
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {[item.locationAddress, `반경 ${item.radiusKm}km`, new Date(item.createdAt).toLocaleDateString()]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
