import { useQuery } from "@tanstack/react-query";
import { formatCurrency as _sharedFcP } from "@workspace/api-zod";
import { ArrowRight, Ban, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { api } from "../../lib/api";

const fc = (n: string | number | null | undefined, currencySymbol = "Rs.") =>
  _sharedFcP(n != null ? String(n) : (n as null | undefined), currencySymbol);

interface ProfilePenaltyHistoryProps {
  currency: string;
}

export function ProfilePenaltyHistory({ currency }: ProfilePenaltyHistoryProps) {
  const [open, setOpen] = useState(false);

  const { data: penaltyData } = useQuery({
    queryKey: ["rider-penalty-history"],
    queryFn: () => api.getPenaltyHistory(),
    enabled: open,
    staleTime: 60000,
  });

  return (
    <div className="animate-[slideUp_0.7s_ease-out] overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 transition-colors active:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50">
            <Ban size={16} className="text-red-500" />
          </div>
          <div className="text-left">
            <p className="text-[14px] font-bold text-gray-900">Penalty History</p>
            <p className="text-[10px] text-gray-400">
              Deductions, ignores &amp; cancellation penalties
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp size={16} className="text-gray-300" />
        ) : (
          <ChevronDown size={16} className="text-gray-300" />
        )}
      </button>
      {open && (
        <div className="border-t border-gray-50">
          {!penaltyData ? (
            <div className="flex items-center justify-center px-5 py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
            </div>
          ) : (
            (() => {
              const penalties: any[] = penaltyData?.penalties ?? [];
              if (penalties.length === 0)
                return (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm font-medium text-gray-400">No penalties on record</p>
                  </div>
                );
              const typeColor: Record<string, string> = {
                ignore: "bg-amber-100 text-amber-700",
                cancel: "bg-red-100 text-red-700",
                ignore_penalty: "bg-orange-100 text-orange-700",
                cancel_penalty: "bg-red-100 text-red-700",
              };
              return (
                <div className="divide-y divide-gray-50">
                  {penalties.map((p: any) => (
                    <div key={p.id} className="flex items-start gap-3 px-5 py-3.5">
                      <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-red-50">
                        <Ban size={15} className="text-red-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${typeColor[p.type] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {(p.type || "penalty").replace(/_/g, " ")}
                          </span>
                          {Number(p.amount) > 0 && (
                            <span className="text-xs font-black text-red-600">
                              −{fc(p.amount, currency)}
                            </span>
                          )}
                        </div>
                        {p.reason && (
                          <p className="mt-1 text-xs leading-relaxed text-gray-600">{p.reason}</p>
                        )}
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-400">
                          <Clock size={9} />{" "}
                          {new Date(p.createdAt).toLocaleDateString("en-PK", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
          <div className="border-t border-gray-50 px-5 py-3">
            <Link href="/penalty-history">
              <button className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-semibold text-red-500 transition-colors hover:text-red-600">
                View Full History <ArrowRight size={13} />
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
