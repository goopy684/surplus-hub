"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../contexts/AuthContext";
import { GoogleSignInButton } from "../../../components/GoogleSignInButton";

export default function SignInPage() {
    const router = useRouter();
    const { login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await login(email, password);
            router.push("/");
        } catch {
            setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center p-4 py-12">
            <form
                onSubmit={onSubmit}
                className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 card-shadow"
            >
                <h1 className="text-xl font-bold text-foreground">로그인</h1>
                <p className="mt-1 text-sm text-muted-foreground">자투리 계정으로 로그인하세요.</p>

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

                <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="password">
                    비밀번호
                </label>
                <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-field border border-border bg-field px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />

                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

                <button
                    type="submit"
                    disabled={submitting}
                    className="mt-6 w-full rounded-btn bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary-dark disabled:opacity-60"
                >
                    {submitting ? "로그인 중..." : "로그인"}
                </button>

                <p className="mt-3 text-center text-sm">
                    <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground hover:underline">
                        비밀번호를 잊으셨나요?
                    </Link>
                </p>

                <p className="mt-4 text-center text-sm text-muted-foreground">
                    계정이 없으신가요?{" "}
                    <Link href="/sign-up" className="font-medium text-primary hover:underline">
                        회원가입
                    </Link>
                </p>

                <GoogleSignInButton onError={setError} />
            </form>
        </div>
    );
}
