import type { Banner, RecommendationProduct, WishlistItem } from "@workspace/api-zod";
import { customFetch } from "./custom-fetch";

export type { Banner, RecommendationProduct, WishlistItem };

export const getBanners = async (
  params?: { placement?: string; service?: string },
  options?: RequestInit
): Promise<Banner[]> => {
  const qs = new URLSearchParams();
  if (params?.placement) qs.set("placement", params.placement);
  if (params?.service) qs.set("service", params.service);
  const q = qs.toString();
  const res: { banners?: Banner[] } = await customFetch(`/banners${q ? `?${q}` : ""}`, {
    ...options,
    method: "GET",
  });
  return res.banners ?? [];
};

export const getTrending = async (
  params?: { limit?: number },
  options?: RequestInit
): Promise<RecommendationProduct[]> => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  const res: { recommendations?: RecommendationProduct[]; products?: RecommendationProduct[] } =
    await customFetch(`/recommendations/trending${q ? `?${q}` : ""}`, {
      ...options,
      method: "GET",
    });
  return res.recommendations ?? res.products ?? [];
};

export const getForYou = async (
  params?: { limit?: number },
  options?: RequestInit
): Promise<RecommendationProduct[]> => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  const res: { products?: RecommendationProduct[] } = await customFetch(
    `/recommendations/for-you${q ? `?${q}` : ""}`,
    { ...options, method: "GET" }
  );
  return res.products ?? [];
};

export const getSimilar = async (
  productId: string,
  params?: { limit?: number },
  options?: RequestInit
): Promise<RecommendationProduct[]> => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  const res: { products?: RecommendationProduct[] } = await customFetch(
    `/recommendations/similar/${productId}${q ? `?${q}` : ""}`,
    { ...options, method: "GET" }
  );
  return res.products ?? [];
};

export const trackInteraction = async (
  body: { productId: string; type: "view" | "add_to_cart" | "purchase" | "wishlist" },
  options?: RequestInit
): Promise<any> => {
  return customFetch(`/recommendations/track`, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
  });
};

export const getProductVariants = async (
  productId: string,
  options?: RequestInit
): Promise<any[]> => {
  const res: { variants?: any[] } = await customFetch(`/variants/product/${productId}`, {
    ...options,
    method: "GET",
  });
  return res.variants ?? [];
};

export interface FlashDealProduct {
  id: string;
  name: string;
  price: string;
  originalPrice: string;
  image: string | null;
  category: string | null;
  rating: number | null;
  vendorName: string | null;
  unit: string | null;
  discountPercent: number;
  dealExpiresAt: string;
  dealStock: number | null;
  soldCount: number;
}

export const getFlashDeals = async (
  params?: { limit?: number },
  options?: RequestInit
): Promise<FlashDealProduct[]> => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  const res: { products?: FlashDealProduct[] } = await customFetch(
    `/products/flash-deals${q ? `?${q}` : ""}`,
    { ...options, method: "GET" }
  );
  return res.products ?? [];
};

export interface SearchProductsParams {
  q: string;
  type?: string;
  category?: string;
  sort?: string;
  minPrice?: string;
  maxPrice?: string;
  minRating?: string;
  page?: number;
  perPage?: number;
}

export interface SearchProductsResponse {
  products: Array<{
    id: string;
    name: string;
    price: string;
    image: string | null;
    category: string | null;
    originalPrice?: string;
    rating: number | null;
    vendorName: string | null;
    type: string | null;
  }>;
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export const searchProducts = async (
  params: SearchProductsParams,
  options?: RequestInit
): Promise<SearchProductsResponse> => {
  const qs = new URLSearchParams();
  qs.set("q", params.q);
  if (params.type) qs.set("type", params.type);
  if (params.category) qs.set("category", params.category);
  if (params.sort) qs.set("sort", params.sort);
  if (params.minPrice) qs.set("minPrice", params.minPrice);
  if (params.maxPrice) qs.set("maxPrice", params.maxPrice);
  if (params.minRating) qs.set("minRating", params.minRating);
  if (params.page) qs.set("page", String(params.page));
  if (params.perPage) qs.set("perPage", String(params.perPage));
  const res: SearchProductsResponse = await customFetch(`/products/search?${qs.toString()}`, {
    ...options,
    method: "GET",
  });
  return res;
};

export interface HierarchicalCategory {
  id: string;
  name: string;
  icon: string;
  type: string;
  parentId: string | null;
  sortOrder: number;
  productCount: number;
  children: HierarchicalCategory[];
}

export const getHierarchicalCategories = async (
  params?: { type?: string },
  options?: RequestInit
): Promise<HierarchicalCategory[]> => {
  const qs = new URLSearchParams();
  if (params?.type) qs.set("type", params.type);
  const q = qs.toString();
  const res: { categories?: HierarchicalCategory[] } = await customFetch(
    `/categories${q ? `?${q}` : ""}`,
    { ...options, method: "GET" }
  );
  return res.categories ?? [];
};

export const getTrendingSearches = async (
  params?: { limit?: number },
  options?: RequestInit
): Promise<string[]> => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  const res: { searches?: string[] } = await customFetch(
    `/products/trending-searches${q ? `?${q}` : ""}`,
    { ...options, method: "GET" }
  );
  return res.searches ?? [];
};

