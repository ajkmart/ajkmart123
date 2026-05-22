import { NAV_GROUPS, NAV_ITEMS } from "@/lib/navConfig";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "wouter";

function stripQuery(path: string) {
  return path.split("?")[0] ?? path;
}

function findNavItem(location: string) {
  const loc = stripQuery(location);
  return NAV_ITEMS.find((item) => {
    const href = stripQuery(item.href);
    if (href === "/dashboard") return loc === "/dashboard" || loc === "/";
    return loc === href || loc.startsWith(href + "/");
  });
}

function findNavGroup(item: (typeof NAV_ITEMS)[number]) {
  return NAV_GROUPS.find((g) => g.items.some((i) => i.href === item.href));
}

function buildCrumbs(
  location: string,
  T: (k: TranslationKey) => string
): { label: string; href?: string }[] {
  const crumbs: { label: string; href?: string }[] = [{ label: "Dashboard", href: "/dashboard" }];

  const loc = stripQuery(location);
  if (loc === "/dashboard" || loc === "/") return crumbs;

  const item = findNavItem(location);
  if (!item) {
    const segments = loc.split("/").filter(Boolean);
    for (let i = 0; i < segments.length; i++) {
      const label = segments[i]!.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const href = "/" + segments.slice(0, i + 1).join("/");
      crumbs.push({ label, href: i < segments.length - 1 ? href : undefined });
    }
    return crumbs;
  }

  const group = findNavGroup(item);
  if (group) {
    crumbs.push({ label: T(group.labelKey) });
  }

  const isLastCrumb = true;
  crumbs.push({ label: T(item.nameKey), href: isLastCrumb ? undefined : item.href });

  if (loc !== stripQuery(item.href)) {
    const extra = loc.replace(stripQuery(item.href), "").split("/").filter(Boolean);
    for (const seg of extra) {
      crumbs.push({ label: seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) });
    }
  }

  return crumbs;
}

export function Breadcrumbs() {
  const [location] = useLocation();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const crumbs = buildCrumbs(location, T);

  if (crumbs.length <= 1) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="text-muted-foreground mb-2 flex items-center gap-1 overflow-x-auto py-1 text-xs whitespace-nowrap"
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0" />}
            {i === 0 && <Home className="h-3 w-3 flex-shrink-0" />}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="hover:text-foreground capitalize transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? "text-foreground font-semibold capitalize" : "capitalize"}>
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
