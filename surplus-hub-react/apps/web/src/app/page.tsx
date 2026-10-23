"use client";

import { MaterialItem, useMaterials } from "@repo/core";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

// 업종별 카테고리 — 백엔드 seed_categories와 동기화 (조명/문/건자재/전기/설비/기타)
const CATEGORIES = [
  { label: "조명" },
  { label: "문/창호" },
  { label: "건축자재" },
  { label: "전기" },
  { label: "설비" },
  { label: "기타" },
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
  "flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-chip border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const CHIP_ACTIVE = "border-ink bg-ink font-bold text-surface";
const CHIP_INACTIVE = "border-line bg-surface font-medium text-foreground hover:bg-field active:bg-field";


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
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-x-3 gap-y-5 px-5 py-4 md:grid-cols-3" aria-busy="true">
        {[0, 1, 2, 3].map((cell) => (
          <div key={cell} className="flex flex-col gap-2 animate-pulse">
            <div className="aspect-square w-full rounded-thumb bg-field" />
            <div className="h-4 w-3/4 rounded bg-field" />
            <div className="h-5 w-1/2 rounded bg-field" />
          </div>
        ))}
      </div>
    );
  }

  if (error && materials.length === 0) {
    return <div className="p-4 text-center text-destructive">자재 목록을 불러오지 못했습니다.</div>;
  }

  return (
    <div className="min-h-screen bg-paper">
      {/* MOBILE MASTHEAD — 위치 · 알림 · 검색 필 (모바일 전용) */}
      <div className="bg-paper px-5 pt-4 pb-1 md:hidden">
        <h1 className="sr-only">자투리</h1>
        <div className="flex items-center justify-between">
          <div className="relative flex items-center">
            <select
              aria-label="지역 선택"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="h-11 appearance-none cursor-pointer bg-transparent pr-6 text-[20px] font-extrabold tracking-[-0.6px] text-foreground outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              {REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region === "전체" ? "전체 지역" : region}
                </option>
              ))}
            </select>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.2}
              stroke="currentColor"
              aria-hidden="true"
              className="pointer-events-none absolute right-0 h-[18px] w-[18px] text-foreground"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </div>
          <Link
            href="/notifications"
            aria-label="알림"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-field text-foreground transition-colors active:bg-line-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9M10 20a2 2 0 0 0 4 0" />
            </svg>
          </Link>
        </div>
        <Link
          href="/search"
          className="mt-3 flex h-12 items-center gap-2.5 rounded-chip bg-field px-4 text-[14.5px] text-muted-foreground transition-colors active:bg-line-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true" className="h-[18px] w-[18px]">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="m20 20-3.5-3.5" />
          </svg>
          <span>내 주변 잔여 자재를 찾아보세요</span>
        </Link>
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
              className="h-[50px] w-full rounded-chip border border-transparent bg-field pl-11 pr-24 text-[15px] text-foreground placeholder:text-ink-3 focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
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
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-chip bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
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
              const isActive = selectedCategory === category.label;
              return (
                <button
                  key={category.label}
                  type="button"
                  onClick={() => setSelectedCategory(category.label)}
                  className={`${CHIP_BASE} ${isActive ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {category.label}
                </button>
              );
            })}
          </nav>

          {/* LIST HEADER — 카운트 · 정렬 */}
          <div className="flex items-center justify-between px-5 pb-2 md:px-0">
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
              className="min-h-[44px] cursor-pointer bg-transparent text-[13px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="latest">최신순</option>
              <option value="price_asc">가격 낮은순</option>
              <option value="price_desc">가격 높은순</option>
            </select>
          </div>

          {/* MATERIAL GRID — 사진 중심 카탈로그 카드 */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 px-5 pt-2 md:grid-cols-3 md:gap-x-5 md:px-0">
            {materials.map((item) => {
              const isSold = item.status === "SOLD";
              const grade = item.conditionGrade;
              const hasGrade = grade === "상" || grade === "중" || grade === "하";
              const meta = [formatLocation(item.location), item.createdAt ? new Date(item.createdAt).toLocaleDateString() : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <Link
                  href={`/material/${item.id}`}
                  key={item.id}
                  className="group flex min-w-0 flex-col gap-2 rounded-thumb focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-square w-full overflow-hidden rounded-thumb bg-field">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-ink-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="h-9 w-9">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                        </svg>
                      </div>
                    )}
                    {(item.status === "RESERVED" || hasGrade) && !isSold && (
                      <div className="absolute left-2 top-2 flex gap-1">
                        {item.status === "RESERVED" && (
                          <span className="rounded-chip bg-surface px-2.5 py-1 text-[11.5px] font-bold text-foreground">예약중</span>
                        )}
                        {hasGrade && (
                          <span
                            className={
                              "rounded-chip border px-2.5 py-0.5 text-[11.5px] font-bold " +
                              (grade === "상"
                                ? "border-olive-bd bg-olive-bg text-olive-tx"
                                : "border-line bg-surface text-muted-foreground")
                            }
                          >
                            {grade}
                          </span>
                        )}
                      </div>
                    )}
                    {isSold && (
                      <div className="absolute inset-0 flex items-center justify-center bg-ink/60">
                        <span className="text-xs font-bold text-surface">판매완료</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h3
                      className={
                        "line-clamp-2 text-[14px] font-semibold leading-[1.35] tracking-[-0.2px] " +
                        (isSold ? "text-muted-foreground" : "text-foreground")
                      }
                    >
                      {item.title}
                    </h3>
                    {item.price > 0 ? (
                      <p className={isSold ? "text-muted-foreground" : "text-foreground"}>
                        <span className="num text-[17px] font-bold">{item.price.toLocaleString()}</span>
                        <span className="text-[13px] font-semibold">원</span>
                      </p>
                    ) : (
                      <p className="text-base font-extrabold text-primary">무료나눔</p>
                    )}
                    <p className="truncate text-xs text-muted-foreground">{meta}</p>
                    {(item.likesCount ?? 0) > 0 || (item.quantity && item.quantity > 0) ? (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        {item.quantity && item.quantity > 0 ? (
                          <span>
                            수량 {item.quantity}
                            {item.quantityUnit ? ` ${item.quantityUnit}` : ""}
                          </span>
                        ) : null}
                        {(item.likesCount ?? 0) > 0 ? (
                          <span className="ml-auto flex items-center gap-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true" className="h-[13px] w-[13px]">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                            </svg>
                            <span className="tabular">{item.likesCount}</span>
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>

          {!showInitialLoading && materials.length === 0 ? (
            <div className="mx-5 mt-10 flex flex-col items-center gap-4 px-4 pt-10 pb-4 text-center md:mx-0">
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
                className="min-h-[48px] rounded-chip border border-line bg-surface px-8 text-sm font-semibold text-foreground transition-colors hover:bg-muted active:bg-muted disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                {isFetching ? "불러오는 중..." : "더 보기"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* 등록하기 FAB (모바일) */}
      <Link
        href="/register"
        className="bg-primary shadow-fab fixed bottom-[88px] right-5 z-40 flex h-[52px] items-center gap-1.5 rounded-full px-5 text-sm font-bold text-primary-foreground transition-colors active:bg-primary-dark md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true" className="h-[19px] w-[19px]">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        등록하기
      </Link>

    </div>
  );
}
