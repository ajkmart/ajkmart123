import { createLogger } from "@/lib/logger";
import { useMutation } from "@tanstack/react-query";
import { formatCurrency as _sharedFcR } from "@workspace/api-zod";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Landmark,
  Lightbulb,
  Loader2,
  Smartphone,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, apiFetch } from "../../lib/api";
import { useAuth } from "../../lib/rider-auth";
import { useCurrency } from "../../lib/useConfig";
import {
  checkPromoStackable,
  checkSufficientBalance,
  validatePromo,
  type PromoCode,
} from "../../lib/wallet/validation";
import type { PayMethod } from "./WithdrawModal";
const log = createLogger("[RemittanceModal]");
const INPUT =
  "w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:bg-white transition-colors";

function MethodLogo({ id }: { id: string }) {
  if (id === "jazzcash") return <Smartphone size={28} className="text-red-500" />;
  if (id === "easypaisa") return <Smartphone size={28} className="text-green-500" />;
  return <Landmark size={28} className="text-blue-500" />;
}

export default function RemittanceModal({
  netOwed,
  codCollected,
  onClose,
  onSuccess,
}: {
  netOwed: number;
  codCollected?: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const { symbol: currencySymbol } = useCurrency();
  const fc = (n: string | number | null | undefined) =>
    _sharedFcR(n != null ? String(n) : (n as null | undefined), currencySymbol);
  const [step, setStep] = useState<"method" | "details" | "confirm" | "done">("method");
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [amount, setAmount] = useState(String(Math.ceil(netOwed)));
  const [acNo, setAcNo] = useState("");
  const [txId, setTxId] = useState("");
  const [note, setNote] = useState("");
  const [bonusCode, setBonusCode] = useState("");
  const [err, setErr] = useState("");
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [methodsError, setMethodsError] = useState(false);

  useEffect(() => {
    type ApiMethod = { id: string; label?: string; logo?: string; description?: string };
    apiFetch("/payments/methods")
      .then((data: { methods?: ApiMethod[] }) => {
        const ms: PayMethod[] = (data.methods || [])
          .filter((m) => ["jazzcash", "easypaisa", "bank"].includes(m.id))
          .map((m) => ({ ...m, label: m.label ?? m.id, logo: m.logo ?? m.id }));
        if (ms.length === 0) {
          setMethodsError(true);
        } else {
          setMethods(ms);
        }
      })
      .catch((err: Error) => {
        log.warn("Failed to load payment methods:", err.message);
        setMethodsError(true);
      })
      .finally(() => setLoadingMethods(false));
  }, []);

  const mut = useMutation({
    mutationFn: () =>
      api.submitCodRemittance({
        amount: Number(amount),
        paymentMethod: method?.id ?? "",
        accountNumber: acNo,
        transactionId: txId,
        note,
      }),
    onSuccess: () => setStep("done"),
    onError: (e: Error) => setErr(e.message),
  });

  const goToDetails = (m: PayMethod) => {
    setMethod(m);
    setAcNo(m.manualNumber || m.iban || "");
    setErr("");
    setStep("details");
  };

  const goToConfirm = () => {
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt < 1) {
      setErr(`Amount kam az kam ${currencySymbol} 1 hona chahiye`);
      return;
    }
    if (codCollected != null && amt > codCollected) {
      setErr(`Amount ${fc(amt)} aapke collected COD ${fc(codCollected)} se zyada nahi ho sakta`);
      return;
    }
    if (amt > netOwed) {
      setErr(`Amount ${fc(amt)} owed amount ${fc(netOwed)} se zyada nahi ho sakta`);
      return;
    }
    const balanceCheck = checkSufficientBalance(netOwed, amt);
    if (!balanceCheck.valid) {
      setErr(balanceCheck.reason);
      return;
    }
    if (!acNo.trim()) {
      setErr("Account / phone number required");
      return;
    }
    if (!txId.trim()) {
      setErr("Transaction reference ID required hai");
      return;
    }
    /* Promo / bonus code validation — riders may optionally enter a platform-
       issued bonus code for COD remittance campaigns.
       checkPromoStackable ensures they cannot apply more than one promo at a time.
       validatePromo checks expiry and per-user usage limits client-side before
       the mutation hits the server (server also validates; this is a first-pass
       guard that gives immediate, translated feedback). */
    if (bonusCode.trim()) {
      const activeBonuses: PromoCode[] = [{ id: bonusCode.trim() }];
      /* If a second bonus code were already applied in this session this guard
         fires before the network call, preventing silent double-stacking. */
      const stackCheck = checkPromoStackable(activeBonuses);
      if (!stackCheck.valid) {
        setErr(stackCheck.reason);
        return;
      }
      const promoEntry: PromoCode = { id: bonusCode.trim() };
      const promoCheck = validatePromo(promoEntry, user?.id ?? "");
      if (!promoCheck.valid) {
        setErr(promoCheck.reason);
        return;
      }
    }
    setErr("");
    setStep("confirm");
  };

  const STEP_LABELS = ["method", "details", "confirm"];
  const stepIdx = STEP_LABELS.indexOf(step);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[93vh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl"
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
                  className={`h-1 flex-1 rounded-full transition-all ${i <= stepIdx ? "bg-blue-500" : "bg-gray-100"}`}
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
              <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-blue-100">
                <CheckCircle size={52} className="text-blue-500" />
              </div>
              <h3 className="text-2xl font-extrabold text-gray-800">Remittance Submitted!</h3>
              <p className="mt-2 text-sm text-gray-500">
                Admin 24 hours mein verify karega. Verify hone par notification milegi.
              </p>
              <div className="mt-5 space-y-3 rounded-2xl bg-blue-50 p-5 text-left">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Method</span>
                  <span className="flex items-center gap-1.5 font-bold">
                    <MethodLogo id={method?.id ?? ""} /> {method?.label}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Account</span>
                  <span className="font-mono font-bold">{acNo}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tx Ref</span>
                  <span className="font-mono font-bold">{txId}</span>
                </div>
                <div className="flex items-center justify-between border-t border-blue-100 pt-2">
                  <span className="font-semibold text-gray-600">Amount Remitted</span>
                  <span className="text-2xl font-extrabold text-blue-600">
                    {fc(Number(amount))}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
                className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 font-extrabold text-white"
              >
                <CheckCircle size={20} /> Done
              </button>
            </div>
          )}

          {/* CONFIRM */}
          {step === "confirm" && (
            <div className="p-6">
              <h3 className="mb-1 text-xl font-extrabold text-gray-800">Confirm Remittance</h3>
              <p className="mb-5 text-sm text-gray-500">Submit se pehle sab details check karein</p>
              <div className="mb-4 space-y-3 rounded-2xl border border-blue-100 bg-blue-50 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Amount</span>
                  <span className="text-3xl font-extrabold text-blue-600">
                    {fc(Number(amount))}
                  </span>
                </div>
                <div className="h-px bg-blue-100" />
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Method</span>
                  <span className="flex items-center gap-1.5 font-bold">
                    <MethodLogo id={method?.id ?? ""} /> {method?.label}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">To Account</span>
                  <span className="font-mono font-bold">{acNo}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tx Ref</span>
                  <span className="font-mono font-bold">{txId}</span>
                </div>
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
                  className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-sm font-extrabold text-white disabled:opacity-60"
                >
                  {mut.isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} /> Submit Remittance
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* DETAILS */}
          {step === "details" && method && (
            <div className="p-6">
              <button
                onClick={() => setStep("method")}
                className="mb-4 flex items-center gap-1 text-sm font-semibold text-gray-500"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <h3 className="mb-4 flex items-center gap-2 text-xl font-extrabold text-gray-800">
                <MethodLogo id={method.id} /> {method.label}
              </h3>

              {/* Admin-configured destination account (read-only) */}
              {(method.manualNumber || method.iban || method.instructions) && (
                <div className="mb-4 space-y-2 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs font-bold tracking-wide text-blue-700 uppercase">
                    Send To (Company Account)
                  </p>
                  {method.accountTitle && (
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-blue-500">Account Name</span>
                      <span className="font-bold text-blue-900">{method.accountTitle}</span>
                    </div>
                  )}
                  {(method.manualNumber || method.iban) && (
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-blue-500">
                        {method.id === "bank" ? "IBAN / Account" : "Phone No."}
                      </span>
                      <span className="font-mono font-bold text-blue-900">
                        {method.iban || method.manualNumber}
                      </span>
                    </div>
                  )}
                  {method.bankName && (
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-blue-500">Bank</span>
                      <span className="font-bold text-blue-900">{method.bankName}</span>
                    </div>
                  )}
                  {method.instructions && (
                    <p className="mt-1 border-t border-blue-200 pt-2 text-xs text-blue-700">
                      {method.instructions}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-bold tracking-wider text-gray-400 uppercase">
                    Amount ({currencySymbol}) *
                  </p>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={amount}
                    min={1}
                    max={Math.ceil(netOwed)}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setErr("");
                    }}
                    className={INPUT}
                    placeholder="0"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold tracking-wider text-gray-400 uppercase">
                    {method.id === "bank" ? "Your Account No. (Sender)" : "Your Phone No. (Sender)"}{" "}
                    *
                  </p>
                  <input
                    value={acNo}
                    onChange={(e) => {
                      setAcNo(e.target.value);
                      setErr("");
                    }}
                    placeholder={method.id === "bank" ? "Your IBAN / Account No." : "03XX-XXXXXXX"}
                    className={INPUT}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold tracking-wider text-gray-400 uppercase">
                    Transaction ID / Reference *
                  </p>
                  <input
                    value={txId}
                    onChange={(e) => {
                      setTxId(e.target.value);
                      setErr("");
                    }}
                    placeholder="JazzCash/EasyPaisa TxID ya bank ref no."
                    className={INPUT}
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    JazzCash app ya bank SMS mein milta hai
                  </p>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold tracking-wider text-gray-400 uppercase">
                    Bonus Code (Optional)
                  </p>
                  <input
                    value={bonusCode}
                    onChange={(e) => {
                      setBonusCode(e.target.value.toUpperCase());
                      setErr("");
                    }}
                    placeholder="Platform promo ya bonus code (agar ho)"
                    className={INPUT}
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    Agar company ne bonus code diya ho to yahan likhein
                  </p>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-bold tracking-wider text-gray-400 uppercase">
                    Note (Optional)
                  </p>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Koi additional info"
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
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 font-extrabold text-white"
                >
                  Review & Submit <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* METHOD SELECTION */}
          {step === "method" && (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-extrabold text-gray-800">Remit COD Cash</h3>
                <button
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mb-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white">
                <p className="text-sm text-blue-200">Total COD Owed</p>
                <p className="mt-0.5 text-4xl font-extrabold">{fc(netOwed)}</p>
                <p className="mt-2 text-xs text-blue-300">Company ke account mein remit karein</p>
              </div>
              <p className="mb-4 text-sm text-gray-600">Kahan bheja? Method select karein:</p>
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
                      className="flex w-full items-center gap-4 rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 text-left transition-all hover:border-blue-400 hover:bg-blue-50 active:scale-[0.98]"
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
              <div className="mt-4 flex gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3">
                <Lightbulb size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
                <p className="text-xs font-medium text-amber-700">
                  Pehle company account mein transfer karein, phir yahan Transaction ID ke sath
                  submit karein.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
