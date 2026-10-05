"use client";

import { useState } from "react";
import type { StatsDataPoint } from "@repo/core";
import {
  useDashboardSummary,
  useAdminUserStats,
  useAdminMaterialStats,
  useAdminTransactionStats,
  useAdminActiveUserStats,
  useExportCsv,
} from "@repo/core";

type Period = "day" | "week" | "month";
type ExportType = "users" | "materials" | "transactions";

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "일" },
  { key: "week", label: "주" },
  { key: "month", label: "월" },
];

const EXPORTS: { type: ExportType; label: string }[] = [
  { type: "users", label: "사용자" },
  { type: "materials", label: "자재" },
  { type: "transactions", label: "거래" },
];

// 백엔드 date 포맷을 신뢰하지 않는다 — Date 파싱 없이 라벨만 뽑는다.
function axisLabel(date: string): string {
  const parts = String(date).split("-");
  return parts.length > 1 ? parts.slice(1).join("/") : String(date);
}

interface KpiCardProps {
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
  loading?: boolean;
}

function KpiCard({ label, value, sub, accent, loading }: KpiCardProps) {
  return (
    <div
      className={`rounded-thumb border p-5 card-shadow ${
        accent ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"
      }`}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <p className={`mt-1 text-2xl font-bold tabular ${accent ? "text-destructive" : "text-foreground"}`}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      )}
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

interface TrendChartProps {
  title: string;
  data?: StatsDataPoint[];
  loading: boolean;
  error: boolean;
}

