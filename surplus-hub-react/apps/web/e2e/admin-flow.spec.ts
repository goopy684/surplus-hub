import { expect, test, type Page } from "@playwright/test";

let adminToken = "";

test.beforeAll(async ({ request }) => {
  const res = await request.post("http://localhost:8000/api/v1/auth/login/access-token", {
    form: {
      username: "admin@example.com",
      password: "password123",
    },
  });
  const json = await res.json();
  adminToken = json.data.accessToken;
});

const mockNonAdminUser = async (page: Page) => {
  await page.route("**/api/v1/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        data: {
          id: "100",
          name: "일반유저",
          email: "user@example.com",
          role: "user",
          adminRole: null,
          isSuperuser: false,
          location: "서울",
        },
      }),
    });
  });
};

test.describe("Admin Console — Comprehensive Functional Tests", () => {
  test("1. Access Guard — blocks admin route for unauthenticated user", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText("접근 권한이 없습니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "로그인 하러 가기" })).toBeVisible();
  });

  test("2. Access Guard — blocks admin route for non-admin user", async ({ page }) => {
    await mockNonAdminUser(page);
    await page.addInitScript(() => {
      localStorage.setItem("access_token", "non-admin-token");
    });

    await page.goto("/admin");
    await expect(page.getByText("관리자 권한이 필요합니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "홈으로 돌아가기" })).toBeVisible();
  });

  test("3. Dashboard — renders live KPI summary cards & charts", async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem("access_token", token);
    }, adminToken);

    await page.goto("/admin");
    await expect(page.getByText("관리자 패널").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();

    // Check KPI cards
    await expect(page.getByText("총 사용자")).toBeVisible();
    await expect(page.getByText("활성 사용자")).toBeVisible();
    await expect(page.getByText("등록 자재")).toBeVisible();
    await expect(page.getByText("총 거래")).toBeVisible();
    await expect(page.getByText("미처리 신고")).toBeVisible();

    // Check Period buttons
    await expect(page.getByRole("button", { name: "일" })).toBeVisible();
    await expect(page.getByRole("button", { name: "주" })).toBeVisible();
    await expect(page.getByRole("button", { name: "월" })).toBeVisible();

    // Check CSV Export buttons
    await expect(page.getByRole("button", { name: "사용자 CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "자재 CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "거래 CSV" })).toBeVisible();
  });

  test("4. Navigation — travels across all admin subpages via sidebar", async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem("access_token", token);
    }, adminToken);

    await page.goto("/admin");

    // 1) 사용자 관리
    await page.getByRole("link", { name: "사용자 관리" }).click();
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.getByRole("heading", { name: "사용자 관리" })).toBeVisible();
    await expect(page.getByPlaceholder("이름, 이메일 검색")).toBeVisible();

    // 2) 콘텐츠 모더레이션
    await page.getByRole("link", { name: "콘텐츠 모더레이션" }).click();
    await expect(page).toHaveURL(/\/admin\/moderation/);
    await expect(page.getByRole("heading", { name: "콘텐츠 모더레이션" })).toBeVisible();
    await expect(page.getByText("금칙어 관리")).toBeVisible();

    // 3) 푸시 알림
    await page.getByRole("link", { name: "푸시 알림" }).click();
    await expect(page).toHaveURL(/\/admin\/notifications/);
    await expect(page.getByRole("heading", { name: "푸시 알림" })).toBeVisible();

    // 4) 설정
    await page.getByRole("link", { name: "설정" }).click();
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
    await expect(page.getByText("내 관리자 정보")).toBeVisible();
    await expect(page.getByText("관리자 역할 관리")).toBeVisible();

    // 5) 대시보드로 복귀
    await page.getByRole("link", { name: "대시보드" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();
  });

  test("5. Users Management — search input and status filters work", async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem("access_token", token);
    }, adminToken);

    await page.goto("/admin/users");
    const searchInput = page.getByPlaceholder("이름, 이메일 검색");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("admin@example.com");

    // Status filter buttons
    await expect(page.getByRole("button", { name: "전체" })).toBeVisible();
    await expect(page.getByRole("button", { name: "활성", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "비활성" })).toBeVisible();

    // Row for admin should be visible
    await expect(page.getByRole("cell", { name: "admin@example.com" })).toBeVisible();
  });

  test("6. Push Notifications — form inputs and history section load", async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem("access_token", token);
    }, adminToken);

    await page.goto("/admin/notifications");
    await expect(page.getByRole("heading", { name: "푸시 알림" })).toBeVisible();

    // Target type buttons
    await expect(page.getByRole("button", { name: "전체 사용자" })).toBeVisible();
    await expect(page.getByRole("button", { name: "특정 사용자" })).toBeVisible();
    await expect(page.getByRole("button", { name: "역할별" })).toBeVisible();

    // Title and body inputs
    const titleInput = page.locator("#push-title");
    await expect(titleInput).toBeVisible();
    await titleInput.fill("전체 공지사항 테스트");

    const bodyInput = page.locator("#push-body");
    await expect(bodyInput).toBeVisible();
    await bodyInput.fill("테스트 알림 메시지 본문입니다.");

    // Submit button should be enabled
    await expect(page.getByRole("button", { name: "발송", exact: true })).toBeEnabled();

    // Overview KPIs
    await expect(page.getByText("총 알림")).toBeVisible();
    await expect(page.getByText("미읽음 알림")).toBeVisible();
  });

  test("7. Moderation — tabs and banned words section load", async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem("access_token", token);
    }, adminToken);

    await page.goto("/admin/moderation");

    // Report status tabs
    await expect(page.getByRole("button", { name: /신고 대기/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /처리 완료/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /기각/ })).toBeVisible();

    // Banned words section
    await expect(page.getByText("금칙어 관리")).toBeVisible();
    const bannedWordInput = page.getByPlaceholder("금칙어 입력");
    await expect(bannedWordInput).toBeVisible();
    await expect(page.getByRole("button", { name: "추가" })).toBeVisible();
  });

  test("8. Admin Settings — shows current admin role, operators list & audit logs", async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem("access_token", token);
    }, adminToken);

    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();

    // Current operator card
    await expect(page.getByText("내 관리자 정보")).toBeVisible();
    await expect(page.getByText("admin@example.com").first()).toBeVisible();
    await expect(page.getByText("SUPER_ADMIN").first()).toBeVisible();

    // Operators list & Audit log tables
    await expect(page.getByText("관리자 역할 관리")).toBeVisible();
    await expect(page.getByText("최근 감사 로그")).toBeVisible();
  });
});
