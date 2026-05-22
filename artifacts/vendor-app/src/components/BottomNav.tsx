import { useQuery } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { Link, useLocation } from "wouter";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/useLanguage";

const navItems: { href: string; labelKey: TranslationKey; icon: string }[] = [
  { href: "/", labelKey: "dashboard", icon: "📊" },
  { href: "/orders", labelKey: "orders", icon: "📦" },
  { href: "/chat", labelKey: "chat", icon: "💬" },
  { href: "/products", labelKey: "products", icon: "🍽️" },
  { href: "/wallet", labelKey: "wallet", icon: "💰" },
  { href: "/profile", labelKey: "account", icon: "👤" },
];

interface Conversation {
  unreadCount: number;
}

export function BottomNav() {
  const [location] = useLocation();
  const { language } = useLanguage();
  const { user } = useAuth();
  const T = (key: TranslationKey) => tDual(key, language);

  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["vendor-conversations-unread"],
    queryFn: () => api.getConversations(),
    enabled: !!user,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    select: (data: unknown) => (Array.isArray(data) ? data : []),
  });

  const unreadCount = (conversations ?? []).filter((c) => c.unreadCount > 0).length;
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-40 md:hidden"
      style={{
        background: "#0D1117",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.40)",
        paddingBottom: "max(8px, env(safe-area-inset-bottom, 8px))",
      }}
    >
      <div className="flex">
        {navItems.map((item) => {
          const active =
            location === item.href || (item.href !== "/" && location.startsWith(item.href));
          const isChatTab = item.href === "/chat";
          return (
            <Link
              key={item.href}
              href={item.href}
              className="android-press relative flex min-h-0 flex-1 flex-col items-center gap-0.5 pt-2 pb-1"
            >
              {/* Active top indicator */}
              {active && (
                <div
                  className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full"
                  style={{ background: "linear-gradient(90deg, #1A56DB, #60A5FA)" }}
                />
              )}
              {/* Icon container */}
              <span
                className="relative flex h-7 w-10 items-center justify-center rounded-xl text-xl transition-all duration-200"
                style={active ? { background: "rgba(26,86,219,0.18)" } : {}}
              >
                {item.icon}
                {isChatTab && unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 flex items-center justify-center rounded-full leading-none font-bold text-white"
                    style={{
                      minWidth: unreadCount > 9 ? "18px" : "16px",
                      height: "16px",
                      fontSize: "9px",
                      padding: "0 3px",
                      background: "#EF4444",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                    }}
                  >
                    {badgeLabel}
                  </span>
                )}
              </span>
              {/* Label */}
              <span
                className="text-[10px] leading-none font-bold transition-colors"
                style={{ color: active ? "#60A5FA" : "#4B5563" }}
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
