import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

/**
 * Shared page header used across the admin chrome.
 *
 * Replaces the ad-hoc `<div className="flex items-center justify-between">` +
 * inline icon-tile + `<h1 className="text-3xl font-display font-bold">` block
 * that every page used to redeclare. Pages can pass:
 *
 *   - `icon`     — a Lucide icon component (rendered in the standard
 *                   slate-100 / slate-600 tile);
 *   - `title`    — the H1;
 *   - `subtitle` — optional description below the title;
 *   - `breadcrumbs` — optional crumbs above the title (each crumb has a
 *                     label and an optional `href`);
 *   - `actions`  — optional ReactNode rendered on the right side
 *                   (responsive: stacks below on mobile).
 *
 * The component intentionally does no data fetching — keeps it cheap to
 * use everywhere.
 */

export interface BreadcrumbCrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: BreadcrumbCrumb[];
  actions?: ReactNode;
  /** Override the default slate-100 / slate-600 icon tile colours. */
  iconBgClass?: string;
  iconColorClass?: string;
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  breadcrumbs,
  actions,
  iconBgClass = "bg-slate-100",
  iconColorClass = "text-slate-600",
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${iconBgClass} ${iconColorClass}`}
          >
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
        )}
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="text-muted-foreground mb-0.5 flex flex-wrap items-center gap-1 text-[11px] font-medium"
            >
              {breadcrumbs.map((crumb, i) => (
                <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="text-muted-foreground/50 h-3 w-3" aria-hidden="true" />
                  )}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="hover:text-foreground admin-transition admin-focus-ring rounded-sm"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-foreground">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <h1 className="font-display text-foreground truncate text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
          {actions}
        </div>
      )}
    </header>
  );
}
