import { AdminNotificationBell } from "@/components/AdminNotificationBell";
import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { StockNotificationBell } from "@/components/StockNotificationBell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePermissions } from "@/hooks/usePermissions";
import { useAdminAuth } from "@/lib/adminAuthContext";
import { adminFetch } from "@/lib/adminFetcher";
import { getAdminSocket, resetSosBadge, socketStatus$, type SocketStatus } from "@/lib/adminSocket";
import { getAdminTiming } from "@/lib/adminTiming";
import { lockBodyScroll } from "@/lib/domSafety";
import { createLogger } from "@/lib/logger";
import {
  BOTTOM_NAV,
  isActivePath,
  NAV_DESCRIPTIONS,
  NAV_GROUPS,
  NAV_ITEMS as navItems,
  readFavorites,
  writeFavorites,
  type NavItem,
} from "@/lib/navConfig";
import { safeLocalGet, safeLocalSet } from "@/lib/safeStorage";
import { useLanguage } from "@/lib/useLanguage";
import { useTheme } from "@/lib/useTheme";
import { LANGUAGE_OPTIONS, tDual, type Language, type TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Globe,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShoppingBag,
  Star,
  StarOff,
  Sun,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { type Socket } from "socket.io-client";
import { Link, useLocation } from "wouter";
const log = createLogger("[AdminLayout]");

// NAV_GROUPS, NAV_DESCRIPTIONS, BOTTOM_NAV and navItems are imported from
// `@/lib/navConfig` so the command palette, breadcrumbs and any future
// favorites/pinned UI all read from one source of truth.

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { state, logout } = useAdminAuth();
  const { has, hasAny, isSuper } = usePermissions();
  const canSeeItem = useCallback(
    (item: NavItem): boolean => {
      if (isSuper) return true;
      if (!item.requirePermission) return true;
      if (Array.isArray(item.requirePermission)) return hasAny(item.requirePermission);
      return has(item.requirePermission);
    },
    [isSuper, has, hasAny]
  );
  const { isDark, toggleDark } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => safeLocalGet("ajkmart_sidebar_collapsed") === "true"
  );
  const [cmdOpen, setCmdOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [cmdHintVisible, setCmdHintVisible] = useState(
    () => safeLocalGet("cmd_palette_hinted") !== "true"
  );
  const cmdHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { language, setLanguage, loading: langLoading } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const globalSearchRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts({
    onOpenSearch: () => {
      globalSearchRef.current?.focus();
    },
    onCloseModal: () => {
      setIsMobileMenuOpen(false);
      setUserMenuOpen(false);
      setLangOpen(false);
      window.dispatchEvent(new CustomEvent("admin:close-modal"));
    },
    onNewItem: () => {
      window.dispatchEvent(new CustomEvent("admin:new-item"));
    },
  });

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const active = NAV_GROUPS.find((g) => g.items.some((i) => isActivePath(location, i.href)));
    return new Set(active ? [active.key] : [NAV_GROUPS[0]!.key]);
  });

  // In-sidebar text filter — narrows the visible nav items as the admin types.
  // Independent from the Cmd+K command palette which still does cross-action search.
  const [navFilter, setNavFilter] = useState("");
  const navFilterTrim = navFilter.trim().toLowerCase();

  // Pinned favorites — persisted as comma-joined hrefs in localStorage.
  // Star icon next to each item toggles membership; pinned items render at the
  // top of the sidebar above the group list for one-click access.
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites(safeLocalGet));
  const toggleFavorite = useCallback((href: string) => {
    setFavorites((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href];
      writeFavorites(safeLocalSet, next);
      return next;
    });
  }, []);

  const [socketStatus, setSocketStatus] = useState<SocketStatus>(socketStatus$.value);
  const [justConnected, setJustConnected] = useState(false);
  const [sosCount, setSosCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [pendingRidersCount, setPendingRidersCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [pendingWithdrawalsCount, setPendingWithdrawalsCount] = useState(0);
  const [pendingDepositsCount, setPendingDepositsCount] = useState(0);
  const [pendingProductsCount, setPendingProductsCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      // Failures are logged inside safeLocalSet under [safeStorage]; we
      // intentionally still flip the in-memory state even if persistence
      // fails so the admin's click is never ignored.
      safeLocalSet("ajkmart_sidebar_collapsed", String(next));
      return next;
    });
  }, []);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // 4-second auto-dismiss for ⌘K hint
  useEffect(() => {
    if (!cmdHintVisible) return;
    cmdHintTimerRef.current = setTimeout(() => {
      setCmdHintVisible(false);
      safeLocalSet("cmd_palette_hinted", "true");
    }, 4000);
    return () => {
      if (cmdHintTimerRef.current) clearTimeout(cmdHintTimerRef.current);
    };
  }, [cmdHintVisible]);

  // Subscribe to socket connection status observable
  useEffect(() => {
    const handler = (s: SocketStatus) => {
      setSocketStatus(s);
      if (s === "connected") {
        setJustConnected(true);
        const t = setTimeout(() => setJustConnected(false), 2500);
        return () => clearTimeout(t);
      }
      return undefined;
    };
    socketStatus$.listeners.add(handler);
    return () => {
      socketStatus$.listeners.delete(handler);
    };
  }, []);

  // Reset SOS sidebar badge when admin is on the SOS page
  useEffect(() => {
    if (location === "/sos-alerts") {
      resetSosBadge();
    }
  }, [location]);

  // Listen for SOS badge updates from the shared socket (localStorage-backed)
  useEffect(() => {
    const handler = (e: Event) => {
      const count = (e as CustomEvent<{ count: number }>).detail?.count;
      if (typeof count === "number") {
        setSosCount((c) => Math.max(c, count));
      }
    };
    window.addEventListener("sos:badge:update", handler);
    return () => window.removeEventListener("sos:badge:update", handler);
  }, []);

  // Socket + data fetching
  useEffect(() => {
    adminFetch("/sos/alerts?limit=1")
      .then((data: { activeCount?: number }) => {
        if (typeof data.activeCount === "number") setSosCount(data.activeCount);
      })
      .catch((err) => {
        log.error("SOS badge fetch failed:", err);
      });

    adminFetch("/error-reports/new-count")
      .then((data: { count?: number }) => {
        if (typeof data.count === "number") setErrorCount(data.count);
      })
      .catch((err) => {
        log.error("Error count fetch failed:", err);
      });

    // Fetch all pending badge counts in one round-trip
    const fetchPendingCounts = () => {
      adminFetch("/pending-counts")
        .then(
          (data: {
            pendingRiders?: number;
            pendingOrders?: number;
            pendingWithdrawals?: number;
            pendingDeposits?: number;
            pendingProducts?: number;
          }) => {
            if (typeof data.pendingRiders === "number") setPendingRidersCount(data.pendingRiders);
            if (typeof data.pendingOrders === "number") setPendingOrdersCount(data.pendingOrders);
            if (typeof data.pendingWithdrawals === "number")
              setPendingWithdrawalsCount(data.pendingWithdrawals);
            if (typeof data.pendingDeposits === "number")
              setPendingDepositsCount(data.pendingDeposits);
            if (typeof data.pendingProducts === "number")
              setPendingProductsCount(data.pendingProducts);
          }
        )
        .catch((err) => {
          log.error("Pending counts fetch failed:", err);
        });
    };
    fetchPendingCounts();

    const errorInterval = setInterval(() => {
      adminFetch("/error-reports/new-count")
        .then((data: { count?: number }) => {
          if (typeof data.count === "number") setErrorCount(data.count);
        })
        .catch((err) => {
          log.error("Error count interval fetch failed:", err);
        });
    }, getAdminTiming().layoutErrorPollIntervalMs);
    const cleanupErrorInterval = () => clearInterval(errorInterval);

    // Use the shared admin socket (same instance as AdminNotificationBell)
    if (!state.accessToken) return cleanupErrorInterval;
    const socket = getAdminSocket(state.accessToken);
    socketRef.current = socket;

    const onSosNew = () => {
      setSosCount((c) => c + 1);
      if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
    };
    const onSosResolved = () => setSosCount((c) => Math.max(0, c - 1));
    const onOrderNew = (data: { status?: string }) => {
      if (!data || data.status === "pending") setPendingOrdersCount((c) => c + 1);
    };
    const onOrderUpdate = (data: { status?: string }) => {
      if (data?.status && data.status !== "pending") {
        fetchPendingCounts();
      }
    };
    const onRiderStatus = () => fetchPendingCounts();
    const onWalletChange = () => fetchPendingCounts();
    const onProductSubmitted = () => setPendingProductsCount((c) => c + 1);
    const onProductApproved = () => setPendingProductsCount((c) => Math.max(0, c - 1));
    const onProductRejected = () => setPendingProductsCount((c) => Math.max(0, c - 1));

    socket.on("sos:new", onSosNew);
    socket.on("sos:resolved", onSosResolved);
    socket.on("order:new", onOrderNew);
    socket.on("order:update", onOrderUpdate);
    socket.on("rider:status", onRiderStatus);
    socket.on("wallet:deposit-approved", onWalletChange);
    socket.on("wallet:withdrawal-approved", onWalletChange);
    socket.on("wallet:withdrawal-rejected", onWalletChange);
    socket.on("product:submitted", onProductSubmitted);
    socket.on("product:approved", onProductApproved);
    socket.on("product:rejected", onProductRejected);

    return () => {
      // Only remove our specific listeners — do NOT disconnect the shared socket
      socket.off("sos:new", onSosNew);
      socket.off("sos:resolved", onSosResolved);
      socket.off("order:new", onOrderNew);
      socket.off("order:update", onOrderUpdate);
      socket.off("rider:status", onRiderStatus);
      socket.off("wallet:deposit-approved", onWalletChange);
      socket.off("wallet:withdrawal-approved", onWalletChange);
      socket.off("wallet:withdrawal-rejected", onWalletChange);
      socket.off("product:submitted", onProductSubmitted);
      socket.off("product:approved", onProductApproved);
      socket.off("product:rejected", onProductRejected);
      socketRef.current = null;
      cleanupErrorInterval();
    };
  }, [state.accessToken]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    const active = NAV_GROUPS.find((g) => g.items.some((i) => isActivePath(location, i.href)));
    if (active) {
      setExpandedGroups((prev) => {
        if (prev.has(active.key)) return prev;
        const next = new Set(prev);
        next.add(active.key);
        return next;
      });
    }

    // Restore sidebar scroll position and scroll active item into view.
    // A single constant key ensures the saved position is always read back
    // correctly regardless of which nav item was clicked.
    if (sidebarScrollRef.current) {
      const savedScroll = sessionStorage.getItem("sidebar_scroll_position");
      if (savedScroll) {
        const scrollPos = parseInt(savedScroll, 10);
        requestAnimationFrame(() => {
          if (sidebarScrollRef.current) {
            sidebarScrollRef.current.scrollTop = scrollPos;
          }
        });
      } else {
        // If no saved position, scroll active item into view
        setTimeout(() => {
          if (sidebarScrollRef.current) {
            const activeElement = sidebarScrollRef.current.querySelector(
              '[data-sidebar-active="true"]'
            );
            if (activeElement) {
              activeElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
          }
        }, 50);
      }
    }
  }, [location]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
      if (e.key === "Escape" && isMobileMenuOpen) setIsMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const release = lockBodyScroll();
    return release;
  }, [isMobileMenuOpen]);

  /* Focus trap for mobile nav drawer — WCAG 2.1.2 / 2.4.3 */
  useEffect(() => {
    if (!isMobileMenuOpen || !mobileDrawerRef.current) return;
    const drawer = mobileDrawerRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    /* Move focus to first focusable item in drawer */
    const first = drawer.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const trapTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const firstEl = focusables[0]!;
      const lastEl = focusables[focusables.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener("keydown", trapTab);
    return () => {
      document.removeEventListener("keydown", trapTab);
      /* Restore focus to trigger element on drawer close */
      previousFocus?.focus?.();
    };
  }, [isMobileMenuOpen]);

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  const isActive = (href: string) => isActivePath(location, href);

  const currentItem = navItems.find((i) => isActive(i.href));
  const currentPageName = currentItem ? T(currentItem.nameKey) : "AJKMart Admin";
  const currentLangLabel =
    LANGUAGE_OPTIONS.find((o) => o.value === language)?.label || language.toUpperCase();

  const sidebarWidth = collapsed ? 72 : 264;

  const SidebarContent = ({ mini, isMobile }: { mini?: boolean; isMobile?: boolean }) => (
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      <div
        className="flex h-full flex-col select-none"
        style={{
          width: isMobile ? 280 : mini ? 72 : 264,
          background: "linear-gradient(180deg, #0F172A 0%, #0B1120 50%, #0F172A 100%)",
          borderRight: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {/* Logo */}
        <div
          className="flex shrink-0 items-center"
          style={{
            height: 64,
            padding: mini ? "0 16px" : "0 20px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
              boxShadow: "0 4px 16px rgba(99,102,241,0.4), inset 0 1px 1px rgba(255,255,255,0.15)",
            }}
          >
            <ShoppingBag className="h-5 w-5 text-white" />
          </div>
          {(!mini || isMobile) && (
            <div className="ml-3 overflow-hidden">
              <span className="block text-[17px] leading-tight font-bold tracking-tight text-white">
                AJKMart
              </span>
              <span
                className="text-[10px] font-semibold tracking-[0.15em] uppercase"
                style={{ color: "#818CF8" }}
              >
                Admin Console
              </span>
            </div>
          )}
          {isMobile && (
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
            >
              <X className="h-4 w-4 text-white/50" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* SOS alert banner */}
        {sosCount > 0 && (
          <Link href="/sos-alerts" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
            <div
              className="relative flex cursor-pointer items-center gap-2.5 overflow-hidden transition-opacity hover:opacity-90"
              style={{
                margin: mini ? "8px 8px" : "10px 12px",
                background: "linear-gradient(135deg, #DC2626, #B91C1C)",
                borderRadius: 14,
                padding: mini ? "10px" : "10px 14px",
                boxShadow: "0 4px 20px rgba(220,38,38,0.35)",
              }}
            >
              <span
                className="absolute inset-0 animate-ping rounded-xl"
                style={{ background: "rgba(239,68,68,0.2)", animationDuration: "2s" }}
              />
              <AlertTriangle className="relative z-10 h-4 w-4 shrink-0 animate-pulse text-white" />
              {(!mini || isMobile) && (
                <div className="relative z-10 min-w-0 flex-1">
                  <p className="text-[11px] leading-tight font-bold text-white">
                    {sosCount} Active SOS
                  </p>
                  <p
                    className="text-[10px] leading-tight"
                    style={{ color: "rgba(255,255,255,0.7)" }}
                  >
                    Tap to respond
                  </p>
                </div>
              )}
              <span
                className="relative z-10 flex shrink-0 items-center justify-center rounded-full text-[10px] font-black"
                style={{
                  background: "rgba(255,255,255,0.2)",
                  color: "#fff",
                  minWidth: 22,
                  height: 22,
                  padding: "0 5px",
                }}
              >
                {sosCount}
              </span>
            </div>
          </Link>
        )}

        {/* In-sidebar quick filter — narrows the visible nav items live as the
          admin types. Hidden when the sidebar is collapsed to icons-only. */}
        {(!mini || isMobile) && (
          <div className="px-3 pt-3 pb-1">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: "rgba(255,255,255,0.35)" }}
              />
              <input
                type="text"
                value={navFilter}
                placeholder="Filter menu…"
                onChange={(e) => setNavFilter(e.target.value)}
                className="admin-transition h-8 w-full rounded-lg border border-white/[0.06] bg-white/[0.04] pr-7 pl-8 text-[12px] text-white placeholder:text-white/35 focus:border-white/20 focus:bg-white/[0.06] focus:outline-none"
                aria-label="Filter sidebar items"
              />
              {navFilter && (
                <button
                  type="button"
                  onClick={() => setNavFilter("")}
                  className="admin-focus-ring absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded"
                  aria-label="Clear filter"
                  title="Clear filter"
                >
                  <X className="h-3 w-3" style={{ color: "rgba(255,255,255,0.4)" }} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Pinned favorites — surfaced above group nav for one-click access. Only
          shown when there's at least one pinned item and not in icons-only mode. */}
        {(!mini || isMobile) && favorites.length > 0 && !navFilterTrim && (
          <div className="px-3 pt-2">
            <p
              className="mb-1 px-2.5 text-[10px] font-bold tracking-[0.12em] uppercase"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              <Star
                className="-mt-0.5 mr-1 inline h-2.5 w-2.5"
                style={{ color: "#FBBF24", fill: "#FBBF24" }}
              />
              Pinned
            </p>
            <div className="mb-1 space-y-0.5">
              {favorites.map((href) => {
                const item = navItems.find((n) => n.href === href);
                if (!item) return null;
                if (!canSeeItem(item)) return null;
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={href}
                    href={item.href}
                    onClick={() => {
                      if (sidebarScrollRef.current) {
                        sessionStorage.setItem(
                          "sidebar_scroll_position",
                          String(sidebarScrollRef.current.scrollTop)
                        );
                      }
                      isMobile && setIsMobileMenuOpen(false);
                    }}
                  >
                    <div
                      className="admin-transition group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5"
                      data-sidebar-active={active ? "true" : "false"}
                      style={{
                        background: active ? "rgba(99,102,241,0.14)" : "transparent",
                        border: active
                          ? "1px solid rgba(99,102,241,0.25)"
                          : "1px solid transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!active)
                          (e.currentTarget as HTMLElement).style.background =
                            "rgba(255,255,255,0.04)";
                      }}
                      onMouseLeave={(e) => {
                        if (!active)
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <Icon
                        className="h-[16px] w-[16px] shrink-0"
                        style={{ color: active ? "#A5B4FC" : "rgba(255,255,255,0.55)" }}
                      />
                      <span
                        className="flex-1 truncate text-[12px]"
                        style={{
                          color: active ? "#E0E7FF" : "rgba(255,255,255,0.55)",
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {T(item.nameKey)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite(item.href);
                        }}
                        className="admin-focus-ring shrink-0 rounded opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label="Unpin from favorites"
                        title="Unpin"
                      >
                        <Star className="h-3 w-3" style={{ color: "#FBBF24", fill: "#FBBF24" }} />
                      </button>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Nav groups */}
        <div
          ref={sidebarScrollRef}
          className="flex-1 overflow-y-auto py-2"
          style={{ scrollbarWidth: "none" }}
        >
          {navFilterTrim &&
            NAV_GROUPS.every((g) =>
              g.items
                .filter((i) => canSeeItem(i))
                .every((i) => {
                  const label = T(i.nameKey).toLowerCase();
                  const desc = (NAV_DESCRIPTIONS[i.href] || "").toLowerCase();
                  return (
                    !label.includes(navFilterTrim) &&
                    !desc.includes(navFilterTrim) &&
                    !i.href.toLowerCase().includes(navFilterTrim)
                  );
                })
            ) && (
              <div className="px-5 py-6 text-center">
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  No menu items match "{navFilter}"
                </p>
              </div>
            )}
          {NAV_GROUPS.map((group) => {
            const isExpanded = expandedGroups.has(group.key);
            const showMini = mini && !isMobile;
            // First filter to only items this admin has permission to see.
            const permittedItems = group.items.filter((item) => canSeeItem(item));
            // When the user is filtering, show every group expanded so matches across
            // groups are visible at once.
            const filteredItems = navFilterTrim
              ? permittedItems.filter((item) => {
                  const label = T(item.nameKey).toLowerCase();
                  const desc = (NAV_DESCRIPTIONS[item.href] || "").toLowerCase();
                  return (
                    label.includes(navFilterTrim) ||
                    desc.includes(navFilterTrim) ||
                    item.href.toLowerCase().includes(navFilterTrim)
                  );
                })
              : permittedItems;
            // Hide entire group if no permitted items remain (with or without filter).
            if (filteredItems.length === 0) return null;
            const effectiveExpanded = navFilterTrim ? true : isExpanded;
            const hasActiveItem = filteredItems.some((i) => isActive(i.href));

            return (
              <div
                key={group.key}
                className="mb-0.5"
                style={{ padding: showMini ? "0 8px" : "0 10px" }}
              >
                {/* Group header */}
                {showMini ? (
                  <div className="flex justify-center py-2">
                    <div
                      className="h-[2px] w-6 rounded-full"
                      style={{ background: `${group.color}40` }}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="group/header mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full transition-all"
                      style={{ background: hasActiveItem ? group.color : `${group.color}60` }}
                    />
                    <span
                      className="flex-1 truncate text-left text-[10px] font-bold tracking-[0.12em] uppercase transition-colors"
                      style={{
                        color: hasActiveItem ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)",
                      }}
                    >
                      {T(group.labelKey)}
                    </span>
                    <ChevronDown
                      className="h-3 w-3 shrink-0 transition-transform duration-200"
                      style={{
                        color: "rgba(255,255,255,0.2)",
                        transform: effectiveExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                      }}
                    />
                  </button>
                )}

                {/* Group items */}
                <div
                  className="overflow-hidden transition-all duration-200 ease-out"
                  style={{
                    maxHeight: showMini
                      ? "none"
                      : effectiveExpanded
                        ? `${filteredItems.length * 44}px`
                        : "0px",
                    opacity: showMini ? 1 : effectiveExpanded ? 1 : 0,
                  }}
                >
                  <div className="space-y-0.5 pb-1">
                    {filteredItems.map((item) => {
                      const active = isActive(item.href);
                      const Icon = item.icon;
                      const showSosBadge = item.sosBadge && sosCount > 0;
                      const showErrorBadge = item.errorBadge && errorCount > 0;
                      const showPendingRidersBadge =
                        item.pendingRidersBadge && pendingRidersCount > 0;
                      const showPendingOrdersBadge =
                        item.pendingOrdersBadge && pendingOrdersCount > 0;
                      const showPendingWithdrawalsBadge =
                        item.pendingWithdrawalsBadge && pendingWithdrawalsCount > 0;
                      const showPendingDepositsBadge =
                        item.pendingDepositsBadge && pendingDepositsCount > 0;
                      const showPendingProductsBadge =
                        item.pendingProductsBadge && pendingProductsCount > 0;
                      const hasBadge =
                        showSosBadge ||
                        showErrorBadge ||
                        showPendingRidersBadge ||
                        showPendingOrdersBadge ||
                        showPendingWithdrawalsBadge ||
                        showPendingDepositsBadge ||
                        showPendingProductsBadge;
                      const isFav = favorites.includes(item.href);

                      const itemNode = (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => {
                            if (sidebarScrollRef.current) {
                              sessionStorage.setItem(
                                "sidebar_scroll_position",
                                String(sidebarScrollRef.current.scrollTop)
                              );
                            }
                            isMobile && setIsMobileMenuOpen(false);
                          }}
                        >
                          <div
                            className="group relative flex cursor-pointer items-center transition-all duration-150"
                            data-sidebar-active={active ? "true" : "false"}
                            style={{
                              borderRadius: 10,
                              padding: showMini ? "10px 0" : "8px 10px",
                              justifyContent: showMini ? "center" : "flex-start",
                              background: active
                                ? `linear-gradient(135deg, ${group.color}18 0%, ${group.color}0A 100%)`
                                : "transparent",
                              border: active
                                ? `1px solid ${group.color}30`
                                : "1px solid transparent",
                            }}
                            onMouseEnter={(e) => {
                              if (!active)
                                (e.currentTarget as HTMLElement).style.background =
                                  "rgba(255,255,255,0.04)";
                            }}
                            onMouseLeave={(e) => {
                              if (!active)
                                (e.currentTarget as HTMLElement).style.background = "transparent";
                            }}
                          >
                            {active && !showMini && (
                              <span
                                className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full"
                                style={{ background: group.color }}
                              />
                            )}

                            <div
                              className="relative shrink-0"
                              style={{ margin: showMini ? 0 : "0 10px 0 6px" }}
                            >
                              <Icon
                                className="h-[18px] w-[18px] transition-colors duration-150"
                                style={{
                                  color: active
                                    ? group.color
                                    : showSosBadge
                                      ? "#EF4444"
                                      : showErrorBadge
                                        ? "#F59E0B"
                                        : showPendingRidersBadge
                                          ? "#3B82F6"
                                          : showPendingOrdersBadge
                                            ? "#F97316"
                                            : showPendingWithdrawalsBadge
                                              ? "#22C55E"
                                              : showPendingDepositsBadge
                                                ? "#06B6D4"
                                                : showPendingProductsBadge
                                                  ? "#8B5CF6"
                                                  : "rgba(255,255,255,0.38)",
                                }}
                              />
                              {showSosBadge && (
                                <>
                                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 animate-ping rounded-full bg-red-500 opacity-75" />
                                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-black text-white">
                                    {sosCount > 9 ? "9+" : sosCount}
                                  </span>
                                </>
                              )}
                              {showErrorBadge && !showSosBadge && (
                                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-black text-white">
                                  {errorCount > 99 ? "99+" : errorCount}
                                </span>
                              )}
                              {showPendingRidersBadge && !showSosBadge && !showErrorBadge && (
                                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-black text-white">
                                  {pendingRidersCount > 99 ? "99+" : pendingRidersCount}
                                </span>
                              )}
                              {showPendingOrdersBadge &&
                                !showSosBadge &&
                                !showErrorBadge &&
                                !showPendingRidersBadge && (
                                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-black text-white">
                                    {pendingOrdersCount > 99 ? "99+" : pendingOrdersCount}
                                  </span>
                                )}
                              {showPendingWithdrawalsBadge && !showSosBadge && !showErrorBadge && (
                                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[9px] font-black text-white">
                                  {pendingWithdrawalsCount > 99 ? "99+" : pendingWithdrawalsCount}
                                </span>
                              )}
                              {showPendingDepositsBadge && !showSosBadge && !showErrorBadge && (
                                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[9px] font-black text-white">
                                  {pendingDepositsCount > 99 ? "99+" : pendingDepositsCount}
                                </span>
                              )}
                              {showPendingProductsBadge &&
                                !showSosBadge &&
                                !showErrorBadge &&
                                !showPendingRidersBadge &&
                                !showPendingOrdersBadge &&
                                !showPendingWithdrawalsBadge &&
                                !showPendingDepositsBadge && (
                                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[9px] font-black text-white">
                                    {pendingProductsCount > 99 ? "99+" : pendingProductsCount}
                                  </span>
                                )}
                            </div>

                            {!showMini && (
                              <>
                                <span
                                  className="flex-1 truncate text-[13px] transition-colors"
                                  style={{
                                    color: active ? "#E0E7FF" : "rgba(255,255,255,0.58)",
                                    fontWeight: active ? 600 : 400,
                                  }}
                                >
                                  {T(item.nameKey)}
                                </span>
                                {showSosBadge && (
                                  <span
                                    className="rounded-full px-1.5 py-0.5 text-[10px] font-black"
                                    style={{ background: "rgba(239,68,68,0.2)", color: "#FCA5A5" }}
                                  >
                                    {sosCount > 9 ? "9+" : sosCount}
                                  </span>
                                )}
                                {showErrorBadge && !showSosBadge && (
                                  <span
                                    className="rounded-full px-1.5 py-0.5 text-[10px] font-black"
                                    style={{ background: "rgba(245,158,11,0.2)", color: "#FCD34D" }}
                                  >
                                    {errorCount > 99 ? "99+" : errorCount}
                                  </span>
                                )}
                                {showPendingRidersBadge && !showSosBadge && !showErrorBadge && (
                                  <span
                                    className="rounded-full px-1.5 py-0.5 text-[10px] font-black"
                                    style={{ background: "rgba(59,130,246,0.2)", color: "#93C5FD" }}
                                  >
                                    {pendingRidersCount > 99 ? "99+" : pendingRidersCount}
                                  </span>
                                )}
                                {showPendingOrdersBadge &&
                                  !showSosBadge &&
                                  !showErrorBadge &&
                                  !showPendingRidersBadge && (
                                    <span
                                      className="rounded-full px-1.5 py-0.5 text-[10px] font-black"
                                      style={{
                                        background: "rgba(249,115,22,0.2)",
                                        color: "#FDBA74",
                                      }}
                                    >
                                      {pendingOrdersCount > 99 ? "99+" : pendingOrdersCount}
                                    </span>
                                  )}
                                {showPendingWithdrawalsBadge &&
                                  !showSosBadge &&
                                  !showErrorBadge && (
                                    <span
                                      className="rounded-full px-1.5 py-0.5 text-[10px] font-black"
                                      style={{
                                        background: "rgba(34,197,94,0.2)",
                                        color: "#86EFAC",
                                      }}
                                    >
                                      {pendingWithdrawalsCount > 99
                                        ? "99+"
                                        : pendingWithdrawalsCount}
                                    </span>
                                  )}
                                {showPendingDepositsBadge && !showSosBadge && !showErrorBadge && (
                                  <span
                                    className="rounded-full px-1.5 py-0.5 text-[10px] font-black"
                                    style={{ background: "rgba(6,182,212,0.2)", color: "#67E8F9" }}
                                  >
                                    {pendingDepositsCount > 99 ? "99+" : pendingDepositsCount}
                                  </span>
                                )}
                                {showPendingProductsBadge &&
                                  !showSosBadge &&
                                  !showErrorBadge &&
                                  !showPendingRidersBadge &&
                                  !showPendingOrdersBadge &&
                                  !showPendingWithdrawalsBadge &&
                                  !showPendingDepositsBadge && (
                                    <span
                                      className="rounded-full px-1.5 py-0.5 text-[10px] font-black"
                                      style={{
                                        background: "rgba(139,92,246,0.2)",
                                        color: "#C4B5FD",
                                      }}
                                    >
                                      {pendingProductsCount > 99 ? "99+" : pendingProductsCount}
                                    </span>
                                  )}
                                {/* Favorite star — visible on hover, persisted on click. Hidden when mini. */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleFavorite(item.href);
                                  }}
                                  className={`-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-opacity duration-150 ${isFav ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"} admin-focus-ring`}
                                  title={isFav ? "Remove from favorites" : "Add to favorites"}
                                  aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                                >
                                  {isFav ? (
                                    <Star
                                      className="h-3.5 w-3.5"
                                      style={{ color: "#FBBF24", fill: "#FBBF24" }}
                                    />
                                  ) : (
                                    <StarOff
                                      className="h-3.5 w-3.5"
                                      style={{ color: "rgba(255,255,255,0.35)" }}
                                    />
                                  )}
                                </button>
                                {active && !hasBadge && (
                                  <ChevronRight
                                    className="h-3.5 w-3.5 shrink-0"
                                    style={{ color: `${group.color}60` }}
                                  />
                                )}
                              </>
                            )}
                          </div>
                        </Link>
                      );

                      if (showMini) {
                        const description = NAV_DESCRIPTIONS[item.href];
                        return (
                          <Tooltip key={item.href} delayDuration={150}>
                            <TooltipTrigger asChild>{itemNode}</TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[220px]">
                              <div className="text-[10px] font-bold tracking-wide uppercase opacity-60">
                                {T(group.labelKey)}
                              </div>
                              <div className="text-xs leading-tight font-semibold">
                                {T(item.nameKey)}
                              </div>
                              {description && (
                                <div className="mt-0.5 text-[11px] leading-snug opacity-80">
                                  {description}
                                </div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        );
                      }
                      const description = NAV_DESCRIPTIONS[item.href];
                      if (description) {
                        return (
                          <Tooltip key={item.href} delayDuration={600}>
                            <TooltipTrigger asChild>{itemNode}</TooltipTrigger>
                            <TooltipContent side="right" className="max-w-[220px]">
                              <div className="text-xs leading-tight font-semibold">
                                {T(item.nameKey)}
                              </div>
                              <div className="mt-0.5 text-[11px] leading-snug opacity-80">
                                {description}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      }
                      return <React.Fragment key={item.href}>{itemNode}</React.Fragment>;
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom section */}
        <div
          className="shrink-0"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            padding: showMiniFooter(mini, isMobile) ? "12px 10px" : "14px 14px",
          }}
        >
          {/* Profile card */}
          <div
            className="flex items-center rounded-xl transition-all duration-150"
            style={{
              padding: showMiniFooter(mini, isMobile) ? "8px 0" : "10px 12px",
              justifyContent: showMiniFooter(mini, isMobile) ? "center" : "flex-start",
              background: showMiniFooter(mini, isMobile) ? "transparent" : "rgba(255,255,255,0.03)",
              border: showMiniFooter(mini, isMobile) ? "none" : "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
              style={{
                background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                color: "#fff",
                boxShadow: "0 2px 10px rgba(99,102,241,0.35)",
              }}
            >
              A
            </div>
            {!showMiniFooter(mini, isMobile) && (
              <div className="ml-2.5 min-w-0 flex-1">
                <p
                  className="truncate text-[12px] font-semibold"
                  style={{ color: "rgba(255,255,255,0.85)" }}
                >
                  Administrator
                </p>
                <p className="truncate text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  admin@ajkmart.pk
                </p>
              </div>
            )}
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            title={showMiniFooter(mini, isMobile) ? "Logout" : undefined}
            className="group/logout mt-2 flex w-full items-center rounded-xl transition-all duration-200"
            style={{
              padding: showMiniFooter(mini, isMobile) ? "9px 0" : "9px 12px",
              justifyContent: showMiniFooter(mini, isMobile) ? "center" : "flex-start",
              color: "rgba(255,255,255,0.3)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)";
              (e.currentTarget as HTMLElement).style.color = "#F87171";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.3)";
            }}
          >
            <LogOut
              className="h-[17px] w-[17px] shrink-0"
              style={{ margin: showMiniFooter(mini, isMobile) ? 0 : "0 10px 0 4px" }}
            />
            {!showMiniFooter(mini, isMobile) && (
              <span className="text-[13px] font-medium">{T("logout")}</span>
            )}
          </button>
        </div>
      </div>
    </TooltipProvider>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#F1F5F9" }}>
      {/* Skip-to-main navigation link — visible only on keyboard focus */}
      <a href="#main-content" className="admin-skip-link">
        Skip to main content
      </a>
      {/* Desktop sidebar */}
      <div
        className="z-20 hidden h-full shrink-0 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] lg:block"
        style={{ width: sidebarWidth }}
      >
        {SidebarContent({ mini: collapsed })}
      </div>

      {/* Mobile drawer overlay */}
      {isMobileMenuOpen && (
        <div
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="fixed inset-0 z-50 lg:hidden"
        >
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-[6px] transition-opacity duration-300"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
            style={{ animation: "fadeIn 200ms ease-out" }}
          />
          <div
            ref={mobileDrawerRef}
            className="relative z-10 h-full"
            style={{
              width: 280,
              animation: "slideInLeft 250ms cubic-bezier(0.16,1,0.3,1)",
              boxShadow: "4px 0 32px rgba(0,0,0,0.3)",
            }}
          >
            {SidebarContent({ isMobile: true })}
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* SOS top banner */}
        {sosCount > 0 && (
          <Link href="/sos-alerts">
            <div
              className="relative z-20 flex cursor-pointer items-center justify-center gap-2 overflow-hidden text-white"
              style={{
                background: "linear-gradient(90deg, #B91C1C, #DC2626, #B91C1C)",
                padding: "7px 16px",
              }}
            >
              <span
                className="absolute inset-0 animate-pulse"
                style={{ background: "rgba(239,68,68,0.30)", animationDuration: "1s" }}
              />
              <AlertTriangle className="relative z-10 h-3.5 w-3.5" />
              <span className="relative z-10 text-xs font-bold tracking-wide">
                {sosCount} Active SOS Alert{sosCount !== 1 ? "s" : ""} — Tap for immediate response
              </span>
              <AlertTriangle className="relative z-10 h-3.5 w-3.5" />
            </div>
          </Link>
        )}

        {/* Socket connection status banners */}
        {socketStatus === "disconnected" && !justConnected && (
          <div className="z-20 bg-red-500 py-1 text-center text-xs text-white">
            ⚡ Disconnected from real-time server. Some data may be stale.
          </div>
        )}
        {socketStatus === "reconnecting" && (
          <div className="z-20 bg-yellow-500 py-1 text-center text-xs text-white">
            🔄 Reconnecting to real-time server…
          </div>
        )}
        {justConnected && socketStatus === "connected" && (
          <div className="z-20 bg-emerald-500 py-1 text-center text-xs text-white">
            ✓ Connected to real-time server
          </div>
        )}

        {/* Header */}
        <header
          className="z-10 flex shrink-0 items-center justify-between"
          style={{
            height: 60,
            padding: "0 20px 0 16px",
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          {/* Left */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleCollapsed}
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all duration-150 hover:bg-slate-100 hover:text-slate-600 lg:flex"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>

            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav-drawer"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg lg:hidden"
              style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}
            >
              <ShoppingBag className="h-3.5 w-3.5 text-white" />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="hidden text-xs font-medium text-slate-400 sm:block">AJKMart</span>
              <ChevronRight className="hidden h-3 w-3 text-slate-300 sm:block" />
              <span className="text-sm font-semibold text-slate-700">{currentPageName}</span>
            </div>
          </div>

          {/* Center: global search + ⌘K hint */}
          <div className="relative hidden items-center gap-2 sm:flex">
            <GlobalSearch inputRef={globalSearchRef} />
            <button
              onClick={() => setCmdOpen(true)}
              aria-label="Open command palette (⌘K)"
              title="Command palette (⌘K)"
              className="flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-all duration-150 hover:bg-slate-50"
              style={{ borderColor: "rgba(0,0,0,0.08)", color: "#94A3B8" }}
            >
              <kbd className="font-mono text-[10px]">⌘K</kbd>
            </button>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setCmdOpen(true)}
              aria-label="Open search"
              aria-expanded={cmdOpen}
              className="flex h-8 w-8 items-center justify-center rounded-xl border transition-colors hover:bg-slate-50 sm:hidden"
              style={{ borderColor: "rgba(0,0,0,0.08)" }}
            >
              <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </button>

            {/* Live indicator */}
            <div
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 sm:flex"
              style={{
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.12)",
              }}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-[11px] font-semibold text-emerald-600">{T("live")}</span>
            </div>

            {/* SOS badge */}
            {sosCount > 0 && (
              <Link href="/sos-alerts">
                <div
                  className="flex animate-pulse cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    color: "#DC2626",
                  }}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-bold">{sosCount} SOS</span>
                </div>
              </Link>
            )}

            {/* Activity notification bell — orders, KYC, SOS */}
            <AdminNotificationBell />

            {/* Stock notification bell */}
            <StockNotificationBell />

            {/* Language selector */}
            <div className="relative hidden sm:block" ref={langRef}>
              <button
                onClick={() => setLangOpen((o) => !o)}
                disabled={langLoading}
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-150 hover:bg-slate-50"
                style={{ borderColor: "rgba(0,0,0,0.08)", color: "#64748B" }}
              >
                <Globe className="h-3.5 w-3.5" />
                {currentLangLabel}
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`}
                />
              </button>
              {langOpen && (
                <div
                  className="absolute top-full right-0 z-50 mt-1.5 overflow-hidden rounded-xl"
                  style={{
                    background: "#fff",
                    border: "1px solid rgba(0,0,0,0.08)",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
                    minWidth: 150,
                  }}
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        void setLanguage(opt.value as Language);
                        setLangOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors"
                      style={{
                        fontWeight: language === opt.value ? 600 : 400,
                        color: language === opt.value ? "#6366F1" : "#374151",
                        background:
                          language === opt.value ? "rgba(99,102,241,0.06)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (language !== opt.value)
                          (e.currentTarget as HTMLElement).style.background = "#F8FAFC";
                      }}
                      onMouseLeave={(e) => {
                        if (language !== opt.value)
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* User menu */}
            <div className="relative hidden sm:block" ref={userRef}>
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-all duration-150 hover:bg-slate-50"
              >
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                    color: "#fff",
                    boxShadow: "0 2px 6px rgba(99,102,241,0.3)",
                  }}
                >
                  A
                </div>
                <ChevronDown
                  className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${userMenuOpen ? "rotate-180" : ""}`}
                />
              </button>
              {userMenuOpen && (
                <div
                  className="absolute top-full right-0 z-50 mt-1.5 overflow-hidden rounded-xl"
                  style={{
                    background: "#fff",
                    border: "1px solid rgba(0,0,0,0.08)",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
                    minWidth: 190,
                  }}
                >
                  <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <p className="text-sm font-semibold text-slate-700">
                      {state.user?.name || "Administrator"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {state.user?.email || "admin@ajkmart.pk"}
                    </p>
                  </div>
                  <button
                    onClick={toggleDark}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-600 transition-colors"
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "transparent")
                    }
                  >
                    {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {isDark ? "Light Mode" : "Dark Mode"}
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-500 transition-colors"
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.06)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "transparent")
                    }
                  >
                    <LogOut className="h-4 w-4" />
                    {T("logout")}
                  </button>
                </div>
              )}
            </div>

            {/* Mobile logout */}
            <button
              onClick={handleLogout}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 sm:hidden"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <ErrorBoundary
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
                <p className="font-semibold text-red-600">
                  {T("errorCommandPalette" as TranslationKey)}
                </p>
              </div>
            </div>
          }
        >
          <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
        </ErrorBoundary>

        {/* Page content */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto pb-20 focus:outline-none lg:pb-6"
          style={{ background: "#F1F5F9" }}
        >
          <div className="animate-in fade-in slide-in-from-bottom-2 mx-auto max-w-7xl p-3 duration-300 ease-out sm:p-5 lg:p-7">
            <Breadcrumbs />
            {children}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="safe-area-inset-bottom fixed inset-x-0 bottom-0 z-40 border-t lg:hidden"
          style={{
            background: "rgba(255,255,255,0.97)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderColor: "rgba(0,0,0,0.06)",
            boxShadow: "0 -2px 20px rgba(0,0,0,0.04)",
          }}
        >
          <div className="mx-auto flex h-16 max-w-md items-stretch">
            {BOTTOM_NAV.map((item) => {
              const active = item.href !== "__more__" && isActive(item.href);
              const Icon = item.icon;
              const hasSosAlert = item.isSos && sosCount > 0;

              if (item.href === "__more__") {
                return (
                  <button
                    key="more"
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="flex flex-1 flex-col items-center justify-center gap-1 transition-colors"
                    style={{ color: "#94A3B8" }}
                  >
                    <Menu className="h-5 w-5" />
                    <span className="text-[10px] font-semibold">{T("navMore")}</span>
                  </button>
                );
              }

              return (
                <Link key={item.href} href={item.href} className="flex-1">
                  <div
                    className="flex h-full flex-col items-center justify-center gap-1 transition-all"
                    style={{ color: hasSosAlert ? "#DC2626" : active ? "#6366F1" : "#94A3B8" }}
                  >
                    {hasSosAlert ? (
                      <div className="relative">
                        <div
                          className="absolute inset-0 animate-ping rounded-full"
                          style={{ background: "rgba(220,38,38,0.2)" }}
                        />
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-full shadow-lg"
                          style={{
                            background: "linear-gradient(135deg, #DC2626, #EF4444)",
                            boxShadow: "0 4px 12px rgba(220,38,38,0.4)",
                          }}
                        >
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <span
                          className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white"
                          style={{
                            background: "#fff",
                            color: "#DC2626",
                            border: "1.5px solid #FECACA",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                          }}
                        >
                          {sosCount > 9 ? "9+" : sosCount}
                        </span>
                      </div>
                    ) : (
                      <div className="relative">
                        {active && (
                          <span
                            className="absolute -inset-1.5 rounded-xl"
                            style={{ background: "rgba(99,102,241,0.10)" }}
                          />
                        )}
                        <Icon className="relative z-10 h-5 w-5" />
                      </div>
                    )}
                    <span className="text-[10px] font-semibold">
                      {hasSosAlert ? "SOS!" : T(item.nameKey)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function showMiniFooter(mini?: boolean, isMobile?: boolean): boolean {
  return !!mini && !isMobile;
}
