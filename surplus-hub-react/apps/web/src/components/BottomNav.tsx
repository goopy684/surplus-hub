"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./navItems";

const HIDDEN_BOTTOM_NAV_PATTERNS = [
  /^\/material\/[^/]+(\/edit)?$/,
  /^\/chat\/[^/]+$/,
  // 등록/작성/수정/관리자/인증 화면은 하단 자체 액션바 또는 전용 레이아웃을 사용한다.
  /^\/register$/,
  /^\/community\/write$/,
  /^\/profile\/edit$/,
  /^\/admin(\/.*)?$/,
  /^\/sign-in(\/.*)?$/,
  /^\/sign-up(\/.*)?$/,
  /^\/forgot-password$/,
  /^\/reset-password$/,
];

const HIDDEN_FOOTER_PATTERNS = [
  /^\/material\/[^/]+(\/edit)?$/,
  /^\/chat\/[^/]+$/,
  /^\/register$/,
  /^\/community\/write$/,
  /^\/profile\/edit$/,
  /^\/admin(\/.*)?$/,
];

export function AppFooter() {
  const pathname = usePathname();

  if (HIDDEN_FOOTER_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return null;
  }

  return (
    <footer className="border-t border-line-2 bg-canvas px-4 py-6 pb-28 md:pb-6">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-4 text-sm">
          <Link href="/terms" className="text-muted-foreground hover:text-foreground">
            이용약관
          </Link>
          <span className="text-border">|</span>
          <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
            개인정보 처리방침
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">© 자투리. All rights reserved.</p>
      </div>
    </footer>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  if (HIDDEN_BOTTOM_NAV_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return null;
  }

  const isActive = (path: string) => pathname === path;

  const NavItem = ({
    href,
    label,
    children,
  }: {
    href: string;
    label: string;
    children: ReactNode;
  }) => (
    <Link
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className={`flex min-h-[52px] flex-1 min-w-0 flex-col items-center justify-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isActive(href) ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
      <span
        className={`text-[11px] truncate ${isActive(href) ? "font-bold" : "font-medium"}`}
      >
        {label}
      </span>
    </Link>
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-line-2 bg-surface md:hidden pb-safe">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-around px-1 pt-2 pb-1">
          <NavItem href="/" label="홈">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-[22px] w-[22px]">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </NavItem>

          <NavItem href="/search" label="검색">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-[22px] w-[22px]">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </NavItem>

          <NavItem href="/chat" label="채팅">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-[22px] w-[22px]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
          </NavItem>

          <NavItem href="/community" label="커뮤니티">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-[22px] w-[22px]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
          </NavItem>

          <NavItem href="/profile" label="프로필">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-[22px] w-[22px]">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </NavItem>
        </div>
      </div>
    </nav>
  );
}
