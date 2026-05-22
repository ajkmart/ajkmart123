import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Colors from "@/constants/colors";

const C = Colors.light;

export type CancelTarget = {
  id: string;
  type: "order" | "ride" | "pharmacy" | "parcel";
  status: string;
  total?: number;
  fare?: number;
  paymentMethod?: string;
  riderAssigned?: boolean;
  cancelMinsLeft?: number;
};

const ORDER_CANCEL_REASONS = [
  { key: "changed_mind",     label: "Changed my mind",       icon: "swap-horizontal-outline" },
  { key: "wrong_items",      label: "Wrong items ordered",   icon: "alert-circle-outline" },
  { key: "found_cheaper",    label: "Found a better price",  icon: "pricetag-outline" },
  { key: "taking_too_long",  label: "Taking too long",       icon: "time-outline" },
  { key: "other",            label: "Other reason",          icon: "chatbox-ellipses-outline" },
] as const;

const RIDE_CANCEL_REASONS = [
  { key: "changed_mind",     label: "Changed my mind",       icon: "swap-horizontal-outline" },
  { key: "wrong_location",   label: "Wrong pickup/drop",     icon: "location-outline" },
  { key: "wait_too_long",    label: "Driver taking too long", icon: "time-outline" },
  { key: "found_other",      label: "Found another ride",    icon: "car-outline" },
  { key: "other",            label: "Other reason",          icon: "chatbox-ellipses-outline" },
] as const;

export function CancelModal({ target, cancellationFee, apiBase, token, onClose, onDone }: {
  target: CancelTarget;
  cancellationFee: number;
  apiBase: string;
  token: string | null;
  onClose: () => void;
  onDone: (result: any) => void;
}) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isRide = target.type === "ride";
  const isPharmacy = target.type === "pharmacy";
  const isParcel = target.type === "parcel";
  const reasons = isRide ? RIDE_CANCEL_REASONS : ORDER_CANCEL_REASONS;
  const riderAssigned = target.riderAssigned ?? false;
  const hasFee = isRide && riderAssigned && cancellationFee > 0;
  const isWallet = target.paymentMethod === "wallet";
  const amount = isRide ? target.fare : target.total;

  const handleConfirm = async () => {
    if (!selectedReason) { setError("Please select a reason."); return; }
    setLoading(true);
    setError("");
    try {
      const url = isRide
        ? `${apiBase}/rides/${target.id}/cancel`
        : isPharmacy
        ? `${apiBase}/pharmacy-orders/${target.id}/cancel`
        : isParcel
        ? `${apiBase}/parcel-bookings/${target.id}/cancel`
        : `${apiBase}/orders/${target.id}/cancel`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: selectedReason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not cancel. Please try again.");
        setLoading(false);
        return;
      }
      const result = await res.json().catch(() => ({}));
      onDone(result);
      onClose();
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  const safeClose = () => { if (!loading) onClose(); };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={safeClose}>
      <Pressable style={cm.backdrop} onPress={safeClose}>
        <Pressable style={cm.sheet} onPress={() => {}}>
          <View style={cm.handle} />

          <View style={cm.headerIconWrap}>
            <View style={cm.headerIcon}>
              <Ionicons name="warning" size={24} color="#fff" />
            </View>
          </View>

          <Text style={cm.title}>
            {isRide ? "Cancel Ride?" : isPharmacy ? "Cancel Pharmacy Order?" : isParcel ? "Cancel Parcel Booking?" : "Cancel Order?"}
          </Text>
          <Text style={cm.sub}>
            {isRide
              ? `Ride #${target.id.slice(-8).toUpperCase()}`
              : isPharmacy
              ? `Pharmacy Order #${target.id.slice(-8).toUpperCase()}`
              : isParcel
              ? `Parcel #${target.id.slice(-8).toUpperCase()}`
              : `Order #${target.id.slice(-8).toUpperCase()}`}
            {target.cancelMinsLeft != null && !isRide
              ? ` · ${target.cancelMinsLeft}m left`
              : ""}
          </Text>

          {(hasFee || isWallet) && (
            <View style={cm.infoBox}>
              {hasFee && (
                <View style={cm.infoRow}>
                  <Ionicons name="cash-outline" size={15} color="#DC2626" />
                  <Text style={cm.infoTextRed}>
                    Rs. {cancellationFee} cancellation fee will apply
                  </Text>
                </View>
              )}
              {isWallet && amount != null && (
                <View style={cm.infoRow}>
                  <Ionicons name="wallet-outline" size={15} color="#059669" />
                  <Text style={cm.infoTextGreen}>
                    Rs. {Math.round(amount)} will be refunded to wallet
                  </Text>
                </View>
              )}
            </View>
          )}

          {!hasFee && !isWallet && isRide && !riderAssigned && (
            <View style={cm.infoBox}>
              <View style={cm.infoRow}>
                <Ionicons name="checkmark-circle-outline" size={15} color="#059669" />
                <Text style={cm.infoTextGreen}>No cancellation fee applies</Text>
              </View>
            </View>
          )}

          <Text style={cm.reasonTitle}>Why are you cancelling?</Text>
          <View style={cm.reasons}>
            {reasons.map(r => {
              const active = selectedReason === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => { setSelectedReason(r.key); setError(""); }}
                  style={[cm.reasonChip, active && cm.reasonChipActive]}
                >
                  <Ionicons
                    name={r.icon as any}
                    size={16}
                    color={active ? "#DC2626" : C.textSecondary}
                  />
                  <Text style={[cm.reasonText, active && cm.reasonTextActive]}>
                    {r.label}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark-circle" size={16} color="#DC2626" />
                  )}
                </Pressable>
              );
            })}
          </View>

          {error ? <Text style={cm.error}>{error}</Text> : null}

          <View style={cm.btns}>
            <Pressable style={cm.keepBtn} onPress={safeClose}>
              <Text style={cm.keepText}>
                {isRide ? "Keep Ride" : isParcel ? "Keep Booking" : "Keep Order"}
              </Text>
            </Pressable>
            <Pressable
              style={[cm.confirmBtn, !selectedReason && { opacity: 0.5 }]}
              onPress={handleConfirm}
              disabled={loading || !selectedReason}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={cm.confirmText}>Confirm Cancel</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const cm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: "85%" },
  handle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  headerIconWrap: { alignItems: "center", marginBottom: 14 },
  headerIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, color: C.text, textAlign: "center", marginBottom: 4 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 13, color: C.textSecondary, textAlign: "center", marginBottom: 16 },
  infoBox: { backgroundColor: "#FAFAFA", borderRadius: 14, padding: 14, gap: 8, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoTextRed: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#DC2626", flex: 1 },
  infoTextGreen: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#059669", flex: 1 },
  reasonTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.text, marginBottom: 10 },
  reasons: { gap: 8, marginBottom: 12 },
  reasonChip: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: "#FAFAFA",
  },
  reasonChipActive: { borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" },
  reasonText: { fontFamily: "Inter_500Medium", fontSize: 14, color: C.textSecondary, flex: 1 },
  reasonTextActive: { color: "#DC2626" },
  error: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#EF4444", textAlign: "center", marginBottom: 8 },
  btns: { flexDirection: "row", gap: 12, marginTop: 8 },
  keepBtn: { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  keepText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.textSecondary },
  confirmBtn: { flex: 2, backgroundColor: "#DC2626", borderRadius: 16, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  confirmText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },
});
