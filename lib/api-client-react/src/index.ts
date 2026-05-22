// Generated API types & hooks — run `pnpm orval` to regenerate from the OpenAPI spec.
// If this file is absent after a fresh clone, run `node scripts/ensure-generated-stub.mjs`
// from the lib/api-client-react directory to create an empty stub, then re-run orval.
export { CircuitOpenError, createCircuitBreaker } from "./circuitBreaker";
export type { ApiCircuitBreaker, CircuitBreakerConfig } from "./circuitBreaker";
export { FetchTimeoutError, RefreshError, createApiFetcher } from "./createApiFetcher";
export type {
  CoreFetch,
  CoreFetchOpts,
  CreateApiFetcherConfig,
  RefreshResult,
} from "./createApiFetcher";
export {
  customFetch,
  setAuthTokenGetter,
  setBaseUrl,
  setMaxRetryAttempts,
  setOnApiError,
  setOnTokenRefreshed,
  setOnUnauthorized,
  setRefreshTokenGetter,
  setRetryBackoffBaseMs,
} from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
export {
  addToWishlist,
  checkCanReviewProduct,
  checkStockNotifySubscription,
  checkWishlist,
  getBanners,
  getFlashDeals,
  getForYou,
  getHierarchicalCategories,
  getProductReviewSummary,
  getProductReviews,
  getProductVariants,
  getSimilar,
  getTrending,
  getTrendingSearches,
  getWishlist,
  removeFromWishlist,
  searchProducts,
  submitProductReview,
  subscribeStockNotify,
  trackInteraction,
  unsubscribeStockNotify,
  uploadImage,
} from "./discovery";
export type {
  Banner,
  FlashDealProduct,
  HierarchicalCategory,
  ProductReview,
  ProductReviewsResponse,
  RecommendationProduct,
  ReviewSummary,
  SearchProductsParams,
  SearchProductsResponse,
  WishlistItem,
} from "./discovery";
export * from "./generated/api";
export * from "./generated/api.schemas";
export { queryClient } from "./queryClient";
export { createResilientFetcher } from "./resilience";
export type { ResilientFetcher, ResilientFetcherConfig } from "./resilience";
export { getDispatchStatus, rateRide, retryRideDispatch } from "./ride-dispatch";
