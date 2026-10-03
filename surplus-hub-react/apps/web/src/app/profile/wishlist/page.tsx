"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMyWishlist } from "@repo/core";
import { AuthGate } from "../../../components/AuthGate";

function WishlistContent() {
  const router = useRouter();
  const { data, isLoading } = useMyWishlist({ limit: 50 });
  const items = data?.data ?? [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button type="button" aria-label="뒤로 가기" onClick={() => router.back()} className="p-1">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-foreground">관심 목록</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-20 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-muted-foreground">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">관심 목록이 비어있습니다</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 rounded-btn bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
          >
            자재 둘러보기
          </button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/material/${item.id}`}
              className="flex cursor-pointer gap-3 bg-card px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="h-16 w-16 flex-shrink-0 rounded-thumb object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-thumb bg-muted">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6 text-muted-foreground">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V5.25a1.5 1.5 0 0 0-1.5-1.5H3.75a1.5 1.5 0 0 0-1.5 1.5v14.25a1.5 1.5 0 0 0 0 1.5Z" />
                  </svg>
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-base font-semibold text-foreground">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.location || item.category}</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  <span className="tabular">{item.price.toLocaleString()}</span>
                  <span className="ml-0.5 text-sm font-medium text-muted-foreground">원</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WishlistPage() {
  return (
    <AuthGate title="관심 목록은 로그인 후 이용 가능합니다">
      <WishlistContent />
    </AuthGate>
  );
}
