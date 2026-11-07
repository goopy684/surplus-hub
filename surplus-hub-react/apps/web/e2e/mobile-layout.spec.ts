import { expect, test, type Page, type Route } from "@playwright/test";

const withApiEnvelope = (data: unknown, meta?: unknown) =>
  JSON.stringify({
    status: "success",
    data,
    ...(meta ? { meta } : {}),
  });

const stubMobileLayoutApi = async (page: Page) => {
  await page.route("**/api/v1/**", async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/v1/users/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope({
          id: "11",
          name: "김현장",
          email: "site@surplushub.kr",
          location: "서울 성동구",
          trustLevel: 92,
          mannerTemperature: 39.5,
          isSuperuser: true,
          adminRole: "SUPER_ADMIN",
        }),
      });
      return;
    }

    if (url.includes("/api/v1/users/11/stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope({
          materialsSold: 8,
          materialsBought: 4,
          wishlistCount: 6,
          communityPostsCount: 3,
        }),
      });
      return;
    }

    if (url.includes("/api/v1/categories")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope([
          { id: 1, name: "조명", slug: "조명" },
          { id: 2, name: "문/창호", slug: "문/창호" },
          { id: 3, name: "건축자재", slug: "건축자재" },
          { id: 4, name: "전기", slug: "전기" },
          { id: 5, name: "설비", slug: "설비" },
          { id: 6, name: "기타", slug: "기타" },
        ]),
      });
      return;
    }

    if (url.includes("/api/v1/materials/201") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope({
          id: "201",
          title: "산업용 H빔 철골 자재 및 잔여 파이프 일괄",
          description: "현장 마감 후 남은 H빔 및 각관 자재입니다. 상태 확인 후 직거래 및 화물 모두 가능합니다.",
          price: 12500000,
          imageUrl: "",
          category: "건축자재",
          location: "경기도 안산시 단원구",
          sellerId: "21",
          sellerName: "반월철강",
          quantity: 15,
          quantityUnit: "본",
          tradeMethod: "BOTH",
          conditionGrade: "하",
          status: "ACTIVE",
          likesCount: 12,
          isLiked: false,
          createdAt: "2026-10-01T10:00:00.000Z",
        }),
      });
      return;
    }

    if (url.includes("/api/v1/materials")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope(
          [
            {
              id: "201",
              title: "산업용 H빔 철골 자재 및 잔여 파이프 일괄",
              description: "현장 마감 후 남은 H빔 및 각관 자재입니다.",
              price: 12500000,
              imageUrl: "",
              category: "건축자재",
              location: "경기도 안산시 단원구",
              sellerId: "21",
              sellerName: "반월철강",
              quantity: 15,
              quantityUnit: "본",
              tradeMethod: "BOTH",
              conditionGrade: "하",
              status: "ACTIVE",
              likesCount: 12,
              createdAt: "2026-10-01T10:00:00.000Z",
            },
          ],
          { totalCount: 1, page: 1, limit: 20, hasNextPage: false }
        ),
      });
      return;
    }

    if (url.includes("/api/v1/chats/rooms/room-601/messages")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope([
          {
            id: "msg-1",
            roomId: "room-601",
            senderId: "21",
            content: "안녕하세요, 자재 수량 아직 남아있나요?",
            messageType: "TEXT",
            isRead: true,
            createdAt: "2026-10-01T10:05:00.000Z",
          },
        ]),
      });
      return;
    }

    if (url.includes("/api/v1/chats/rooms")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope([
          {
            id: "room-601",
            materialId: "201",
            materialTitle: "산업용 H빔 철골 자재",
            otherUser: { id: "21", name: "반월철강", avatarUrl: "" },
            unreadCount: 1,
            updatedAt: "2026-10-01T10:05:00.000Z",
            lastMessage: {
              id: "msg-1",
              roomId: "room-601",
              senderId: "21",
              content: "안녕하세요, 자재 수량 아직 남아있나요?",
              timestamp: "2026-10-01T10:05:00.000Z",
              isRead: false,
            },
          },
        ]),
      });
      return;
    }

    if (url.includes("/api/v1/community/posts")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope([
          {
            id: "post-1",
            title: "남동공단 근처 각관 자투리 처분 팁 공유합니다",
            content: "현장 정리할 때 직거래로 올리면 당일 수거 잘 됩니다.",
            category: "노하우",
            authorId: "21",
            authorName: "현장소장",
            views: 42,
            likesCount: 5,
            commentsCount: 2,
            createdAt: "2026-10-01T09:00:00.000Z",
          },
        ]),
      });
      return;
    }

    if (url.includes("/api/v1/admin/dashboard/summary")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope({
          totalUsers: 120,
          newUsersToday: 5,
          dau: 28,
          wau: 74,
          mau: 110,
          totalMaterials: 85,
          activeMaterials: 64,
          totalTransactions: 32,
          completedTransactions: 29,
          completedTransactionAmount: 18500000,
          pendingReports: 2,
        }),
      });
      return;
    }

    if (url.includes("/api/v1/admin/dashboard/stats/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope({
          period: "week",
          data: [
            { date: "2026-10-01", count: 4 },
            { date: "2026-10-02", count: 9 },
            { date: "2026-10-03", count: 7 },
          ],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: withApiEnvelope({}),
    });
  });
};

