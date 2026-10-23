"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { shouldBypassAuth } from "./authGatePolicy";

const SHOULD_BYPASS_AUTH = shouldBypassAuth();
const LOAD_TIMEOUT_MS = 2000;

type AuthGateProps = {
  children: ReactNode;
  title?: string;
  description?: string;
};

export function AuthGate({
  children,
  title = "로그인이 필요합니다",
  description = "해당 화면은 로그인 후 이용할 수 있습니다.",
}: AuthGateProps) {
  const { isLoading, isSignedIn } = useAuth();
  const isLoaded = !isLoading;
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded) return;
    const t = setTimeout(() => setLoadTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isLoaded]);

  if (SHOULD_BYPASS_AUTH) {
    return <>{children}</>;
  }

  if (isLoaded && isSignedIn) {
    return <>{children}</>;
  }

  if (!isLoaded && !loadTimedOut) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-xl items-center justify-center px-4">
      <div className="w-full rounded-card bg-canvas px-6 py-10 text-center">
        <h1 className="text-[22px] font-extrabold tracking-[-0.6px] text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <p className="mt-2 text-xs text-muted-foreground">상단 로그인 버튼으로 로그인한 뒤 다시 확인해주세요.</p>
        <a
          href="/sign-in"
          className="mt-5 inline-flex min-h-[48px] items-center rounded-btn bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-dark active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          로그인 하러 가기
        </a>
      </div>
    </div>
  );
}
