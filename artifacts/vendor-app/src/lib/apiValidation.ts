import {
  createSchemaRegistry,
  EstimateFareResponse,
  GetCategoriesResponse,
  GetOrderResponse,
  GetOrdersResponse,
  GetProductResponse,
  GetProductsResponse,
  GetProfileResponse,
  GetRideResponse,
  GetWalletResponse,
  type SchemaEntry,
  type ValidationOptions,
  VerifyOtpResponse,
} from "@workspace/api-zod";

const ENTRIES: SchemaEntry[] = [
  { pattern: /\/auth\/verify-otp/, schema: VerifyOtpResponse },
  { pattern: /\/auth\/verify-email-otp/, schema: VerifyOtpResponse },
  { pattern: /\/vendor\/me$/, schema: GetProfileResponse },
  { pattern: /\/vendor\/orders\/[^/?]+$/, schema: GetOrderResponse },
  { pattern: /\/vendor\/orders/, schema: GetOrdersResponse },
  { pattern: /\/vendor\/products\/[^/?]+$/, schema: GetProductResponse },
  { pattern: /\/vendor\/products/, schema: GetProductsResponse },
  { pattern: /\/wallet/, schema: GetWalletResponse },
  { pattern: /\/rides\/[^/?]+$/, schema: GetRideResponse },
  { pattern: /\/fare\/estimate/, schema: EstimateFareResponse },
  { pattern: /\/categories/, schema: GetCategoriesResponse },
];

/**
 * Build and return a response validator for the vendor app.
 *
 * Pass the returned function to `initApiValidation()` exported from `api.ts`
 * so every successful `apiFetch` response is validated against its Zod schema.
 *
 * Behaviour by environment:
 *   development — throws `ApiValidationError` (surface the mismatch immediately)
 *   production  — `log.warn` only; raw data is returned so the UI still works
 */
export function createVendorValidator(
  onFailure?: ValidationOptions["onFailure"]
): (path: string, data: unknown) => void {
  return createSchemaRegistry(ENTRIES, { onFailure });
}