export const getWishlist = async (options?: RequestInit): Promise<WishlistItem[]> => {
  const res: { items?: WishlistItem[] } = await customFetch(`/wishlist`, {
    ...options,
    method: "GET",
  });
  return res.items ?? [];
};

export const addToWishlist = async (
  productId: string,
  options?: RequestInit
): Promise<{ success: boolean; id: string }> => {
  return customFetch(`/wishlist`, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify({ productId }),
  });
};

export const removeFromWishlist = async (
  productId: string,
  options?: RequestInit
): Promise<{ success: boolean }> => {
  return customFetch(`/wishlist/${productId}`, { ...options, method: "DELETE" });
};

export const checkWishlist = async (productId: string, options?: RequestInit): Promise<boolean> => {
  const res: { inWishlist?: boolean } = await customFetch(`/wishlist/check/${productId}`, {
    ...options,
    method: "GET",
  });
  return res.inWishlist ?? false;
};

export interface ProductReview {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string | null;
  photos: string[];
  createdAt: string;
  vendorReply: string | null;
  vendorRepliedAt: string | null;
}

export interface ProductReviewsResponse {
  reviews: ProductReview[];
  total: number;
  page: number;
  pages: number;
}

export const getProductReviews = async (
  productId: string,
  params?: { page?: number; limit?: number },
  options?: RequestInit
): Promise<ProductReviewsResponse> => {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return customFetch(`/reviews/product/${productId}${q ? `?${q}` : ""}`, {
    ...options,
    method: "GET",
  });
};

export interface ReviewSummary {
  average: number;
  total: number;
  distribution: Record<number, number>;
}

export const getProductReviewSummary = async (
  productId: string,
  options?: RequestInit
): Promise<ReviewSummary> => {
  return customFetch(`/reviews/product/${productId}/summary`, { ...options, method: "GET" });
};

export const checkCanReviewProduct = async (
  productId: string,
  options?: RequestInit
): Promise<{ canReview: boolean; hasPurchased: boolean; alreadyReviewed: boolean }> => {
  return customFetch(`/reviews/can-review/${productId}`, { ...options, method: "GET" });
};

export const submitProductReview = async (
  body: {
    orderId?: string;
    orderType: string;
    rating: number;
    comment?: string;
    productId?: string;
    photos?: string[];
  },
  options?: RequestInit
): Promise<Record<string, unknown>> => {
  return customFetch(`/reviews`, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
  });
};

export const uploadImage = async (
  file: string,
  mimeType?: string,
  options?: RequestInit
): Promise<{ url: string }> => {
  return customFetch(`/uploads`, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify({ file, mimeType: mimeType || "image/jpeg" }),
  });
};

export const subscribeStockNotify = async (
  productId: string,
  options?: RequestInit
): Promise<{ subscribed: boolean }> => {
  return customFetch(`/products/${productId}/notify-me`, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
};

export const unsubscribeStockNotify = async (
  productId: string,
  options?: RequestInit
): Promise<{ subscribed: boolean }> => {
  return customFetch(`/products/${productId}/notify-me`, {
    ...options,
    method: "DELETE",
    headers: { ...options?.headers },
  });
};

export const checkStockNotifySubscription = async (
  productId: string,
  options?: RequestInit
): Promise<{ subscribed: boolean }> => {
  return customFetch(`/products/${productId}/notify-me`, {
    ...options,
    method: "GET",
  });
};
