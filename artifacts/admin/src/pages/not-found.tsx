import { CommandPalette } from "@/components/CommandPalette";
import { Button } from "@/components/ui/button";
import { safeLocalGet } from "@/lib/safeStorage";
import { Compass, Home, Search, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

interface RecentEntry {
  href: string;
  label: string;
}

const HISTORY_KEY = "ajkmart_admin_recent_pages";

function readRecent(): RecentEntry[] {
  try {
    const raw = safeLocalGet(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e: any) => e && typeof e.href === "string" && typeof e.label === "string")
      .slice(0, 3);
  } catch {
    return [];
  }
}

export default function NotFound() {
  const [location] = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  return (
    <>
      <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 px-4 py-10">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
            <ShoppingBag className="h-8 w-8 text-white" />
          </div>

          <p className="mb-3 text-[11px] font-bold tracking-[0.18em] text-indigo-500 uppercase">
            AJKMart Admin Console
          </p>

          <h1 className="mb-3 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            We couldn't find that page
          </h1>

          <p className="mb-8 text-sm leading-relaxed text-slate-500 md:text-[15px]">
            The page{" "}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
              {location}
            </span>{" "}
            doesn't exist or was moved. Use the dashboard or jump straight to a page from search.
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/dashboard">
              <Button className="h-11 w-full gap-2 rounded-xl px-6 sm:w-auto">
                <Home className="h-4 w-4" />
                Go to Dashboard
              </Button>
            </Link>
            <Button
              variant="outline"
              className="h-11 w-full gap-2 rounded-xl px-6 sm:w-auto"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="h-4 w-4" />
              Open Search
            </Button>
          </div>

          {recent.length > 0 && (
            <div className="mt-10 text-left">
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.16em] text-slate-400 uppercase">
                <Compass className="h-3 w-3" /> Recently visited
              </p>
              <div className="grid gap-1.5">
                {recent.map((entry) => (
                  <Link key={entry.href} href={entry.href}>
                    <div className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm transition-colors hover:bg-slate-50">
                      <span className="font-medium text-slate-700">{entry.label}</span>
                      <span className="font-mono text-xs text-slate-400">{entry.href}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
