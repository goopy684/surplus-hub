import { apiClient, fetchNotifications, resolveNotificationTarget } from "@repo/core";

// 매퍼(mapNotification)는 내부 함수라 @repo/core를 목하지 않고 apiClient만 가로챈다.
// 백엔드 reference_id는 Optional[int]라 와이어에는 숫자로 실려 온다.
const mockGet = jest.spyOn(apiClient, "get") as unknown as jest.Mock;

const respondWith = (item: Record<string, unknown>) =>
  mockGet.mockResolvedValue({
    data: {
      status: "success",
      data: [
        {
          id: 1,
          notification_type: "COMMUNITY",
          title: "새 댓글",
          message: "댓글이 달렸습니다",
          is_read: false,
          created_at: "2026-08-03T00:00:00Z",
          ...item,
        },
      ],
    },
  });

afterEach(() => {
  mockGet.mockReset();
});

describe("fetchNotifications → resolveNotificationTarget 연결", () => {
  it("숫자 referenceId를 문자열로 정규화해 타깃까지 이어진다", async () => {
    respondWith({ referenceType: "post", referenceId: 42 });

    const [notification] = (await fetchNotifications()).data;

    expect(notification?.referenceId).toBe("42");
    expect(resolveNotificationTarget(notification)).toEqual({ kind: "post", id: "42" });
  });

  it("snake_case reference_id도 동일하게 처리한다", async () => {
    respondWith({ reference_type: "chat_room", reference_id: 7 });

    const [notification] = (await fetchNotifications()).data;

    expect(notification?.referenceId).toBe("7");
    expect(resolveNotificationTarget(notification)).toEqual({ kind: "chat", id: "7" });
  });

  it("reference_id가 null이면 필드를 비우고 타깃도 없다", async () => {
    respondWith({ reference_type: "material", reference_id: null });

    const [notification] = (await fetchNotifications()).data;

    expect(notification?.referenceId).toBeUndefined();
    expect(resolveNotificationTarget(notification)).toBeNull();
  });
});
