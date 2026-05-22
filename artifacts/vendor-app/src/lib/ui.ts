import { formatCurrency as _sharedFcV } from "@workspace/api-zod";

/* ── AJKMart Vendor — Dark Design System Tokens ───────────────
   Primary: #1A56DB (AJKMart Blue)
   Accent:  #F59E0B (Amber)
   BG:      #0A0F1A (Deep Navy)
   Surface: #111827 / #141E2E (Dark Cards)
   All pages MUST use these constants for visual consistency.
─────────────────────────────────────────────────────────────── */

export const DEFAULT_COMMISSION_PCT = 15;
export const BOTTOM_PADDING = "calc(64px + max(8px, env(safe-area-inset-bottom, 8px)))";

/* ── Buttons ── */
export const BTN_PRIMARY =
  "h-12 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-base android-press flex items-center justify-center gap-2 disabled:opacity-50 transition-colors";
export const BTN_SECONDARY =
  "h-12 w-full border-2 border-white/10 text-gray-300 hover:border-blue-500/50 hover:text-blue-300 font-bold rounded-2xl text-base android-press flex items-center justify-center transition-colors";
export const BTN_SM =
  "h-9 px-4 text-sm font-bold rounded-xl android-press min-h-0 flex items-center transition-colors";
export const BTN_XS =
  "h-8 px-3 text-xs font-bold rounded-xl android-press min-h-0 flex items-center transition-colors";

/* ── Inputs ── */
export const INPUT =
  "w-full h-12 px-4 bg-[#1A2236] border border-white/10 rounded-xl text-base text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:bg-[#1E2A44] transition-colors";
export const SELECT =
  "w-full h-12 px-3 bg-[#1A2236] border border-white/10 rounded-xl text-base text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none";
export const TEXTAREA =
  "w-full px-4 py-3 bg-[#1A2236] border border-white/10 rounded-xl text-base text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:bg-[#1E2A44] transition-colors resize-none";

/* ── Cards (white surface on dark bg — Stripe/Linear dark mode pattern) ── */
export const CARD = "bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100";
export const CARD_HEADER = "px-4 py-3.5 border-b border-gray-100 flex items-center justify-between";
export const CARD_BODY = "p-4";
export const ROW = "flex items-center justify-between py-3 border-b border-gray-50 last:border-0";

/* ── Typography ── */
export const LABEL = "block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5";
export const STAT_VAL = "text-2xl font-extrabold leading-none text-gray-900";
export const STAT_LBL = "text-xs text-gray-500 font-medium mt-1";

/* ── Badges ── */
export const BADGE_GREEN = "text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700";
export const BADGE_ORANGE =
  "text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700";
export const BADGE_BLUE = "text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700";
export const BADGE_RED = "text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-600";
export const BADGE_PURPLE =
  "text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700";
export const BADGE_GRAY = "text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600";

/* ── Layout ── */
export const SECTION = "px-4 py-4 space-y-3";
export const PAGE = "min-h-screen bg-[#0A0F1A]";

/* ── Helpers ── */
export function fc(n: string | number | null | undefined, currencySymbol = "Rs."): string {
  return _sharedFcV(n != null ? String(n) : (n as null | undefined), currencySymbol);
}
export function fd(d: string | Date): string {
  return new Date(d).toLocaleString("en-PK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}
