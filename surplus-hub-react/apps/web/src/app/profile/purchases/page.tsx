"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser, useMyTransactions, useCompleteTransaction, useCreateReview } from "@repo/core";
import { AuthGate } from "../../../components/AuthGate";

const formatDate = (value: string): string => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
};

const statusLabel = (status: string) => {
  switch (status) {
    case "PENDING": return { text: "대기중", color: "bg-surface text-muted-foreground border border-line" };
    case "CONFIRMED": return { text: "확인됨", color: "bg-surface text-muted-foreground border border-line" };
    case "COMPLETED": return { text: "완료", color: "bg-olive-bg text-olive-tx border border-olive-bd" };
    case "CANCELLED": return { text: "취소됨", color: "bg-surface text-muted-foreground border border-line" };
    default: return { text: status, color: "bg-surface text-muted-foreground border border-line" };
  }
};

function PurchasesContent() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const { data, isLoading } = useMyTransactions({ limit: 50 });
  const completeMutation = useCompleteTransaction();
  const reviewMutation = useCreateReview();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ txId: string; sellerId: string; materialId: string } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewContent, setReviewContent] = useState("");
  const [reviewedTxIds, setReviewedTxIds] = useState<Set<string>>(new Set());

  const handleComplete = (txId: string) => {
    setPendingId(txId);
    completeMutation.mutate(txId, {
      onError: () => alert("처리에 실패했습니다. 다시 시도해주세요."),
      onSettled: () => setPendingId(null),
    });
  };

  const purchases = (data?.data ?? []).filter(
    (tx) => currentUser && tx.buyerId === currentUser.id
  );

  return (
    <div className="min-h-screen bg-paper pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line-2 bg-surface px-4 py-3">
        <button type="button" aria-label="뒤로 가기" onClick={() => router.back()} className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-[17px] font-extrabold tracking-[-0.4px] text-foreground">구매 내역</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : purchases.length === 0 ? (
        <div className="px-4 py-20 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-8 w-8 text-muted-foreground">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">구매 내역이 없습니다</p>
        </div>
      ) : (
        <div className="divide-y divide-line-2">
          {purchases.map((tx) => {
            const st = statusLabel(tx.status);
            const isReviewed = Boolean(tx.hasReviewed) || reviewedTxIds.has(tx.id);
            return (
              <div key={tx.id} className="bg-surface px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-base font-semibold text-foreground">{tx.materialTitle || `자재 #${tx.materialId}`}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">판매자: {tx.sellerName || "알 수 없음"}</p>
                    {tx.quantity !== undefined && <p className="mt-0.5 text-xs tabular text-muted-foreground">수량 {tx.quantity}</p>}
                    <p className="mt-0.5 text-xs tabular text-muted-foreground">{formatDate(tx.createdAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <p className="text-lg font-bold text-foreground">
                      <span className="num">{tx.price.toLocaleString()}</span>
                      <span className="ml-0.5 text-sm font-medium text-muted-foreground">원</span>
                    </p>
                    <span className={`inline-block rounded-chip px-2 py-0.5 text-xs font-semibold ${st.color}`}>{st.text}</span>
                    {tx.status === "CONFIRMED" && (
                      <button
                        onClick={() => handleComplete(tx.id)}
                        disabled={pendingId === tx.id}
                        className="mt-1 rounded-btn bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary-dark disabled:opacity-50 min-h-[48px] active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {pendingId === tx.id ? "처리중..." : "완료"}
                      </button>
                    )}
                    {tx.status === "COMPLETED" && !isReviewed && (
                      <button
                        onClick={() => {
                          setReviewTarget({ txId: tx.id, sellerId: tx.sellerId, materialId: tx.materialId });
                          setReviewRating(5);
                          setReviewContent("");
                        }}
                        className="mt-1 rounded-btn border border-line bg-surface px-3 py-1.5 text-xs font-bold text-foreground hover:bg-field"
                      >
                        리뷰 작성
                      </button>
                    )}
                    {tx.status === "COMPLETED" && isReviewed && (
                      <span className="mt-1 inline-block rounded-chip bg-olive-bg px-3 py-1 text-xs font-semibold text-olive-tx border border-olive-bd">
                        리뷰 완료
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-card border border-line-2 bg-surface p-6">
            <h3 className="mb-4 text-base font-bold text-foreground">리뷰 작성</h3>
            {/* Star Rating */}
            <div className="mb-4 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setReviewRating(star)}
                  className="p-0.5"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill={star <= reviewRating ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth={1.8}
                    className={`h-7 w-7 ${star <= reviewRating ? "text-primary" : "text-muted-foreground"}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                </button>
              ))}
              <span className="ml-2 text-sm tabular text-muted-foreground">{reviewRating}점</span>
            </div>
            {/* Content */}
            <textarea
              value={reviewContent}
              onChange={(e) => setReviewContent(e.target.value)}
              placeholder="거래는 어떠셨나요? (선택)"
              className="mb-4 w-full resize-none rounded-field border-[1.5px] border-line bg-surface p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              rows={3}
            />
            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setReviewTarget(null)}
                className="flex-1 rounded-btn border border-line bg-surface px-4 py-3 text-sm font-bold text-foreground hover:bg-field"
              >
                취소
              </button>
              <button
                onClick={() => {
                  const sellerId = Number(reviewTarget.sellerId);
                  const materialId = Number(reviewTarget.materialId);
                  if (!Number.isFinite(sellerId) || sellerId <= 0) {
                    alert("판매자 정보가 올바르지 않습니다.");
                    return;
                  }
                  reviewMutation.mutate(
                    {
                      targetUserId: sellerId,
                      materialId: materialId || undefined,
                      rating: reviewRating,
                      content: reviewContent || undefined,
                    },
                    {
                      onSuccess: () => {
                        setReviewedTxIds((prev) => new Set(prev).add(reviewTarget.txId));
                        setReviewTarget(null);
                      },
                      onError: () => alert("리뷰 작성에 실패했습니다. 다시 시도해주세요."),
                    }
                  );
                }}
                disabled={reviewMutation.isPending}
                className="flex-1 rounded-btn bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary-dark disabled:opacity-50 min-h-[48px] active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {reviewMutation.isPending ? "제출 중..." : "제출"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PurchasesPage() {
  return (
    <AuthGate title="구매 내역은 로그인 후 이용 가능합니다">
      <PurchasesContent />
    </AuthGate>
  );
}
