/**
 * Shared fee/tax calculation utilities for all order types.
 *
 * Centralises delivery fee, GST, and COD-fee logic that was previously
 * duplicated across orders.ts, parcel.ts, and pharmacy.ts.
 * Ride-hailing fare is intentionally isolated in rides.ts.
 */

export type ServiceType = "mart" | "food" | "pharmacy" | "parcel" | string;

export interface FeeBreakdown {
  deliveryFee: number;
  gstAmount: number;
  codFee: number;
  total: number;
}

const DELIVERY_FEE_KEY: Record<string, string> = {
  mart: "delivery_fee_mart",
  food: "delivery_fee_food",
  pharmacy: "delivery_fee_pharmacy",
  parcel: "delivery_fee_parcel",
};

/**
 * Calculate delivery fee for non-parcel service types.
 *
 * @param s            Flat platform settings map
 * @param type         Service type (mart | food | pharmacy | parcel)
 * @param itemsTotal   Sum of (price × qty) before fees
 * @param weightKg     Parcel weight in kg (only used when type === "parcel")
 */
export function calcDeliveryFee(
  s: Record<string, string>,
  type: ServiceType,
  itemsTotal: number,
  weightKg = 0
): number {
  const feeKey = DELIVERY_FEE_KEY[type] ?? "delivery_fee_mart";
  const baseFee = parseFloat(s[feeKey] ?? "80");

  let rawFee = baseFee;
  if (type === "parcel") {
    const perKgRate = parseFloat(s["delivery_parcel_per_kg"] ?? "40");
    rawFee = baseFee + Math.round(Math.max(0, weightKg) * perKgRate);
  }

  const freeEnabled = (s["delivery_free_enabled"] ?? "on") === "on";
  const freeAbove = parseFloat(s["free_delivery_above"] ?? "1000");
  return freeEnabled && itemsTotal >= freeAbove ? 0 : rawFee;
}

/**
 * Calculate GST amount on the items subtotal.
 */
export function calcGst(s: Record<string, string>, itemsTotal: number): number {
  const gstEnabled = (s["finance_gst_enabled"] ?? "off") === "on";
  const gstPct = parseFloat(s["finance_gst_pct"] ?? "17");
  return gstEnabled ? parseFloat(((itemsTotal * gstPct) / 100).toFixed(2)) : 0;
}

/**
 * Calculate the COD service fee.
 *
 * @param s             Platform settings map
 * @param paymentMethod The selected payment method
 * @param orderTotal    The total before the COD fee itself (items + delivery + gst)
 */
export function calcCodFee(
  s: Record<string, string>,
  paymentMethod: string,
  orderTotal: number
): number {
  if (paymentMethod !== "cash" && paymentMethod !== "cod") return 0;
  const fee = parseFloat(s["cod_fee_amount"] ?? s["cod_fee"] ?? "0");
  const freeAb = parseFloat(s["cod_free_above"] ?? "2000");
  return fee > 0 && orderTotal < freeAb ? fee : 0;
}

/**
 * Convenience wrapper: compute the full fee breakdown for a standard order.
 *
 * For parcel orders, pass `weightKg` from request body.
 * The returned `total` is the final amount charged to the customer.
 */
export function calcOrderFees(
  s: Record<string, string>,
  type: ServiceType,
  itemsTotal: number,
  paymentMethod: string,
  opts: { weightKg?: number; promoDiscount?: number } = {}
): FeeBreakdown {
  const deliveryFee = calcDeliveryFee(s, type, itemsTotal, opts.weightKg ?? 0);
  const gstAmount = calcGst(s, itemsTotal);
  const subtotal = itemsTotal + deliveryFee + gstAmount;
  const codFee = calcCodFee(s, paymentMethod, subtotal);
  const discount = opts.promoDiscount ?? 0;
  const total = Math.max(0, subtotal + codFee - discount);
  return { deliveryFee, gstAmount, codFee, total };
}
