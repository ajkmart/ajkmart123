import crypto from "crypto";

export interface PaymentProviderConfig {
  enabled: boolean;
  mode: "sandbox" | "live" | "manual";
  type: "api" | "manual";
  minAmount: number;
  maxAmount: number;
}

export interface PaymentInitResult {
  gateway: string;
  mode: string;
  type: string;
  txnRef: string;
  orderId: string;
  gatewayUrl?: string;
  params?: Record<string, string>;
  token?: string;
  instructions: string;
  simulateUrl?: string | null;
  payload?: Record<string, unknown>;
  manualName?: string;
  manualNumber?: string;
}

export interface PaymentCallbackResult {
  success: boolean;
  txnRef: string;
  orderId?: string;
  message: string;
  responseCode?: string;
}

export function hmacSHA256(key: string, data: string): string {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

export function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function txnDateTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function txnExpiry(minutes = 15): string {
  const exp = new Date(Date.now() + minutes * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${exp.getFullYear()}${pad(exp.getMonth() + 1)}${pad(exp.getDate())}${pad(exp.getHours())}${pad(exp.getMinutes())}${pad(exp.getSeconds())}`;
}

export function buildJazzCashHash(params: Record<string, string>, salt: string): string {
  const sorted = Object.keys(params)
    .filter((k) => params[k] !== "" && k !== "pp_SecureHash")
    .sort()
    .map((k) => params[k])
    .join("&");
  return hmacSHA256(salt, `${salt}&${sorted}`).toUpperCase();
}

export function buildEasyPaisaHash(fields: string[], hashKey: string): string {
  return sha256(`${hashKey}&${fields.join("&")}`);
}

export function getProviderConfig(
  s: Record<string, string>,
  gateway: string
): PaymentProviderConfig | null {
  switch (gateway) {
    case "jazzcash":
      return {
        enabled: (s["jazzcash_enabled"] ?? "off") === "on",
        mode:
          (s["jazzcash_type"] ?? "manual") === "api"
            ? ((s["jazzcash_mode"] ?? "sandbox") as "sandbox" | "live")
            : "manual",
        type: (s["jazzcash_type"] ?? "manual") as "api" | "manual",
        minAmount: parseFloat(s["jazzcash_min_amount"] ?? "10"),
        maxAmount: parseFloat(s["jazzcash_max_amount"] ?? "100000"),
      };
    case "easypaisa":
      return {
        enabled: (s["easypaisa_enabled"] ?? "off") === "on",
        mode:
          (s["easypaisa_type"] ?? "manual") === "api"
            ? ((s["easypaisa_mode"] ?? "sandbox") as "sandbox" | "live")
            : "manual",
        type: (s["easypaisa_type"] ?? "manual") as "api" | "manual",
        minAmount: parseFloat(s["easypaisa_min_amount"] ?? "10"),
        maxAmount: parseFloat(s["easypaisa_max_amount"] ?? "100000"),
      };
    case "bank":
      return {
        enabled: (s["bank_enabled"] ?? "off") === "on",
        mode: "manual",
        type: "manual",
        minAmount: parseFloat(s["bank_min_amount"] ?? "0"),
        maxAmount: parseFloat(s["payment_max_online"] ?? "100000"),
      };
    default:
      return null;
  }
}

export function validatePaymentAmount(
  config: PaymentProviderConfig,
  amount: number,
  gatewayLabel: string
): string | null {
  if (!config.enabled) return `${gatewayLabel} is currently disabled`;
  if (amount < config.minAmount)
    return `Minimum ${gatewayLabel} payment is Rs. ${config.minAmount}`;
  if (amount > config.maxAmount)
    return `Maximum ${gatewayLabel} payment is Rs. ${config.maxAmount}`;
  return null;
}

export const SUPPORTED_GATEWAYS = ["jazzcash", "easypaisa", "bank"] as const;
export type SupportedGateway = (typeof SUPPORTED_GATEWAYS)[number];

export function isSupportedGateway(gw: string): gw is SupportedGateway {
  return (SUPPORTED_GATEWAYS as readonly string[]).includes(gw);
}