const assertNoHorizontalOverflow = async (page: Page, routePath: string) => {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(
    metrics.docScrollWidth,
    `Horizontal overflow on ${routePath}: docScrollWidth(${metrics.docScrollWidth}) > innerWidth(${metrics.innerWidth})`
  ).toBeLessThanOrEqual(metrics.innerWidth);
  expect(
    metrics.bodyScrollWidth,
    `Horizontal overflow on ${routePath}: bodyScrollWidth(${metrics.bodyScrollWidth}) > innerWidth(${metrics.innerWidth})`
  ).toBeLessThanOrEqual(metrics.innerWidth);
};

const MOBILE_VIEWPORTS = [
  { name: "360x800 (narrow Android)", width: 360, height: 800 },
  { name: "390x844 (iPhone 14)", width: 390, height: 844 },
];

for (const vp of MOBILE_VIEWPORTS) {
  test.describe(`Mobile layout guard — ${vp.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await stubMobileLayoutApi(page);
      await page.addInitScript(() => {
        localStorage.setItem("access_token", "playwright-mobile-token");
      });
    });

    test("tab routes have single mobile header, visible BottomNav, and zero horizontal overflow", async ({
      page,
    }) => {
      const tabRoutes = ["/", "/search", "/community", "/chat", "/profile"];

      for (const routePath of tabRoutes) {
        await page.goto(routePath);

        // Global desktop header must be hidden on mobile viewports
        const desktopHeader = page.locator("body > header").first();
        await expect(desktopHeader).toBeHidden();

        // BottomNav must be visible and anchored to bottom of viewport
        const bottomNav = page.locator("nav.fixed.bottom-0");
        await expect(bottomNav).toBeVisible();
        const navBox = await bottomNav.boundingBox();
        expect(navBox).not.toBeNull();
        expect(navBox!.x).toBeGreaterThanOrEqual(0);
        expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(vp.width + 1);

        await assertNoHorizontalOverflow(page, routePath);
      }

      // On /search, horizontal filter chip rails should span edge-to-edge (no 20px clipping)
      await page.goto("/search");
      const tradeMethodGroup = page.getByRole("group", { name: "거래 방식" });
      await expect(tradeMethodGroup).toBeVisible();
      const railBox = await tradeMethodGroup.boundingBox();
      expect(railBox).not.toBeNull();
      expect(railBox!.x).toBeLessThanOrEqual(1);
      expect(Math.round(railBox!.width)).toBe(vp.width);
    });

    test("material detail bottom action bar fits narrow mobile without badge wrapping or footer overlap", async ({
      page,
    }) => {
      await page.goto("/material/201");
      await expect(
        page.locator("h2", { hasText: "산업용 H빔 철골 자재 및 잔여 파이프 일괄" })
      ).toBeVisible();

      await assertNoHorizontalOverflow(page, "/material/201");

      // BottomNav and global footer must be hidden on detail page
      await expect(page.locator("nav.fixed.bottom-0")).toHaveCount(0);
      await expect(page.locator("footer")).toHaveCount(0);

      // Condition grade badge ("하 (사용감 있음)") and CTA ("판매자와 채팅") must fit inside viewport without wrapping
      const ctaButton = page.getByRole("button", { name: "판매자와 채팅" });
      await expect(ctaButton).toBeVisible();
      const ctaBox = await ctaButton.boundingBox();
      expect(ctaBox).not.toBeNull();
      expect(ctaBox!.x + ctaBox!.width).toBeLessThanOrEqual(vp.width);
      expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(vp.height + 1);

      const gradeBadge = page.locator(".fixed.bottom-0").getByText("하 (사용감 있음)");
      await expect(gradeBadge).toBeVisible();
      const badgeBox = await gradeBadge.boundingBox();
      expect(badgeBox).not.toBeNull();
      // Single-line pill badge height should be compact (<= 30px)
      expect(badgeBox!.height).toBeLessThanOrEqual(30);
      expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(ctaBox!.x);
    });

    test("chat room fits 100dvh mobile viewport with single header and no footer/nav overlap", async ({
      page,
    }) => {
      await page.goto("/chat/room-601");
      await expect(page.getByText("안녕하세요, 자재 수량 아직 남아있나요?")).toBeVisible();

      await assertNoHorizontalOverflow(page, "/chat/room-601");

      // BottomNav and global footer must be hidden
      await expect(page.locator("nav.fixed.bottom-0")).toHaveCount(0);
      await expect(page.locator("footer")).toHaveCount(0);

      // Message input form should sit cleanly at the bottom of the viewport
      const input = page.getByLabel("메시지 입력");
      await expect(input).toBeVisible();
      const inputBox = await input.boundingBox();
      expect(inputBox).not.toBeNull();
      expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(vp.height);
      expect(inputBox!.y).toBeGreaterThan(vp.height - 90);
    });

    test("register and admin routes hide BottomNav/footer and have no header collision", async ({
      page,
    }) => {
      await page.goto("/register");
      await expect(page.getByRole("heading", { name: "자재 등록" })).toBeVisible();
      await assertNoHorizontalOverflow(page, "/register");
      await expect(page.locator("nav.fixed.bottom-0")).toHaveCount(0);
      await expect(page.locator("footer")).toHaveCount(0);

      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();
      await assertNoHorizontalOverflow(page, "/admin");
      await expect(page.locator("nav.fixed.bottom-0")).toHaveCount(0);
      await expect(page.locator("footer")).toHaveCount(0);

      // Admin mobile header hamburger button should be at the very top of the viewport (not pushed down by global header)
      const menuBtn = page.getByRole("button", { name: "메뉴 열기" });
      await expect(menuBtn).toBeVisible();
      const menuBox = await menuBtn.boundingBox();
      expect(menuBox).not.toBeNull();
      expect(menuBox!.y).toBeLessThan(32);
    });
  });
}
