"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function HeaderSearch() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = keyword.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  };

  return (
    <form onSubmit={handleSubmit} role="search" className="hidden md:flex flex-1 max-w-md mx-8">
      <div className="relative w-full">
        <label htmlFor="header-search" className="sr-only">
          자재, 공구, 설비 검색
        </label>
        <input
          id="header-search"
          type="search"
          suppressHydrationWarning
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="자재, 공구, 설비 검색"
          className="w-full rounded-field bg-field border border-border px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      </div>
    </form>
  );
}
