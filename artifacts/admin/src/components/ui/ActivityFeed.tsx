import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useActivityFeed,
  type ActivityEvent,
  type ActivityEventType,
} from "@/hooks/useActivityFeed";
import {
  AlertTriangle,
  Car,
  Package,
  Radio,
  Shield,
  ShoppingBag,
  Trash2,
  TrendingDown,
  Wallet,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

const EVENT_META: Record<
  ActivityEventType,
  { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; dot: string }
> = {
  "order:new": {
    icon: ShoppingBag,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    dot: "bg-indigo-500",
  },
  "order:update": {
    icon: ShoppingBag,
    color: "text-blue-600",
    bg: "bg-blue-50",
    dot: "bg-blue-500",
  },
  "ride:dispatch_update": {
    icon: Car,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    dot: "bg-emerald-500",
  },
  "rider:sos": { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", dot: "bg-red-500" },
  "rider:status": {
    icon: Radio,
    color: "text-violet-600",
    bg: "bg-violet-50",
    dot: "bg-violet-500",
  },
  "rider:offline": { icon: Radio, color: "text-gray-500", bg: "bg-gray-50", dot: "bg-gray-400" },
  "rider:spoof-alert": {
    icon: Shield,
    color: "text-orange-600",
    bg: "bg-orange-50",
    dot: "bg-orange-500",
  },
  "wallet:admin-topup": {
    icon: Wallet,
    color: "text-amber-600",
    bg: "bg-amber-50",
    dot: "bg-amber-500",
  },
  "wallet:deposit-approved": {
    icon: Wallet,
    color: "text-green-600",
    bg: "bg-green-50",
    dot: "bg-green-500",
  },
  "product:stock_updated": {
    icon: Package,
    color: "text-blue-600",
    bg: "bg-blue-50",
    dot: "bg-blue-500",
  },
  "product:stock_low": {
    icon: TrendingDown,
    color: "text-orange-600",
    bg: "bg-orange-50",
    dot: "bg-orange-500",
  },
};

function EventRow({ event, tick }: { event: ActivityEvent; tick: number }) {
  const meta = EVENT_META[event.type] ?? {
    icon: Radio,
    color: "text-gray-500",
    bg: "bg-gray-50",
    dot: "bg-gray-400",
  };
  const Icon = meta.icon;
  const isSos = event.type === "rider:sos";

  void tick;

  return (
    <div
      className={`border-border/30 hover:bg-muted/30 flex items-start gap-3 border-b px-4 py-3 transition-colors last:border-0 ${isSos ? "animate-pulse-once" : ""}`}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}
      >
        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm leading-tight font-semibold ${isSos ? "text-red-600" : "text-foreground"}`}
        >
          {event.title}
        </p>
        {event.subtitle && (
          <p className="text-muted-foreground mt-0.5 truncate text-xs">{event.subtitle}</p>
        )}
      </div>
      <span className="text-muted-foreground mt-0.5 shrink-0 text-[10px] tabular-nums">
        {relativeTime(event.ts)}
      </span>
    </div>
  );
}

export function ActivityFeed({ maxVisible = 12 }: { maxVisible?: number }) {
  const { events, connected, clear } = useActivityFeed();
  const listRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);
  const prevLenRef = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!hoverRef.current && listRef.current && events.length > prevLenRef.current) {
      listRef.current.scrollTop = 0;
    }
    prevLenRef.current = events.length;
  }, [events.length]);

  const visible = events.slice(0, maxVisible);

  return (
    <Card className="border-border/50 flex flex-col overflow-hidden rounded-2xl shadow-sm">
      <div className="border-border/30 bg-card flex shrink-0 items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Radio className="h-4 w-4 shrink-0 text-indigo-500" />
          <h2 className="truncate text-base font-bold sm:text-lg">Live Activity</h2>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              connected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-gray-100 text-gray-500"
            }`}
          >
            {connected ? (
              <>
                <Wifi className="h-2.5 w-2.5" /> Live
              </>
            ) : (
              <>
                <WifiOff className="h-2.5 w-2.5" /> Offline
              </>
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {events.length > 0 && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {events.length} event{events.length !== 1 ? "s" : ""}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={events.length === 0}
            className="text-muted-foreground hover:text-foreground h-7 w-7 p-0"
            title="Clear feed"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        ref={listRef}
        className="overflow-y-auto"
        style={{ maxHeight: 420 }}
        onMouseEnter={() => {
          hoverRef.current = true;
        }}
        onMouseLeave={() => {
          hoverRef.current = false;
        }}
      >
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50">
              <Radio className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-foreground text-sm font-semibold">Waiting for live events</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Orders, rides, and wallet actions will appear here in real time.
              </p>
            </div>
            {!connected && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-600">
                Connecting to socket…
              </span>
            )}
          </div>
        ) : (
          visible.map((ev) => <EventRow key={ev.id} event={ev} tick={tick} />)
        )}
      </div>

      {events.length > maxVisible && (
        <div className="border-border/30 bg-muted/30 shrink-0 border-t px-4 py-2 text-center">
          <span className="text-muted-foreground text-xs">
            +{events.length - maxVisible} older events not shown
          </span>
        </div>
      )}
    </Card>
  );
}
