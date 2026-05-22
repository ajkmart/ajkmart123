import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { useCallback, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { ErrorState } from "../components/ui/ErrorState";
import { api } from "../lib/api";
import { CARD, CARD_HEADER, fd } from "../lib/ui";
import { useLanguage } from "../lib/useLanguage";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  icon?: string;
  isRead?: boolean;
  createdAt: string;
}

function typeIcon(type: string) {
  if (type === "order") return "📦";
  if (type === "wallet") return "💰";
  if (type === "promo") return "🎟️";
  if (type === "system") return "⚙️";
  if (type === "alert") return "⚠️";
  return "🔔";
}

export default function Notifications() {
  const qc = useQueryClient();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["vendor-notifications"],
    queryFn: () => api.getNotifications(),
    refetchInterval: 30000,
  });

  const notifs: Notification[] = data?.notifications || [];
  const unread: number = data?.unread || 0;

  const pullY = useRef(0);
  const pulling = useRef(false);
  const startY = useRef(0);
  const pullIndicatorRef = useRef<HTMLDivElement>(null);

  const getMainScroll = () => document.getElementById("main-scroll");

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const mainScroll = getMainScroll();
    const scrollTop = mainScroll ? mainScroll.scrollTop : 0;
    pullY.current = 0;
    pulling.current = false;
    if (scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return;
    const diff = Math.max(0, Math.min(80, e.touches[0].clientY - startY.current));
    pullY.current = diff;
    if (pullIndicatorRef.current) {
      pullIndicatorRef.current.style.opacity = String(diff / 60);
      pullIndicatorRef.current.style.display = diff > 0 ? "flex" : "none";
      if (diff > 50) pullIndicatorRef.current.classList.add("animate-spin");
      else pullIndicatorRef.current.classList.remove("animate-spin");
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (pullY.current > 50) void refetch();
    pullY.current = 0;
    pulling.current = false;
    if (pullIndicatorRef.current) {
      pullIndicatorRef.current.style.opacity = "0";
      pullIndicatorRef.current.style.display = "none";
    }
  }, [refetch]);

  const markAllMut = useMutation({
    mutationFn: () => api.markAllRead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-notifications"] });
      void qc.invalidateQueries({ queryKey: ["vendor-notifs-count"] });
      void qc.invalidateQueries({ queryKey: ["vendor-me"] });
    },
    onError: () => {
      void refetch();
    },
  });

  const [pendingNotifIds, setPendingNotifIds] = useState<Set<string>>(new Set());

  const markOneMut = useMutation({
    mutationFn: (id: string) => {
      setPendingNotifIds((s) => new Set(s).add(id));
      return api.markNotificationRead(id);
    },
    onSettled: (_d, _e, id) => {
      setPendingNotifIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-notifications"] });
      void qc.invalidateQueries({ queryKey: ["vendor-notifs-count"] });
    },
  });

  return (
    <div className="bg-[#0A0F1A] md:bg-transparent">
      <PageHeader
        title={T("notifications")}
        subtitle={unread > 0 ? `${unread} ${T("unread")}` : T("allCaughtUp")}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => refetch()}
              className="android-press h-9 min-h-0 rounded-xl bg-white/20 px-3 text-sm font-bold text-white md:bg-gray-100 md:text-gray-700"
            >
              ↻
            </button>
            {unread > 0 && (
              <button
                onClick={() => markAllMut.mutate()}
                disabled={markAllMut.isPending}
                className="android-press h-9 min-h-0 rounded-xl bg-white/20 px-4 text-sm font-bold text-white md:bg-blue-50 md:text-blue-600"
              >
                ✓ {T("markAllRead")}
              </button>
            )}
          </div>
        }
      />

      <div
        className="px-4 py-4 md:px-0 md:py-4"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          ref={pullIndicatorRef}
          className="mb-2 hidden justify-center py-2"
          style={{ opacity: 0 }}
        >
          <div className="h-6 w-6 rounded-full border-2 border-blue-400 border-t-transparent" />
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-20 rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <div className={CARD}>
            <ErrorState
              title={T("somethingWentWrong")}
              subtitle={T("checkInternetRetry")}
              onRetry={() => refetch()}
              retryLabel={T("retry")}
            />
          </div>
        ) : notifs.length === 0 ? (
          <div className={`${CARD} px-4 py-20 text-center`}>
            <p className="mb-4 text-5xl">🔔</p>
            <p className="text-base font-bold text-gray-700">{T("noNotificationsYet")}</p>
            <p className="mt-1 text-sm text-gray-400">{T("noNotificationsDesc")}</p>
          </div>
        ) : (
          <div className={CARD}>
            <div className={`${CARD_HEADER} bg-gray-50`}>
              <p className="text-sm font-bold text-gray-700">{notifs.length} notifications</p>
              {unread > 0 && (
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-600">
                  {unread} unread
                </span>
              )}
            </div>
            <div className="divide-y divide-gray-50">
              {notifs.map((n) => (
                <button
                  key={n.id}
                  className={`android-press flex min-h-0 w-full gap-3 px-4 py-4 text-left transition-colors ${!n.isRead ? "bg-blue-50/40 hover:bg-blue-50/80" : "hover:bg-gray-50"}`}
                  onClick={() => {
                    if (!n.isRead && !pendingNotifIds.has(n.id)) markOneMut.mutate(n.id);
                  }}
                >
                  <div
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-xl ${!n.isRead ? "bg-blue-100" : "bg-gray-100"}`}
                  >
                    {typeIcon(n.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-sm leading-snug font-bold ${!n.isRead ? "text-gray-900" : "text-gray-700"}`}
                      >
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-600" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{n.body}</p>
                    <p className="mt-1.5 text-[10px] font-medium text-gray-400">
                      {fd(n.createdAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
