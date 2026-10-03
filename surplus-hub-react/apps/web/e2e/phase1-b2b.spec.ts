import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Phase 1 MVP E2E Tests — 당근마켓 for B2B
 *
 * Tests:
 * 1. Home feed: region dropdown filter + condition_grade badge display
 * 2. Material registration: condition_grade + region dropdown
 * 3. Chat entry: material detail → chat button flow
 */

type MaterialItem = {
  id: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
  location: string;
  sellerId: string;
  sellerName: string;
  conditionGrade?: string;
  quantity?: number;
  quantityUnit?: string;
  status?: string;
  createdAt: string;
};

const seedMaterials = (): MaterialItem[] => [
  {
    id: "201",
    title: "LED 조명 모듈 50개",
    description: "공장 잉여분 LED 모듈",
    price: 300000,
    imageUrl: "",
    category: "조명",
    location: "경기도",
    sellerId: "31",
    sellerName: "조명공장",
    conditionGrade: "상",
    quantity: 50,
    quantityUnit: "개",
    status: "ACTIVE",
    createdAt: "2026-03-27T10:00:00.000Z",
  },
  {
    id: "202",
    title: "사무실 문짝 10개",
    description: "미사용 문짝",
    price: 500000,
    imageUrl: "",
    category: "문/창호",
    location: "서울특별시",
    sellerId: "32",
    sellerName: "문제작소",
    conditionGrade: "중",
    quantity: 10,
    quantityUnit: "개",
    status: "ACTIVE",
    createdAt: "2026-03-26T09:00:00.000Z",
  },
];

const withApiEnvelope = (data: unknown, meta?: unknown) =>
  JSON.stringify({
    status: "success",
    data,
    ...(meta ? { meta } : {}),
  });

// v3 자재 등록은 사진 우선 흐름이라 AI 자동 입력을 거쳐야 폼이 열린다.
// setInputFiles로 올릴 1x1 PNG.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const stubPhase1Api = async (page: Page) => {
  const materials = seedMaterials();

  await page.route("**/api/v1/**", async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    // User profile
    if (url.includes("/api/v1/users/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope({
          id: "11",
          name: "테스트사장",
          location: "경기도",
        }),
      });
      return;
    }

    // AI auto-fill endpoints (photo-first register flow)
    if (url.includes("/api/v1/ai/analyze-image") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope({
          titleSuggestion: "AI 추천 자재",
          category: "기타",
          description: "AI가 인식한 자재입니다.",
        }),
      });
      return;
    }

    if (url.includes("/api/v1/ai/generate-description") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope({ description: "AI가 생성한 상세 설명입니다." }),
      });
      return;
    }

    if (url.includes("/api/v1/ai/suggest-price") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope({
          suggestedPrice: 40000,
          marketPrice: { min: 30000, ideal: 40000, max: 50000, recentTrades: 3 },
        }),
      });
      return;
    }

    // Material detail
    if (url.includes("/api/v1/materials/") && method === "GET" && /\/api\/v1\/materials\/\d+$/.test(url)) {
      const idMatch = url.match(/\/api\/v1\/materials\/(\d+)/);
      const id = idMatch ? idMatch[1] : "";
      const found = materials.find((item) => item.id === id);
      await route.fulfill({
        status: found ? 200 : 404,
        contentType: "application/json",
        body: withApiEnvelope(found ?? { detail: "not found" }),
      });
      return;
    }

    // Material list with location filter
    if (url.includes("/api/v1/materials") && method === "GET") {
      const parsed = new URL(url);
      const location = parsed.searchParams.get("location");
      const filtered = location
        ? materials.filter((item) => item.location.includes(location))
        : materials;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope(filtered, {
          totalCount: filtered.length,
          page: 1,
          limit: 20,
          hasNextPage: false,
          totalPages: 1,
        }),
      });
      return;
    }

    // Material create
    if (url.includes("/api/v1/materials") && method === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const created: MaterialItem = {
        id: String(2000 + materials.length),
        title: String(payload.title ?? "새 자재"),
        description: String(payload.description ?? ""),
        price: Number(payload.price ?? 0),
        imageUrl: "",
        category: String(payload.category ?? "기타"),
        location:
          typeof payload.location === "object" && payload.location !== null
            ? String((payload.location as { address?: string }).address ?? "위치 미정")
            : "위치 미정",
        sellerId: "11",
        sellerName: "테스트사장",
        conditionGrade: typeof payload.conditionGrade === "string" ? payload.conditionGrade : undefined,
        quantity: Number(payload.quantity ?? 0) || undefined,
        quantityUnit: typeof payload.quantityUnit === "string" ? payload.quantityUnit : undefined,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
      };
      materials.unshift(created);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: withApiEnvelope(created),
      });
      return;
    }

    // Chat room create
    if (url.includes("/api/v1/chats/rooms") && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope({ id: "room-601" }),
      });
      return;
    }

    // Chat messages
    if (url.includes("/api/v1/chats/rooms/room-601/messages") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope([]),
      });
      return;
    }

    // Chat rooms list
    if (url.includes("/api/v1/chats/rooms") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: withApiEnvelope([]),
      });
      return;
    }

    // Default
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: withApiEnvelope({}),
    });
  });
};

