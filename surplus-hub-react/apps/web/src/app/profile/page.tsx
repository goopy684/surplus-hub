"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentUser, useUserStats } from "@repo/core";
import { AuthGate } from "../../components/AuthGate";
import { useAuth } from "../../contexts/AuthContext";

function ProfileContent() {
  const router = useRouter();
  const { logout } = useAuth();
  const { data: currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { data: stats, isLoading: isStatsLoading } = useUserStats(currentUser?.id);

  const handleSignOut = () => {
    logout();
    router.push("/");
  };

  if (isCurrentUserLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-thumb border border-border bg-card p-8 text-center card-shadow">
          <h2 className="text-lg font-bold text-foreground">프로필 정보를 불러오지 못했습니다</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            인증 토큰이 없거나 만료되었을 수 있습니다. 다시 로그인해주세요.
          </p>
        </div>
      </div>
    );
  }

  const displayName = currentUser.name || "사용자";
  const displayImage = currentUser.profileImageUrl;
  const locationLabel = currentUser.location || "위치 정보 없음";
  // 정직성 규칙(design.md): API가 매너온도를 주지 않으면 지어내지 않고 카드를 숨긴다.
  const mannerTemperature = Number.isFinite(currentUser.mannerTemperature ?? Number.NaN)
    ? (currentUser.mannerTemperature as number)
    : undefined;
  const mannerBarWidth =
    mannerTemperature === undefined
      ? 0
      : Math.max(10, Math.min(100, ((mannerTemperature - 30) / 20) * 100));

  const activityCards = [
    {
      label: "판매 내역",
      value: stats?.materialsSold ?? 0,
      href: "/profile/sales",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-muted-foreground">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      ),
    },
    {
      label: "구매 내역",
      value: stats?.materialsBought ?? 0,
      href: "/profile/purchases",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-muted-foreground">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      ),
    },
    {
      label: "관심 목록",
      value: stats?.wishlistCount ?? 0,
      href: "/profile/wishlist",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-muted-foreground">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
      ),
    },
    {
      label: "커뮤니티 작성글",
      value: stats?.communityPostsCount ?? 0,
      href: "/profile/posts",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-muted-foreground">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      ),
    },
  ];

  const settingsItems = [
    { label: "알림 설정", href: "/notifications" },
    { label: "커뮤니티", href: "/community" },
    { label: "앱 정보", href: null as string | null },
  ];

  return (
    <div className="bg-background min-h-screen pb-24">
      {/* Header - Mobile only */}
      <div className="px-4 py-4 flex items-center justify-between md:hidden">
        <h1 className="text-lg font-bold text-foreground">마이페이지</h1>
        <button onClick={() => router.push("/profile/edit")} className="p-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6 text-foreground">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </button>
      </div>

      <div className="mx-4 space-y-4">
        {/* Profile Card */}
        <div className="bg-card border border-border rounded-thumb p-5 card-shadow">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              {displayImage ? (
                <img src={displayImage} alt={displayName} className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-foreground">{displayName.charAt(0)}</span>
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold text-foreground">{displayName}</h2>
              <p className="text-xs text-muted-foreground">{locationLabel}</p>
            </div>
            <div className="bg-olive-bg text-olive-tx border border-olive-bd rounded-full px-2.5 py-1 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
              <span className="text-xs font-bold">인증회원</span>
            </div>
          </div>

          {/* Manner Temperature — 서버 값이 있을 때만 렌더 */}
          {mannerTemperature !== undefined && (
          <div className="bg-secondary border border-border rounded-field p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-olive-tx">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                </svg>
                <span className="text-xs font-medium text-muted-foreground">매너온도</span>
              </div>
              <span className="text-sm font-bold text-olive-tx tabular">{mannerTemperature.toFixed(1)}°C</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-olive-tx rounded-full" style={{ width: `${mannerBarWidth}%` }} />
            </div>
          </div>
          )}
        </div>

        {/* Activity Grid */}
        <div className="grid grid-cols-2 gap-3">
          {activityCards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="block cursor-pointer bg-card border border-border rounded-thumb p-4 card-shadow transition-colors hover:bg-muted/50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex items-center gap-2 mb-2">
                {card.icon}
                <span className="text-xs text-muted-foreground">{card.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground tabular">
                {isStatsLoading ? "-" : card.value}
              </p>
            </Link>
          ))}
        </div>

        {/* Settings Section */}
        <div className="bg-card border border-border rounded-thumb card-shadow divide-y divide-border">
          {settingsItems.map((item, i) => {
            const row = (
              <>
                <span className="text-sm font-medium text-foreground">{item.label}</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true" className="w-4 h-4 text-muted-foreground">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </>
            );
            return item.href ? (
              <Link
                key={i}
                href={item.href}
                className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {row}
              </Link>
            ) : (
              <div key={i} className="p-4 flex items-center justify-between opacity-60">
                {row}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-destructive/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="text-sm font-medium text-destructive">로그아웃</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true" className="w-4 h-4 text-destructive">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGate title="프로필은 로그인 후 이용 가능합니다">
      <ProfileContent />
    </AuthGate>
  );
}
