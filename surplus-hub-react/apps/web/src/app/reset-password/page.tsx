"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { resetPassword } from "@repo/core";

export default function ResetPasswordPage() {
    const [token, setToken] = useState<string | null>(null);
    const [tokenChecked, setTokenChecked] = useState(false);
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Read the reset token from the URL on mount (avoids useSearchParams/Suspense).
    useEffect(() => {
        const t = new URLSearchParams(window.location.search).get("token");
        setToken(t);
        setTokenChecked(true);
    }, []);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!token) {
            setError("유효하지 않은 링크입니다. 비밀번호 찾기를 다시 진행해주세요.");
            return;
        }
        if (password.length < 6) {
            setError("비밀번호는 6자 이상이어야 합니다.");
            return;
        }
        if (password !== confirm) {
            setError("비밀번호가 일치하지 않습니다.");
            return;
        }
        setSubmitting(true);
        try {
            await resetPassword(token, password);
            setDone(true);
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(
                status === 400
                    ? "유효하지 않거나 만료된 링크입니다. 비밀번호 찾기를 다시 진행해주세요."
                    : "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해주세요."
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center p-4 py-12">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 card-shadow">
                <h1 className="text-xl font-bold text-foreground">비밀번호 재설정</h1>

                {done ? (
                    <div className="mt-6">
                        <p className="rounded-field bg-field p-3 text-sm text-foreground">
                            비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.
                        </p>
                        <Link
                            href="/sign-in"
                            className="mt-5 inline-block rounded-btn bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary-dark"
                        >
                            로그인하러 가기
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={onSubmit}>
                        <p className="mt-1 text-sm text-muted-foreground">새 비밀번호를 입력하세요.</p>

                        {tokenChecked && !token && (
                            <p className="mt-4 text-sm text-red-600">
                                유효하지 않은 링크입니다.{" "}
                                <Link href="/forgot-password" className="underline">
                                    비밀번호 찾기
                                </Link>
                                를 다시 진행해주세요.
                            </p>
                        )}

                        <label className="mt-6 block text-sm font-medium text-foreground" htmlFor="password">
                            새 비밀번호
                        </label>
                        <input
                            id="password"
                            type="password"
                            autoComplete="new-password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 w-full rounded-field border border-border bg-field px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />

                        <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="confirm">
                            새 비밀번호 확인
                        </label>
                        <input
                            id="confirm"
                            type="password"
                            autoComplete="new-password"
                            required
                            minLength={6}
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="mt-1 w-full rounded-field border border-border bg-field px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">6자 이상</p>

                        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

                        <button
                            type="submit"
                            disabled={submitting || (tokenChecked && !token)}
                            className="mt-6 w-full rounded-btn bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary-dark disabled:opacity-60"
                        >
                            {submitting ? "변경 중..." : "비밀번호 변경"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
