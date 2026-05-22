export type ConditionSeverity =
  | "warning"
  | "restriction_normal"
  | "restriction_strict"
  | "suspension"
  | "ban";

export interface ConditionType {
  value: string;
  label: string;
  severity: ConditionSeverity;
}

export const CONDITION_TYPES: ConditionType[] = [
  { value: "warning_l1", label: "Warning L1 - Informal", severity: "warning" },
  { value: "warning_l2", label: "Warning L2 - Formal", severity: "warning" },
  { value: "warning_l3", label: "Warning L3 - Final", severity: "warning" },
  { value: "restriction_service_block", label: "Service Block", severity: "restriction_normal" },
  { value: "restriction_wallet_freeze", label: "Wallet Freeze", severity: "restriction_normal" },
  { value: "restriction_promo_block", label: "Promo Block", severity: "restriction_normal" },
  { value: "restriction_order_cap", label: "Order Cap", severity: "restriction_normal" },
  { value: "restriction_review_block", label: "Review Block", severity: "restriction_normal" },
  { value: "restriction_cash_only", label: "Cash Only", severity: "restriction_normal" },
  {
    value: "restriction_new_order_block",
    label: "New Order Block",
    severity: "restriction_strict",
  },
  { value: "restriction_rate_limit", label: "Rate Limit", severity: "restriction_strict" },
  {
    value: "restriction_pending_review_gate",
    label: "Pending Review Gate",
    severity: "restriction_strict",
  },
  {
    value: "restriction_device_restriction",
    label: "Device Restriction",
    severity: "restriction_strict",
  },
  { value: "suspension_temporary", label: "Temporary Suspension", severity: "suspension" },
  { value: "suspension_extended", label: "Extended Suspension", severity: "suspension" },
  {
    value: "suspension_pending_review",
    label: "Pending Review Suspension",
    severity: "suspension",
  },
  { value: "ban_soft", label: "Soft Ban", severity: "ban" },
  { value: "ban_hard", label: "Hard Ban", severity: "ban" },
  { value: "ban_fraud", label: "Fraud Ban", severity: "ban" },
];

export const SEVERITY_COLORS: Record<string, string> = {
  warning: "bg-yellow-100 text-yellow-700 border-yellow-200",
  restriction_normal: "bg-orange-100 text-orange-700 border-orange-200",
  restriction_strict: "bg-red-100 text-red-700 border-red-200",
  suspension: "bg-purple-100 text-purple-700 border-purple-200",
  ban: "bg-red-200 text-red-900 border-red-300",
};

export const SEVERITY_LABELS: Record<string, string> = {
  warning: "Warning",
  restriction_normal: "Restriction",
  restriction_strict: "Strict Restriction",
  suspension: "Suspension",
  ban: "Ban",
};

export const SEVERITY_OPTIONS: { value: ConditionSeverity; label: string }[] = [
  { value: "warning", label: "Warning" },
  { value: "restriction_normal", label: "Restriction (Normal)" },
  { value: "restriction_strict", label: "Restriction (Strict)" },
  { value: "suspension", label: "Suspension" },
  { value: "ban", label: "Ban" },
];

export const CATEGORY_MAP: Record<string, string> = {
  warning: "warning",
  restriction_normal: "restriction",
  restriction_strict: "restriction",
  suspension: "suspension",
  ban: "ban",
};
