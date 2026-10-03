/**
 * node assert 자체 점검. 모바일 앱에는 테스트 러너가 없어(그리고 새로 넣지 않는다) 직접 돌린다.
 *
 *   cd apps/mobile && node hooks/usePushNotifications.test.js
 *
 * 네이티브 모듈만 스텁으로 막고, 검증 대상인 @repo/core 리졸버는 실물을 그대로 쓴다.
 * React 렌더러가 없어 훅 자체(effect 순서·네비게이터 준비 대기)는 여기서 다루지 못한다 —
 * 순수 로직인 라우트 매핑과 cold start 응답 소비 순서만 검증한다.
 *
 * ── 실기기 수동 검증 (아직 하지 않았다. EAS 빌드 + 실물 기기가 필요하다) ────────────────
 * 1) 빌드
 *      cd apps/mobile
 *      npx eas build --profile preview    --platform ios       # 릴리스 성격 (aps-environment=production)
 *      npx eas build --profile development --platform ios      # 개발 클라이언트 (aps-environment=development)
 * 2) aps-environment 확인
 *    - 빌드 전 드라이런:
 *        APS_ENVIRONMENT=production npx expo config --type introspect --json
 *        → ios.entitlements["aps-environment"] === "production" (env 없이 돌리면 "development")
 *    - 빌드 산출물: .ipa를 unzip한 뒤
 *        codesign -d --entitlements :- "Payload/자투리.app" | grep aps-environment
 *      → <string>production</string> 이어야 한다. development면 프로덕션 푸시가 전부 조용히 죽는다.
 * 3) 토큰 읽기 — 기기에 설치·로그인하고 `npx expo start --dev-client` 로그(또는 Console.app / adb logcat)에서
 *      [push] ExponentPushToken: ExponentPushToken[...]
 *    줄을 찾는다. 실패했다면 그 자리에 원인이 찍히고 Sentry에도 올라간다.
 * 4) 테스트 발송
 *      curl -X POST https://exp.host/--/api/v2/push/send -H 'Content-Type: application/json' -d '{
 *        "to":"ExponentPushToken[...]","title":"테스트","body":"본문","badge":3,"channelId":"default",
 *        "data":{"referenceType":"chat_room","referenceId":"1"}}'
 *    - 앱을 완전히 종료한 뒤 알림을 탭 → /chat/1 로 들어가야 한다 (cold start 딥링크).
 *      단, EXPO_PUBLIC_DEV_AUTH_BYPASS는 끈 상태로 확인해야 한다. 켜져 있으면 AppStack이
 *      첫 렌더에 붙어 네비게이터 대기 경로를 지나친다.
 *    - 앱 아이콘 배지가 3으로 바뀌고, 포그라운드 복귀 후에도 서버 미읽음 수와 같아야 한다.
 * 5) 응답의 details.error가 DeviceNotRegistered / BadDeviceToken이면 2)의 엔타이틀먼트를 다시 본다.
 */
const assert = require("node:assert/strict");
const Module = require("node:module");

require("ts-node").register({
  transpileOnly: true,
  skipProject: true,
  compilerOptions: {
    module: "commonjs",
    moduleResolution: "node10",
    ignoreDeprecations: "6.0",
    target: "es2020",
    esModuleInterop: true,
  },
});

// --- 스텁 -------------------------------------------------------------------
const calls = [];
let coldStartResponse = null;

const notificationsStub = {
  getLastNotificationResponse: () => {
    calls.push("get");
    return coldStartResponse;
  },
  clearLastNotificationResponse: () => {
    calls.push("clear");
  },
  setBadgeCountAsync: async () => {},
  setNotificationChannelAsync: async () => {},
  addNotificationReceivedListener: () => ({ remove() {} }),
  addNotificationResponseReceivedListener: () => ({ remove() {} }),
  getPermissionsAsync: async () => ({ granted: false, canAskAgain: false }),
  requestPermissionsAsync: async () => ({ granted: false }),
  getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[stub]" }),
  AndroidImportance: { MAX: 5 },
};

