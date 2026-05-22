import { createLogger } from "@/lib/logger";
import { useMutation } from "@tanstack/react-query";
import { formatCurrency as _sharedFcD } from "@workspace/api-zod";
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
import { useCurrency } from "../../lib/useConfig";
import { checkSufficientBalance } from "../../lib/wallet/validation";
import type { PayMethod } from "./WithdrawModal";
const log = createLogger("[DepositModal]");
const INPUT =
  "w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-400 focus:bg-white transition-colors";

function MethodLogo({ id }: { id: string }) {
  if (id === "jazzcash") return <Smartphone size={28} className="text-red-500" />;
  if (id === "easypaisa") return <Smartphone size={28} className="text-green-500" />;
  return <Landmark size={28} className="text-blue-500" />;
}

export default function DepositModal({
  minBalance,
  balance,
  onClose,
  onSuccess,
}: {
  minBalance: number;
  balance: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { symbol: currencySymbol } = useCurrency();
  const fc = (n: string | number | null | undefined) =>
    _sharedFcD(n != null ? String(n) : (n as null | undefined), currencySymbol);
  const [amount, setAmount] = useState("");
  const [selectedMethod, setMethod] = useState<PayMethod | null>(null);
  const [txId, setTxId] = useState("");
  const [senderAcNo, setSenderAcNo] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"amount" | "method" | "details" | "confirm" | "done">("amount");
  const [err, setErr] = useState("");
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [methodsError, setMethodsError] = useState(false);

  useEffect(() => {
    type ApiMethod = {
      id: string;
      label?: string;
      logo?: string;
      description?: string;
      manualNumber?: string;
      iban?: string;
    };
    apiFetch("/payments/methods")
      .then((data: { methods?: ApiMethod[] }) => {
        const depositable: PayMethod[] = (data.methods || [])
          .filter((m) => ["jazzcash", "easypaisa", "bank"].includes(m.id))
          .map((m) => ({ ...m, label: m.label ?? m.id, logo: m.logo ?? m.id }));
        if (depositable.length === 0) {
          setMethodsError(true);
        } else {
          setMethods(depositable);
        }
      })
      .catch((err: Error) => {
        log.warn("Failed to load payment methods:", err.message);
        setMethodsError(true);
      })
      .finally(() => setLoadingMethods(false));
  }, []);

  const suggestAmt = minBalance > balance ? Math.ceil(minBalance - balance + 50) : 500;

  const mut = useMutation({
    mutationFn: () =>
      api.submitDeposit({
        amount: Number(amount),
        paymentMethod: selectedMethod?.id ?? "",
        accountNumber: senderAcNo.trim() || undefined,
        transactionId: txId,
        note,
      }),
    onSuccess: () => setStep("done"),
    onError: (e: Error) => setErr(e.message),
  });

  const goToMethod = () => {
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt < 100) {
      setErr(`Minimum deposit ${currencySymbol} 100 hai`);
      return;
    }
    /* If the rider's balance is below the minimum operating threshold, ensure
       this deposit is large enough to cover the shortfall — using the same
       library guard that WithdrawModal uses to prevent overdrafts. */
    const shortfall = Math.max(0, minBalance - balance);
    if (shortfall > 0) {
      const gapCheck = checkSufficientBalance(amt, shortfall);
      if (!gapCheck.valid) {
        setErr(
          `Please deposit at least ${fc(shortfall)} to cover your minimum balance requirement`
        );
        return;
      }
    }
    setErr("");
    setStep("method");
  };

  const goToDetails = (m: PayMethod) => {
    setMethod(m);
    setTxId("");
    setNote("");
    setErr("");
    setStep("details");
  };

  const goToConfirm = () => {
    if (!txId.trim()) {
      setErr("Transaction ID daalna zaroori hai — without ID verify nahi ho sakta");
      return;
    }
    if (!senderAcNo.trim()) {
      setErr("Sender account / mobile number zaroori hai — admin verify karne ke liye chahiye");
      return;
    }
    if (selectedMethod?.id === "jazzcash" || selectedMethod?.id === "easypaisa") {
      const cleanPhone = senderAcNo.replace(/[\s-]/g, "");
      if (!/^0[3]\d{9}$/.test(cleanPhone)) {
        setErr("Valid Pakistani mobile number daalen (e.g. 03XX-XXXXXXX, 11 digits)");
        return;
      }
    }
    if (selectedMethod?.id === "bank") {
      const cleaned = senderAcNo.replace(/[\s-]/g, "");
      const isIban = /^PK\d{2}[A-Z]{4}\d{16}$/i.test(cleaned);
      const isAccountNo = /^\d{8,20}$/.test(cleaned);
      if (!isIban && !isAccountNo) {
        setErr("Valid IBAN (e.g. PK36SCBL0000001234567801) ya 8-20 digit account number daalen");
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
                  className={`h-1 flex-1 rounded-full transition-all ${i <= stepIdx ? "bg-teal-500" : "bg-gray-100"}`}
                />
              ))}
            </div>
            <p className="mt-1 text-right text-[10px] text-gray-400">
              Step {stepIdx + 1}/{STEP_LABELS.length}
            </p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {/* DONE */}
          {step === "done" && (
            <div className="p-8 text-center">
              <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-teal-100">
                <CheckCircle size={52} className="text-teal-500" />
              </div>
              <h3 className="text-2xl font-extrabold text-gray-800">Deposit Submitted!</h3>
              <p className="mt-2 text-sm text-gray-500">
                Admin 24 hours mein verify karke wallet credit karega.
              </p>
              <div className="mt-5 space-y-3 rounded-2xl bg-teal-50 p-5 text-left">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Method</span>
                  <span className="flex items-center gap-1.5 font-bold">
                    <MethodLogo id={selectedMethod?.id ?? ""} /> {selectedMethod?.label}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tx ID</span>
                  <span className="font-mono font-bold">{txId}</span>
                </div>
                <div className="flex items-center justify-between border-t border-teal-100 pt-2">
                  <span className="font-semibold text-gray-600">Amount</span>
                  <span className="text-2xl font-extrabold text-teal-600">
                    {fc(Number(amount))}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
                className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 font-extrabold text-white"
              >
                <CheckCircle size={20} /> Done
              </button>
            </div>
          )}

          {/* AMOUNT STEP */}
          {step === "amount" && (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-extrabold text-gray-800">Wallet Deposit</h3>
                <button
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500"
                >
                  <X size={18} />
                </button>
              </div>
              {minBalance > balance && (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-500" />
                    <p className="text-xs font-bold text-amber-700">Balance Kam Hai</p>
                  </div>
                  <p className="text-xs text-amber-600">
                    Cash orders ke liye minimum <strong>{fc(minBalance)}</strong> chahiye. Abhi{" "}
                    <strong>{fc(balance)}</strong> hai.
                  </p>
                  <p className="mt-0.5 text-xs text-amber-600">
                    Suggested deposit: <strong>{fc(suggestAmt)}</strong>
                  </p>
                </div>
              )}
              <p className="mb-4 text-sm text-gray-600">Kitna deposit karna chahte hain?</p>
              <div className="relative mb-2">
                <span className="absolute top-1/2 left-4 -translate-y-1/2 text-sm font-bold text-gray-500">
                  {currencySymbol}
                </span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  placeholder="0"
                  className={`${INPUT} pl-12 text-2xl font-extrabold`}
                />
              </div>
              <div className="mb-4 flex gap-2">
                {[suggestAmt, 1000, 2000, 5000]
                  .filter((v, i, arr) => arr.indexOf(v) === i)
                  .map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmount(String(v))}
                      className="flex-1 rounded-xl bg-gray-100 py-2 text-xs font-bold text-gray-700 active:bg-teal-100 active:text-teal-700"
                    >
                      {fc(v)}
                    </button>
                  ))}
              </div>
              {err && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5">
                  <AlertTriangle size={14} className="text-red-400" />
                  <p className="text-sm font-semibold text-red-500">{err}</p>
                </div>
              )}
              <button
                onClick={goToMethod}
                className="mt-1 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 font-extrabold text-white"
              >
                Next: Payment Method <ChevronRight size={18} />
              </button>
            </div>
          )}

          {/* METHOD STEP */}
          {step === "method" && (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-extrabold text-gray-800">Payment Method</h3>
                <button
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mb-5 rounded-2xl bg-teal-50 px-4 py-3">
                <p className="text-xs font-medium text-teal-600">Deposit Amount</p>
                <p className="text-3xl font-extrabold text-teal-700">{fc(Number(amount))}</p>
              </div>
              <p className="mb-3 text-sm text-gray-600">Kahan se deposit karein?</p>
              {loadingMethods ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
                  ))}
                </div>
              ) : methodsError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center">
                  <AlertTriangle size={28} className="mx-auto mb-2 text-red-400" />
                  <p className="text-sm font-bold text-red-700">Payment methods unavailable</p>
                  <p className="mt-1 text-xs text-red-500">
                    Admin ne koi payment method enable nahi ki hai. Contact support.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {methods.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => goToDetails(m)}
                      className="flex w-full items-center gap-4 rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 text-left transition-all hover:border-teal-400 hover:bg-teal-50 active:scale-[0.98]"
                    >
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                        <MethodLogo id={m.id} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-gray-800">{m.label}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {m.description || m.label + " se deposit karein"}
                        </p>
                        {(m.manualNumber || m.iban) && (
                          <p className="mt-1 text-xs font-semibold text-teal-600">
                            {m.manualNumber || m.iban}
                          </p>
                        )}
                      </div>
                      <ChevronRight size={20} className="text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setStep("amount")}
                className="mt-4 flex w-full items-center justify-center gap-1 py-2 text-center text-sm font-medium text-gray-500"
              >
                <ArrowLeft size={14} /> Back
              </button>
            </div>
          )}

          {/* DETAILS STEP */}
          {step === "details" && selectedMethod && (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-xl font-extrabold text-gray-800">
                  <MethodLogo id={selectedMethod.id} /> {selectedMethod.label}
                </h3>
                <button
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mb-4 rounded-2xl border border-teal-100 bg-teal-50 p-4">
                <p className="mb-2 text-xs font-bold text-teal-600">Company Account Details:</p>
                {selectedMethod.manualNumber && (
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs text-teal-700">Account Number</span>
                    <span className="font-mono text-sm font-extrabold text-teal-800">
                      {selectedMethod.manualNumber}
                    </span>
                  </div>
                )}
                {selectedMethod.manualName && (
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs text-teal-700">Account Title</span>
                    <span className="text-sm font-bold text-teal-800">
                      {selectedMethod.manualName}
                    </span>
                  </div>
                )}
                {selectedMethod.iban && (
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs text-teal-700">IBAN</span>
                    <span className="font-mono text-xs font-extrabold break-all text-teal-800">
                      {selectedMethod.iban}
                    </span>
                  </div>
                )}
                {selectedMethod.accountTitle && (
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs text-teal-700">Account Title</span>
                    <span className="text-sm font-bold text-teal-800">
                      {selectedMethod.accountTitle}
                    </span>
                  </div>
                )}
                {selectedMethod.accountNumber && (
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs text-teal-700">Account #</span>
                    <span className="font-mono text-sm font-extrabold text-teal-800">
                      {selectedMethod.accountNumber}
                    </span>
                  </div>
                )}
                {selectedMethod.bankName && (
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs text-teal-700">Bank</span>
                    <span className="text-sm font-bold text-teal-800">
                      {selectedMethod.bankName}
                    </span>
                  </div>
                )}
                <div className="mt-2 border-t border-teal-200 pt-2">
                  <p className="text-xs text-teal-700">
                    {selectedMethod.manualInstructions ||
                      selectedMethod.instructions ||
                      `${fc(amount)} transfer karein aur Transaction ID yahan daalen.`}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-400 uppercase">
                    {selectedMethod.id === "bank"
                      ? "Your Account / IBAN (Sender)"
                      : "Your Phone No. (Sender)"}
                  </label>
                  <input
                    value={senderAcNo}
                    onChange={(e) => setSenderAcNo(e.target.value)}
                    placeholder={
                      selectedMethod.id === "bank" ? "Your IBAN / Account No." : "03XX-XXXXXXX"
                    }
                    className={INPUT}
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    Admin verification ke liye (optional but recommended)
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-400 uppercase">
                    Transaction ID / TxID *
                  </label>
                  <input
                    value={txId}
                    onChange={(e) => setTxId(e.target.value)}
                    placeholder="e.g. T12345678 ya TxID number"
                    className={INPUT}
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    Without valid TxID deposit verify nahi hogi
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold tracking-wider text-gray-400 uppercase">
                    Note (Optional)
                  </label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Koi aur info..."
                    className={INPUT}
                  />
                </div>
              </div>
              {err && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5">
                  <AlertTriangle size={14} className="text-red-400" />
                  <p className="text-sm font-semibold text-red-500">{err}</p>
                </div>
              )}
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setStep("method")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-gray-200 py-3 text-sm font-bold text-gray-600"
                >
                  <ArrowLeft size={14} /> Back
                </button>
                <button
                  onClick={goToConfirm}
                  className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-teal-600 py-3 text-sm font-extrabold text-white"
                >
                  Review <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* CONFIRM STEP */}
          {step === "confirm" && selectedMethod && (
            <div className="p-6">
              <h3 className="mb-1 text-xl font-extrabold text-gray-800">Confirm Deposit</h3>
              <p className="mb-5 text-sm text-gray-500">Submit se pehle details check karein</p>
              <div className="mb-4 space-y-3 rounded-2xl border border-teal-100 bg-teal-50 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Amount</span>
                  <span className="text-3xl font-extrabold text-teal-600">
                    {fc(Number(amount))}
                  </span>
                </div>
                <div className="h-px bg-teal-100" />
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Method</span>
                  <span className="flex items-center gap-1.5 font-bold">
                    <MethodLogo id={selectedMethod.id} /> {selectedMethod.label}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tx ID</span>
                  <span className="font-mono font-bold">{txId}</span>
                </div>
                {note && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Note</span>
                    <span className="font-bold">{note}</span>
                  </div>
                )}
              </div>
              <div className="mb-4 flex gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
                <p className="text-xs font-medium text-amber-700">
                  Galat TxID se deposit reject ho sakti hai. Real transaction ID daalen.
                </p>
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
                  <ArrowLeft size={14} /> Edit
                </button>
                <button
                  onClick={() => mut.mutate()}
                  disabled={mut.isPending}
                  className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-teal-600 py-3 text-sm font-extrabold text-white disabled:opacity-60"
                >
                  {mut.isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} /> Submit Deposit
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
