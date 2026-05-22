import { useQuery } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { Bell, Home, MapPin, RefreshCw, TrendingUp, User, Wallet } from "lucide-react";
import { Link, useLocation } from "wouter";
import { api } from "../lib/api";
import { useQueueStatus } from "../lib/offline/queueManager";
import { getRiderModules, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";

import type { LucideProps } from "lucide-react";
import type { RiderModules } from "../lib/useConfig";
interface NavItem {
  href: string;
  labelKey: TranslationKey;
  Icon: React.ComponentType<LucideProps>;
  moduleKey?: keyof RiderModules;
}

const navItems: NavItem[] = [
  { href: "/", labelKey: "home", Icon: Home },
  { href: "/active", labelKey: "active", Icon: MapPin },
  { href: "/wallet", labelKey: "wallet", Icon: Wallet, moduleKey: "wallet" },
  { href: "/earnings", labelKey: "earnings", Icon: TrendingUp },
  { href: "/notifications", labelKey: "alerts", Icon: Bell },
  { href: "/profile", labelKey: "profile", Icon: User },
];

export function BottomNav() {
  const [location] = useLocation();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { config } = usePlatformConfig();
  const modules = getRiderModules(config);
  const { pendingCount, syncing } = useQueueStatus();

  const { data: notifData } = useQuery({
    queryKey: ["rider-notifs-count"],
    queryFn: () => api.getNotifications(),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const unread: number = notifData?.unread || 0;

  const { data: activeData } = useQuery({
    queryKey: ["rider-active"],
    queryFn: () => api.getActive(),
    refetchInterval: 8000,
    staleTime: 60_000,
  });
  const hasActive = !!(activeData?.order || activeData?.ride);

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-40 border-t border-gray-200/60 bg-white/95 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-lg"
      style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom, 6px))" }}
    >
      {pendingCount > 0 && (
        <div className="flex items-center justify-center gap-1.5 bg-amber-500 px-3 py-1 text-[10px] font-bold text-white">
          <RefreshCw size={10} className={syncing ? "animate-spin" : ""} />
          {syncing
            ? `Syncing ${pendingCount} pending action${pendingCount > 1 ? "s" : ""}…`
            : `${pendingCount} action${pendingCount > 1 ? "s" : ""} queued — will sync when online`}
        </div>
      )}
      <div className="mx-auto flex max-w-md">
        {navItems
          .filter((item) => !item.moduleKey || modules[item.moduleKey] !== false)
          .map((item) => {
            const active =
              location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const { Icon } = item;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="android-press relative flex min-h-0 flex-1 flex-col items-center gap-0.5 pt-2 pb-1"
              >
                <div className="relative">
                  <span
                    className={`flex h-8 w-11 items-center justify-center rounded-full transition-all duration-200 ${active ? "bg-gray-900/10" : ""}`}
                  >
                    <Icon
                      size={21}
                      strokeWidth={active ? 2.5 : 1.8}
                      className={`transition-colors duration-200 ${active ? "text-gray-900" : "text-gray-400"}`}
                    />
                  </span>
                  {active && (
                    <div className="absolute -bottom-0.5 left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-full bg-gray-900" />
                  )}
                  {item.href === "/notifications" && unread > 0 && (
                    <span className="absolute -top-1 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-extrabold text-white shadow-sm">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                  {item.href === "/active" && hasActive && location !== "/active" && (
                    <span className="absolute -top-1 -right-0.5 flex items-center justify-center">
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative h-2.5 w-2.5 rounded-full bg-green-500"></span>
                      </span>
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] leading-none font-semibold transition-colors duration-200 ${active ? "font-bold text-gray-900" : "text-gray-400"}`}
                >
                  {T(item.labelKey)}
                </span>
              </Link>
            );
          })}
      </div>
    </nav>
  );
}
