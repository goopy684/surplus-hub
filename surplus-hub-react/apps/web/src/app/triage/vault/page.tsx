"use client";

import { TRIAGE_PATH_LABELS, useTriageVault } from "@repo/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGate } from "../../../components/AuthGate";

function TriageVaultContent() {
  const router = useRouter();
  const { data, isLoading, error } = useTriageVault(true);
  const items = data ?? [];

  return (
    <div className="min-h-screen bg-canvas pb-28">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line-2 bg-surface px-4 py-3">
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={() => router.back()}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h1 className="text-[17px] font-extrabold tracking-[-0.4px] text-foreground">내 창고 보관함</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20" aria-busy="true">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : error ? (
        <p className="px-4 py-20 text-center text-sm text-destructive">보관함을 불러오지 못했습니다.</p>
      ) : items.length === 0 ? (
        <div className="px-5 py-20 text-center">
          <p className="text-base font-bold text-foreground">보관함이 비어 있어요</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            지금 팔지 않을 자재도 진단해 담아두면 수요가 생길 때 알려드립니다.
          </p>
          <Link
            href="/triage"
            className="mt-5 inline-flex min-h-[48px] items-center rounded-btn bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-dark active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            3초 가치진단
          </Link>
        </div>
      ) : (
        <ul className="mx-auto max-w-lg space-y-2.5 px-4 py-4">
          {items.map((item) => (
            <li key={item.id ?? item.shareToken}>
              <Link
                href={`/triage/${item.id}`}
                className="flex gap-3 rounded-card bg-surface p-3.5 transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.imageUrls[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 업로드된 원본 URL을 그대로 보여준다
                  <img src={item.imageUrls[0]} alt={item.title} className="h-16 w-16 flex-shrink-0 rounded-thumb object-cover" />
                ) : (
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-thumb bg-field text-ink-3">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="h-6 w-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3ZM3 7.5 12 12m0 0 9-4.5M12 12v9" />
                    </svg>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{item.title}</p>
                    {item.status === "LISTED_MATERIAL" ? (
                      <span className="flex-shrink-0 rounded-chip border border-line bg-surface px-2 py-0.5 text-[11.5px] font-bold text-muted-foreground">
                        등록 완료
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Path {item.dispositionPath} · {item.pathLabel || TRIAGE_PATH_LABELS[item.dispositionPath]}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px]">
                    <span className="text-foreground">
                      유동성 <span className="tabular font-bold">{item.liquidityScore}</span>점
                    </span>
                    {item.scoreDelta !== 0 ? (
                      <span className={`tabular font-bold ${item.scoreDelta > 0 ? "text-olive-tx" : "text-destructive"}`}>
                        {item.scoreDelta > 0 ? "+" : "−"}
                        {Math.abs(item.scoreDelta)}점
                      </span>
                    ) : null}
                    <span className="font-semibold text-olive-tx">
                      실질 +<span className="tabular">{Math.abs(item.comparison.netBenefit).toLocaleString()}</span>원
                    </span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TriageVaultPage() {
  return (
    <AuthGate title="보관함은 로그인 후 이용 가능합니다">
      <TriageVaultContent />
    </AuthGate>
  );
}
