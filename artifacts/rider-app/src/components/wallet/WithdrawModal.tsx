import { createLogger } from "@/lib/logger";
import { useMutation } from "@tanstack/react-query";
import { formatCurrency as _sharedFcW2 } from "@workspace/api-zod";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Landmark,
  Loader2,
  Smartphone,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/rider-auth";
import { usePlatformConfig } from "../../lib/useConfig";
import { useLanguage } from "../../lib/useLanguage";
import { checkDailyLimits, checkSufficientBalance } from "../../lib/wallet/validation";
const log = createLogger("[WithdrawModal]");

const TRADITIONAL_BANKS = [
  "HBL",
  "MCB",
  "UBL",
  "Meezan Bank",
  "Bank Alfalah",
  "NBP",
  "Allied Bank",
  "Bank Al Habib",
  "Faysal Bank",
  "Askari Bank",
  "Other",
];

export type PayMethod = {
  id: string;
  label: string;
  logo: string;
  description?: string;
  type?: string;
  manualNumber?: string;
  manualName?: string;
  manualInstructions?: string;
  iban?: string;
  accountTitle?: string;
  accountNumber?: string;
  bankName?: string;
  instructions?: string;
};

const INPUT =
  "w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-400 focus:bg-white transition-colors";
const SELECT =
  "w-full h-12 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-400 appearance-none";

function MethodLogo({ id }: { id: string }) {
  if (id === "jazzcash") return <Smartphone size={28} className="text-red-500" />;
  if (id === "easypaisa") return <Smartphone size={28} className="text-green-500" />;
  return <Landmark size={28} className="text-blue-500" />;
}

