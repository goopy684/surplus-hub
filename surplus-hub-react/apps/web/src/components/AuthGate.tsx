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
      <div className="w-full rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">{description}</p>
        <p className="mt-2 text-xs text-gray-400">상단 로그인 버튼으로 로그인한 뒤 다시 확인해주세요.</p>
        <a
          href="/sign-in"
          className="mt-5 inline-block rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white hover:bg-[#e65c00]"
        >
          로그인 하러 가기
        </a>
      </div>
    </div>
  );
}
