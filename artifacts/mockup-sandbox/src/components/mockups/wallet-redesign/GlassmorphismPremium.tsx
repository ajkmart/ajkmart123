import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Award,
  Building2,
  Clock,
  Eye,
  EyeOff,
  Gift,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { useState } from "react";

const fc = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;

const MOCK_TXS = [
  {
    id: "1",
    type: "credit",
    amount: 850,
    description: "Food delivery — Order #A7F2C1",
    createdAt: new Date().toISOString(),
    group: "Today",
  },
  {
    id: "2",
    type: "credit",
    amount: 420,
    description: "Mart pickup — Order #B3D9E5",
    createdAt: new Date().toISOString(),
    group: "Today",
  },
  {
    id: "3",
    type: "bonus",
    amount: 200,
    description: "Peak hour bonus — 5 deliveries",
    createdAt: new Date().toISOString(),
    group: "Today",
  },
  {
    id: "4",
    type: "platform_fee",
    amount: 127,
    description: "Platform service fee",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    group: "Yesterday",
  },
  {
    id: "5",
    type: "debit",
    amount: 5000,
    description: "Withdrawal — JazzCash · 03001234567",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    group: "Yesterday",
  },
  {
    id: "6",
    type: "credit",
    amount: 1200,
    description: "Ride completed — #R4K8M2",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    group: "This Week",
  },
];

const CHART_DATA = [
  { label: "Mon", amount: 1200 },
  { label: "Tue", amount: 1850 },
  { label: "Wed", amount: 950 },
  { label: "Thu", amount: 2100 },
  { label: "Fri", amount: 1600 },
  { label: "Sat", amount: 2800 },
  { label: "Today", amount: 1470 },
];

function TxIcon({ type }: { type: string }) {
  if (type === "credit") return <TrendingUp size={16} className="text-white" />;
  if (type === "bonus") return <Gift size={16} className="text-white" />;
  if (type === "platform_fee") return <Building2 size={16} className="text-white" />;
  return <ArrowUpFromLine size={16} className="text-white" />;
}

function txGradient(type: string) {
  if (type === "credit") return "from-green-500 to-emerald-600";
  if (type === "bonus") return "from-blue-500 to-indigo-600";
  if (type === "platform_fee") return "from-orange-500 to-amber-600";
  return "from-red-500 to-pink-600";
}

