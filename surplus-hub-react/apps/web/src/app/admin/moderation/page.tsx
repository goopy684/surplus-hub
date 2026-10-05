"use client";

import { useState } from "react";
import type { Report } from "@repo/core";
import { useReports, useBannedWords, useUpdateReport, useCreateBannedWord, useDeleteBannedWord } from "@repo/core";

const TARGET_TYPE_LABELS: Record<Report["targetType"], string> = {
  user: "사용자",
  material: "자재",
  post: "게시글",
  comment: "댓글",
};

const STATUS_LABELS: Record<Report["status"], string> = {
  pending: "대기",
  reviewed: "검토 중",
  resolved: "해결됨",
  dismissed: "기각",
};

const STATUS_COLORS: Record<Report["status"], string> = {
  pending: "bg-accent text-accent-foreground",
  reviewed: "bg-card text-muted-foreground border border-border",
  resolved: "bg-olive-bg text-olive-tx border border-olive-bd",
  dismissed: "bg-card text-muted-foreground border border-border",
};

// 신고 사유 코드 (백엔드 reports.VALID_REASONS)
const REASON_LABELS: Record<string, string> = {
  spam: "스팸·광고",
  abuse: "욕설·괴롭힘",
  fraud: "사기·허위 매물",
  inappropriate: "부적절한 콘텐츠",
  other: "기타",
};

type Tab = "pending" | "reviewed" | "resolved" | "dismissed";

const TAB_STATUS_MAP: Record<Tab, string | undefined> = {
  pending: "pending",
  reviewed: "reviewed",
  resolved: "resolved",
  dismissed: "dismissed",
};

export default function AdminModerationPage() {
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [newWord, setNewWord] = useState("");

  const { data: reportsData, isLoading: reportsLoading } = useReports({
    status: TAB_STATUS_MAP[activeTab],
    limit: 100,
  });
  const { data: bannedWordsData, isLoading: wordsLoading } = useBannedWords();
  const updateReport = useUpdateReport();
  const createBannedWord = useCreateBannedWord();
  const deleteBannedWord = useDeleteBannedWord();

  const reports = reportsData?.data ?? [];
  const bannedWords = bannedWordsData ?? [];

  // 탭별 카운트는 별도 쿼리 없이 현재 탭 기준으로만 표시
  const handleUpdateStatus = (id: number, status: Report["status"]) => {
    updateReport.mutate({ id, data: { status } });
  };

  const handleAddWord = () => {
    const trimmed = newWord.trim();
    if (!trimmed) return;
    createBannedWord.mutate(trimmed, { onSuccess: () => setNewWord("") });
  };

  const handleDeleteWord = (id: number) => {
    deleteBannedWord.mutate(id);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "pending", label: "신고 대기" },
    { key: "reviewed", label: "검토 중" },
    { key: "resolved", label: "처리 완료" },
    { key: "dismissed", label: "기각" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">콘텐츠 모더레이션</h1>
        <p className="mt-1 text-sm text-muted-foreground">신고 내용을 검토하고 처리합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {activeTab === tab.key && !reportsLoading && reports.length > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold tabular ${
                tab.key === "pending"
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground"
              }`}>
                {reports.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 신고 목록 */}
      <div className="space-y-3">
        {reportsLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-thumb bg-muted" />
          ))
        ) : reports.length === 0 ? (
          <div className="rounded-thumb border border-border bg-card py-12 text-center text-sm text-muted-foreground">
            해당 항목이 없습니다.
          </div>
        ) : (
          reports.map((report) => (
            <div key={report.id} className="rounded-thumb border border-border bg-card p-4 card-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[report.status]}`}>
                      {STATUS_LABELS[report.status]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {TARGET_TYPE_LABELS[report.targetType] ?? report.targetType} 신고
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-foreground">{REASON_LABELS[report.reason] ?? report.reason}</p>
                  {report.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{report.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>신고자 ID: {report.reporterId}</span>
                    <span>{new Date(report.createdAt).toLocaleDateString("ko-KR")}</span>
                    {report.reviewedBy && <span>처리자: {report.reviewedBy}</span>}
                  </div>
                </div>
                {(report.status === "pending" || report.status === "reviewed") && (
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      onClick={() => handleUpdateStatus(report.id, "resolved")}
                      disabled={updateReport.isPending}
                      className="rounded-btn bg-olive-bg px-3 py-1.5 text-xs font-bold text-olive-tx border border-olive-bd hover:bg-olive-bg/70 disabled:opacity-50"
                    >
                      해결
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(report.id, "dismissed")}
                      disabled={updateReport.isPending}
                      className="rounded-btn border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      기각
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 금칙어 관리 */}
      <div className="rounded-thumb border border-border bg-card p-5 card-shadow">
        <h2 className="text-sm font-semibold text-foreground">금칙어 관리</h2>
        <p className="mt-1 text-xs text-muted-foreground">등록된 금칙어는 콘텐츠 자동 필터링에 사용됩니다.</p>

        {/* 추가 입력 */}
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="금칙어 입력"
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddWord()}
            className="flex-1 rounded-field border border-border bg-field px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={handleAddWord}
            disabled={!newWord.trim() || createBannedWord.isPending}
            className="rounded-btn bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary-dark disabled:opacity-50"
          >
            {createBannedWord.isPending ? "추가 중..." : "추가"}
          </button>
        </div>

        {createBannedWord.isError && (
          <p className="mt-2 text-xs text-destructive">
            {(createBannedWord.error as { response?: { status?: number } })?.response?.status === 409
              ? "이미 등록된 금칙어입니다."
              : "금칙어를 추가하지 못했습니다. 관리자 이상만 추가할 수 있습니다."}
          </p>
        )}

        {/* 금칙어 태그 목록 */}
        <div className="mt-3 flex flex-wrap gap-2">
          {wordsLoading ? (
            <div className="h-6 w-32 animate-pulse rounded-full bg-muted" />
          ) : bannedWords.length === 0 ? (
            <p className="text-xs text-muted-foreground">등록된 금칙어가 없습니다.</p>
          ) : (
            bannedWords.map((bw) => (
              <span
                key={bw.id}
                className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs text-foreground"
              >
                {bw.word}
                <button
                  onClick={() => handleDeleteWord(bw.id)}
                  disabled={deleteBannedWord.isPending}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  aria-label={`${bw.word} 삭제`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3 w-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
