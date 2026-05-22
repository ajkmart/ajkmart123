import { AlertTriangle, CheckCircle, MessageSquare, Shield, X } from "lucide-react";

export interface ActiveModalsProps {
  showOtpModal: boolean;
  showCancelConfirm: boolean;
  showNoPhotoWarning: boolean;
  showAdminChat: boolean;
  toastMsg: string | null;
  toastIsError: boolean;
  cancelTarget: "order" | "ride" | null;
  otpInput: string;
  setOtpInput: (v: string) => void;
  setShowOtpModal: (v: boolean) => void;
  setShowCancelConfirm: (v: boolean) => void;
  setShowNoPhotoWarning: (v: boolean) => void;
  setShowAdminChat: (v: boolean) => void;
  chatReply: string;
  setChatReply: (v: string) => void;
  adminMessages: Array<{ text: string; ts: string; from: "rider" | "admin" }>;
  setAdminMessages: (
    fn: (
      prev: Array<{ text: string; ts: string; from: "rider" | "admin" }>
    ) => Array<{ text: string; ts: string; from: "rider" | "admin" }>
  ) => void;
  socketRef: React.RefObject<{ emit: (event: string, data: unknown) => void } | null>;
  order: Record<string, unknown> | null;
  ride: Record<string, unknown> | null;
  updateOrderMut: { mutate: (args: { id: string; status: string }) => void; isPending: boolean };
  updateRideMut: { mutate: (args: { id: string; status: string }) => void; isPending: boolean };
  verifyOtpMut: { mutate: (args: { id: string; otp: string }) => void; isPending: boolean };
  handleMarkDelivered: (id: string, forceNoPhoto?: boolean) => void;
  proofUploading: boolean;
  T: (key: import("@workspace/i18n").TranslationKey) => string;
}

