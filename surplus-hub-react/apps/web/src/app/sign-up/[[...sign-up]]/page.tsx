"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../contexts/AuthContext";
import { GoogleSignInButton } from "../../../components/GoogleSignInButton";

export default function SignUpPage() {
    const router = useRouter();
    const { signup } = useAuth();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (password.length < 6) {
            setError("비밀번호는 6자 이상이어야 합니다.");
            return;
        }
        setSubmitting(true);
        try {
            await signup(email, password, name);
            router.push("/");
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(
                status === 400
                    ? "이미 가입된 이메일이거나 입력값이 올바르지 않습니다."
                    : "회원가입에 실패했습니다. 잠시 후 다시 시도해주세요."
            );
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
                <h1 className="text-xl font-bold text-foreground">회원가입</h1>
                <p className="mt-1 text-sm text-muted-foreground">이메일과 비밀번호로 가입하세요.</p>

                <label className="mt-6 block text-sm font-medium text-foreground" htmlFor="name">
                    이름
                </label>
                <input
                    id="name"
                    type="text"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-field border border-border bg-field px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />

                <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="email">
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
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-field border border-border bg-field px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1 text-xs text-muted-foreground">6자 이상</p>

                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

                <button
                    type="submit"
                    disabled={submitting}
                    className="mt-6 w-full rounded-btn bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary-dark disabled:opacity-60"
                >
                    {submitting ? "가입 중..." : "회원가입"}
                </button>

                <p className="mt-3 text-center text-xs text-muted-foreground">
                    회원가입 시{" "}
                    <Link href="/terms" className="underline hover:text-foreground">
                        이용약관
                    </Link>{" "}
                    및{" "}
                    <Link href="/privacy" className="underline hover:text-foreground">
                        개인정보 처리방침
                    </Link>
                    에 동의하는 것으로 간주됩니다.
                </p>

                <p className="mt-4 text-center text-sm text-muted-foreground">
                    이미 계정이 있으신가요?{" "}
                    <Link href="/sign-in" className="font-medium text-primary hover:underline">
                        로그인
                    </Link>
                </p>

                <GoogleSignInButton onError={setError} />
            </form>
        </div>
    );
}
