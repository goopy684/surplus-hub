import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useNavigationContainerRef, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  notificationKeys,
  resolveNotificationTarget,
  unregisterDeviceToken,
  useRegisterDeviceToken,
  useUnreadCount,
  type DevicePlatform,
} from "@repo/core";
import { useAuth } from "../contexts/AuthContext";
import { tokenCache } from "../utils/tokenCache";

// Device.isDevice 가드를 통과한 뒤에만 쓰이므로 ios/android 둘 중 하나다.
const PLATFORM: DevicePlatform = Platform.OS === "android" ? "android" : "ios";

// 알림 채널 tint는 네이티브 prop이라 className을 받지 못한다 (ActivityIndicator color와 동일 예외).
// design.md 토큰 `--accent`(= Tailwind `bg-primary`) 미러링 — design.md를 바꾸면 이 값도 같이 바꾼다.
const ACCENT_HEX = "#ed701d";

// 로그아웃 해제 DELETE가 실패했을 때 남기는 기록. SecureStore는 tokenCache로 이미 쓰고 있어 그대로 재사용한다.
const PENDING_UNREGISTER_KEY = "pending_push_unregister";

// 모듈 전역 — 재렌더·재마운트 모두에서 같은 토큰을 다시 POST하지 않기 위한 기록.
let registeredToken: string | null = null;
// 메시지별로 한 번씩 남긴다. 래치를 하나만 두면 첫 메시지가 나머지 진단을 전부 삼킨다.
const loggedMessages = new Set<string>();

const logOnce = (message: string) => {
  if (loggedMessages.has(message)) return;
  loggedMessages.add(message);
  console.log(`[push] ${message}`);
};

// 시뮬레이터·권한 거부는 정상 상태라 로그만 남긴다. 여기로 오는 건 푸시가 실제로 죽는 실패뿐이다.
const reportFailure = (message: string, error?: unknown) => {
  logOnce(`${message}${error === undefined ? "" : `: ${String(error)}`}`);
  Sentry.captureException(error instanceof Error ? error : new Error(message), {
    tags: { feature: "push" },
    extra: { reason: message },
  });
};

/**
 * 알림 종류 → 모바일 라우트. 모바일에 커뮤니티 게시글 상세 화면이 없어 post 종류는 갈 곳이 없다(null).
 * 푸시 탭(cold start 포함)과 알림 목록이 같은 규칙을 쓰도록 매핑은 이 한 곳에만 둔다.
 */
export const notificationRoute = (
  input?: Parameters<typeof resolveNotificationTarget>[0]
): `/chat/${string}` | `/material/${string}` | null => {
  const target = resolveNotificationTarget(input);
  if (target?.kind === "chat") return `/chat/${target.id}`;
  if (target?.kind === "material") return `/material/${target.id}`;
  return null;
};

/**
 * cold start(앱이 죽은 상태에서 알림을 탭해 켜진 경우) 응답 처리.
 * 네비게이터가 이동을 받을 수 있게 된 뒤에만 호출해야 하고, 저장된 응답은 이동을 넘긴 다음에 비운다 —
 * 먼저 비우면 이동이 실패했을 때 딥링크를 되살릴 방법이 없다.
 */
export const handleColdStartResponse = (openTarget: (data?: Record<string, unknown>) => void) => {
  let last: Notifications.NotificationResponse | null;
  try {
    last = Notifications.getLastNotificationResponse();
  } catch {
    // 알림 모듈을 쓸 수 없는 환경 — 무시한다.
    return;
  }
  if (!last) return;
  openTarget(last.notification.request.content.data);
  Notifications.clearLastNotificationResponse();
};

