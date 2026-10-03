export interface CurrentUser {
  id: string;
  email?: string;
  name?: string;
  profileImageUrl?: string;
  location?: string;
  trustLevel?: number;
  mannerTemperature?: number;
  role?: string;
  adminRole?: string;
  isSuperuser?: boolean;
}

export interface UserStats {
  materialsSold: number;
  materialsBought: number;
  activeListings: number;
  rating?: number;
  reviews: number;
  wishlistCount: number;
  communityPostsCount: number;
}
