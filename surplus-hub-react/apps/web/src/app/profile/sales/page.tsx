"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser, useMyTransactions, useConfirmTransaction } from "@repo/core";
import { AuthGate } from "../../../components/AuthGate";

const formatDate = (value: string): string => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
};

const statusLabel = (status: string) => {
  switch (status) {
    case "PENDING": return { text: "대기중", color: "bg-card text-muted-foreground border border-border" };
    case "CONFIRMED": return { text: "확인됨", color: "bg-card text-muted-foreground border border-border" };
    case "COMPLETED": return { text: "완료", color: "bg-olive-bg text-olive-tx border border-olive-bd" };
    case "CANCELLED": return { text: "취소됨", color: "bg-card text-muted-foreground border border-border" };
    default: return { text: status, color: "bg-card text-muted-foreground border border-border" };
  }
};

const ITEMS_PER_PAGE = 20;

function SalesContent() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMyTransactions({ limit: ITEMS_PER_PAGE, offset: (page - 1) * ITEMS_PER_PAGE, role: "seller" });
  const confirmMutation = useConfirmTransaction();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleConfirm = (txId: string) => {
    setPendingId(txId);
    confirmMutation.mutate(txId, {
      onError: () => alert("처리에 실패했습니다. 다시 시도해주세요."),
      onSettled: () => setPendingId(null),
    });
  };

  const sales = data?.data ?? [];
  const hasMore = sales.length === ITEMS_PER_PAGE;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button onClick={() => router.back()} className="p-1" aria-label="뒤로가기">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-foreground">판매 내역</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : sales.length === 0 ? (
        <div className="px-4 py-20 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-8 w-8 text-muted-foreground">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">판매 내역이 없습니다</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 p-4">
            {sales.map((tx) => {
              const st = statusLabel(tx.status);
              return (
                <div key={tx.id} className="rounded-thumb border border-border bg-card px-4 py-3 card-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-base font-semibold text-foreground">{tx.materialTitle || `자재 #${tx.materialId}`}</p>
                      <p className="mt-1 text-xs text-muted-foreground">구매자: {tx.buyerName || "알 수 없음"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular">{formatDate(tx.createdAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <p className="text-lg font-bold text-foreground">
                        <span className="tabular">{tx.price.toLocaleString()}</span>
                        <span className="ml-0.5 text-xs font-medium text-muted-foreground">원</span>
                      </p>
                      <span className={`inline-block rounded-chip px-2 py-0.5 text-xs font-semibold ${st.color}`}>{st.text}</span>
                      {tx.status === "PENDING" && (
                        <button
                          onClick={() => handleConfirm(tx.id)}
                          disabled={pendingId === tx.id}
                          className="mt-1 rounded-btn border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                        >
                          {pendingId === tx.id ? "처리중..." : "확인"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <button onClick={() => setPage((p) => p + 1)} className="w-full py-3 text-sm font-bold text-muted-foreground">
              더 보기
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function SalesPage() {
  return (
    <AuthGate title="판매 내역은 로그인 후 이용 가능합니다">
      <SalesContent />
    </AuthGate>
  );
}