// 푸시를 쓸 수 없는 환경(시뮬레이터·권한 거부·projectId 없음)에서는 조용히 null.
const acquireExpoPushToken = async (): Promise<string | null> => {
  if (!Device.isDevice) {
    logOnce("시뮬레이터/에뮬레이터에서는 푸시 토큰을 받을 수 없어 등록을 건너뜁니다.");
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    reportFailure("app.json의 extra.eas.projectId가 없어 푸시 토큰을 발급할 수 없습니다.");
    return null;
  }

  try {
    const current = await Notifications.getPermissionsAsync();
    // iOS는 시스템 권한 요청을 한 번만 띄울 수 있다 — 이미 거부한 사용자에게 다시 묻지 않는다.
    const granted =
      current.granted ||
      (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!granted) {
      logOnce("알림 권한이 없어 푸시 토큰 등록을 건너뜁니다.");
      return null;
    }

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (error) {
    // 앱 사용을 막지는 않지만 이 사용자의 푸시는 죽는다 — 조용히 넘기면 원인을 알 수 없다.
    reportFailure("푸시 토큰 발급 실패", error);
    return null;
  }
};

const flushPendingUnregister = async (token: string): Promise<void> => {
  try {
    await unregisterDeviceToken({ token, platform: PLATFORM });
  } catch (error) {
    // 기록은 남겨둔다 — 다음 로그인의 등록 POST가 토큰 소유권을 옮겨 이전 사용자의 발송을 끊는다.
    reportFailure("푸시 토큰 해제 실패 — 다음 로그인에서 정리합니다", error);
    return;
  }
  await tokenCache.removeToken(PENDING_UNREGISTER_KEY);
};

/**
 * 로그아웃 직전에 호출한다. AuthContext.logout()이 액세스 토큰을 먼저 지우기 때문에
 * isAuthenticated가 false로 바뀐 뒤에 DELETE를 보내면 401이 되고 서버에 토큰이 남는다.
 *
 * 해제에 실패하면 서버는 이전 사용자의 푸시를 계속 이 기기로 보낸다 — 채팅 본문 미리보기까지.
 * (서버가 토큰을 비활성화하는 건 Expo가 DeviceNotRegistered를 줄 때, 즉 앱을 삭제했을 때뿐이다.)
 * 그래서 실패를 삼키지 않고 SecureStore에 남겨 다음 등록 시점에 반드시 정리되게 한다.
 */
export const unregisterPushTokenBeforeLogout = async (): Promise<void> => {
  const token = registeredToken;
  if (!token) return;
  registeredToken = null;
  // 이전 사용자의 미읽음 수가 앱 아이콘에 남지 않게 지운다.
  void Notifications.setBadgeCountAsync(0).catch(() => {
    // 배지를 지원하지 않는 런처/플랫폼 — 무시한다.
  });
  // DELETE보다 먼저 적어야 실패해도 흔적이 남는다.
  await tokenCache.saveToken(PENDING_UNREGISTER_KEY, token);
  await flushPendingUnregister(token);
};

export function usePushNotifications(): void {
  const router = useRouter();
  const navigationRef = useNavigationContainerRef();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { mutateAsync: registerToken } = useRegisterDeviceToken();
  const { data: unreadCount } = useUnreadCount();
  // expo-router는 네비게이터가 focus 리스너를 등록한 뒤에만 이동을 받는다
  // (global-state/store.js: `isReady = () => listeners.focus[0] != null`).
  // 그전에 push()하면 큐에 쌓인 액션이 앱 트리 밖 effect에서 던져 Sentry.wrap으로도 못 잡는다.
  const [isNavigatorReady, setNavigatorReady] = useState(() => navigationRef.isReady());

  useEffect(() => {
    if (isNavigatorReady) return;
    // 렌더 시점에는 ref가 아직 붙지 않았을 수 있고, 자식(AppStack)의 effect가 먼저 돌아
    // 이 effect에 도달했을 때 이미 준비된 경우도 있다 — 여기서 한 번 더 본다.
    if (navigationRef.isReady()) {
      setNavigatorReady(true);
      return;
    }
    // 컨테이너 마운트 전에 등록한 리스너는 navigationRef가 버퍼링해 마운트 시점에 붙여준다.
    return navigationRef.addListener("state", () => {
      if (navigationRef.isReady()) setNavigatorReady(true);
    });
  }, [isNavigatorReady, navigationRef]);

  const openTarget = useCallback(
    (data?: Record<string, unknown>) => {
      // 푸시 payload의 data는 타입이 보장되지 않아 문자열로 좁힌다 (리졸버가 빈 값을 null로 처리).
      const route = notificationRoute({
        referenceType: String(data?.referenceType ?? ""),
        referenceId: String(data?.referenceId ?? ""),
      });
      // 갈 곳이 없는 종류(커뮤니티 게시글)는 알림 목록으로 보낸다.
      router.push(route ?? "/notifications");
    },
    [router]
  );

  // 채널 생성 · 리스너 (인증과 무관하게 마운트 1회)
  useEffect(() => {
    if (Platform.OS === "android") {
      // 백엔드가 channelId "default"로 보내므로 이름이 정확히 일치해야 한다.
      void Notifications.setNotificationChannelAsync("default", {
        name: "기본 알림",
        importance: Notifications.AndroidImportance.MAX,
        lightColor: ACCENT_HEX,
      }).catch(() => {
        // 채널 생성 실패 시 OS 기본 채널로 표시된다.
      });
    }

    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      // 프리픽스 무효화 — 목록과 미읽음 카운트가 모두 ["notifications"] 아래에 있다.
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      openTarget(response.notification.request.content.data);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [openTarget, queryClient]);

  // 앱이 종료된 상태에서 알림을 탭해 켜진 경우(cold start)도 딥링크한다.
  // 네비게이터가 이동을 받을 수 있게 된 뒤에만 저장된 응답을 소비한다.
  useEffect(() => {
    if (!isNavigatorReady) return;
    handleColdStartResponse(openTarget);
  }, [isNavigatorReady, openTarget]);

  // 배지 = 서버 미읽음 수. 푸시 payload의 badge와 같은 값이라 포그라운드 복귀 후에도 어긋나지 않는다.
  useEffect(() => {
    if (unreadCount === undefined) return;
    void Notifications.setBadgeCountAsync(unreadCount).catch(() => {
      // 배지를 지원하지 않는 런처/플랫폼 — 무시한다.
    });
  }, [unreadCount]);

  // 로그인 상태에서만 서버에 토큰을 등록한다.
  useEffect(() => {
    if (!isAuthenticated) return;

    const register = async () => {
      // 이미 등록했으면 포그라운드마다 Expo 토큰 발급 요청(네트워크)을 다시 보내지 않는다.
      if (registeredToken) return;
      const token = await acquireExpoPushToken();
      if (!token || token === registeredToken) return;
      registeredToken = token;
      // 실기기 수동 검증용 — 이 토큰으로 exp.host에 테스트 발송을 넣는다. 릴리스 빌드에는 찍히지 않는다.
      if (__DEV__) console.log(`[push] ExponentPushToken: ${token}`);
      try {
        await registerToken({ token, platform: PLATFORM });
      } catch (error) {
        // 오프라인이 대부분이라 Sentry로 올리지 않는다 — 아래 포그라운드 복귀에서 다시 시도한다.
        registeredToken = null;
        logOnce(`푸시 토큰 등록 실패: ${String(error)}`);
        return;
      }
      // 서버가 이 토큰의 소유권을 현재 사용자로 옮겼다 — 밀린 해제 기록은 목적을 달성했다.
      await tokenCache.removeToken(PENDING_UNREGISTER_KEY);
    };

    void register();

    // 권한 요청은 토큰 발급 경로에만 있다. OS 설정에서 알림을 켜고 돌아온 사용자를 여기서
    // 다시 시도하지 않으면 앱을 완전히 재시작할 때까지 토큰이 등록되지 않는다.
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void register();
      // 배지가 서버 미읽음 수를 따라가도록 복귀할 때마다 다시 읽는다.
      void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    });

    return () => appStateSub.remove();
  }, [isAuthenticated, queryClient, registerToken]);
}
