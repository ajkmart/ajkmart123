import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Building2,
  CheckCircle,
  ChevronRight,
  Eye,
  EyeOff,
  Gift,
  Receipt,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";

const fc = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;

const MOCK_TXS = [
  {
    id: "1",
    type: "credit",
    amount: 850,
    description: "Food delivery completed",
    time: "2h ago",
  },
  {
    id: "2",
    type: "credit",
    amount: 420,
    description: "Mart pickup delivery",
    time: "4h ago",
  },
  {
    id: "3",
    type: "bonus",
    amount: 200,
    description: "Peak hour bonus",
    time: "5h ago",
  },
  {
    id: "4",
    type: "platform_fee",
    amount: 127,
    description: "Platform service fee",
    time: "Yesterday",
  },
  {
    id: "5",
    type: "debit",
    amount: 5000,
    description: "Withdrawal to JazzCash",
    time: "Yesterday",
    status: "paid",
  },
  {
    id: "6",
    type: "credit",
    amount: 1200,
    description: "Ride completed",
    time: "2 days ago",
  },
];

const CHART_DATA = [
  { label: "M", amount: 1200 },
  { label: "T", amount: 1850 },
  { label: "W", amount: 950 },
  { label: "T", amount: 2100 },
  { label: "F", amount: 1600 },
  { label: "S", amount: 2800 },
  { label: "S", amount: 1470 },
];

function TxIconEl({ type }: { type: string }) {
  const base = "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0";
  if (type === "credit")
    return (
      <div className={`${base} bg-green-50`}>
        <TrendingUp size={18} className="text-green-600" />
      </div>
    );
  if (type === "bonus")
    return (
      <div className={`${base} bg-blue-50`}>
        <Gift size={18} className="text-blue-600" />
      </div>
    );
  if (type === "platform_fee")
    return (
      <div className={`${base} bg-orange-50`}>
        <Building2 size={18} className="text-orange-500" />
      </div>
    );
  if (type === "debit")
    return (
      <div className={`${base} bg-red-50`}>
        <ArrowUpFromLine size={18} className="text-red-500" />
      </div>
    );
  return (
    <div className={`${base} bg-gray-50`}>
      <Receipt size={18} className="text-gray-500" />
    </div>
  );
}

