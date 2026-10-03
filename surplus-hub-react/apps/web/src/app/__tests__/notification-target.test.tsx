import { resolveNotificationTarget } from "@repo/core";

describe("resolveNotificationTarget", () => {
  it("maps every recognized referenceType and alias", () => {
    expect(resolveNotificationTarget({ referenceType: "chat_room", referenceId: "1" })).toEqual({
      kind: "chat",
      id: "1",
    });
    expect(resolveNotificationTarget({ referenceType: "chatroom", referenceId: "1" })).toEqual({
      kind: "chat",
      id: "1",
    });
    expect(resolveNotificationTarget({ referenceType: "chat", referenceId: "1" })).toEqual({
      kind: "chat",
      id: "1",
    });
    expect(resolveNotificationTarget({ referenceType: "material", referenceId: "2" })).toEqual({
      kind: "material",
      id: "2",
    });
    expect(resolveNotificationTarget({ referenceType: "post", referenceId: "3" })).toEqual({
      kind: "post",
      id: "3",
    });
    expect(resolveNotificationTarget({ referenceType: "community", referenceId: "3" })).toEqual({
      kind: "post",
      id: "3",
    });
  });

  it("is case-insensitive", () => {
    expect(resolveNotificationTarget({ referenceType: "CHAT_ROOM", referenceId: "7" })).toEqual({
      kind: "chat",
      id: "7",
    });
  });

  it("always returns the id as a string", () => {
    const target = resolveNotificationTarget({ referenceType: "material", referenceId: 42 });
    expect(target).toEqual({ kind: "material", id: "42" });
    expect(typeof target?.id).toBe("string");
  });

  // reference id는 전부 양의 정수 DB id다. 그 밖의 값은 죽은 라우트가 되므로 목록으로 폴백해야 한다.
  it("returns null for ids that are not positive integers", () => {
    expect(
      resolveNotificationTarget({ referenceType: "material", referenceId: Number.NaN })
    ).toBeNull();
    expect(resolveNotificationTarget({ referenceType: "material", referenceId: -5 })).toBeNull();
    expect(resolveNotificationTarget({ referenceType: "material", referenceId: 1.5 })).toBeNull();
    expect(
      resolveNotificationTarget({ referenceType: "post", referenceId: "../../admin" })
    ).toBeNull();
    // 1e21은 "1e+21"로 문자열화되어 그대로 URL에 박힌다.
    expect(resolveNotificationTarget({ referenceType: "material", referenceId: 1e21 })).toBeNull();
    expect(resolveNotificationTarget({ referenceType: "chat", referenceId: "7" })).toEqual({
      kind: "chat",
      id: "7",
    });
  });

  it("returns null for unknown type, blank/missing/zero id, and null input", () => {
    expect(resolveNotificationTarget({ referenceType: "review", referenceId: "1" })).toBeNull();
    expect(resolveNotificationTarget({ referenceType: "material" })).toBeNull();
    expect(resolveNotificationTarget({ referenceType: "material", referenceId: "" })).toBeNull();
    expect(resolveNotificationTarget({ referenceType: "material", referenceId: 0 })).toBeNull();
    expect(resolveNotificationTarget(null)).toBeNull();
    expect(resolveNotificationTarget(undefined)).toBeNull();
  });
});
