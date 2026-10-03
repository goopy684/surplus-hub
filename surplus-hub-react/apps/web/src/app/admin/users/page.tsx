"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AdminUser, AdminRole, UserSanction } from "@repo/core";
import {
  useManagedUsers,
  useManagedUserDetail,
  useCreateSanction,
  useDeleteSanction,
  useCreateAdminNote,
} from "@repo/core";

const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "슈퍼관리자",
  ADMIN: "관리자",
  MODERATOR: "모더레이터",
};

const ROLE_COLORS: Record<AdminRole, string> = {
  SUPER_ADMIN: "bg-accent text-accent-foreground",
  ADMIN: "border border-border bg-card text-muted-foreground",
  MODERATOR: "border border-border bg-card text-muted-foreground",
};

const SANCTION_LABELS: Record<UserSanction["sanctionType"], string> = {
  WARNING: "경고",
  SUSPENSION: "정지",
  BAN: "영구 차단",
};

const SANCTION_COLORS: Record<UserSanction["sanctionType"], string> = {
  WARNING: "border border-border bg-muted text-muted-foreground",
  SUSPENSION: "border border-destructive/30 bg-destructive/5 text-destructive",
  BAN: "bg-destructive text-destructive-foreground",
};

// 403 = ADMIN 이상만 허용되는 작업(BAN 부여 · 제재 해제)을 MODERATOR가 시도한 경우.
function errorMessage(err: unknown, fallback: string) {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 403) return "권한이 없습니다. 관리자 이상만 가능한 작업입니다.";
  return fallback;
}

const formatDate = (v: string) => new Date(v).toLocaleDateString("ko-KR");

interface SanctionFormProps {
  userId: number;
  onClose: () => void;
  onCreated: () => void;
}

