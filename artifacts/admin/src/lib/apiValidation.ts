import {
  createSchemaRegistry,
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
} from "@workspace/api-zod";

const ENTRIES: SchemaEntry[] = [
  { pattern: /\/users\/[^/?]+$/, schema: GetProfileResponse },
  { pattern: /\/orders\/[^/?]+$/, schema: GetOrderResponse },
  { pattern: /\/orders/, schema: GetOrdersResponse },
  { pattern: /\/products\/[^/?]+$/, schema: GetProductResponse },
  { pattern: /\/products/, schema: GetProductsResponse },
  { pattern: /\/rides\/[^/?]+$/, schema: GetRideResponse },
  { pattern: /\/wallet/, schema: GetWalletResponse },
  { pattern: /\/categories/, schema: GetCategoriesResponse },
];

/**
 * Build and return a response validator for the admin panel.
 *
 * Pass the returned function to `initAdminApiValidation()` exported from
 * `adminFetcher.tsx` so every `fetchAdmin` / `fetchAdminAbsolute` response is
 * validated against its Zod schema.
 *
 * Behaviour by environment:
 *   development — throws `ApiValidationError` (surface the mismatch immediately)
 *   production  — `log.warn` only; raw data is returned so the UI still works
 */
export function createAdminValidator(
  onFailure?: ValidationOptions["onFailure"]
): (path: string, data: unknown) => void {
  return createSchemaRegistry(ENTRIES, { onFailure });
}
