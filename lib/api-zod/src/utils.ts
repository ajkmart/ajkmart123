/**
 * Shared financial formatting utility.
 *
 * Financial amounts arrive from the API as decimal strings (e.g. "1234.50") to
 * preserve full precision without floating-point loss. Use this helper whenever
 * displaying a monetary value — never call Number() or parseFloat() directly on
 * API price/total/walletBalance fields.
 *
 * The formatter intentionally avoids parseFloat / Number() on the API string to
 * eliminate any risk of IEEE-754 representation drift. Only the integer portion
 * is formatted with thousands separators; the decimal portion is preserved as-is
 * from the server string.
 */
export function formatCurrency(value: string | null | undefined, symbol = "Rs."): string {
  if (value == null || value === undefined || value === "") return `${symbol} 0`;
  const str = String(value).trim();
  const dotIdx = str.indexOf(".");
  const intPart = dotIdx >= 0 ? str.slice(0, dotIdx) : str;
  const decPart = dotIdx >= 0 ? str.slice(dotIdx) : "";
  const digitsOnly = intPart.replace(/[^0-9]/g, "");
  if (!digitsOnly) return `${symbol} 0`;
  const formatted = BigInt(digitsOnly).toLocaleString("en-PK");
  return `${symbol} ${intPart.startsWith("-") ? "-" : ""}${formatted}${decPart}`;
}
