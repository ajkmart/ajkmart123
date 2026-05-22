import {
  createSchemaRegistry,
  type ValidationOptions,
  type SchemaEntry,
  VerifyOtpResponse,
  GetProfileResponse,
  GetProductsResponse,
  GetProductResponse,
  GetOrdersResponse,
  GetOrderResponse,
  GetWalletResponse,
  GetRideResponse,
  EstimateFareResponse,
  GetRideHistoryResponse,
  GetParcelBookingsResponse,
  GetParcelBookingResponse,
  GetCategoriesResponse,
  GetPaymentMethodsResponse,
} from "@workspace/api-zod";

const ENTRIES: SchemaEntry[] = [
  { pattern: /\/auth\/verify-otp/,            schema: VerifyOtpResponse },
  { pattern: /\/auth\/verify-email-otp/,      schema: VerifyOtpResponse },
  { pattern: /\/profile/,                     schema: GetProfileResponse },
  { pattern: /\/products\/[^/?]+$/,           schema: GetProductResponse },
  { pattern: /\/products/,                    schema: GetProductsResponse },
  { pattern: /\/orders\/[^/?]+$/,             schema: GetOrderResponse },
  { pattern: /\/orders/,                      schema: GetOrdersResponse },
  { pattern: /\/wallet/,                      schema: GetWalletResponse },
  { pattern: /\/rides\/history/,              schema: GetRideHistoryResponse },
  { pattern: /\/rides\/[^/?]+$/,              schema: GetRideResponse },
  { pattern: /\/fare\/estimate/,              schema: EstimateFareResponse },
  { pattern: /\/parcel\/bookings\/[^/?]+$/,   schema: GetParcelBookingResponse },
  { pattern: /\/parcel\/bookings/,            schema: GetParcelBookingsResponse },
  { pattern: /\/categories/,                  schema: GetCategoriesResponse },
  { pattern: /\/payment-methods/,             schema: GetPaymentMethodsResponse },
];

/**
 * Build and return a response validator for the customer Expo app.
 *
 * Pass the returned function to `setResponseValidator` so every successful
 * `customFetch` response is checked against its Zod schema automatically.
 *
 * Behaviour by environment:
 *   development — throws `ApiValidationError` on mismatch (caught by error boundary)
 *   production  — `log.warn` only; the raw data is still returned so the
 *                 UI degrades gracefully rather than crashing
 */
export function createCustomerValidator(
  onFailure?: ValidationOptions["onFailure"],
): (path: string, data: unknown) => void {
  return createSchemaRegistry(ENTRIES, { onFailure });
}
