import { type ReactNode } from "react";

interface HeaderProps {
  children: ReactNode;
  className?: string;
  /** extra bottom padding (default pb-5) */
  pb?: string;
}

/**
 * Full-bleed gradient header — AJKMart Blue (#1A56DB) brand theme.
 * Respects Android status bar safe area.
 */
export function Header({ children, className = "", pb = "pb-5" }: HeaderProps) {
  return (
    <div
      className={`relative overflow-hidden ${pb} ${className}`}
      style={{
        background: "linear-gradient(135deg, #1A56DB 0%, #1348B5 60%, #0F3499 100%)",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 2.5rem)",
      }}
    >
      {/* Decorative glow circles */}
      <div
        className="pointer-events-none absolute -top-8 -right-8 h-48 w-48 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-6 -left-6 h-32 w-32 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute top-1/2 right-1/4 h-24 w-24 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)",
        }}
      />
      <div className="relative px-5">{children}</div>
    </div>
  );
}