const STUBS = {
  "react-native": {
    AppState: { addEventListener: () => ({ remove() {} }) },
    Platform: { OS: "ios" },
  },
  "expo-constants": { default: { expoConfig: { extra: {} } } },
  "expo-device": { isDevice: false },
  "expo-notifications": notificationsStub,
  "expo-router": { useRouter: () => ({}), useNavigationContainerRef: () => ({}) },
  "expo-secure-store": {
    getItemAsync: async () => null,
    setItemAsync: async () => {},
    deleteItemAsync: async () => {},
  },
  "@sentry/react-native": { captureException() {} },
};

const originalLoad = Module._load;
Module._load = function (request) {
  if (Object.prototype.hasOwnProperty.call(STUBS, request)) return STUBS[request];
  // .tsx라 ts-node 확장 등록 없이는 못 읽고, 이 테스트와도 무관하다.
  if (request.endsWith("contexts/AuthContext")) return { useAuth: () => ({ isAuthenticated: false }) };
  return originalLoad.apply(this, arguments);
};

const { notificationRoute, handleColdStartResponse } = require("./usePushNotifications.ts");

// --- 라우트 매핑 (푸시 탭과 알림 목록이 같은 규칙을 써야 한다) ----------------
// 아래 네 가지는 예전 알림 목록 화면이 `referenceType === "chat_room"`만 보고 있어 갈라졌던 값들이다.
assert.equal(notificationRoute({ referenceType: "chat_room", referenceId: 5 }), "/chat/5");
assert.equal(notificationRoute({ referenceType: "CHAT_ROOM", referenceId: "5" }), "/chat/5");
assert.equal(notificationRoute({ referenceType: " chatroom ", referenceId: "5" }), "/chat/5");
assert.equal(notificationRoute({ referenceType: "chat", referenceId: "5" }), "/chat/5");

assert.equal(notificationRoute({ referenceType: "material", referenceId: 7 }), "/material/7");
assert.equal(notificationRoute({ referenceType: " MATERIAL ", referenceId: "7" }), "/material/7");

// 모바일에 커뮤니티 게시글 상세 라우트가 없다 — 죽은 라우트로 밀지 않고 null.
assert.equal(notificationRoute({ referenceType: "post", referenceId: "9" }), null);
assert.equal(notificationRoute({ referenceType: "community", referenceId: "9" }), null);

// 리졸버가 거르는 값들.
assert.equal(notificationRoute({ referenceType: "chat_room" }), null);
assert.equal(notificationRoute({ referenceType: "chat_room", referenceId: "0" }), null);
assert.equal(notificationRoute({ referenceType: "chat_room", referenceId: "abc" }), null);
assert.equal(notificationRoute({ referenceType: "unknown", referenceId: "5" }), null);
assert.equal(notificationRoute(), null);
// roomId 폴백은 없다 — roomId를 보내는 발송 경로는 같은 호출에서 reference_id도 채운다.
assert.equal(notificationRoute({ roomId: 5 }), null);

// --- cold start 응답 소비 순서 ----------------------------------------------
const response = (data) => ({ notification: { request: { content: { data } } } });

// 저장된 응답이 없으면 아무것도 지우지 않는다.
calls.length = 0;
coldStartResponse = null;
handleColdStartResponse(() => calls.push("open"));
assert.deepEqual(calls, ["get"]);

// 이동을 넘긴 뒤에 지운다. 먼저 지우면 이동이 실패했을 때 딥링크가 사라진다.
calls.length = 0;
coldStartResponse = response({ referenceType: "chat_room", referenceId: "5" });
let seen;
handleColdStartResponse((data) => {
  calls.push("open");
  seen = data;
});
assert.deepEqual(calls, ["get", "open", "clear"]);
assert.equal(notificationRoute(seen), "/chat/5");

// 이동이 던지면 저장된 응답은 남아 있어야 한다.
calls.length = 0;
assert.throws(() =>
  handleColdStartResponse(() => {
    calls.push("open");
    throw new Error("navigator not ready");
  })
);
assert.deepEqual(calls, ["get", "open"]);

Module._load = originalLoad;
console.log("ok — usePushNotifications 라우트 매핑 · cold start 소비 순서");
