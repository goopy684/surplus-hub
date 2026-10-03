import { CurrentUser, UserStats } from "../types";
import { apiClient, unwrapApiData } from "./client";

const readNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }
  return fallback;
};

const readRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

// design.md 정직성 규칙: 지어낸 지표 금지. API가 주지 않는 값은 undefined로 두어
// 화면이 조건부로 숨길 수 있게 한다 (기본값을 주입하면 가짜 수치가 항상 렌더된다).
const readOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
};

const mapCurrentUser = (raw: Record<string, unknown>): CurrentUser => ({
  id: String(raw.id ?? ""),
  email: readString(raw.email),
  name: readString(raw.name),
  profileImageUrl: readString(raw.profileImageUrl ?? raw.profile_image_url),
  location: readString(raw.location),
  trustLevel: readOptionalNumber(raw.trustLevel ?? raw.trust_level),
  mannerTemperature: readOptionalNumber(raw.mannerTemperature ?? raw.manner_temperature),
  role: readString(raw.role),
  adminRole: readString(raw.adminRole ?? raw.admin_role),
  isSuperuser: Boolean(raw.isSuperuser ?? raw.is_superuser),
});

const fetchCurrentUserRaw = async (): Promise<Record<string, unknown>> => {
  const response = await apiClient.get("/api/v1/users/me");
  return unwrapApiData<Record<string, unknown>>(response.data);
};

export const fetchCurrentUser = async (): Promise<CurrentUser> => {
  return mapCurrentUser(await fetchCurrentUserRaw());
};

export interface UserUpdateData {
  name?: string;
  location?: string;
  profile_image_url?: string;
}

export const updateProfile = async (data: UserUpdateData): Promise<CurrentUser> => {
  const response = await apiClient.put("/api/v1/users/me", data);
  return mapCurrentUser(readRecord(unwrapApiData<unknown>(response.data)));
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const fetchUserStats = async (_userId: string): Promise<UserStats> => {
  const userData = await fetchCurrentUserRaw();
  const stats = readRecord(userData.stats);

  return {
    materialsSold: readNumber(stats.salesCount ?? stats.materialsSold, 0),
    materialsBought: readNumber(stats.purchaseCount ?? stats.materialsBought, 0),
    activeListings: readNumber(stats.activeListings, 0),
    // 서버가 평점을 주지 않으면 undefined. (이전에는 매너온도/20으로 평점을 만들어냈다)
    rating: readOptionalNumber(stats.rating),
    reviews: readNumber(stats.reviewCount ?? stats.reviews, 0),
    wishlistCount: readNumber(stats.wishlistCount ?? stats.wishlist_count, 0),
    communityPostsCount: readNumber(stats.communityPostsCount ?? stats.community_posts_count, 0),
  };
};
