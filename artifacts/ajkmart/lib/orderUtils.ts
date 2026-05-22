import type { TranslationKey } from "@workspace/i18n";
import Colors from "@/constants/colors";
export {
  ORDER_VALID_STATUSES, RIDE_VALID_STATUSES, PARCEL_VALID_STATUSES, PHARMACY_ORDER_VALID_STATUSES,
  type OrderStatus, type RideStatus, type ParcelStatus, type PharmacyOrderStatus,
  getSocketRoom,
} from "@workspace/service-constants";


export type StatusConfig = {
  color: string;
  bg: string;
  icon: string;
  labelKey: TranslationKey;
};

export const ORDER_STATUS_MAP: Record<string, StatusConfig> = {
  pending:          { color: Colors.light.amber, bg: Colors.light.amberSoft, icon: "time-outline",                  labelKey: "pending" },
  confirmed:        { color: Colors.light.brandBlue, bg: Colors.light.brandBlueSoft, icon: "checkmark-circle-outline",  labelKey: "confirmed" },
  preparing:        { color: Colors.light.purple, bg: Colors.light.purpleSoft, icon: "flame-outline",               labelKey: "preparing" },
  ready:            { color: Colors.light.indigo, bg: Colors.light.indigoSoft, icon: "bag-check-outline",           labelKey: "readyForPickup" },
  picked_up:        { color: Colors.light.cyan, bg: Colors.light.cyanSoft, icon: "cube-outline",                labelKey: "pickedUp" },
  out_for_delivery: { color: Colors.light.emerald, bg: Colors.light.emeraldSoft, icon: "bicycle-outline",            labelKey: "onTheWay" },
  delivered:        { color: Colors.light.gray, bg: Colors.light.graySoft, icon: "checkmark-done-outline",     labelKey: "delivered" },
  cancelled:        { color: Colors.light.red, bg: Colors.light.redSoft, icon: "close-circle-outline",       labelKey: "cancelled" },
};

export const RIDE_STATUS_MAP: Record<string, StatusConfig> = {
  searching:   { color: Colors.light.amber, bg: Colors.light.amberSoft, icon: "search-outline",             labelKey: "searching" },
  bargaining:  { color: Colors.light.brandBlue, bg: Colors.light.brandBlueSoft, icon: "swap-horizontal-outline",   labelKey: "bargaining" },
  accepted:    { color: Colors.light.brandBlue, bg: Colors.light.brandBlueSoft, icon: "person-outline",             labelKey: "statusAccepted" },
  arrived:     { color: Colors.light.purple, bg: Colors.light.purpleSoft, icon: "location-outline",           labelKey: "arrived" },
  in_transit:  { color: Colors.light.emerald, bg: Colors.light.emeraldSoft, icon: "car-outline",                labelKey: "inTransit" },
  ongoing:     { color: Colors.light.brandBlue, bg: Colors.light.brandBlueSoft, icon: "navigate-outline",        labelKey: "onTheWay" },
  completed:   { color: Colors.light.gray, bg: Colors.light.graySoft, icon: "checkmark-done-outline",     labelKey: "completed" },
  cancelled:   { color: Colors.light.red, bg: Colors.light.redSoft, icon: "close-circle-outline",       labelKey: "cancelled" },
};

export const PARCEL_STATUS_MAP: Record<string, StatusConfig> = {
  pending:    { color: Colors.light.amber, bg: Colors.light.amberSoft, icon: "time-outline",               labelKey: "pending" },
  accepted:   { color: Colors.light.brandBlue, bg: Colors.light.brandBlueSoft, icon: "person-outline",             labelKey: "statusAccepted" },
  in_transit: { color: Colors.light.emerald, bg: Colors.light.emeraldSoft, icon: "cube-outline",               labelKey: "inTransit" },
  completed:  { color: Colors.light.gray, bg: Colors.light.graySoft, icon: "checkmark-done-outline",     labelKey: "delivered" },
  cancelled:  { color: Colors.light.red, bg: Colors.light.redSoft, icon: "close-circle-outline",       labelKey: "cancelled" },
};

export const ORDER_STEPS = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered"];
export const PARCEL_STEPS = ["pending", "accepted", "in_transit", "completed"];
export const RIDE_STEPS = ["searching", "accepted", "arrived", "in_transit", "completed"];

export type OrderType = "mart" | "food" | "ride" | "pharmacy" | "parcel";

export function getOrderStatusConfig(status: string, orderType?: string): StatusConfig {
  if (orderType === "ride") {
    return RIDE_STATUS_MAP[status] ?? RIDE_STATUS_MAP["searching"]!;
  }
  if (orderType === "parcel") {
    return PARCEL_STATUS_MAP[status] ?? PARCEL_STATUS_MAP["pending"]!;
  }
  return ORDER_STATUS_MAP[status] ?? ORDER_STATUS_MAP["pending"]!;
}