export function GlassmorphismPremium() {
  const [hidden, setHidden] = useState(false);
  const balance = 12470;
  const maxChart = Math.max(...CHART_DATA.map((d) => d.amount));
  const weekTotal = CHART_DATA.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="min-h-screen bg-gray-950 font-['Inter']">
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-green-800 to-teal-900 px-5 pt-14 pb-32">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] right-[-10%] h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute bottom-[-30%] left-[-15%] h-64 w-64 rounded-full bg-teal-400/15 blur-3xl" />
          <div className="absolute top-[40%] left-[30%] h-40 w-40 rounded-full bg-green-400/10 blur-2xl" />
        </div>

        <div className="relative mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl">
              <Wallet size={20} className="text-emerald-300" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white">My Wallet</h1>
              <p className="text-xs font-medium text-emerald-300/80">Earnings & Payouts</p>
            </div>
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl">
            <RefreshCw size={16} className="text-white" />
          </button>
        </div>

        <div className="relative">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-bold tracking-widest text-emerald-300/60 uppercase">
              Available Balance
            </p>
            <button onClick={() => setHidden((v) => !v)} className="text-emerald-300/60">
              {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <p className="text-5xl leading-none font-black tracking-tight text-white">
            {hidden ? "Rs. ••••••" : fc(balance)}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">
              <Zap size={11} /> 85% your share
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/50">
              <Clock size={10} className="mr-1 inline" />
              Credited instantly
            </span>
          </div>
        </div>
      </div>

      <div className="-mt-24 space-y-4 px-4 pb-8">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-2xl">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 py-4 text-sm font-black text-white shadow-lg shadow-emerald-500/25 transition-transform active:scale-[0.97]">
              <ArrowUpFromLine size={16} /> Withdraw
            </button>
            <button className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-600 py-4 text-sm font-black text-white shadow-lg shadow-teal-500/25 transition-transform active:scale-[0.97]">
              <ArrowDownToLine size={16} /> Deposit
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20">
              <Clock size={14} className="text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-400">Rs. 5,000 Pending</p>
              <p className="text-[10px] text-amber-400/60">1 withdrawal processing</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            {
              label: "Today",
              value: fc(1470),
              icon: <Target size={16} />,
              gradient: "from-amber-500/15 to-orange-500/15",
              text: "text-amber-400",
              border: "border-amber-500/20",
            },
            {
              label: "This Week",
              value: fc(weekTotal),
              icon: <TrendingUp size={16} />,
              gradient: "from-blue-500/15 to-indigo-500/15",
              text: "text-blue-400",
              border: "border-blue-500/20",
            },
            {
              label: "Total Earned",
              value: fc(45280),
              icon: <Award size={16} />,
              gradient: "from-emerald-500/15 to-green-500/15",
              text: "text-emerald-400",
              border: "border-emerald-500/20",
            },
            {
              label: "Withdrawn",
              value: fc(32000),
              icon: <ArrowUpFromLine size={16} />,
              gradient: "from-red-500/15 to-pink-500/15",
              text: "text-red-400",
              border: "border-red-500/20",
            },
          ].map((s, i) => (
            <div
              key={i}
              className={`bg-gradient-to-br ${s.gradient} rounded-2xl border p-4 backdrop-blur-xl ${s.border}`}
            >
              <div className={`${s.text} mb-2`}>{s.icon}</div>
              <p className="text-lg font-black text-white">{s.value}</p>
              <p className="mt-1 text-[10px] font-bold tracking-wider text-white/40 uppercase">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-2xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">7-Day Earnings</p>
              <p className="mt-0.5 text-[10px] text-white/40">Last 7 days performance</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-emerald-400">{fc(weekTotal)}</p>
              <p className="text-[9px] text-white/40">This Week</p>
            </div>
          </div>
          <div className="flex h-24 items-end gap-2">
            {CHART_DATA.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                {d.amount > 0 && (
                  <p className="text-[7px] font-bold text-white/30">
                    {(d.amount / 1000).toFixed(1)}k
                  </p>
                )}
                <div className="flex w-full items-end justify-center" style={{ height: 64 }}>
                  <div
                    className={`w-full max-w-[24px] rounded-lg transition-all ${
                      i === 6
                        ? "bg-gradient-to-t from-emerald-500 to-green-400 shadow-lg shadow-emerald-500/30"
                        : "bg-gradient-to-t from-white/10 to-white/5"
                    }`}
                    style={{ height: Math.max((d.amount / maxChart) * 64, d.amount > 0 ? 6 : 2) }}
                  />
                </div>
                <p
                  className={`text-[9px] font-medium ${i === 6 ? "font-bold text-emerald-400" : "text-white/30"}`}
                >
                  {d.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl">
          <div className="px-5 pt-5 pb-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-white">Transactions</p>
              <span className="text-[10px] font-medium text-white/30">
                {MOCK_TXS.length} records
              </span>
            </div>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {["All", "Earnings", "Withdrawals", "Bonuses"].map((tab, i) => (
                <button
                  key={tab}
                  className={`flex-shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                    i === 0
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                      : "border border-white/10 bg-white/5 text-white/40"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {["Today", "Yesterday", "This Week"].map((group) => {
            const items = MOCK_TXS.filter((t) => t.group === group);
            if (!items.length) return null;
            return (
              <div key={group}>
                <div className="flex items-center gap-2 bg-white/[0.02] px-5 py-2">
                  <p className="text-[10px] font-bold tracking-widest text-white/25 uppercase">
                    {group}
                  </p>
                  <div className="h-px flex-1 bg-white/5" />
                  <span className="text-[9px] text-white/20">{items.length}</span>
                </div>
                <div className="divide-y divide-white/5">
                  {items.map((t) => {
                    const isDebit = t.type === "debit" || t.type === "platform_fee";
                    return (
                      <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                        <div
                          className={`h-10 w-10 rounded-2xl bg-gradient-to-br ${txGradient(t.type)} flex flex-shrink-0 items-center justify-center shadow-lg`}
                        >
                          <TxIcon type={t.type} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-xs leading-snug font-semibold text-white/80">
                            {t.description}
                          </p>
                          <p className="mt-0.5 text-[10px] text-white/25">2 hours ago</p>
                        </div>
                        <p
                          className={`flex-shrink-0 text-sm font-black ${isDebit ? "text-red-400" : "text-emerald-400"}`}
                        >
                          {isDebit ? "−" : "+"}
                          {fc(t.amount)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-5 backdrop-blur-xl">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-300">
            <ShieldCheck size={15} /> Payout Policy
          </p>
          <div className="space-y-2">
            {[
              "85% your share — 15% platform fee",
              "Min withdrawal: Rs. 500 · Max: Rs. 50,000",
              "48–72h processing via JazzCash, EasyPaisa, Bank",
              "Rejected requests auto-refunded",
            ].map((p, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
                <p className="text-[11px] font-medium text-white/50">{p}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 pb-4 text-center text-[10px] text-white/20">
          <ShieldCheck size={10} /> All transactions secured by AJKMart
        </p>
      </div>
    </div>
  );
}
