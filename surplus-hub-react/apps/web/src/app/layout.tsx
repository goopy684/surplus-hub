import { Providers } from "./providers";
import "./globals.css";
import Link from 'next/link';
import { ServiceWorkerUnregister } from './sw-unregister';
import { BottomNav } from '../components/BottomNav';
import { DesktopNav } from "../components/DesktopNav";
import { AuthHeaderActions } from "../components/AuthHeaderActions";
import { HeaderSearch } from "../components/HeaderSearch";

import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "자투리 - B2B 잉여자재 거래",
  description: "내 근처 잉여자재를 찾아보세요. 공장/건설 잉여자재 B2B 거래 플랫폼.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
      <html lang="ko">
        <body>
          <Providers>
            <ServiceWorkerUnregister />
            <header className="px-4 py-3 border-b border-border flex justify-between items-center bg-card sticky top-0 z-50">
              <div className="flex items-center gap-2">
                <div className="bg-primary p-2 rounded-btn w-9 h-9 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-primary-foreground">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                  </svg>
                </div>
                <Link href="/" className="text-xl font-bold text-foreground">자투리</Link>
              </div>

              <HeaderSearch />

              <div className="flex items-center gap-6">
                <DesktopNav />
                <div className="flex items-center gap-4">
                  <Link
                    href="/register"
                    className="hidden md:inline-flex min-h-[44px] items-center gap-1.5 rounded-btn border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-field active:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    자재 등록
                  </Link>
                  <AuthHeaderActions />
                </div>
              </div>
            </header>
            <main className="min-h-screen bg-background">{children}</main>
            <footer className="border-t border-border bg-card px-4 py-6 pb-28 md:pb-6">
              <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 text-center">
                <div className="flex items-center gap-4 text-sm">
                  <Link href="/terms" className="text-muted-foreground hover:text-foreground">이용약관</Link>
                  <span className="text-border">|</span>
                  <Link href="/privacy" className="text-muted-foreground hover:text-foreground">개인정보 처리방침</Link>
                </div>
                <p className="text-xs text-muted-foreground">© 자투리. All rights reserved.</p>
              </div>
            </footer>
            <BottomNav />
          </Providers>
        </body>
      </html>
  )
}
