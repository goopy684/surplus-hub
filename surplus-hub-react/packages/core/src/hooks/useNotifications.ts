import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
  UseMutationResult,
} from "@tanstack/react-query";
import {
  fetchNotificationPreferences,
  fetchNotifications,
  fetchUnreadCount,
  markAllAsRead,
  markAsRead,
  registerDeviceToken,
  unregisterDeviceToken,
  updateNotificationPreferences,
} from "../api";
import {
  DeviceTokenPayload,
  NotificationPreferences,
  NotificationsResponse,
} from "../types";

export const notificationKeys = {
  all: ["notifications"] as const,
  lists: () => ["notifications", "list"] as const,
  list: (params?: { page?: number; limit?: number }) =>
    ["notifications", "list", params ?? {}] as const,
  unreadCount: () => ["notifications", "unread-count"] as const,
  preferences: () => ["notifications", "preferences"] as const,
};

export const useNotifications = (
  params?: { page?: number; limit?: number }
): UseQueryResult<NotificationsResponse> => {
  return useQuery<NotificationsResponse>({
    queryKey: notificationKeys.list(params),
    queryFn: () => fetchNotifications(params),
  });
};

export const useUnreadCount = (): UseQueryResult<number> => {
  return useQuery<number>({
    queryKey: notificationKeys.unreadCount(),
    queryFn: fetchUnreadCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
};

export const useMarkNotificationRead = (): UseMutationResult<void, Error, string> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
};

export const useMarkAllNotificationsRead = (): UseMutationResult<void, Error, void> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
};

export const useNotificationPreferences = (): UseQueryResult<NotificationPreferences> => {
  return useQuery<NotificationPreferences>({
    queryKey: notificationKeys.preferences(),
    queryFn: fetchNotificationPreferences,
  });
};

export const useUpdateNotificationPreferences = (): UseMutationResult<
  NotificationPreferences,
  Error,
  Partial<NotificationPreferences>
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) =>
      updateNotificationPreferences(patch),
    onSuccess: (data) => {
      queryClient.setQueryData(notificationKeys.preferences(), data);
    },
  });
};

export const useRegisterDeviceToken = (): UseMutationResult<
  void,
  Error,
  DeviceTokenPayload
> => {
  return useMutation({
    mutationFn: (payload: DeviceTokenPayload) => registerDeviceToken(payload),
  });
};

export const useUnregisterDeviceToken = (): UseMutationResult<
  void,
  Error,
  DeviceTokenPayload
> => {
  return useMutation({
    mutationFn: (payload: DeviceTokenPayload) => unregisterDeviceToken(payload),
  });
};
