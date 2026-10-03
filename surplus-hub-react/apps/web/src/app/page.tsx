"use client";

import { MaterialItem, useMaterials } from "@repo/core";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

// 모노라인 아이콘 (viewBox 0 0 24 24, stroke=currentColor, stroke-width 1.8, fill=none)
const iconProps = {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.8,
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// 조명 — 전구
const IconLighting = ({ className }: { className?: string }) => (
  <svg {...iconProps} className={className}>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.5.4.8.9.9 1.5l.2 1.2h5l.2-1.2c.1-.6.4-1.1.9-1.5A6 6 0 0 0 12 3Z" />
  </svg>
);
// 문/창호 — 문
const IconDoor = ({ className }: { className?: string }) => (
  <svg {...iconProps} className={className}>
    <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M14.5 12v.5" />
  </svg>
);
// 건축자재 — 벽돌
const IconBricks = ({ className }: { className?: string }) => (
  <svg {...iconProps} className={className}>
    <path d="M3 8.5h18M3 15.5h18M3 5.5h18v13H3zM9 5.5v3M15 5.5v3M6 8.5v7M12 8.5v7M18 8.5v7M9 15.5v3M15 15.5v3" />
  </svg>
);
// 전기 — 번개
const IconBolt = ({ className }: { className?: string }) => (
  <svg {...iconProps} className={className}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </svg>
);
// 설비 — 렌치
const IconWrench = ({ className }: { className?: string }) => (
  <svg {...iconProps} className={className}>
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L4 16.7a1.5 1.5 0 0 0 2.1 2.1l5.3-5.3a4 4 0 0 0 5.1-5.4l-2.4 2.4-2.1-.3-.3-2.1 2.9-1.8Z" />
  </svg>
);
// 기타 — 박스
const IconBox = ({ className }: { className?: string }) => (
  <svg {...iconProps} className={className}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5m0 0 9-5m-9 5v8" />
  </svg>
);

// 업종별 카테고리 — 백엔드 seed_categories와 동기화 (조명/문/건자재/전기/설비/기타)
const CATEGORIES = [
  { icon: IconLighting, label: "조명" },
  { icon: IconDoor, label: "문/창호" },
  { icon: IconBricks, label: "건축자재" },
  { icon: IconBolt, label: "전기" },
  { icon: IconWrench, label: "설비" },
  { icon: IconBox, label: "기타" },
] as const;

const REGIONS = [
  "전체",
  "서울특별시",
  "경기도",
  "인천광역시",
  "부산광역시",
  "대구광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "강원도",
  "충청북도",
  "충청남도",
  "전라북도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
] as const;

const FIXED_SORT = "latest" as const;
const PAGE_SIZE = 20;
const formatLocation = (location?: string): string => {
  if (!location || !location.trim()) return "위치 정보 없음";
  if (/^\s*Lat\s*:/i.test(location) || /Lng\s*:/i.test(location)) return "위치 정보 없음";
  return location;
};

// 카테고리 칩 공통 스타일 (모바일 가로 스크롤 · 데스크톱 wrap 공유)
const CHIP_BASE =
  "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const CHIP_ACTIVE = "border-primary bg-accent font-semibold text-accent-foreground";
const CHIP_INACTIVE = "border-border bg-card font-medium text-foreground hover:bg-muted active:bg-muted";


export default function Home() {
  const [searchInput, setSearchInput] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [selectedRegion, setSelectedRegion] = useState<string>("전체");
  const [sortOption, setSortOption] = useState<"latest" | "price_asc" | "price_desc">("latest");
  const [page, setPage] = useState(1);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [hasReachedMax, setHasReachedMax] = useState(false);

  const queryParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      category: selectedCategory,
      sort: sortOption,
      keyword: submittedKeyword.trim() ? submittedKeyword.trim() : undefined,
      location: selectedRegion !== "전체" ? selectedRegion : undefined,
    }),
    [page, selectedCategory, sortOption, submittedKeyword, selectedRegion]
  );

  const { data, isLoading, isFetching, error } = useMaterials(queryParams);

  useEffect(() => {
    setPage(1);
    setMaterials([]);
    setHasReachedMax(false);
  }, [selectedCategory, submittedKeyword, sortOption, selectedRegion]);

  useEffect(() => {
    if (!data) return;

    const incoming = data?.data ?? [];

    setMaterials((previous) => {
      if (page === 1) {
        return incoming;
      }

      const merged = [...previous];
      const seen = new Set(previous.map((item) => item.id));

      for (const item of incoming) {
        if (!seen.has(item.id)) {
          merged.push(item);
          seen.add(item.id);
        }
      }

      return merged;
    });

    setHasReachedMax(incoming.length < PAGE_SIZE);
  }, [data, page]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedKeyword(searchInput);
  };

  const handleLoadMore = () => {
    if (hasReachedMax || isFetching) return;
    setPage((currentPage) => currentPage + 1);
  };

  const showInitialLoading = isLoading && page === 1 && materials.length === 0;
  const totalCount = data?.meta?.totalCount;

  if (showInitialLoading) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-4" aria-busy="true">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex gap-3.5 py-4 animate-pulse">
            <div className="h-[100px] w-[100px] rounded-thumb bg-muted" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/3 rounded bg-muted" />
              <div className="h-5 w-24 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error && materials.length === 0) {
    return <div className="p-4 text-center text-destructive">자재 목록을 불러오지 못했습니다.</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* MOBILE MASTHEAD — 지역 선택 · 알림 · 타이틀 (모바일 전용) */}
      <div className="bg-card border-b border-border px-5 pt-3 pb-3.5 md:hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="relative flex items-center gap-1">
            <select
              aria-label="지역 선택"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="appearance-none cursor-pointer bg-transparent pr-5 text-[13px] text-muted-foreground outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              {REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
              className="pointer-events-none absolute right-0 h-4 w-4 text-muted-foreground"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
          <Link
            href="/notifications"
            aria-label="알림"
            className="flex h-11 w-11 -mr-2 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
              className="h-6 w-6 text-foreground"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
              />
            </svg>
          </Link>
        </div>
        <h1 className="text-[21px] font-extrabold tracking-[-0.5px] text-foreground">자투리</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">내 주변 잔여 자재를 찾아보세요</p>
      </div>

      {/* SHELL — 데스크톱 210px 사이드레일 + 피드 그리드 */}
      <div className="mx-auto max-w-5xl md:grid md:grid-cols-[210px_minmax(0,1fr)] md:gap-10 md:px-5 md:py-6">
        {/* DESKTOP SIDE RAIL — 지역 (데스크톱 전용) */}
        <aside className="hidden md:block md:sticky md:top-20 md:self-start">
          <p className="text-[13px] font-semibold text-muted-foreground">지역</p>
          <select
            aria-label="지역 선택"
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="mt-2 w-full rounded-field border border-border bg-card px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </aside>

        {/* FEED COLUMN */}
        <div className="min-w-0">
          {/* Desktop search — 기능 동일 (데스크톱 전용) */}
          <form className="relative mb-5 hidden md:block" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="시멘트, 파이프, 목재 검색..."
              className="h-[50px] w-full rounded-field border border-border bg-card pl-11 pr-24 text-[15px] text-foreground placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
              className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              검색
            </button>
          </form>

          {/* CATEGORY RAIL — 단일 DOM (모바일 스크롤 칩 → 데스크톱 wrap) */}
          <nav
            aria-label="카테고리"
            className="flex gap-2 overflow-x-auto px-5 py-3 scrollbar-hide md:flex-wrap md:overflow-visible md:px-0 md:pt-0 md:pb-4"
          >
            <button
              type="button"
              onClick={() => setSelectedCategory(undefined)}
              className={`${CHIP_BASE} ${selectedCategory === undefined ? CHIP_ACTIVE : CHIP_INACTIVE}`}
            >
              전체
            </button>
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              const isActive = selectedCategory === category.label;
              return (
                <button
                  key={category.label}
                  type="button"
                  onClick={() => setSelectedCategory(category.label)}
                  className={`${CHIP_BASE} ${isActive ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </nav>

          {/* LIST HEADER — 카운트 · 정렬 */}
          <div className="flex items-baseline justify-between border-b-2 border-foreground px-5 pb-2 md:px-0">
            {typeof totalCount === "number" ? (
              <p className="text-[13px] font-semibold text-muted-foreground">
                전체 <span className="tabular font-bold text-foreground">{totalCount.toLocaleString()}</span>건
              </p>
            ) : (
              <span />
            )}
            <select
              aria-label="정렬"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as "latest" | "price_asc" | "price_desc")}
              className="cursor-pointer bg-transparent py-1 text-[13px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="latest">최신순</option>
              <option value="price_asc">가격 낮은순</option>
              <option value="price_desc">가격 높은순</option>
            </select>
          </div>

          {/* MATERIAL LIST — 에디토리얼 분류 행 */}
          <div className="flex flex-col">
            {materials.map((item) => {
              const isSold = item.status === "SOLD";
              const grade = item.conditionGrade;
              const hasGrade = grade === "상" || grade === "중" || grade === "하";
              const hasRow1 = hasGrade || item.status === "RESERVED" || Boolean(item.createdAt);
              const meta = [item.category, formatLocation(item.location)].filter(Boolean).join(" · ");
              return (
                <Link
                  href={`/material/${item.id}`}
                  key={item.id}
                  className="group flex gap-3.5 bg-card px-5 transition-colors hover:bg-muted/40 active:bg-muted/60 md:bg-transparent md:px-0 md:hover:bg-card md:active:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  {/* Thumbnail */}
                  <div className="relative my-4 h-[100px] w-[100px] shrink-0 overflow-hidden rounded-thumb border border-border-secondary bg-muted">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="h-10 w-10">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                        </svg>
                      </div>
                    )}
                    {isSold && (
                      <div className="absolute inset-0 flex items-center justify-center bg-foreground/70">
                        <span className="text-xs font-bold text-surface">판매완료</span>
                      </div>
                    )}
                  </div>

                  {/* Info column — border-b = 썸네일을 지나 들여쓴 구분선 */}
                  <div className="flex min-w-0 flex-1 flex-col border-b border-border-secondary py-4">
                    {hasRow1 && (
                      <div className="flex items-center gap-1.5">
                        {hasGrade && (
                          <span
                            className={
                              "rounded-chip border px-2 py-0.5 text-xs font-semibold " +
                              (grade === "상"
                                ? "bg-olive-bg text-olive-tx border-olive-bd"
                                : "bg-card text-muted-foreground border-border")
                            }
                          >
                            {grade}
                          </span>
                        )}
                        {item.status === "RESERVED" && (
                          <span className="rounded-chip bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                            예약중
                          </span>
                        )}
                        {item.createdAt && (
                          <span className="ml-auto text-xs text-muted-foreground tabular">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}

                    <h3
                      className={
                        "line-clamp-2 text-[17px] font-semibold leading-[1.32] tracking-[-0.3px] " +
                        (isSold ? "text-muted-foreground" : "text-foreground")
                      }
                    >
                      {item.title}
                    </h3>

                    {item.quantity && item.quantity > 0 ? (
                      <p className="mt-1 text-[13.5px] text-muted-foreground">
                        수량 {item.quantity}
                        {item.quantityUnit ? ` ${item.quantityUnit}` : ""}
                      </p>
                    ) : null}

                    <p className="mt-1 truncate text-[12.5px] text-muted-foreground">{meta}</p>

                    <div className="mt-auto flex items-baseline justify-between pt-1.5">
                      {item.price > 0 ? (
                        <p className={isSold ? "text-muted-foreground" : "text-foreground"}>
                          <span className="tabular text-xl font-bold tracking-[-0.5px]">{item.price.toLocaleString()}</span>
                          <span className="ml-0.5 text-[13px] font-medium text-muted-foreground">원</span>
                        </p>
                      ) : (
                        <p className="text-base font-bold text-foreground">무료나눔</p>
                      )}
                      <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted-foreground">
                        {item.sellerName ? <span className="truncate max-w-[120px]">{item.sellerName}</span> : null}
                        {(item.likesCount ?? 0) > 0 ? (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="h-[13px] w-[13px]">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                            </svg>
                            <span className="tabular">{item.likesCount}</span>
                          </>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {!showInitialLoading && materials.length === 0 ? (
            <div className="mx-5 mt-10 flex flex-col items-center gap-4 border-t border-border px-4 pt-10 pb-4 text-center md:mx-0">
              <p className="text-lg font-medium text-foreground">아직 등록된 자재가 없어요</p>
              <p className="text-sm text-muted-foreground">첫 자재를 등록해보세요!</p>
              <Link
                href="/register"
                className="rounded-btn bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                등록하기
              </Link>
            </div>
          ) : null}

          {!hasReachedMax && materials.length > 0 ? (
            <div className="mt-6 flex justify-center px-5 pb-4 md:px-0">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isFetching}
                className="min-h-[48px] rounded-btn border border-border bg-card px-8 text-sm font-semibold text-foreground transition-colors hover:bg-muted active:bg-muted disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                {isFetching ? "불러오는 중..." : "더 보기"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* 등록하기 FAB — 1a 시안 (모바일) */}
      <Link
        href="/register"
        className="bg-primary shadow-fab fixed bottom-[82px] right-4 z-40 flex h-12 items-center gap-1.5 rounded-full px-4 text-sm font-bold text-primary-foreground transition-colors active:bg-primary-dark md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true" className="h-[19px] w-[19px]">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        등록하기
      </Link>

    </div>
  );
}
