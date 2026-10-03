"use client";

import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";

export function AuthHeaderActions() {
  const { isSignedIn, isLoading, user, logout } = useAuth();

  if (isLoading) {
    return <div className="h-8 w-16" aria-hidden />;
  }

  if (!isSignedIn) {
    return (
      <Link
        href="/sign-in"
        className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        로그인
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/profile"
        className="text-sm font-medium text-foreground hover:text-primary transition-colors"
      >
        {user?.name || "내 계정"}
      </Link>
      <button
        onClick={logout}
        className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        로그아웃
      </button>
    </div>
  );
}
