"use client";

import { useMaterials, useAiSearch, useSearchSuggestions, useCategories } from "@repo/core";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState, useRef, useEffect } from "react";

function SearchPageContent() {
  const queryParam = useSearchParams().get("q")?.trim() ?? "";
  const [keyword, setKeyword] = useState(queryParam);
  const [submittedKeyword, setSubmittedKeyword] = useState(queryParam);
  const [aiMode, setAiMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([
    "스테인리스 파이프",
    "안전화",
    "알루미늄",
  ]);

  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { data: categoriesData } = useCategories();
  const categories = categoriesData ?? [];

  const { data: suggestionsData } = useSearchSuggestions(keyword);
  const suggestions = suggestionsData?.suggestions ?? [];

  const { data: materialData, isLoading: materialLoading, error: materialError } = useMaterials({
    keyword: !aiMode && submittedKeyword ? submittedKeyword : undefined,
    category: !aiMode && selectedCategory ? selectedCategory : undefined,
    page: 1,
    limit: 20,
  });

  const { data: aiData, isLoading: aiLoading, error: aiError } = useAiSearch(
    { q: submittedKeyword, category: selectedCategory, page: 1, limit: 20 },
    aiMode && submittedKeyword.length > 0
  );

  const isLoading = aiMode ? aiLoading : materialLoading;
  const error = aiMode ? aiError : materialError;
  const results = aiMode
    ? (aiData?.data ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        price: item.price,
        location: item.location,
      }))
    : (materialData?.data ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        price: item.price,
        location: item.location,
      }));

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

  const handlePopularClick = (searchTerm: string) => {
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

  const popularSearches = [
    "스테인리스 파이프",
    "안전화",
    "알루미늄 판재",
    "전선",
    "용접기",
    "컴프레서",
    "리프트",
    "보호구",
  ];

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground md:hidden">검색</h1>
          <button
            onClick={() => setAiMode((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-bold transition-colors ${
              aiMode
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-foreground hover:bg-accent"
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
              className="w-full rounded-field border border-border bg-field px-12 py-3 text-base outline-none focus:border-primary"
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
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-btn bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              검색
            </button>
          </form>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-field border border-border bg-card card-shadow">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestionClick(s)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-foreground hover:bg-accent first:rounded-t-field last:rounded-b-field"
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
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory(undefined)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                !selectedCategory
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              전체
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.slug ?? cat.name)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  selectedCategory === (cat.slug ?? cat.name)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

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
              <h2 className="text-sm font-bold text-foreground">최근 검색</h2>
            </div>
            <div className="space-y-2">
              {recentSearches.map((searchTerm) => (
                <div key={searchTerm} className="flex items-center justify-between rounded-thumb border border-border bg-card px-4 py-3">
                  <button onClick={() => handleRecentClick(searchTerm)} className="flex-1 text-left text-sm text-foreground">
                    {searchTerm}
                  </button>
                  <button onClick={() => handleDeleteRecent(searchTerm)} className="text-muted-foreground hover:text-foreground">
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
              <h2 className="text-sm font-bold text-foreground">인기 검색어</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {popularSearches.map((tag) => (
                <button key={tag} onClick={() => handlePopularClick(tag)} className="rounded-full bg-muted px-3.5 py-1.5 text-sm text-foreground hover:bg-accent">
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
                className="block rounded-thumb border border-border bg-card p-4 card-shadow card-shadow-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-foreground">{item.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{item.location || "위치 정보 없음"}</p>
                  </div>
                  <p className="shrink-0 text-lg font-bold text-foreground">
                    <span className="tabular">{item.price.toLocaleString()}</span>
                    <span className="ml-0.5 text-xs font-medium text-muted-foreground">원</span>
                  </p>
                </div>
              </Link>
            ))}
            {results.length === 0 && (
              <div className="rounded-thumb border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
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
