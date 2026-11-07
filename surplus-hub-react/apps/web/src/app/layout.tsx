import { Providers } from "./providers";
import "./globals.css";
import Link from 'next/link';
import { ServiceWorkerUnregister } from './sw-unregister';
import { BottomNav, AppFooter } from '../components/BottomNav';
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
            <header className="hidden md:flex px-4 py-3 border-b border-line-2 justify-between items-center bg-surface sticky top-0 z-50">
              <div className="flex items-center gap-2">
                <div className="bg-primary p-2 rounded-[10px] w-9 h-9 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-primary-foreground">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                  </svg>
                </div>
                <Link href="/" className="text-xl font-extrabold tracking-[-0.6px] text-foreground">자투리</Link>
              </div>

              <HeaderSearch />

              <div className="flex items-center gap-6">
                <DesktopNav />
                <div className="flex items-center gap-4">
                  <Link
                    href="/register"
                    className="hidden md:inline-flex min-h-[44px] items-center gap-1.5 rounded-chip bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-dark active:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
            <main className="min-h-[100dvh] bg-paper">{children}</main>
            <AppFooter />
            <BottomNav />
          </Providers>
        </body>
      </html>
  )
}
