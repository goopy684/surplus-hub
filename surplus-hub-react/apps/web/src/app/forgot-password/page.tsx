"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@repo/core";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            const res = await requestPasswordReset(email);
            setMessage(res.message || "가입된 이메일이라면 재설정 링크를 보냈습니다.");
            setDevResetUrl(res.devResetUrl ?? null);
        } catch {
            setError("요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center p-4 py-12">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 card-shadow">
                <h1 className="text-xl font-bold text-foreground">비밀번호 찾기</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    가입한 이메일로 비밀번호 재설정 링크를 보내드립니다.
                </p>

                {message ? (
                    <div className="mt-6">
                        <p className="rounded-field bg-field p-3 text-sm text-foreground">{message}</p>
                        {devResetUrl && (
                            <p className="mt-3 break-all text-xs text-muted-foreground">
                                [개발용] 재설정 링크:{" "}
                                <a href={devResetUrl} className="text-primary underline">
                                    {devResetUrl}
                                </a>
                            </p>
                        )}
                        <Link
                            href="/sign-in"
                            className="mt-5 inline-block text-sm font-medium text-primary hover:underline"
                        >
                            로그인으로 돌아가기
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={onSubmit}>
                        <label className="mt-6 block text-sm font-medium text-foreground" htmlFor="email">
                            이메일
                        </label>
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 w-full rounded-field border border-border bg-field px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />

                        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="mt-6 w-full rounded-btn bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary-dark disabled:opacity-60"
                        >
                            {submitting ? "전송 중..." : "재설정 링크 받기"}
                        </button>

                        <p className="mt-4 text-center text-sm text-muted-foreground">
                            <Link href="/sign-in" className="font-medium text-primary hover:underline">
                                로그인으로 돌아가기
                            </Link>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}
