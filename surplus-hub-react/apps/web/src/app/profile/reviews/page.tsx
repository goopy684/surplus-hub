"use client";

import { useRouter } from "next/navigation";
import { useCurrentUser, useUserReviews } from "@repo/core";
import { AuthGate } from "../../../components/AuthGate";

const formatDate = (value: string): string => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
};

const StarRating = ({ rating }: { rating: number }) => {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={star <= rating ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.5}
          className={`h-4 w-4 ${star <= rating ? "text-olive-tx" : "text-border"}`}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
          />
        </svg>
      ))}
    </div>
  );
};

function ReviewsContent() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const userId = currentUser?.id ?? "";

  const { data, isLoading, error } = useUserReviews(userId, { limit: 50 });
  const reviews = data?.data ?? [];

  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button onClick={() => router.back()} className="p-1">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-foreground">받은 리뷰</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : null}

      {error ? (
        <div className="p-8 text-center text-sm text-destructive">리뷰를 불러오지 못했습니다.</div>
      ) : null}

      {!isLoading && !error ? (
        <>
          {reviews.length > 0 ? (
            <div className="card-shadow mx-4 mt-4 mb-3 rounded-thumb border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <span className="tabular text-3xl font-bold text-foreground">{averageRating.toFixed(1)}</span>
                  <StarRating rating={Math.round(averageRating)} />
                  <span className="mt-1 text-xs text-muted-foreground">총 {reviews.length}개</span>
                </div>
                <div className="flex-1 space-y-1">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = reviews.filter((r) => r.rating === star).length;
                    const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                    return (
                      <div key={star} className="flex items-center gap-2">
                        <span className="tabular w-3 text-right text-xs text-muted-foreground">{star}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-olive-tx transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="tabular w-4 text-xs text-muted-foreground">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          <div className="divide-y divide-border">
            {reviews.map((review) => (
              <div key={review.id} className="bg-card px-4 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                      <span className="text-sm font-bold text-foreground">
                        {(review.reviewerName || "?").charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {review.reviewerName || "익명"}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</p>
                    </div>
                  </div>
                  <StarRating rating={review.rating} />
                </div>

                {review.content ? (
                  <p className="mt-3 text-sm leading-relaxed text-foreground">{review.content}</p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground italic">내용 없음</p>
                )}
              </div>
            ))}
          </div>

          {reviews.length === 0 ? (
            <div className="px-4 py-20 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-muted-foreground">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">아직 받은 리뷰가 없습니다</p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <AuthGate title="리뷰는 로그인 후 이용 가능합니다">
      <ReviewsContent />
    </AuthGate>
  );
}
