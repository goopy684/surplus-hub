"use client";

import { useState } from "react";
import { useAdminUsers, useAuditLogs, useUpdateUserRole, type AdminRole } from "@repo/core";
import { useAuth } from "../../../contexts/AuthContext";

const ROLES = ["SUPER_ADMIN", "ADMIN", "MODERATOR"] as const;
const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "슈퍼관리자",
  ADMIN: "관리자",
  MODERATOR: "모더레이터",
};
const AUDIT_PER_PAGE = 10;

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [auditSkip, setAuditSkip] = useState(0);
  const { data: auditData, isLoading: auditLoading } = useAuditLogs({
    skip: auditSkip,
    limit: AUDIT_PER_PAGE,
  });
  const { data: adminData, isLoading: adminsLoading } = useAdminUsers({ limit: 50 });
  const updateRole = useUpdateUserRole();

  const adminName = user?.name ?? "관리자";
  const adminEmail = user?.email ?? "";
  const adminRoleLabel = user?.adminRole
    ? ROLE_LABELS[user.adminRole as AdminRole] ?? user.adminRole
    : user?.isSuperuser ? "슈퍼관리자" : user?.role ?? "관리자";

  // 서버(get_current_admin_user)와 동일한 판정 — 슈퍼유저는 admin_role 없이도 통과한다.
  const canManageRoles = user?.adminRole === "SUPER_ADMIN" || user?.isSuperuser === true;
  const admins = adminData?.data ?? [];

  const auditTotal = auditData?.total ?? 0;
  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / AUDIT_PER_PAGE));
  const auditPage = Math.floor(auditSkip / AUDIT_PER_PAGE) + 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">설정</h1>
        <p className="mt-1 text-sm text-muted-foreground">관리자 정보 및 시스템 설정을 확인합니다.</p>
      </div>

      {/* 관리자 정보 */}
      <section className="rounded-thumb border border-border bg-card p-5 card-shadow">
        <h2 className="text-sm font-semibold text-foreground">내 관리자 정보</h2>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground text-xl font-bold">
            {adminName[0] ?? "A"}
          </div>
          <div>
            <p className="font-semibold text-foreground">{adminName}</p>
            <p className="text-sm text-muted-foreground">{adminEmail || "이메일 없음"}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-field bg-muted p-3">
            <p className="text-xs text-muted-foreground">역할</p>
            <p className="mt-0.5 font-medium text-foreground">{adminRoleLabel}</p>
          </div>
          <div className="rounded-field bg-muted p-3">
            <p className="text-xs text-muted-foreground">사용자 ID</p>
            <p className="mt-0.5 font-medium text-foreground">{user?.id ?? "-"}</p>
          </div>
        </div>
      </section>

      {/* 시스템 설정 */}
      <section className="rounded-thumb border border-border bg-card p-5 card-shadow">
        <h2 className="text-sm font-semibold text-foreground">시스템 설정</h2>
        <p className="mt-1 text-xs text-muted-foreground">Phase 1.2에서 구현 예정입니다.</p>
        <div className="mt-4 space-y-3">
          {[
            { label: "이메일 알림", desc: "신고 접수 시 이메일 수신" },
            { label: "자동 필터링", desc: "금칙어 자동 차단 활성화" },
            { label: "유지보수 모드", desc: "서비스 임시 점검 모드" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-field border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <div className="h-5 w-9 rounded-full bg-muted opacity-50 cursor-not-allowed" />
            </div>
          ))}
        </div>
      </section>

      {/* 관리자 역할 관리 */}
      <section className="rounded-thumb border border-border bg-card p-5 card-shadow">
        <h2 className="text-sm font-semibold text-foreground">관리자 역할 관리</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {canManageRoles
            ? "관리자 권한을 가진 사용자의 역할을 변경할 수 있습니다."
            : "역할 변경은 슈퍼관리자만 가능합니다. 목록은 조회만 됩니다."}
        </p>

        {updateRole.isError && (
          <p className="mt-3 rounded-field bg-destructive px-3 py-2 text-xs text-destructive-foreground">
            역할 변경에 실패했습니다. 슈퍼관리자 권한이 필요합니다.
          </p>
        )}

        <div className="mt-4 space-y-2">
          {adminsLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-field bg-muted" />
            ))
          ) : admins.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">관리자 계정이 없습니다.</p>
          ) : (
            admins.map((admin) => (
              <div
                key={admin.id}
                className="flex items-center justify-between gap-3 rounded-field bg-muted/50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{admin.name ?? "(이름 없음)"}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{admin.email}</p>
                </div>
                {canManageRoles ? (
                  <select
                    aria-label={`${admin.name ?? admin.email} 역할 변경`}
                    value={admin.adminRole ?? ""}
                    disabled={updateRole.isPending}
                    onChange={(e) =>
                      updateRole.mutate({ userId: admin.id, role: e.target.value as AdminRole })
                    }
                    className="flex-shrink-0 rounded-field border border-border bg-card px-2 py-1 text-xs text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {!admin.adminRole && (
                      <option value="" disabled>
                        역할 없음
                      </option>
                    )}
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="flex-shrink-0 rounded-field bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {admin.adminRole ? ROLE_LABELS[admin.adminRole] : "역할 없음"}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* 감사 로그 */}
      <section className="rounded-thumb border border-border bg-card p-5 card-shadow">
        <h2 className="text-sm font-semibold text-foreground">최근 감사 로그</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          관리자 활동 내역입니다.{auditTotal > 0 ? ` 총 ${auditTotal}건` : ""}
        </p>
        <div className="mt-4 space-y-2">
          {auditLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-field bg-muted" />
            ))
          ) : (auditData?.items ?? []).length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">감사 로그가 없습니다.</p>
          ) : (
            (auditData?.items ?? []).map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-3 rounded-field bg-muted/50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{log.action}</p>
                  {(log.targetType || log.details) && (
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {log.targetType ?? ""}
                      {log.targetId ? ` #${log.targetId}` : ""}
                      {log.details ? ` · ${log.details}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">관리자 #{log.adminId}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {auditTotalPages > 1 && (
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              {auditPage}/{auditTotalPages} 페이지
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={auditSkip === 0}
                onClick={() => setAuditSkip((s) => Math.max(0, s - AUDIT_PER_PAGE))}
                className="rounded-field border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
              </button>
              <button
                type="button"
                disabled={auditPage >= auditTotalPages}
                onClick={() => setAuditSkip((s) => s + AUDIT_PER_PAGE)}
                className="rounded-field border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
