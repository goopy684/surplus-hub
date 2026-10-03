"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCommunityPosts } from "@repo/core";
import { useMemo, useState } from "react";

const CATEGORIES = ["전체", "QnA", "노하우", "안전", "정보"] as const;

const formatTimeAgo = (value: string): string => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "방금";

  const diffMinutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (diffMinutes < 1) return "방금";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}일 전`;

  return new Date(value).toLocaleDateString();
};

const getCategoryColor = (_category: string) => {
  // 카테고리는 등급이 아니므로 무채색(뉴트럴) 토큰으로 통일한다.
  // 악센트(테라코타)는 화면당 주요 액션 1곳에만 — 일반 배지에 색을 입히지 않는다.
  return {
    bg: "bg-card",
    text: "text-muted-foreground",
    border: "border-border",
  };
};

export default function CommunityPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<(typeof CATEGORIES)[number]>("전체");

  const params = useMemo(
    () => ({
      page: 1,
      limit: 20,
      category: selectedCategory === "전체" ? undefined : selectedCategory,
    }),
    [selectedCategory]
  );

  const { data, isLoading, error } = useCommunityPosts(params);
  const posts = data?.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-4 py-6">
        <h1 className="mb-2 text-xl font-bold text-foreground md:hidden">커뮤니티 게시판</h1>
        <p className="text-sm text-muted-foreground">
          지식을 공유하고, 질문하고, 다른 건설인들과 소통하세요.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto px-4 pb-2 scrollbar-hide">
        <div className="flex gap-2">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? "bg-accent font-bold text-accent-foreground"
                  : "border border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">게시글을 불러오는 중...</div>
      ) : null}

      {error ? (
        <div className="p-8 text-center text-sm text-destructive">게시글을 불러오지 못했습니다.</div>
      ) : null}

      {!isLoading && !error ? (
        <div className="p-4">
          {posts.map((post) => {
            const catColors = getCategoryColor(post.category);

            return (
              <Link
                key={post.id}
                href={`/community/${post.id}`}
                className="block cursor-pointer border-b border-border bg-card p-4 transition-colors active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${catColors.bg} ${catColors.text} ${catColors.border}`}
                  >
                    {post.category}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatTimeAgo(post.createdAt)}</span>
                </div>

                <h3 className="mb-1 text-base font-bold text-foreground">{post.title}</h3>
                <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">{post.content}</p>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{post.authorName}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.8}
                        stroke="currentColor"
                        className="h-4 w-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.247-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z"
                        />
                      </svg>
                      <span>{post.likesCount}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.8}
                        stroke="currentColor"
                        className="h-4 w-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                        />
                      </svg>
                      <span>{post.views}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {posts.length === 0 ? (
            <div className="rounded-thumb border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              조건에 맞는 게시글이 없습니다.
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        aria-label="글쓰기"
        onClick={() => router.push("/community/write")}
        className="fixed bottom-24 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-fab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <path d="M16.5 3.75 20.25 7.5 7.5 20.25 3.75 20.25 3.75 16.5 16.5 3.75Z" />
          <path d="M14.25 6 18 9.75" />
        </svg>
      </button>
    </div>
  );
}
