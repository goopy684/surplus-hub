"use client";

import {
  TRIAGE_PATH_LABELS,
  TriagePath,
  useConvertTriage,
  useSaveTriageToVault,
  useTriage,
} from "@repo/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthGate } from "../../../components/AuthGate";
import { TriageReport } from "../../../components/TriageReport";

const PATH_OPTIONS: TriagePath[] = ["A", "B", "C"];

const CONVERT_LABELS: Record<TriagePath, string> = {
  A: "메인 마켓에 원클릭 등록",
  B: "매입 호가 트랙에 올리기",
  C: "중량 일괄 처분 트랙에 올리기",
};

const SECONDARY_BUTTON =
  "flex min-h-[48px] w-full items-center justify-center rounded-btn border border-line bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-field active:bg-field disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PRIMARY_BUTTON =
  "flex min-h-[56px] w-full items-center justify-center rounded-btn bg-primary px-4 text-base font-bold text-primary-foreground transition-colors hover:bg-primary-dark active:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const FIELD_CLASS =
  "w-full min-h-[52px] rounded-field border-[1.5px] border-line bg-surface px-3.5 py-3 text-[15.5px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const errorStatus = (err: unknown) => (err as { response?: { status?: number } })?.response?.status;

function TriageResultContent({ id }: { id: string }) {
  const router = useRouter();
  const { data: diagnosis, isLoading, error, refetch } = useTriage(id);
  const { mutateAsync: convert, isPending: isConverting } = useConvertTriage();
  const { mutateAsync: saveToVault, isPending: isSaving } = useSaveTriageToVault();
  // null = AI 추천 경로 / 사용자가 손대지 않은 추천 가격을 그대로 쓴다
  const [pathOverride, setPathOverride] = useState<TriagePath | null>(null);
  const [priceInput, setPriceInput] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [noDemandTerms, setNoDemandTerms] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const header = (
    <div className="sticky top-0 z-50 flex h-14 items-center gap-1 bg-surface px-2">
      <button
        type="button"
        aria-label="뒤로가기"
        onClick={() => router.back()}
        className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <h1 className="text-lg font-extrabold tracking-[-0.4px] text-foreground">가치진단 결과</h1>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-paper">
        {header}
        <div className="mx-auto max-w-lg space-y-4 px-5 py-4" aria-busy="true">
          <div className="h-7 w-2/3 animate-pulse rounded bg-field" />
          <div className="h-36 animate-pulse rounded-card bg-field" />
          <div className="h-24 animate-pulse rounded-card bg-field" />
          <div className="h-28 animate-pulse rounded-card bg-field" />
        </div>
      </div>
    );
  }

  if (error || !diagnosis) {
    return (
      <div className="min-h-screen bg-paper">
        {header}
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-5 py-20 text-center">
          <p className="text-base font-medium text-foreground">
            {errorStatus(error) === 404 ? "진단 결과를 찾을 수 없습니다" : "진단 결과를 불러오지 못했습니다"}
          </p>
          <Link
            href="/triage"
            className="inline-flex min-h-[48px] items-center rounded-btn border border-line bg-surface px-6 text-sm font-semibold text-foreground transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            새로 진단하기
          </Link>
        </div>
      </div>
    );
  }

  const path = pathOverride ?? diagnosis.dispositionPath;
  const suggestedPrice = path === "A" ? diagnosis.comparison.directSale : diagnosis.comparison.scrap;
  const price = priceInput ?? (suggestedPrice > 0 ? String(suggestedPrice) : "");
  const isListed = diagnosis.status === "LISTED_MATERIAL";
  const isSaved = diagnosis.status === "VAULT_SAVED";

  const handleConvert = async () => {
    setActionError(null);
    setNoDemandTerms(false);
    try {
      const result = await convert({
        id,
        input: { path, ...(price ? { price: Number(price) } : {}) },
      });
      router.push(`/material/${result.materialId}`);
    } catch (err) {
      if (errorStatus(err) === 409) {
        // 이미 전환된 진단 — 최신 상태를 받아 '이미 등록' 화면으로 바꾼다
        await refetch();
        return;
      }
      setActionError("등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const handleSave = async () => {
    setActionError(null);
    setNoDemandTerms(false);
    try {
      await saveToVault(id);
    } catch (err) {
      // 소재도 규격도 없으면 검색과 맞춰 볼 단서가 없어 서버가 저장을 거절한다
      const detail = (err as { response?: { data?: { detail?: { code?: string } } } })?.response?.data?.detail;
      if (errorStatus(err) === 422 && detail?.code === "NO_DEMAND_TERMS") {
        setNoDemandTerms(true);
        return;
      }
      setActionError("보관함 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/triage/report/${diagnosis.shareToken}`;
    setShareMessage(null);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${diagnosis.title} AI 감정 리포트`, url });
      } catch {
        // 사용자가 공유 시트를 닫은 경우 — 안내 없음
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("링크를 복사했습니다");
    } catch {
      setShareMessage("링크를 복사하지 못했습니다");
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      {header}
      <div className="mx-auto max-w-lg space-y-6 px-5 py-4 pb-28">
        <TriageReport diagnosis={diagnosis} />

        <section className="space-y-3 border-t border-line-2 pt-5">
          {isListed ? (
            <div className="rounded-card bg-field p-4 text-center">
              <p className="text-[15px] font-bold text-foreground">이미 매물로 등록되었습니다</p>
              {diagnosis.materialId ? (
                <Link href={`/material/${diagnosis.materialId}`} className={`${PRIMARY_BUTTON} mt-3`}>
                  매물 보기
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="triage-path" className="mb-2 block text-sm font-bold text-foreground">
                  처분 경로
                </label>
                <select
                  id="triage-path"
                  value={path}
                  onChange={(e) => setPathOverride(e.target.value as TriagePath)}
                  aria-describedby="triage-path-help"
                  className={`${FIELD_CLASS} cursor-pointer focus-visible:ring-ring`}
                >
                  {PATH_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      Path {option} · {TRIAGE_PATH_LABELS[option]}
                    </option>
                  ))}
                </select>
                <p id="triage-path-help" className="mt-1.5 text-xs text-muted-foreground">
                  AI 추천: Path {diagnosis.dispositionPath}. 직접 바꿀 수 있습니다.
                </p>
              </div>

              <div>
                <label htmlFor="triage-price" className="mb-2 block text-sm font-bold text-foreground">
                  희망 가격
                </label>
                <div className="relative">
                  <input
                    id="triage-price"
                    type="text"
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPriceInput(e.target.value.replace(/\D/g, ""))}
                    className={`${FIELD_CLASS} num pr-12 text-lg font-bold`}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">원</span>
                </div>
              </div>

              <button type="button" onClick={handleConvert} disabled={isConverting} className={PRIMARY_BUTTON}>
                {isConverting ? "등록 중…" : CONVERT_LABELS[path]}
              </button>
              {path !== "A" ? (
                <p className="text-xs leading-[1.55] text-muted-foreground">
                  메인 마켓에는 노출되지 않고 전문 매입처 트랙에만 올라갑니다. 호가 제안은 채팅으로 받습니다.
                </p>
              ) : null}

              <button type="button" onClick={handleSave} disabled={isSaved || isSaving} className={SECONDARY_BUTTON}>
                {isSaved ? "보관함에 저장됨" : "보관함에 담아두고 수요 생기면 알림 받기"}
              </button>
              {isSaved ? (
                <p className="text-xs text-muted-foreground">주변 수요가 늘어 점수가 오르면 알림을 보내드립니다.</p>
              ) : null}
            </>
          )}

          {actionError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {actionError}
            </p>
          ) : null}
          {noDemandTerms ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              소재나 규격이 있어야 수요 알림을 보낼 수 있습니다. 소재를 고르거나 규격을 적어 다시 진단해 주세요.{" "}
              <Link
                href="/triage"
                className="inline-flex min-h-[44px] items-center font-bold text-foreground underline underline-offset-2 transition-colors hover:text-ink-2 active:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                다시 진단하기
              </Link>
            </p>
          ) : null}

          {diagnosis.shareToken ? (
            <>
              <button type="button" onClick={handleShare} className={SECONDARY_BUTTON}>
                결재·공유용 리포트 링크 복사
              </button>
              {shareMessage ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {shareMessage}
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default function TriageResultPage({ params }: { params: { id: string } }) {
  return (
    <AuthGate title="가치진단은 로그인 후 이용 가능합니다">
      <TriageResultContent id={params.id} />
    </AuthGate>
  );
}
