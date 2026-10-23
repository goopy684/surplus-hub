"use client";

import {
  useMaterials,
  useAiSearch,
  useSearchSuggestions,
  useCategories,
  TRADE_METHOD_OPTIONS,
  SEARCH_RADIUS_OPTIONS_KM,
} from "@repo/core";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState, useRef, useEffect } from "react";

// 현장 용어 그대로 검색해도 AI 검색이 찾아준다는 걸 보여주는 예시
const EXAMPLE_SEARCHES = ["아시바", "분홍색 단열재", "녹 안 스는 파이프"];

const chipClass = (active: boolean) =>
  `h-[38px] shrink-0 rounded-chip border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active
      ? "border-ink bg-ink font-bold text-surface"
      : "border-line bg-surface font-medium text-foreground hover:bg-field"
  }`;

function SearchPageContent() {
  const queryParam = useSearchParams().get("q")?.trim() ?? "";
  const [keyword, setKeyword] = useState(queryParam);
  const [submittedKeyword, setSubmittedKeyword] = useState(queryParam);
  const [aiMode, setAiMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [tradeMethod, setTradeMethod] = useState<string | undefined>(undefined);
  const [radiusKm, setRadiusKm] = useState<number | undefined>(undefined);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  // 거래방식·내 주변 필터는 AI 검색 API만 지원한다
  const aiSearchActive = aiMode || !!tradeMethod || radiusKm !== undefined;

  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { data: categoriesData } = useCategories();
  const categories = categoriesData ?? [];

  const { data: suggestionsData } = useSearchSuggestions(keyword);
  const suggestions = suggestionsData?.suggestions ?? [];

  const { data: materialData, isLoading: materialLoading, error: materialError } = useMaterials({
    keyword: !aiSearchActive && submittedKeyword ? submittedKeyword : undefined,
    category: !aiSearchActive && selectedCategory ? selectedCategory : undefined,
    page: 1,
    limit: 20,
  });

  const { data: aiData, isLoading: aiLoading, error: aiError } = useAiSearch(
    {
      q: submittedKeyword,
      category: selectedCategory,
      tradeMethod,
      // radiusKm은 좌표를 얻은 뒤에만 설정된다
      ...(radiusKm !== undefined && coords
        ? { locationLat: coords.lat, locationLng: coords.lng, radiusKm, sortBy: "distance" }
        : {}),
      page: 1,
      limit: 20,
    },
    aiSearchActive && submittedKeyword.length > 0
  );

  const isLoading = aiSearchActive ? aiLoading : materialLoading;
  const error = aiSearchActive ? aiError : materialError;
  const results = aiSearchActive
    ? (aiData?.data ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        price: item.price,
        location: item.location,
        distanceKm: item.distanceKm,
      }))
    : (materialData?.data ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        price: item.price,
        location: item.location,
        distanceKm: undefined,
      }));

  const handleRadius = (km?: number) => {
    setGeoMessage(null);
    if (km === undefined || coords) {
      setRadiusKm(km);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMessage("이 브라우저에서는 위치를 사용할 수 없습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setRadiusKm(km);
      },
      () => setGeoMessage("위치 권한이 없어 내 주변 검색을 사용할 수 없습니다.")
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = keyword.trim();
    if (trimmed) {
      setSubmittedKeyword(trimmed);
      setShowSuggestions(false);
      if (!recentSearches.includes(trimmed)) {
        setRecentSearches([trimmed, ...recentSearches.slice(0, 2)]);
      }
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setKeyword(suggestion);
    setSubmittedKeyword(suggestion);
    setShowSuggestions(false);
    if (!recentSearches.includes(suggestion)) {
      setRecentSearches([suggestion, ...recentSearches.slice(0, 2)]);
    }
  };

  const handleDeleteRecent = (searchTerm: string) => {
    setRecentSearches(recentSearches.filter((term) => term !== searchTerm));
  };

  const handleRecentClick = (searchTerm: string) => {
    setKeyword(searchTerm);
    setSubmittedKeyword(searchTerm);
  };

  const handleExampleClick = (searchTerm: string) => {
    setKeyword(searchTerm);
    setSubmittedKeyword(searchTerm);
  };

  // 헤더 검색창에서 /search?q=... 로 들어오거나 q가 바뀌면 반영한다.
  useEffect(() => {
    setKeyword(queryParam);
    setSubmittedKeyword(queryParam);
  }, [queryParam]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-paper px-5 pt-4 pb-24 md:pb-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-3 flex min-h-[44px] items-center justify-between">
          <h1 className="text-[22px] font-extrabold tracking-[-0.6px] text-foreground md:hidden">검색</h1>
          <button
            onClick={() => setAiMode((prev) => !prev)}
            type="button"
            aria-pressed={aiMode}
            className={`flex h-10 items-center gap-1.5 rounded-chip px-4 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              aiMode
                ? "bg-primary text-primary-foreground active:bg-primary-dark"
                : "bg-accent text-accent-foreground hover:bg-primary/15"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
              <path d="M19 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
            </svg>
            {aiMode ? "AI 검색 ON" : "AI 검색"}
          </button>
        </div>

        <div className="relative" ref={suggestionsRef}>
          <form onSubmit={handleSubmit} className="relative">
            <input
              type="text"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setShowSuggestions(e.target.value.trim().length >= 2);
              }}
              onFocus={() => {
                if (keyword.trim().length >= 2) setShowSuggestions(true);
              }}
              placeholder="자재, 공구, 설비 검색"
              className="h-12 w-full rounded-chip border border-transparent bg-field pl-12 pr-24 text-[15px] text-foreground outline-none placeholder:text-ink-3 focus:border-primary focus:bg-surface"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 rounded-chip bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              검색
            </button>
          </form>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-card border border-line-2 bg-surface card-shadow-hover">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestionClick(s)}
                  className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-sm text-foreground hover:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 shrink-0 text-muted-foreground">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {categories.length > 0 && (
          <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide md:mx-0 md:px-0">
            <button onClick={() => setSelectedCategory(undefined)} className={chipClass(!selectedCategory)}>
              전체
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.slug ?? cat.name)}
                className={chipClass(selectedCategory === (cat.slug ?? cat.name))}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        <div role="group" aria-label="거래 방식" className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide md:mx-0 md:px-0">
          <button type="button" aria-pressed={!tradeMethod} onClick={() => setTradeMethod(undefined)} className={chipClass(!tradeMethod)}>
            전체
          </button>
          {TRADE_METHOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={tradeMethod === opt.value}
              onClick={() => setTradeMethod(opt.value)}
              className={chipClass(tradeMethod === opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div role="group" aria-label="내 주변" className="-mx-5 mt-2 flex items-center gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide md:mx-0 md:px-0">
          <span className="shrink-0 text-sm font-semibold text-muted-foreground">내 주변</span>
          <button type="button" aria-pressed={radiusKm === undefined} onClick={() => handleRadius(undefined)} className={chipClass(radiusKm === undefined)}>
            끄기
          </button>
          {SEARCH_RADIUS_OPTIONS_KM.map((km) => (
            <button
              key={km}
              type="button"
              aria-pressed={radiusKm === km}
              onClick={() => handleRadius(km)}
              className={chipClass(radiusKm === km)}
            >
              {km}km
            </button>
          ))}
        </div>
        {geoMessage && <p className="mt-1 text-xs text-muted-foreground">{geoMessage}</p>}

        {!submittedKeyword && recentSearches.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5 text-foreground"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <h2 className="text-base font-extrabold text-foreground">최근 검색</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((searchTerm) => (
                <div key={searchTerm} className="flex h-9 items-center gap-0.5 rounded-chip border border-line bg-surface pl-3.5 pr-1">
                  <button type="button" onClick={() => handleRecentClick(searchTerm)} className="text-left text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-chip">
                    {searchTerm}
                  </button>
                  <button type="button" aria-label={`${searchTerm} 삭제`} onClick={() => handleDeleteRecent(searchTerm)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-field hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!submittedKeyword && (
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-5 w-5 text-foreground"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
              </svg>
              <h2 className="text-base font-extrabold text-foreground">이렇게 검색해 보세요</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_SEARCHES.map((tag) => (
                <button type="button" key={tag} onClick={() => handleExampleClick(tag)} className="h-9 rounded-chip bg-field px-4 text-sm text-foreground transition-colors hover:bg-line-2 active:bg-line-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="mt-8 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        )}

        {error && <div className="mt-6 text-sm text-destructive">검색 결과를 불러오지 못했습니다.</div>}

        {!isLoading && !error && submittedKeyword && (
          <div className="mt-6 space-y-3">
            {aiMode && (
              <p className="text-xs text-muted-foreground">AI 시맨틱 검색 결과 {aiData?.total ?? 0}건</p>
            )}
            {results.map((item) => (
              <Link
                key={item.id}
                href={`/material/${item.id}`}
                className="block rounded-card border border-line-2 bg-surface p-4 transition-colors hover:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-bold text-foreground">{item.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.location || "위치 정보 없음"}
                      {item.distanceKm !== undefined && <span className="tabular"> · {item.distanceKm.toFixed(1)}km</span>}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-bold text-foreground">
                    <span className="num">{item.price.toLocaleString()}</span>
                    <span className="text-[13px] font-semibold">원</span>
                  </p>
                </div>
              </Link>
            ))}
            {results.length === 0 && (
              <div className="rounded-card bg-field p-6 text-center text-sm text-muted-foreground">
                검색 결과가 없습니다.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// useSearchParams는 Suspense 경계가 필요하다 (Next 14 prerender).
export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageContent />
    </Suspense>
  );
}