export default function WithdrawModal({
  balance,
  minPayout,
  maxPayout,
  onClose,
  onSuccess,
}: {
  balance: number;
  minPayout: number;
  maxPayout: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const currency = config.platform.currencySymbol ?? "Rs.";
  const fc = (n: string | number | null | undefined) =>
    _sharedFcW2(n != null ? String(n) : (n as null | undefined), currency);

  const [todayWithdrawn, setTodayWithdrawn] = useState(0);
  const [todayWithdrawCount, setTodayWithdrawCount] = useState(0);

  /* Fetch today's withdrawal totals on mount so checkDailyLimits has real data.
     Withdrawals are stored as type="debit" with description starting with "Withdrawal".
     Filtering by type="withdrawal" would always return 0 since that type does not exist. */
  useEffect(() => {
    api
      .getWalletPage({ limit: 200 })
      .then(({ items }) => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayWithdrawals = items.filter(
          (it) =>
            it.type === "debit" &&
            it.description?.startsWith("Withdrawal") &&
            (it.createdAt ?? "").startsWith(todayStr)
        );
        setTodayWithdrawn(todayWithdrawals.reduce((s, it) => s + Number(it.amount), 0));
        setTodayWithdrawCount(todayWithdrawals.length);
      })
      .catch((err) => {
        log.warn("Failed to load today's withdrawal totals:", err);
      });
  }, []);

  const [amount, setAmount] = useState("");
  const [selectedMethod, setMethod] = useState<PayMethod | null>(null);
  const [acNo, setAcNo] = useState("");
  const [acName, setAcName] = useState("");
  const [bankName, setBankName] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"amount" | "method" | "details" | "confirm" | "done">("amount");
  const [err, setErr] = useState("");
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const { user } = useAuth();

  const [methodsError, setMethodsError] = useState(false);

  useEffect(() => {
    type ApiMethod = {
      id: string;
      label?: string;
      logo?: string;
      description?: string;
      manualNumber?: string;
      iban?: string;
      accountTitle?: string;
      bankName?: string;
      instructions?: string;
    };
    const FALLBACK: Record<string, Pick<PayMethod, "label" | "description">> = {
      jazzcash: { label: "JazzCash", description: "JazzCash mobile wallet transfer" },
      easypaisa: { label: "EasyPaisa", description: "EasyPaisa account transfer" },
      bank: { label: "Bank Transfer", description: "IBFT / RAAST bank transfer" },
    };
    apiFetch("/payments/methods")
      .then((data: { methods?: ApiMethod[] }) => {
        const ms: ApiMethod[] = (data.methods || []).filter((m) =>
          ["jazzcash", "easypaisa", "bank"].includes(m.id)
        );
        const enabled: PayMethod[] = ms.map((m) => ({
          id: m.id,
          logo: m.logo ?? m.id,
          label: m.label ?? FALLBACK[m.id]?.label ?? m.id,
          description: m.description ?? FALLBACK[m.id]?.description ?? "",
          manualNumber: m.manualNumber,
          iban: m.iban,
          accountTitle: m.accountTitle,
          bankName: m.bankName,
          instructions: m.instructions,
        }));
        if (enabled.length === 0) {
          setMethodsError(true);
        } else {
          setMethods(enabled);
        }
      })
      .catch((err: Error) => {
        log.warn("Failed to load payment methods:", err.message);
        setMethodsError(true);
      })
      .finally(() => setLoadingMethods(false));
  }, []);

  const mut = useMutation({
    mutationFn: async () => {
      const m = selectedMethod!;
      /* W1: Re-fetch wallet + min-balance immediately before the request leaves
         the device. Another tab (or a manual server-side adjustment) may have
         changed the balance between modal open and submit; relying on the
         captured `balance`/`minPayout` props lets the rider submit a request
         the server will reject. We bail with a translated error rather than
         showing the raw 4xx, and recompute the cap consistently with the
         modal's existing `amt > balance` guard. */
      const amt = Number(amount);
      /* Sentinel class so we can reliably distinguish our own validation
         errors from network/5xx failures inside the catch block below,
         without depending on translated message content (which breaks in
         non-English locales and is otherwise fragile). */
      class PreflightValidationError extends Error {
        constructor(msg: string) {
          super(msg);
          this.name = "PreflightValidationError";
        }
      }
      try {
        const [wallet, minBal] = await Promise.all([api.getWallet(), api.getMinBalance()]);
        const w = wallet as { balance?: number | string } | null | undefined;
        const liveBalance = Number(w?.balance ?? balance);
        const liveMin = Number(minBal ?? minPayout);
        if (amt < liveMin) {
          throw new PreflightValidationError(`${T("minWithdrawalLabel")}: ${fc(liveMin)}`);
        }
        if (amt > liveBalance - liveMin) {
          /* Reject if the request would drop us below the platform min-balance. */
          throw new PreflightValidationError(T("enterValidAmount"));
        }
        if (amt > liveBalance) {
          throw new PreflightValidationError(T("enterValidAmount"));
        }
      } catch (preflightErr) {
        /* If the preflight fetch itself fails (offline, 5xx) we let the
           withdraw submit go through — the server is the source of truth and
           refusing here would block legitimate withdrawals on flaky networks.
           But if the preflight surfaced a real validation error (PreflightValidationError
           thrown above), bubble it up to onError. */
        if (preflightErr instanceof PreflightValidationError) {
          throw preflightErr;
        }
        /* Otherwise swallow the preflight failure and proceed. */
      }
      return api.withdrawWallet({
        amount: amt,
        bankName: m.id === "bank" ? bankName : m.id,
        accountNumber: acNo,
        accountTitle: acName,
        paymentMethod: m.id,
        note,
      });
    },
    onSuccess: () => setStep("done"),
    onError: (e: Error) => setErr(e.message),
  });

  const goToMethod = () => {
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      setErr(T("enterValidAmount"));
      return;
    }
    if (amt < minPayout) {
      setErr(`${T("minWithdrawalLabel")}: ${fc(minPayout)}`);
      return;
    }
    if (amt > maxPayout) {
      setErr(`${T("maxWithdrawalLabel")}: ${fc(maxPayout)}`);
      return;
    }
    const balanceCheck = checkSufficientBalance(balance, amt);
    if (!balanceCheck.valid) {
      setErr(T("enterValidAmount"));
      return;
    }
    const walletCfg = config?.wallet ?? {};
    const maxDailyWithdrawal =
      typeof walletCfg.maxDailyWithdrawal === "number" ? walletCfg.maxDailyWithdrawal : Infinity;
    const maxDailyTransactionCount =
      typeof walletCfg.maxDailyTransactionCount === "number"
        ? walletCfg.maxDailyTransactionCount
        : Infinity;
    if (isFinite(maxDailyWithdrawal) || isFinite(maxDailyTransactionCount)) {
      const limitsCheck = checkDailyLimits(todayWithdrawn, todayWithdrawCount, amt, {
        maxDailyWithdrawal,
        maxDailyTransactionCount,
      });
      if (!limitsCheck.valid) {
        setErr(limitsCheck.reason);
        return;
      }
    }
    setErr("");
    setStep("method");
  };

  const goToDetails = (m: PayMethod) => {
    setMethod(m);
    setAcNo("");
    setAcName("");
    setBankName("");
    setErr("");
    setStep("details");
  };
  const goToConfirm = () => {
    if (!acNo.trim()) {
      setErr(T("bankAccountRequired"));
      return;
    }
    if (!acName.trim()) {
      setErr(T("bankAccountTitleRequired"));
      return;
    }
    if (acName.trim().length < 3) {
      setErr(T("bankAccountTitleRequired"));
      return;
    }
    if (selectedMethod?.id === "bank") {
      if (!bankName) {
        setErr(T("bankNameRequired"));
        return;
      }
      const cleaned = acNo.replace(/[\s-]/g, "");
      const isIban = /^PK\d{2}[A-Z]{4}\d{16}$/i.test(cleaned);
      const isAccountNo = /^\d{8,20}$/.test(cleaned);
      if (!isIban && !isAccountNo) {
        setErr(T("bankAccountRequired"));
        return;
      }
    }
    if (selectedMethod?.id === "jazzcash" || selectedMethod?.id === "easypaisa") {
      const cleanPhone = acNo.replace(/[\s-]/g, "");
      if (!/^0[3]\d{9}$/.test(cleanPhone)) {
        setErr(T("enterValidPhone"));
        return;
      }
    }
    setErr("");
    setStep("confirm");
  };

  const STEP_LABELS = ["amount", "method", "details", "confirm"];
  const stepIdx = STEP_LABELS.indexOf(step);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[93vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        {step !== "done" && stepIdx >= 0 && (
          <div className="flex-shrink-0 px-6 pb-3">
            <div className="mt-1 flex gap-1.5">
              {STEP_LABELS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all ${i <= stepIdx ? "bg-green-500" : "bg-gray-100"}`}
                />
              ))}
            </div>
            <p className="mt-1 text-right text-[10px] text-gray-400">
              Step {stepIdx + 1} / {STEP_LABELS.length}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* DONE */}
          {step === "done" && (
            <div className="p-8 text-center">
              <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
                <CheckCircle size={52} className="text-green-500" />
              </div>
              <h3 className="text-2xl font-extrabold text-gray-800">{T("requestSubmitted")}</h3>
              <p className="mt-2 text-gray-500">
                <span className="font-extrabold text-green-600">{fc(Number(amount))}</span>{" "}
                {T("withdrawalSubmitted")}
              </p>
              <p className="mt-1 text-sm text-gray-400">{T("adminProcess24h")}</p>
              <div className="mt-5 space-y-3 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 p-5 text-left">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{T("paymentMethod")}</span>
                  <span className="flex items-center gap-1.5 font-bold">
                    <MethodLogo id={selectedMethod?.id ?? ""} /> {selectedMethod?.label}
                  </span>
                </div>
                {selectedMethod?.id === "bank" && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{T("bankName")}</span>
                    <span className="font-bold">{bankName}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    {selectedMethod?.id === "bank" ? T("accountNumber") : T("phone")}
                  </span>
                  <span className="font-bold">{acNo}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{T("accountHolderName")}</span>
                  <span className="font-bold">{acName}</span>
                </div>
                <div className="flex items-center justify-between border-t border-green-100 pt-2">
                  <span className="font-semibold text-gray-600">{T("amountLabel")}</span>
                  <span className="text-2xl font-extrabold text-green-600">
                    {fc(Number(amount))}
                  </span>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle size={13} className="flex-shrink-0" /> {T("trackRequestStatus")}
                </p>
              </div>
              <button
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
                className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 text-lg font-extrabold text-white"
              >
                <CheckCircle size={20} /> {T("done")}
              </button>
            </div>
          )}

          {/* CONFIRM */}
          {step === "confirm" && (
            <div className="p-6">
              <h3 className="mb-1 text-xl font-extrabold text-gray-800">
                {T("confirmWithdrawal")}
              </h3>
              <p className="mb-5 text-sm text-gray-500">{T("reviewConfirm")}</p>
              <div className="mb-4 space-y-3 rounded-2xl border border-green-100 bg-gradient-to-br from-green-50 to-emerald-50 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{T("amountLabel")}</span>
                  <span className="text-3xl font-extrabold text-green-600">
                    {fc(Number(amount))}
                  </span>
                </div>
                <div className="h-px bg-green-100" />
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{T("paymentMethod")}</span>
                  <span className="flex items-center gap-1.5 font-bold">
                    <MethodLogo id={selectedMethod?.id ?? ""} /> {selectedMethod?.label}
                  </span>
                </div>
                {selectedMethod?.id === "bank" && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{T("bankName")}</span>
                    <span className="font-bold">{bankName}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    {selectedMethod?.id === "bank" ? T("accountNumber") : T("phone")}
                  </span>
                  <span className="font-mono font-bold">{acNo}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{T("accountHolderName")}</span>
                  <span className="font-bold">{acName}</span>
                </div>
                {note && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{T("note")}</span>
                    <span className="font-bold">{note}</span>
                  </div>
                )}
              </div>
              <div className="mb-4 flex gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
                <p className="text-xs font-medium text-amber-700">{T("wrongAccountWarning")}</p>
              </div>
              {err && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5">
                  <AlertTriangle size={14} className="text-red-400" />
                  <p className="text-sm font-semibold text-red-500">{err}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setStep("details");
                    setErr("");
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-gray-200 py-3 text-sm font-bold text-gray-600"
                >
                  <ArrowLeft size={14} /> {T("edit")}
                </button>
                <button
                  onClick={() => mut.mutate()}
                  disabled={mut.isPending}
                  className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-green-600 py-3 text-sm font-extrabold text-white disabled:opacity-60"
                >
                  {mut.isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> {T("processing")}
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} /> {T("submitWithdrawal")}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* DETAILS */}
          {step === "details" && selectedMethod && (
            <div className="p-6">
              <button
                onClick={() => setStep("method")}
                className="mb-4 flex items-center gap-1 text-sm font-semibold text-gray-500"
              >
                <ArrowLeft size={14} /> {T("back")}
              </button>
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                  <MethodLogo id={selectedMethod.id} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-gray-800">{selectedMethod.label}</h3>
                  <p className="mt-0.5 text-xs text-gray-500">{selectedMethod.description}</p>
                </div>
              </div>

              {user?.bankName && (
                <div className="mb-4 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <div>
                    <p className="text-xs font-bold text-blue-700">{T("savedAccount")}</p>
                    <p className="mt-0.5 text-xs text-blue-600">
                      {user.bankName} · {user.bankAccount}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setBankName(user.bankName || "");
                      setAcNo(user.bankAccount || "");
                      setAcName(user.bankAccountTitle || "");
                      setErr("");
                    }}
                    className="rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-extrabold text-blue-600"
                  >
                    Use
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {selectedMethod.id === "bank" && (
                  <div>
                    <p className="mb-1.5 text-xs font-bold tracking-wider text-gray-400 uppercase">
                      {T("bankNameLabel")} *
                    </p>
                    <select
                      value={bankName}
                      onChange={(e) => {
                        setBankName(e.target.value);
                        setErr("");
                      }}
                      className={SELECT}
                    >
                      <option value="">{T("selectBank")}</option>
                      {TRADITIONAL_BANKS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <p className="mb-1.5 text-xs font-bold tracking-wider text-gray-400 uppercase">
                    {selectedMethod.id === "bank" ? T("accountNoRequired") : T("phoneRequired")}
                  </p>
                  <input
                    value={acNo}
                    onChange={(e) => {
                      setAcNo(e.target.value);
                      setErr("");
                    }}
                    inputMode={selectedMethod.id === "bank" ? "text" : "numeric"}
                    placeholder={
                      selectedMethod.id === "bank" ? "PK36SCBL0000001234567801" : "03XX-XXXXXXX"
                    }
                    className={INPUT}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold tracking-wider text-gray-400 uppercase">
                    {T("accountTitleRequired")}
                  </p>
                  <input
                    value={acName}
                    onChange={(e) => {
                      setAcName(e.target.value);
                      setErr("");
                    }}
                    placeholder={T("accountTitle")}
                    className={INPUT}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold tracking-wider text-gray-400 uppercase">
                    {T("noteOptional")}
                  </p>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={T("noteOptional")}
                    className={INPUT}
                  />
                </div>
                {err && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5">
                    <AlertTriangle size={14} className="text-red-400" />
                    <p className="text-sm font-semibold text-red-500">{err}</p>
                  </div>
                )}
                <button
                  onClick={goToConfirm}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 font-extrabold text-white"
                >
                  {T("reviewAndConfirm")} <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* METHOD SELECTION */}
          {step === "method" && (
            <div className="p-6">
              <button
                onClick={() => setStep("amount")}
                className="mb-4 flex items-center gap-1 text-sm font-semibold text-gray-500"
              >
                <ArrowLeft size={14} /> {T("back")}
              </button>
              <h3 className="mb-1 text-xl font-extrabold text-gray-800">{T("selectMethod")}</h3>
              <p className="mb-4 text-sm text-gray-500">{T("selectPaymentMethod")}</p>
              <div className="mb-5 flex items-center justify-between rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-4">
                <span className="text-sm font-semibold text-green-200">
                  {T("withdrawalAmount")}
                </span>
                <span className="text-2xl font-extrabold text-white">{fc(Number(amount))}</span>
              </div>
              {loadingMethods ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
                  ))}
                </div>
              ) : methodsError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center">
                  <AlertTriangle size={28} className="mx-auto mb-2 text-red-400" />
                  <p className="text-sm font-bold text-red-700">{T("paymentMethodsUnavailable")}</p>
                  <p className="mt-1 text-xs text-red-500">{T("contactSupportForMethods")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {methods.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => goToDetails(m)}
                      className="flex w-full items-center gap-4 rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 text-left transition-all hover:border-green-400 hover:bg-green-50 active:scale-[0.98]"
                    >
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                        <MethodLogo id={m.id} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-gray-800">{m.label}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{m.description}</p>
                      </div>
                      <ChevronRight size={20} className="text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AMOUNT */}
          {step === "amount" && (
            <div className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-xl font-extrabold text-gray-800">{T("withdrawFunds")}</h3>
                <button
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500"
                >
                  <X size={18} />
                </button>
              </div>

              {/* KYC gate — shown when wallet_kyc_required=on and rider is not yet verified */}
              {config?.wallet?.kycRequired &&
                (user as { kycStatus?: string } | null)?.kycStatus !== "verified" && (
                  <div className="mb-4 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-blue-800">KYC Required</p>
                      <p className="mt-0.5 text-xs text-blue-600">
                        {(user as { kycStatus?: string } | null)?.kycStatus === "pending"
                          ? "Your documents are under review. Withdrawals will unlock once verified."
                          : "Complete KYC verification in your Profile to enable withdrawals."}
                      </p>
                    </div>
                  </div>
                )}

              {/* Bank info gate — shown when no bank account is set */}
              {!(user?.bankName && user?.bankAccount) && (
                <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-amber-800">Bank Account Needed</p>
                    <p className="mt-0.5 text-xs text-amber-600">
                      Add your bank or mobile wallet account in Profile to withdraw earnings.
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-5 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 p-5 text-white">
                <p className="text-sm text-green-200">{T("availableBalance")}</p>
                <p className="mt-0.5 text-4xl font-extrabold">{fc(balance)}</p>
                <div className="mt-3 flex gap-3 text-xs text-green-300">
                  <span>Min: {fc(minPayout)}</span>
                  <span>·</span>
                  <span>Max: {fc(maxPayout)}</span>
                </div>
              </div>
              <p className="mb-2 text-xs font-bold tracking-wider text-gray-400 uppercase">
                {T("quickSelect")}
              </p>
              <div className="mb-5 flex flex-wrap gap-2">
                {(() => {
                  const cap = Math.min(maxPayout, balance);
                  if (cap < minPayout) return [];
                  const range = cap - minPayout;
                  const step = range > 20000 ? 1000 : 500;
                  const seen = new Set<number>();
                  const amounts: number[] = [];
                  // Sample 4 evenly-spaced points across the range
                  for (let i = 1; i <= 4; i++) {
                    const raw = minPayout + (range * i) / 4;
                    const rounded = Math.round(raw / step) * step;
                    if (rounded >= minPayout && rounded <= cap && !seen.has(rounded)) {
                      seen.add(rounded);
                      amounts.push(rounded);
                    }
                  }
                  // Ensure at least 2 useful options in very narrow ranges
                  if (amounts.length < 2) {
                    const anchor = Math.ceil(minPayout / step) * step;
                    if (anchor >= minPayout && anchor <= cap && !seen.has(anchor)) {
                      amounts.unshift(anchor);
                      seen.add(anchor);
                    }
                  }
                  return amounts;
                })().map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      setAmount(String(v));
                      setErr("");
                    }}
                    className={`rounded-xl border px-3 py-1.5 text-sm font-bold transition-all ${amount === String(v) ? "border-green-600 bg-green-600 text-white" : "border-gray-200 bg-gray-50 text-gray-600"}`}
                  >
                    {fc(v)}
                  </button>
                ))}
                {balance >= minPayout && (
                  <button
                    onClick={() => {
                      setAmount(String(Math.floor(balance)));
                      setErr("");
                    }}
                    className={`rounded-xl border px-3 py-1.5 text-sm font-bold transition-all ${amount === String(Math.floor(balance)) ? "border-green-600 bg-green-600 text-white" : "border-green-200 bg-green-50 text-green-600"}`}
                  >
                    All ({fc(Math.floor(balance))})
                  </button>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-bold tracking-wider text-gray-400 uppercase">
                    Amount ({currency}) *
                  </p>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setErr("");
                    }}
                    placeholder={T("enterAmount")}
                    className={INPUT}
                  />
                </div>
                {err && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5">
                    <AlertTriangle size={14} className="text-red-400" />
                    <p className="text-sm font-semibold text-red-500">{err}</p>
                  </div>
                )}
                <button
                  onClick={goToMethod}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 font-extrabold text-white"
                >
                  {T("selectMethod")} <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
