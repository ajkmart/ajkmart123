import { createLogger } from "@/lib/logger";
import { format } from "date-fns";
import { escapeHtml } from "./escapeHtml";
import { getCurrencySymbol } from "./platformConfig";
const log = createLogger("[format]");

export const formatCurrency = (amount: number | null | undefined) => {
  const safe = typeof amount === "number" && isFinite(amount) ? amount : 0;
  return `${getCurrencySymbol()} ${safe.toLocaleString()}`;
};

/**
 * HTML-safe wrappers around the formatters above. Use these any time a
 * formatted value flows into `dangerouslySetInnerHTML` (chart tooltips,
 * map marker labels, push-notification HTML previews, etc.). They run the
 * formatted output through `escapeHtml` so a hostile currency symbol or
 * locale string can never inject markup. Plain JSX usage should keep
 * calling `formatCurrency` / `formatDateLocale` directly — React already
 * escapes JSX text children.
 */
export const formatCurrencyHtml = (amount: number) => escapeHtml(formatCurrency(amount));

export const formatDateLocaleHtml = (
  dateString: string,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
) => escapeHtml(formatDateLocale(dateString, locale, options));

export const formatDate = (dateString: string) => {
  try {
    return format(new Date(dateString), "MMM d, yyyy h:mm a");
  } catch (err) {
    log.warn("formatDate failed for input:", dateString, err);
    return dateString;
  }
};

/**
 * Locale-aware date formatter. Uses Intl.DateTimeFormat (timezone-aware).
 * On parse failure, returns the raw string AND logs the input + error so
 * malformed timestamps are observable in the console (no silent catch).
 * Defaults to the user agent's locale so admins in different regions see
 * dates in their own format.
 */
export const formatDateLocale = (
  dateString: string,
  locale: string | undefined = undefined,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }
) => {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) {
    log.warn("formatDateLocale received non-parseable input:", dateString);
    return dateString;
  }
  try {
    return new Intl.DateTimeFormat(locale, options).format(d);
  } catch (err) {
    log.warn("formatDateLocale Intl.DateTimeFormat failed", { locale, options, dateString }, err);
    return dateString;
  }
};

export const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "pending":
    case "searching":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "confirmed":
    case "accepted":
    case "ongoing":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "preparing":
    case "arrived":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "ready":
      return "bg-teal-100 text-teal-800 border-teal-200";
    case "picked_up":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "out_for_delivery":
    case "in_transit":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "delivered":
    case "completed":
      return "bg-green-100 text-green-800 border-green-200";
    case "cancelled":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};