function SanctionForm({ userId, onClose, onCreated }: SanctionFormProps) {
  const [sanctionType, setSanctionType] = useState<"WARNING" | "SUSPENSION" | "BAN">("WARNING");
  const [reason, setReason] = useState("");
  const createSanction = useCreateSanction();

  const handleSubmit = () => {
    if (!reason.trim()) return;
    createSanction.mutate(
      { userId, data: { sanctionType, reason } },
      { onSuccess: () => { onCreated(); onClose(); } }
    );
  };

  return (
    <div className="space-y-3 rounded-thumb border border-destructive/20 bg-destructive/5 p-4">
      <p className="text-xs font-semibold text-destructive">제재 부여</p>
      <div className="flex gap-2">
        {(["WARNING", "SUSPENSION", "BAN"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSanctionType(t)}
            className={`rounded-field px-2.5 py-1.5 text-xs font-medium transition-colors ${
              sanctionType === t
                ? "bg-destructive text-destructive-foreground"
                : "border border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {t === "WARNING" ? "경고" : t === "SUSPENSION" ? "정지" : "영구 차단"}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="제재 사유 입력"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-field border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      {createSanction.isError && (
        <p className="text-xs text-destructive">
          {errorMessage(createSanction.error, "제재를 부여하지 못했습니다.")}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!reason.trim() || createSanction.isPending}
          className="flex-1 rounded-field bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground disabled:opacity-50 hover:bg-destructive/80"
        >
          {createSanction.isPending ? "처리 중..." : "제재 부여"}
        </button>
        <button
          onClick={onClose}
          className="rounded-field border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          취소
        </button>
      </div>
    </div>
  );
}

interface UserDetailDrawerProps {
  user: AdminUser;
  onClose: () => void;
}

function UserDetailDrawer({ user, onClose }: UserDetailDrawerProps) {
  const [showSanctionForm, setShowSanctionForm] = useState(false);
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const { data: detail, isLoading: isDetailLoading, isError: isDetailError } =
    useManagedUserDetail(user.id);
  const deleteSanction = useDeleteSanction();
  const createNote = useCreateAdminNote();

  // 목록 행(AdminUser)을 즉시 fallback으로 쓰고, 상세가 도착하면 덮어쓴다.
  const head: AdminUser = detail ?? user;
  const sanctions = detail?.sanctions ?? [];
  const notes = detail?.adminNotes ?? [];

  // useCreateSanction/useDeleteSanction은 ["admin","user",id]만 무효화한다 —
  // 이 드로어가 쓰는 ["admin","managedUser",id]는 건드리지 않으므로 여기서 직접 무효화한다.
  const refreshUser = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "managedUser", user.id] });
    queryClient.invalidateQueries({ queryKey: ["admin", "managedUsers"] });
  };

  const handleRelease = (sanction: UserSanction) => {
    if (!window.confirm(`'${SANCTION_LABELS[sanction.sanctionType]}' 제재를 해제할까요?`)) return;
    deleteSanction.mutate(
      { userId: user.id, sanctionId: sanction.id },
      { onSuccess: refreshUser }
    );
  };

  const handleAddNote = () => {
    if (!note.trim()) return;
    createNote.mutate(
      { userId: user.id, content: note.trim() },
      { onSuccess: () => setNote("") }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-foreground/30" aria-hidden="true" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-sm flex-col bg-card card-shadow-hover">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold text-foreground">사용자 상세</h2>
          <button onClick={onClose} className="rounded-field p-1.5 text-muted-foreground hover:bg-muted">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground font-bold text-lg">
              {(head.name ?? head.email ?? "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-foreground">{head.name ?? "(이름 없음)"}</p>
              <p className="text-sm text-muted-foreground">{head.email}</p>
            </div>
          </div>
          <div className="space-y-2 rounded-thumb bg-muted p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">역할</span>
              {head.adminRole ? (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[head.adminRole]}`}>
                  {ROLE_LABELS[head.adminRole]}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">일반 사용자</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">상태</span>
              <span className={`text-xs font-medium ${head.isActive ? "text-success" : "text-muted-foreground"}`}>
                {head.isActive ? "활성" : "비활성"}
              </span>
            </div>
            {head.createdAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">가입일</span>
                <span className="text-foreground tabular">{formatDate(head.createdAt)}</span>
              </div>
            )}
          </div>

          {showSanctionForm ? (
            <SanctionForm
              userId={user.id}
              onClose={() => setShowSanctionForm(false)}
              onCreated={refreshUser}
            />
          ) : (
            <button
              onClick={() => setShowSanctionForm(true)}
              className="w-full rounded-btn border border-destructive/30 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/5"
            >
              제재 부여
            </button>
          )}

          {/* 제재 이력 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">제재 이력</p>
            {isDetailLoading ? (
              <div className="h-16 animate-pulse rounded-thumb bg-muted" />
            ) : isDetailError ? (
              <p className="rounded-thumb border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                제재 이력을 불러오지 못했습니다.
              </p>
            ) : sanctions.length === 0 ? (
              <p className="rounded-thumb bg-muted px-3 py-3 text-xs text-muted-foreground">
                제재 이력이 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {sanctions.map((s) => (
                  <li
                    key={s.id}
                    className="space-y-2 rounded-thumb border border-border bg-card p-3 card-shadow"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SANCTION_COLORS[s.sanctionType]}`}>
                        {SANCTION_LABELS[s.sanctionType]}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.isActive
                            ? "border border-destructive/30 bg-destructive/5 text-destructive"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {s.isActive ? "적용 중" : "해제됨"}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{s.reason}</p>
                    <div className="flex justify-between text-xs text-muted-foreground tabular">
                      <span>부여 {formatDate(s.createdAt)}</span>
                      <span>만료 {s.expiresAt ? formatDate(s.expiresAt) : "영구"}</span>
                    </div>
                    {s.isActive && (
                      <button
                        onClick={() => handleRelease(s)}
                        disabled={deleteSanction.isPending}
                        className="w-full rounded-field border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground disabled:opacity-50 hover:bg-muted"
                      >
                        {deleteSanction.isPending ? "처리 중..." : "제재 해제"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {deleteSanction.isError && (
              <p className="text-xs text-destructive">
                {errorMessage(deleteSanction.error, "제재를 해제하지 못했습니다.")}
              </p>
            )}
          </div>

          {/* 관리자 메모 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">관리자 메모</p>
            {isDetailLoading ? (
              <div className="h-16 animate-pulse rounded-thumb bg-muted" />
            ) : notes.length === 0 ? (
              <p className="rounded-thumb bg-muted px-3 py-3 text-xs text-muted-foreground">
                등록된 메모가 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-thumb border border-border bg-card p-3">
                    <p className="text-sm text-foreground">{n.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground tabular">
                      관리자 #{n.adminId} · {formatDate(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              rows={3}
              placeholder="메모 입력"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-field border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {createNote.isError && (
              <p className="text-xs text-destructive">
                {errorMessage(createNote.error, "메모를 저장하지 못했습니다.")}
              </p>
            )}
            <button
              onClick={handleAddNote}
              disabled={!note.trim() || createNote.isPending}
              className="w-full rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 active:bg-primary-dark"
            >
              {createNote.isPending ? "저장 중..." : "메모 추가"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [skip, setSkip] = useState(0);
  const perPage = 50;

  const isActiveFilter = filter === "active" ? true : filter === "inactive" ? false : undefined;

  const { data, isLoading, isError } = useManagedUsers({
    skip,
    limit: perPage,
    search: search || undefined,
    isActive: isActiveFilter,
  });

  const users = data?.data ?? [];
  const total = data?.meta?.totalCount ?? users.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.floor(skip / perPage) + 1;

  const paginated = users;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">사용자 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">전체 사용자를 조회하고 관리합니다.</p>
      </div>

      {isError && (
        <div className="rounded-thumb border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          사용자 목록을 불러오는 데 실패했습니다.
        </div>
      )}

      {/* 검색 + 필터 */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="search"
            placeholder="이름, 이메일 검색"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSkip(0); }}
            className="w-full rounded-field border border-border bg-card py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setSkip(0); }}
              className={`rounded-field px-3 py-2 text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {f === "all" ? "전체" : f === "active" ? "활성" : "비활성"}
            </button>
          ))}
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-hidden rounded-thumb border border-border bg-card card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">이름</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground sm:table-cell">이메일</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">역할</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">상태</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground md:table-cell">가입일</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    검색 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                // 행 전체 클릭은 마우스 편의용 — 키보드 경로는 각 행의 "상세" 버튼.
                paginated.map((user) => (
                  <tr
                    key={user.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => setSelectedUser(user)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
                          {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-foreground">{user.name ?? "(이름 없음)"}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{user.email}</td>
                    <td className="px-4 py-3">
                      {user.adminRole ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.adminRole]}`}>
                          {ROLE_LABELS[user.adminRole]}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">일반</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${user.isActive ? "text-success" : "text-muted-foreground"}`}>
                        {user.isActive ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString("ko-KR") : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-label={`${user.name ?? user.email ?? "사용자"} 상세`}
                        onClick={(e) => { e.stopPropagation(); setSelectedUser(user); }}
                        className="rounded-field border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        상세
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              총 {total}명 · {page}/{totalPages} 페이지
            </p>
            <div className="flex gap-1">
              <button
                disabled={skip === 0}
                onClick={() => setSkip((s) => Math.max(0, s - perPage))}
                className="rounded-field border border-border px-2.5 py-1 text-xs text-muted-foreground disabled:opacity-40 hover:bg-muted"
              >
                이전
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setSkip((s) => s + perPage)}
                className="rounded-field border border-border px-2.5 py-1 text-xs text-muted-foreground disabled:opacity-40 hover:bg-muted"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 사용자 상세 드로어 */}
      {selectedUser && (
        <UserDetailDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
}