export function ActiveModals({
  showOtpModal,
  showCancelConfirm,
  showNoPhotoWarning,
  showAdminChat,
  toastMsg,
  toastIsError,
  cancelTarget,
  otpInput,
  setOtpInput,
  setShowOtpModal,
  setShowCancelConfirm,
  setShowNoPhotoWarning,
  setShowAdminChat,
  chatReply,
  setChatReply,
  adminMessages,
  setAdminMessages,
  socketRef,
  order,
  ride,
  updateOrderMut,
  updateRideMut,
  verifyOtpMut,
  handleMarkDelivered,
  proofUploading,
  T,
}: ActiveModalsProps) {
  return (
    <>
      {/* Admin Chat Modal */}
      {showAdminChat && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAdminChat(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="flex items-center gap-2 font-black text-gray-900">
                  <MessageSquare size={16} className="text-blue-600" /> Admin Chat
                </p>
                <p className="text-xs text-gray-400">Admin can see your messages</p>
              </div>
              <button onClick={() => setShowAdminChat(false)}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="mb-3 max-h-44 min-h-[80px] space-y-2 overflow-y-auto rounded-2xl bg-gray-50 p-3">
              {adminMessages.map((m) => (
                <div
                  key={`${m.ts}-${m.text}`}
                  className={`flex ${m.from === "rider" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-1.5 text-xs ${m.from === "rider" ? "bg-gray-900 text-white" : "bg-blue-600 text-white"}`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatReply}
                onChange={(e) => setChatReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && chatReply.trim() && socketRef.current) {
                    const msg = chatReply.trim();
                    socketRef.current.emit("rider:chat", { message: msg });
                    setAdminMessages((prev) => [
                      ...prev,
                      { text: msg, ts: new Date().toISOString(), from: "rider" },
                    ]);
                    setChatReply("");
                  }
                }}
                placeholder="Reply to admin..."
                className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={() => {
                  if (!chatReply.trim() || !socketRef.current) return;
                  const msg = chatReply.trim();
                  socketRef.current.emit("rider:chat", { message: msg });
                  setAdminMessages((prev) => [
                    ...prev,
                    { text: msg, ts: new Date().toISOString(), from: "rider" },
                  ]);
                  setChatReply("");
                }}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OTP Verification Modal */}
      {showOtpModal && ride && (
        <div className="fixed inset-0 z-50 flex animate-[fadeIn_0.2s_ease-out] items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm animate-[slideUp_0.3s_ease-out] overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex flex-col items-center gap-3 border-b border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 px-6 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-200">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <p className="text-xl font-black text-gray-900">Enter Customer OTP</p>
                <p className="mt-1 text-sm text-gray-500">
                  Ask the customer for their 4-digit trip code
                </p>
              </div>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="space-y-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={otpInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setOtpInput(val);
                  }}
                  placeholder="_ _ _ _"
                  className="w-full rounded-2xl border-2 border-gray-200 py-4 text-center text-3xl font-black tracking-[0.5em] focus:border-blue-500 focus:outline-none"
                />
                {otpInput.length < 4 && (
                  <p className="text-center text-xs font-medium text-blue-500">
                    Enter the 4-digit code from the customer
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  if (otpInput.length === 4)
                    verifyOtpMut.mutate({ id: ride.id as string, otp: otpInput });
                }}
                disabled={otpInput.length !== 4 || verifyOtpMut.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-black text-white shadow-lg shadow-blue-200 disabled:opacity-50"
              >
                <CheckCircle size={18} />{" "}
                {verifyOtpMut.isPending ? "Verifying…" : "Verify & Start Ride"}
              </button>
              <button
                onClick={() => setShowOtpModal(false)}
                className="w-full py-2 text-sm font-bold text-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex animate-[fadeIn_0.2s_ease-out] items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm animate-[slideUp_0.3s_ease-out] overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex flex-col items-center gap-3 border-b border-red-100 bg-gradient-to-br from-red-50 to-pink-50 px-6 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-pink-600 shadow-lg shadow-red-200">
                <AlertTriangle className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <p className="text-xl font-black text-gray-900">
                  {T("cancelConfirm")} {cancelTarget === "order" ? T("deliveryLabel") : T("ride")}?
                </p>
                <p className="mt-1.5 text-sm text-gray-500">{T("actionNotReversible")}</p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-3.5">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100">
                  <Shield size={16} className="text-amber-600" />
                </div>
                <p className="text-xs leading-relaxed font-medium text-amber-800">
                  {T("cancelWarning")}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 rounded-xl bg-gray-100 py-3 font-bold text-gray-700 transition-colors active:bg-gray-200"
                >
                  {T("goBack")}
                </button>
                <button
                  onClick={() => {
                    setShowCancelConfirm(false);
                    if (cancelTarget === "order" && order) {
                      updateOrderMut.mutate({ id: order.id as string, status: "cancelled" });
                    } else if (cancelTarget === "ride" && ride) {
                      updateRideMut.mutate({ id: ride.id as string, status: "cancelled" });
                    }
                  }}
                  disabled={updateOrderMut.isPending || updateRideMut.isPending}
                  className="flex-1 rounded-xl bg-gradient-to-r from-red-600 to-pink-600 py-3 font-bold text-white shadow-md shadow-red-200 transition-transform active:scale-[0.97] disabled:opacity-60"
                >
                  {updateOrderMut.isPending || updateRideMut.isPending
                    ? T("cancelling")
                    : T("yesCancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Photo Warning Modal */}
      {showNoPhotoWarning && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex animate-[fadeIn_0.15s_ease-out] items-end justify-center bg-black/50">
          <div className="mx-auto w-full max-w-sm animate-[slideUp_0.2s_ease-out] rounded-t-3xl bg-white px-6 py-6 shadow-2xl">
            <div className="mb-5 flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
                <AlertTriangle size={28} className="text-amber-600" />
              </div>
              <div className="text-center">
                <p className="text-base font-extrabold text-gray-900">No Photo Taken</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-500">
                  Delivering without proof photo may cause disputes. Are you sure?
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowNoPhotoWarning(false)}
                className="h-12 flex-1 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Take Photo
              </button>
              <button
                onClick={() => {
                  setShowNoPhotoWarning(false);
                  if (order) handleMarkDelivered(order.id as string, true);
                }}
                disabled={proofUploading || updateOrderMut.isPending}
                className="h-12 flex-1 rounded-xl bg-amber-600 text-sm font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
              >
                Deliver Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed top-4 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 animate-[slideDown_0.3s_ease-out] items-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-bold shadow-2xl backdrop-blur-md ${toastIsError ? "bg-red-600/95 text-white" : "bg-gray-900/95 text-white"}`}
        >
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${toastIsError ? "bg-red-500" : "bg-green-500"}`}
          >
            {toastIsError ? (
              <AlertTriangle size={14} className="text-white" />
            ) : (
              <CheckCircle size={14} className="text-white" />
            )}
          </div>
          {toastMsg}
        </div>
      )}
    </>
  );
}