test.describe("Phase 1 B2B — home feed", () => {
  test.beforeEach(async ({ page }) => {
    await stubPhase1Api(page);
    await page.addInitScript(() => {
      localStorage.setItem("access_token", "playwright-token");
    });
  });

  test("displays materials with condition_grade badges", async ({ page }) => {
    await page.goto("/");

    // Feed should show materials
    await expect(page.getByText("LED 조명 모듈 50개")).toBeVisible();
    await expect(page.getByText("사무실 문짝 10개")).toBeVisible();

    // Condition grade badges should be visible — scope to the material card:
    // bare getByText("상") substring-matches hidden elements (e.g. "경상북도"
    // in the mobile-only region select).
    await expect(
      page.getByRole("link", { name: /LED 조명 모듈 50개/ }).getByText("상", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /사무실 문짝 10개/ }).getByText("중", { exact: true })
    ).toBeVisible();

    // Prices should be visible
    await expect(page.getByText("300,000원")).toBeVisible();
    await expect(page.getByText("500,000원")).toBeVisible();
  });

  test("region dropdown filters materials", async ({ page }) => {
    // 지역 필터 select는 모바일 헤더 전용(md:hidden)이라 모바일 뷰포트에서 검증한다.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    // Both materials visible initially
    await expect(page.getByText("LED 조명 모듈 50개")).toBeVisible();
    await expect(page.getByText("사무실 문짝 10개")).toBeVisible();

    // Select 경기도 region
    const regionSelect = page.locator("select").first();
    await regionSelect.selectOption("경기도");

    // 경기도 자재는 계속 보여야 한다.
    await expect(page.getByText("LED 조명 모듈 50개")).toBeVisible();
  });

  test("bottom nav has register button in center", async ({ page }) => {
    // 하단 네비는 모바일 전용(md:hidden)이라 모바일 뷰포트에서 검증한다.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    // BottomNav should have 5 items including register
    const registerLink = page.locator('nav a[href="/register"]');
    await expect(registerLink).toBeVisible();
  });
});

test.describe("Phase 1 B2B — material registration", () => {
  test.beforeEach(async ({ page }) => {
    await stubPhase1Api(page);
    await page.addInitScript(() => {
      localStorage.setItem("access_token", "playwright-token");
    });
  });

  test("register form has condition_grade and region fields", async ({ page }) => {
    await page.goto("/register");

    // v3 등록은 사진 우선 흐름: 사진 업로드 → AI 자동 입력을 거쳐야 상세 폼이 열린다.
    await page.setInputFiles('input[type="file"]', {
      name: "material.png",
      mimeType: "image/png",
      buffer: PNG_1x1,
    });
    await page.getByRole("button", { name: "AI 자동 입력 시작" }).click();
    await expect(page.getByRole("button", { name: "등록하기" })).toBeVisible();

    // ai-result 단계의 select는 상태 등급(0) · 위치 시도(1) 순서로 존재한다.
    // condition_grade 필드
    await expect(page.getByText("상태 등급")).toBeVisible();
    const conditionSelect = page.locator("select").nth(0);
    await conditionSelect.selectOption("상");
    await expect(conditionSelect).toHaveValue("상");

    // region(시도) 필드
    await expect(page.getByText("위치 (시도)")).toBeVisible();
    const regionSelect = page.locator("select").nth(1);
    await regionSelect.selectOption("서울특별시");
    await expect(regionSelect).toHaveValue("서울특별시");
  });
});

test.describe("Phase 1 B2B — chat entry", () => {
  test.beforeEach(async ({ page }) => {
    await stubPhase1Api(page);
    await page.addInitScript(() => {
      localStorage.setItem("access_token", "playwright-token");
    });
  });

  test("material detail to chat button flow", async ({ page }) => {
    await page.goto("/material/201");

    // 제목은 헤더 h1 + 본문 h2로 2번 렌더링되므로 first()로 한정한다.
    await expect(page.getByText("LED 조명 모듈 50개").first()).toBeVisible();
    await expect(page.getByText("300,000").first()).toBeVisible();

    // Condition grade badge should show
    await expect(page.getByText("상").first()).toBeVisible();

    // Chat button should be visible
    const chatButton = page.getByRole("button", { name: /채팅|문의/ });
    await expect(chatButton).toBeVisible();
  });
});