export function NeobankMinimal() {
  const [hidden, setHidden] = useState(false);
  const balance = 12470;
  const maxChart = Math.max(...CHART_DATA.map((d) => d.amount));
  const weekTotal = CHART_DATA.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="min-h-screen bg-[#FAFBFC] font-['Inter']">
      <div className="border-b border-gray-100 bg-white px-5 pt-14 pb-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium tracking-widest text-gray-400 uppercase">Wallet</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-gray-900">My Balance</h1>
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-100 bg-gray-50">
            <RefreshCw size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 p-6">
          <div className="absolute top-0 right-0 h-40 w-40 translate-x-1/3 -translate-y-1/2 rounded-full bg-white/5" />
          <div className="absolute bottom-0 left-0 h-28 w-28 -translate-x-1/4 translate-y-1/3 rounded-full bg-white/3" />

          <div className="relative">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-gray-400">Available Balance</p>
                <button onClick={() => setHidden((v) => !v)} className="text-gray-500">
                  {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              <div className="flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-1">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                <span className="text-[10px] font-bold text-green-400">Active</span>
              </div>
            </div>

            <p className="text-4xl font-black tracking-tight text-white">
              {hidden ? "Rs. ••••••" : fc(balance)}
            </p>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 rounded-xl bg-white/5 px-3 py-2">
                <p className="text-[9px] font-bold tracking-wider text-gray-500 uppercase">
                  Pending
                </p>
                <p className="text-sm font-bold text-amber-400">{fc(5000)}</p>
              </div>
              <div className="flex-1 rounded-xl bg-white/5 px-3 py-2">
                <p className="text-[9px] font-bold tracking-wider text-gray-500 uppercase">
                  Your Share
                </p>
                <p className="text-sm font-bold text-white">85%</p>
              </div>
            </div>

            <div className="mt-5 flex gap-2.5">
              <button className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-black text-gray-900 transition-colors active:bg-gray-100">
                <ArrowUpFromLine size={15} /> Withdraw
              </button>
              <button className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 py-3.5 text-sm font-bold text-white transition-colors active:bg-white/15">
                <ArrowDownToLine size={15} /> Deposit
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        <div className="flex gap-3">
          {[
            {
              label: "Today",
              value: fc(1470),
              color: "text-green-600",
              bg: "bg-green-50",
            },
            {
              label: "Week",
              value: fc(weekTotal),
              color: "text-blue-600",
              bg: "bg-blue-50",
            },
            {
              label: "Total",
              value: fc(45280),
              color: "text-purple-600",
              bg: "bg-purple-50",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="flex-1 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm"
            >
              <p className={`text-base font-black ${s.color}`}>{s.value}</p>
              <p className="mt-1 text-[10px] font-semibold text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={15} className="text-gray-400" />
              <p className="text-sm font-bold text-gray-800">Weekly Earnings</p>
            </div>
            <p className="text-base font-black text-green-600">{fc(weekTotal)}</p>
          </div>
          <div className="flex h-20 items-end gap-3">
            {CHART_DATA.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full items-end justify-center" style={{ height: 56 }}>
                  <div
                    className={`w-full max-w-[20px] rounded-md transition-all ${
                      i === 5 ? "bg-green-500" : "bg-gray-100"
                    }`}
                    style={{
                      height: Math.max((d.amount / maxChart) * 56, d.amount > 0 ? 4 : 2),
                    }}
                  />
                </div>
                <p
                  className={`text-[9px] font-semibold ${i === 5 ? "text-green-600" : "text-gray-300"}`}
                >
                  {d.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="px-5 pt-5 pb-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-800">Recent Activity</p>
              <button className="flex items-center gap-0.5 text-xs font-bold text-green-600">
                See all <ChevronRight size={12} />
              </button>
            </div>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {["All", "Earnings", "Withdrawals", "Fees"].map((tab, i) => (
                <button
                  key={tab}
                  className={`flex-shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-all ${
                    i === 0
                      ? "bg-gray-900 text-white"
                      : "border border-gray-100 bg-gray-50 text-gray-400"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {MOCK_TXS.map((t) => {
              const isDebit = t.type === "debit" || t.type === "platform_fee";
              return (
                <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                  <TxIconEl type={t.type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug font-semibold text-gray-800">
                      {t.description}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="text-[10px] text-gray-400">{t.time}</p>
                      {(t as any).status === "paid" && (
                        <span className="flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-[9px] font-bold text-green-600">
                          <CheckCircle size={8} /> Paid
                        </span>
                      )}
                    </div>
                  </div>
                  <p
                    className={`flex-shrink-0 text-sm font-black ${isDebit ? "text-red-500" : "text-green-600"}`}
                  >
                    {isDebit ? "−" : "+"}
                    {fc(t.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-green-100 bg-green-50 p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck size={15} className="text-green-600" />
            <p className="text-sm font-bold text-green-800">Payout Policy</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: "Your Share", value: "85%" },
              { label: "Min Withdraw", value: "Rs. 500" },
              { label: "Processing", value: "48-72h" },
              { label: "Methods", value: "3 Available" },
            ].map((p) => (
              <div
                key={p.label}
                className="rounded-xl border border-green-100 bg-white px-3 py-2.5"
              >
                <p className="text-[10px] font-bold tracking-wider text-green-600/60 uppercase">
                  {p.label}
                </p>
                <p className="mt-0.5 text-sm font-black text-green-800">{p.value}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 pb-4 text-center text-[10px] text-gray-300">
          <ShieldCheck size={10} /> Secured by AJKMart
        </p>
      </div>
    </div>
  );
}
