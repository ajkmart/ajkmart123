import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useRiderBonus,
  useRiderPayout,
  useVendorCredit,
  useVendorPayout,
  useWalletTopup,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { AlertTriangle, CircleDollarSign, CreditCard, Gift, Plus, Wallet } from "lucide-react";
import { useState } from "react";

export type WalletMode = "customer" | "vendor" | "rider";

interface WalletSubject {
  id: string;
  name?: string;
  storeName?: string;
  phone?: string;
  walletBalance: number;
}

interface AdjustOption {
  key: string;
  label: string;
  icon: typeof Wallet;
  tone: "credit" | "debit";
}

const OPTIONS: Record<WalletMode, AdjustOption[]> = {
  customer: [{ key: "topup", label: "Top Up", icon: Plus, tone: "credit" }],
  vendor: [
    { key: "payout", label: "Process Payout", icon: CircleDollarSign, tone: "debit" },
    { key: "credit", label: "Credit Amount", icon: CreditCard, tone: "credit" },
  ],
  rider: [
    { key: "payout", label: "Process Payout", icon: CircleDollarSign, tone: "debit" },
    { key: "bonus", label: "Add Bonus", icon: Gift, tone: "credit" },
  ],
};

const HEADER_ACCENT: Record<WalletMode, { wrap: string; text: string; tint: string }> = {
  customer: { wrap: "bg-blue-50 border-blue-200", text: "text-blue-700", tint: "text-blue-500" },
  vendor: {
    wrap: "bg-orange-50 border-orange-200",
    text: "text-orange-700",
    tint: "text-orange-500",
  },
  rider: { wrap: "bg-green-50 border-green-200", text: "text-green-700", tint: "text-green-500" },
};

export interface WalletAdjustModalProps {
  mode: WalletMode;
  subject: WalletSubject;
  onClose: () => void;
}

export function WalletAdjustModal({ mode, subject, onClose }: WalletAdjustModalProps) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { toast } = useToast();
  const options = OPTIONS[mode];
  const [action, setAction] = useState<string>(options[0]!.key);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const topupM = useWalletTopup();
  const vPayoutM = useVendorPayout();
  const vCreditM = useVendorCredit();
  const rPayoutM = useRiderPayout();
  const rBonusM = useRiderBonus();

  const mutationFor = (key: string) => {
    if (mode === "customer") return topupM;
    if (mode === "vendor") return key === "payout" ? vPayoutM : vCreditM;
    return key === "payout" ? rPayoutM : rBonusM;
  };

  const isDebit = options.find((o) => o.key === action)?.tone === "debit";
  const accent = HEADER_ACCENT[mode];
  const balance = subject.walletBalance;
  const overdraw = isDebit && Number(amount) > 0 && balance < Number(amount);
  const subjectName = subject.storeName || subject.name || subject.phone || "—";
  const titleLabel =
    mode === "vendor" ? "Vendor Wallet" : mode === "rider" ? "Rider Wallet" : "Customer Wallet";

  const handleSubmit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: T("amountInvalid"), variant: "destructive" });
      return;
    }
    if (overdraw) {
      toast({
        title: T("amountInvalid"),
        description: "Wallet balance is insufficient.",
        variant: "destructive",
      });
      return;
    }
    const mutation = mutationFor(action);
    mutation.mutate(
      { id: subject.id, amount: amt, description: note || undefined },
      {
        onSuccess: (d: { newBalance?: number } | undefined) => {
          const desc =
            d?.newBalance != null ? `New balance: ${formatCurrency(d.newBalance)}` : undefined;
          toast({ title: actionToastTitle(mode, action), description: desc });
          onClose();
        },
        onError: (e: unknown) =>
          toast({
            title: "Failed",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          }),
      }
    );
  };

  const anyPending =
    topupM.isPending ||
    vPayoutM.isPending ||
    vCreditM.isPending ||
    rPayoutM.isPending ||
    rBonusM.isPending;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="w-[95vw] max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className={`h-5 w-5 ${accent.tint}`} />
            {titleLabel} — {subjectName}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-4">
          <div className={`${accent.wrap} rounded-xl border p-4 text-center`}>
            <p className={`text-xs ${accent.text} mb-1 font-medium`}>Current Wallet Balance</p>
            <p className={`text-3xl font-extrabold ${accent.text}`}>{formatCurrency(balance)}</p>
          </div>

          {options.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              {options.map((opt) => {
                const Icon = opt.icon;
                const active = action === opt.key;
                const activeTone =
                  opt.tone === "debit"
                    ? "bg-red-50 border-red-400 text-red-700"
                    : "bg-green-50 border-green-400 text-green-700";
                return (
                  <button
                    key={opt.key}
                    onClick={() => setAction(opt.key)}
                    className={`rounded-xl border p-3 text-sm font-bold transition-all ${
                      active ? activeTone : "bg-muted/30 border-border"
                    }`}
                  >
                    <Icon className="mr-1 inline h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
              Amount (Rs.)
            </label>
            <Input
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-12 rounded-xl text-lg font-bold"
            />
          </div>

          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-bold tracking-wide uppercase">
              Note (optional)
            </label>
            <Input
              placeholder="e.g. Weekly settlement"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          {overdraw && (
            <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-xs text-red-700">Wallet balance is insufficient for this debit.</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={anyPending || !amount || overdraw}
              className={`flex-1 rounded-xl text-white ${
                isDebit ? "bg-red-500 hover:bg-red-600" : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {anyPending ? "Processing..." : actionButtonLabel(mode, action)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function actionToastTitle(mode: WalletMode, action: string) {
  if (mode === "customer") return "Wallet topped up";
  if (action === "payout") return "Payout processed";
  if (action === "bonus") return "Bonus added";
  return "Amount credited";
}

function actionButtonLabel(mode: WalletMode, action: string) {
  if (mode === "customer") return "Top Up";
  if (action === "payout") return "Process Payout";
  if (action === "bonus") return "Add Bonus";
  return "Credit Amount";
}
