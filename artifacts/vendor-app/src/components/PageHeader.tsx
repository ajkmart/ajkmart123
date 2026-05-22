import { type ReactNode } from "react";
import { Header } from "./Header";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  mobileContent?: ReactNode;
}

/**
 * Responsive page header — AJKMart Blue dark theme.
 * Mobile: full-bleed blue gradient (brand consistent)
 * Desktop: dark top bar with title + actions
 */
export function PageHeader({ title, subtitle, actions, mobileContent }: PageHeaderProps) {
  return (
    <>
      {/* ── Mobile Header (blue gradient) ── */}
      <Header pb="pb-5" className="md:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-blue-200 opacity-80">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        {mobileContent && <div className="mt-3">{mobileContent}</div>}
      </Header>

      {/* ── Desktop Header (dark) ── */}
      <div
        className="sticky top-0 z-10 hidden items-center justify-between px-6 py-4 md:flex"
        style={{
          background: "#0D1117",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 2px 16px rgba(0,0,0,0.25)",
        }}
      >
        <div>
          <h1 className="text-xl font-extrabold text-white">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-sm" style={{ color: "#6B7280" }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
        {mobileContent && <div className="ml-6 max-w-sm flex-1">{mobileContent}</div>}
      </div>
    </>
  );
}