function TrendChart({ title, data, loading, error }: TrendChartProps) {
  const points = data ?? [];
  const max = Math.max(0, ...points.map((d) => d.count));
  // 포인트가 많으면 라벨이 뭉개진다 — 값은 title 툴팁으로만 노출.
  const dense = points.length > 12;

  return (
    <div className="rounded-thumb border border-border bg-card p-5 card-shadow">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {loading ? (
        <div className="mt-4 h-40 animate-pulse rounded bg-muted" />
      ) : points.length === 0 ? (
        <div className="mt-4 flex h-40 items-center justify-center rounded-thumb bg-muted">
          <p className="text-xs text-muted-foreground">
            {error ? "추이 데이터를 불러올 수 없습니다." : "표시할 데이터가 없습니다."}
          </p>
        </div>
      ) : (
        <div className="mt-4 flex items-end gap-1">
          {points.map((d) => (
            <div
              key={d.date}
              title={`${axisLabel(d.date)} · ${d.count.toLocaleString()}건`}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              {!dense && (
                <span className="text-[10px] tabular text-muted-foreground">{d.count.toLocaleString()}</span>
              )}
              <div className="flex h-32 w-full items-end">
                <div
                  data-testid="trend-bar"
                  className="min-h-[2px] w-full rounded-chip bg-primary"
                  style={{ height: `${max === 0 ? 0 : (d.count / max) * 100}%` }}
                />
              </div>
              {!dense && (
                <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                  {axisLabel(d.date)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { data: summary, isLoading, isError } = useDashboardSummary();
  const [period, setPeriod] = useState<Period>("week");

  const userStats = useAdminUserStats(period);
  const materialStats = useAdminMaterialStats(period);
  const transactionStats = useAdminTransactionStats(period);
  const activeUserStats = useAdminActiveUserStats(period);
  const exportCsv = useExportCsv();

  const pending = summary?.pendingReports ?? 0;

  const handleExport = (type: ExportType) => {
    exportCsv.mutate(type, {
      onSuccess: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">대시보드</h1>
        <p className="mt-1 text-sm text-muted-foreground">서비스 현황을 한눈에 확인하세요.</p>
      </div>

      {isError && (
        <div className="rounded-thumb border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          데이터를 불러오는 데 실패했습니다. 잠시 후 다시 시도해주세요.
        </div>
      )}

      {/* KPI 카드 그리드 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="총 사용자" value={summary?.totalUsers ?? 0} sub="전체 가입자 수" loading={isLoading} />
        <KpiCard label="DAU" value={summary?.dau ?? 0} sub="오늘 접속" loading={isLoading} />
        <KpiCard label="WAU" value={summary?.wau ?? 0} sub="최근 7일 접속" loading={isLoading} />
        <KpiCard label="MAU" value={summary?.mau ?? 0} sub="최근 30일 접속" loading={isLoading} />
        <KpiCard label="신규 가입 (오늘)" value={summary?.newUsersToday ?? 0} loading={isLoading} />
        <KpiCard
          label="등록 자재"
          value={summary?.totalMaterials ?? 0}
          sub={summary ? `활성: ${summary.activeMaterials.toLocaleString()}개` : undefined}
          loading={isLoading}
        />
        <KpiCard label="총 거래" value={summary?.totalTransactions ?? 0} loading={isLoading} />
        <KpiCard
          label="거래액"
          value={`₩${(summary?.completedTransactionAmount ?? 0).toLocaleString()}`}
          sub="완료 거래 기준"
          loading={isLoading}
        />
        <KpiCard
          label="미처리 신고"
          value={pending}
          accent={pending > 0}
          sub={pending > 0 ? "즉시 검토 필요" : undefined}
          loading={isLoading}
        />
      </div>

      {/* 추이 차트 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">추이</h2>
        <div className="flex gap-1 rounded-btn border border-border bg-card p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              aria-pressed={period === p.key}
              className={`rounded-chip px-3 py-1.5 text-xs font-semibold transition-colors ${
                period === p.key
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TrendChart
          title="사용자 증가 추이"
          data={userStats.data?.data}
          loading={userStats.isLoading || userStats.isFetching}
          error={userStats.isError}
        />
        <TrendChart
          title="자재 등록 현황"
          data={materialStats.data?.data}
          loading={materialStats.isLoading || materialStats.isFetching}
          error={materialStats.isError}
        />
        <TrendChart
          title="거래 추이"
          data={transactionStats.data?.data}
          loading={transactionStats.isLoading || transactionStats.isFetching}
          error={transactionStats.isError}
        />
        <TrendChart
          title="활성 사용자"
          data={activeUserStats.data?.data}
          loading={activeUserStats.isLoading || activeUserStats.isFetching}
          error={activeUserStats.isError}
        />
      </div>

      {/* CSV 내보내기 */}
      <div className="rounded-thumb border border-border bg-card p-5 card-shadow">
        <h2 className="text-sm font-semibold text-foreground">데이터 내보내기</h2>
        <p className="mt-1 text-xs text-muted-foreground">현재 데이터를 CSV 파일로 내려받습니다.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {EXPORTS.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => handleExport(type)}
              disabled={exportCsv.isPending}
              className="rounded-btn border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportCsv.isPending && exportCsv.variables === type
                ? `${label} 내려받는 중...`
                : `${label} CSV`}
            </button>
          ))}
        </div>
        {exportCsv.isError && (
          <p className="mt-3 rounded-field border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            내려받기에 실패했습니다. 권한이 없거나 서버 오류일 수 있습니다.
            {exportCsv.error?.message ? ` (${exportCsv.error.message})` : ""}
          </p>
        )}
      </div>

      {/* 신고 대기 바로가기 */}
      {!isLoading && pending > 0 && (
        <div className="rounded-thumb border border-border bg-card p-5 card-shadow">
          <p className="text-sm font-semibold text-foreground">미처리 신고 대기</p>
          <div className="mt-3 flex items-center justify-between rounded-thumb bg-muted px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                <span className="tabular">{pending}</span>건의 신고가 처리를 기다리고 있습니다.
              </p>
              <p className="text-xs text-muted-foreground">즉시 검토가 필요합니다.</p>
            </div>
            <a
              href="/admin/moderation"
              className="rounded-btn bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary-dark"
            >
              검토하기
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
