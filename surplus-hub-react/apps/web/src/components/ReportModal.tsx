"use client";

import { useState } from "react";
import { createReport } from "@repo/core";

const REPORT_REASONS = [
  { value: "fraud", label: "허위 매물 / 사기 의심" },
  { value: "spam", label: "스팸 / 상업적 홍보" },
  { value: "inappropriate", label: "부적절한 게시물 / 카테고리 불일치" },
  { value: "abuse", label: "욕설 / 비방 / 불쾌한 표현" },
  { value: "other", label: "기타 사유" },
] as const;

type ReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  targetType: "user" | "material" | "post" | "comment";
  targetId: number;
  targetLabel?: string;
};

export function ReportModal({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetLabel = "콘텐츠",
}: ReportModalProps) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsSubmitting(false);
    setErrorMessage(null);
    setIsSuccess(false);
    setDescription("");
    setReason(REPORT_REASONS[0].value);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await createReport({
        targetType,
        targetId,
        reason,
        description: description.trim() || undefined,
      });
      setIsSuccess(true);
    } catch {
      setErrorMessage("신고 접수에 실패했습니다. 로그인 상태를 확인하거나 잠시 후 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="report-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4"
    >
      <div className="w-full max-w-md rounded-card bg-surface p-5 shadow-float">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="report-modal-title" className="text-lg font-extrabold text-foreground">
            {targetLabel} 신고하기
          </h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-field"
          >
            ✕
          </button>
        </div>

        {isSuccess ? (
          <div className="space-y-4 py-2">
            <p className="text-sm leading-relaxed text-foreground">
              신고가 정상적으로 접수되었습니다. 운영팀에서 확인 후 신속히 조치하겠습니다.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[44px] w-full rounded-field bg-primary py-2.5 text-sm font-bold text-primary-foreground"
            >
              확인
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">신고 사유 선택</p>
              {REPORT_REASONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-field border px-3 py-2.5 text-sm transition-colors ${
                    reason === option.value
                      ? "border-primary bg-accent font-semibold text-primary"
                      : "border-line-2 bg-surface text-foreground hover:bg-field"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>

            <div>
              <label
                htmlFor="report-description"
                className="mb-1.5 block text-xs font-semibold text-muted-foreground"
              >
                상세 내용 (선택)
              </label>
              <textarea
                id="report-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="구체적인 신고 사유를 입력해 주세요."
                className="w-full rounded-field border border-line bg-field p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>

            {errorMessage ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="min-h-[44px] flex-1 rounded-field border border-line bg-surface py-2.5 text-sm font-semibold text-foreground hover:bg-field"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-[44px] flex-1 rounded-field bg-destructive py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {isSubmitting ? "접수 중..." : "신고 접수"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
