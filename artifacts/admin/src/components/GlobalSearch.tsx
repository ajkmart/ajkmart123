import { adminFetch } from "@/lib/adminFetcher";
import { cn } from "@/lib/utils";
import { Bike, Loader2, Search, ShoppingBag, User, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

interface SearchResult {
  id: string;
  label: string;
  sub?: string;
  href: string;
  type: "user" | "order" | "rider";
}

interface AdminUserRecord {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
}

interface AdminOrderRecord {
  id: string;
  status?: string;
  type?: string;
}

interface AdminRiderRecord {
  id: string;
  name?: string;
  phone?: string;
  status?: string;
}

interface AdminListResponse<T> {
  data?: T[];
  users?: T[];
  orders?: T[];
  riders?: T[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const TYPE_CONFIG = {
  user: { icon: User, label: "Users", color: "text-blue-600", bg: "bg-blue-50" },
  order: { icon: ShoppingBag, label: "Orders", color: "text-amber-600", bg: "bg-amber-50" },
  rider: { icon: Bike, label: "Riders", color: "text-green-600", bg: "bg-green-50" },
};

const SEE_ALL_PATHS: Record<"user" | "order" | "rider", string> = {
  user: "/users",
  order: "/orders",
  rider: "/riders",
};

interface GlobalSearchProps {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onClose?: () => void;
}

export function GlobalSearch({ inputRef: externalRef, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? internalRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const debouncedQuery = useDebounce(query, 300);

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const encoded = encodeURIComponent(q);
      const [usersRaw, ordersRaw, ridersRaw] = await Promise.allSettled([
        adminFetch(`/users?search=${encoded}&limit=3`) as Promise<
          AdminListResponse<AdminUserRecord>
        >,
        adminFetch(`/orders?search=${encoded}&limit=3`) as Promise<
          AdminListResponse<AdminOrderRecord>
        >,
        adminFetch(`/riders?search=${encoded}&limit=3`) as Promise<
          AdminListResponse<AdminRiderRecord>
        >,
      ]);

      const mapped: SearchResult[] = [];

      if (usersRaw.status === "fulfilled") {
        const users = usersRaw.value?.users ?? usersRaw.value?.data ?? [];
        for (const u of users.slice(0, 3)) {
          mapped.push({
            id: u.id,
            type: "user",
            label: u.name || u.phone || u.id,
            sub: u.phone ?? u.email,
            href: `/users?highlight=${u.id}`,
          });
        }
      }
      if (ordersRaw.status === "fulfilled") {
        const orders = ordersRaw.value?.orders ?? ordersRaw.value?.data ?? [];
        for (const o of orders.slice(0, 3)) {
          mapped.push({
            id: o.id,
            type: "order",
            label: `Order #${o.id.slice(-8)}`,
            sub: o.status ?? o.type,
            href: `/orders?highlight=${o.id}`,
          });
        }
      }
      if (ridersRaw.status === "fulfilled") {
        const riders = ridersRaw.value?.riders ?? ridersRaw.value?.data ?? [];
        for (const r of riders.slice(0, 3)) {
          mapped.push({
            id: r.id,
            type: "rider",
            label: r.name || r.phone || r.id,
            sub: r.phone ?? r.status,
            href: `/riders?highlight=${r.id}`,
          });
        }
      }
      setResults(mapped);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void doSearch(debouncedQuery);
  }, [debouncedQuery, doSearch]);

  useEffect(() => {
    if (query) setOpen(true);
    else setOpen(false);
    setActiveIdx(-1);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    onClose?.();
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    }
    if (e.key === "Enter" && activeIdx >= 0) {
      const item = results[activeIdx];
      if (item) {
        navigate(item.href);
        close();
      }
    }
    if (e.key === "Escape") {
      close();
      inputRef.current?.blur();
    }
  };

  const grouped: Record<"user" | "order" | "rider", SearchResult[]> = {
    user: results.filter((r) => r.type === "user"),
    order: results.filter((r) => r.type === "order"),
    rider: results.filter((r) => r.type === "rider"),
  };

  const hasResults = results.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xs lg:max-w-sm">
      <div className="relative flex items-center">
        <Search className="text-muted-foreground pointer-events-none absolute left-3 h-4 w-4" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search orders, users, riders…"
          className="border-border bg-background placeholder:text-muted-foreground focus:ring-primary/30 focus:border-primary/50 h-9 w-full rounded-lg border pr-8 pl-9 text-sm transition-colors focus:ring-2 focus:outline-none"
          aria-label="Global search"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {query && !loading && (
          <button
            type="button"
            onClick={() => close()}
            className="hover:bg-muted absolute right-2 rounded p-0.5 transition-colors"
            aria-label="Clear search"
          >
            <X className="text-muted-foreground h-3.5 w-3.5" />
          </button>
        )}
        {loading && (
          <Loader2 className="text-muted-foreground pointer-events-none absolute right-2 h-3.5 w-3.5 animate-spin" />
        )}
      </div>

      {open && (
        <div className="border-border absolute top-full right-0 left-0 z-50 mt-1.5 max-h-80 overflow-hidden overflow-y-auto rounded-xl border bg-white shadow-xl">
          {!loading && !hasResults && debouncedQuery.length >= 2 && (
            <div className="text-muted-foreground px-4 py-6 text-center text-sm">
              No results for "{debouncedQuery}"
            </div>
          )}
          {!loading && debouncedQuery.length < 2 && (
            <div className="text-muted-foreground px-4 py-3 text-xs">
              Type at least 2 characters to search
            </div>
          )}
          {hasResults && (
            <div className="py-1">
              {(["user", "order", "rider"] as const).map((type) => {
                const items = grouped[type];
                if (!items.length) return null;
                const cfg = TYPE_CONFIG[type];
                const Icon = cfg.icon;
                return (
                  <div key={type}>
                    <div className="flex items-center gap-1.5 px-3 py-1.5">
                      <Icon className={cn("h-3 w-3", cfg.color)} />
                      <span
                        className={cn("text-[10px] font-bold tracking-wide uppercase", cfg.color)}
                      >
                        {cfg.label}
                      </span>
                    </div>
                    {items.map((item) => {
                      const globalIdx = results.indexOf(item);
                      const isActive = globalIdx === activeIdx;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                            isActive ? "bg-muted" : "hover:bg-muted/50"
                          )}
                          onMouseEnter={() => setActiveIdx(globalIdx)}
                          onClick={() => {
                            navigate(item.href);
                            close();
                          }}
                        >
                          <div
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                              cfg.bg
                            )}
                          >
                            <Icon className={cn("h-3 w-3", cfg.color)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate text-sm font-medium">
                              {item.label}
                            </p>
                            {item.sub && (
                              <p className="text-muted-foreground truncate text-xs">{item.sub}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs transition-colors",
                        cfg.color,
                        "opacity-70 hover:underline hover:opacity-100"
                      )}
                      onClick={() => {
                        navigate(
                          `${SEE_ALL_PATHS[type]}?search=${encodeURIComponent(debouncedQuery)}`
                        );
                        close();
                      }}
                    >
                      See all results →
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="border-border/50 text-muted-foreground bg-muted/30 flex items-center gap-3 border-t px-3 py-1.5 text-[10px]">
            <span>
              <kbd className="border-border rounded border bg-white px-1 font-mono">↑↓</kbd>{" "}
              navigate
            </span>
            <span>
              <kbd className="border-border rounded border bg-white px-1 font-mono">↵</kbd> open
            </span>
            <span>
              <kbd className="border-border rounded border bg-white px-1 font-mono">Esc</kbd> close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
