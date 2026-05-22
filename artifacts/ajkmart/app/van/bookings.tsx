import React, { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator, Alert, TouchableOpacity, RefreshControl,
  ScrollView, StyleSheet, Text, View, Platform,
} from "react-native";
import { router } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useTheme } from "@/context/ThemeContext";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

type SeatTier = "window" | "aisle" | "economy";

const TIER_COLORS: Record<SeatTier, { bg: string; border: string; label: string }> = {
  window:  { bg: "#FFFBEB", border: "#F59E0B", label: "Window" },
  aisle:   { bg: "#EFF6FF", border: "#3B82F6", label: "Aisle" },
  economy: { bg: "#F0FDF4", border: "#22C55E", label: "Economy" },
};

interface VanBooking {
  id: string;
  scheduleId: string;
  seatNumbers: number[];
  seatTiers?: Record<string, SeatTier> | null;
  tierBreakdown?: Record<string, { count: number; fare: number }> | null;
  travelDate: string;
  status: string;
  fare: string;
  paymentMethod: string;
  routeName?: string;
  routeFrom?: string;
  routeTo?: string;
  departureTime?: string;
  tripStatus?: string;
  vanCode?: string | null;
  cancelledAt?: string;
  boardedAt?: string;
  completedAt?: string;
  createdAt: string;
}

const STATUS_INFO: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  confirmed: { color: "#2563EB", bg: "#DBEAFE", icon: "checkmark-circle-outline", label: "Confirmed" },
  boarded:   { color: "#D97706", bg: "#FEF3C7", icon: "bus-outline",               label: "Boarded" },
  completed: { color: "#16A34A", bg: "#DCFCE7", icon: "checkmark-done-circle",     label: "Completed" },
  cancelled: { color: "#DC2626", bg: "#FEE2E2", icon: "close-circle-outline",      label: "Cancelled" },
};

export default function VanBookingsScreen() {
  const { colors: C } = useTheme();
  const ss = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const topPad = Math.max(insets.top, 12);
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<VanBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function fetchBookings() {
    if (!token) { setLoading(false); return; }
    try {
      const res = await fetch(`${API_BASE}/van/bookings`, {
        headers: { "x-auth-token": token },
      });
      const j = await res.json();
      setBookings(j.data ?? []);
    } catch {
      showToast("Could not load your bookings.", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchBookings(); }, []);

  async function cancelBooking(id: string) {
    Alert.alert("Cancel Booking", "Are you sure you want to cancel this booking?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel", style: "destructive", onPress: async () => {
          setCancelling(id);
          try {
            const res = await fetch(`${API_BASE}/van/bookings/${id}/cancel`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", "x-auth-token": token || "" },
              body: JSON.stringify({ reason: "customer_cancelled" }),
            });
            const j = await res.json();
            if (!res.ok) { showToast(j.error || "Cancellation failed.", "error"); return; }
            showToast("Booking cancelled. Refund will be processed if paid by wallet.", "success");
            fetchBookings();
          } catch {
            showToast("Cancellation failed. Please try again.", "error");
          } finally {
            setCancelling(null);
          }
        }
      }
    ]);
  }

  return (
    <View style={ss.root}>
      <LinearGradient colors={["#4338CA","#6366F1","#818CF8"]} start={{ x:0,y:0 }} end={{ x:1,y:1 }}
        style={[ss.header, { paddingTop: topPad + 14 }]}>
        <View style={ss.headerRow}>
          <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={ss.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={ss.headerTitle}>My Van Bookings</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/van")} hitSlop={12}>
            <Ionicons name="add-circle-outline" size={24} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {!user ? (
        <View style={ss.center}>
          <Ionicons name="person-circle-outline" size={48} color={C.textMuted} />
          <Text style={ss.emptyTitle}>Login to See Bookings</Text>
          <TouchableOpacity activeOpacity={0.7} style={ss.btnPrimary} onPress={() => router.push("/auth")}><Text style={ss.btnPrimaryText}>Login</Text></TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={ss.center}><ActivityIndicator color="#6366F1" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[ss.content, bookings.length === 0 && ss.emptyContent]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBookings(); }} tintColor="#6366F1" />}
        >
          {bookings.length === 0 ? (
            <View style={ss.empty}>
              <Ionicons name="bus-outline" size={48} color={C.textMuted} />
              <Text style={ss.emptyTitle}>No Bookings Yet</Text>
              <Text style={ss.emptyDesc}>Your van seat bookings will appear here.</Text>
              <TouchableOpacity activeOpacity={0.7} style={[ss.btnPrimary, { marginTop: 20 }]} onPress={() => router.push("/van")}>
                <Text style={ss.btnPrimaryText}>Book a Seat</Text>
              </TouchableOpacity>
            </View>
          ) : (
            bookings.map(b => {
              const statusInfo = STATUS_INFO[b.status] ?? STATUS_INFO["confirmed"]!;
              const canCancel = b.status === "confirmed";
              const isActive = b.status === "confirmed" || b.status === "boarded";
              const isInProgress = b.tripStatus === "in_progress";
              return (
                <View key={b.id} style={ss.card}>
                  {/* Ticket-style header */}
                  <LinearGradient colors={["#4338CA","#6366F1"]} start={{x:0,y:0}} end={{x:1,y:1}} style={ss.cardTicketHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={ss.cardRouteName}>{b.routeName ?? "—"}</Text>
                      <Text style={ss.cardRouteFromTo}>{b.routeFrom} → {b.routeTo}</Text>
                    </View>
                    {b.vanCode ? (
                      <View style={ss.vanCodeBadge}>
                        <Text style={ss.vanCodeText}>{b.vanCode}</Text>
                      </View>
                    ) : null}
                  </LinearGradient>

                  <View style={ss.cardBody}>
                    <View style={ss.cardMeta}>
                      <View style={[ss.statusBadge, { backgroundColor: statusInfo.bg }]}>
                        <Ionicons name={statusInfo.icon} size={14} color={statusInfo.color} />
                        <Text style={[ss.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                      </View>
                      <Text style={ss.cardDate}>{b.travelDate}</Text>
                    </View>

                    <View style={ss.detailRow}>
                      <View style={ss.detailItem}><Ionicons name="time-outline" size={14} color={C.textMuted} /><Text style={ss.detailText}>{b.departureTime ?? "—"}</Text></View>
                      <View style={ss.detailItem}><Ionicons name={b.paymentMethod === "wallet" ? "wallet-outline" : "cash-outline"} size={14} color={C.textMuted} /><Text style={ss.detailText}>Rs {parseFloat(b.fare).toFixed(0)}</Text></View>
                    </View>

                    {/* Seat tier badges */}
                    <View style={ss.seatBadgesRow}>
                      {(Array.isArray(b.seatNumbers) ? b.seatNumbers as number[] : []).map(s => {
                        const tier = (b.seatTiers?.[String(s)] || "aisle") as SeatTier;
                        const tc = TIER_COLORS[tier];
                        return (
                          <View key={s} style={[ss.seatBadge, { backgroundColor: tc.bg, borderColor: tc.border }]}>
                            <Text style={[ss.seatBadgeText, { color: tc.border }]}>Seat {s}</Text>
                            <Text style={[ss.seatTierLabel, { color: tc.border }]}>{tc.label}</Text>
                          </View>
                        );
                      })}
                    </View>

                    {/* Tier breakdown */}
                    {b.tierBreakdown && Object.keys(b.tierBreakdown).length > 0 && (
                      <View style={ss.tierBreakdownWrap}>
                        {Object.entries(b.tierBreakdown).map(([tier, info]) => (
                          <Text key={tier} style={ss.tierBreakdownSmall}>
                            {TIER_COLORS[tier as SeatTier]?.label ?? tier} × {(info as {count: number; fare: number}).count} = Rs {((info as {count: number; fare: number}).count * (info as {count: number; fare: number}).fare).toFixed(0)}
                          </Text>
                        ))}
                      </View>
                    )}

                    {/* Live tracking button */}
                    {isActive && isInProgress && (
                      <TouchableOpacity activeOpacity={0.7} style={ss.trackBtn}
                        onPress={() => router.push({ pathname: "/van/tracking", params: { scheduleId: b.scheduleId, date: b.travelDate } })}>
                        <Ionicons name="navigate-outline" size={16} color="#6366F1" />
                        <Text style={ss.trackBtnText}>Track Van Live</Text>
                      </TouchableOpacity>
                    )}

                    {canCancel && (
                      <TouchableOpacity activeOpacity={0.7}
                        style={[ss.cancelBtn, cancelling === b.id && ss.cancelBtnDisabled]}
                        onPress={() => cancelBooking(b.id)}
                        disabled={cancelling === b.id}
                      >
                        {cancelling === b.id ? <ActivityIndicator color="#DC2626" size="small" /> : (
                          <><Ionicons name="close-circle-outline" size={16} color="#DC2626" /><Text style={ss.cancelBtnText}>Cancel Booking</Text></>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 16, paddingBottom: 18 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: Font.bold, fontSize: 20, color: "#fff", flex: 1, marginLeft: 12 },
  content: { padding: 16, paddingBottom: 40 },
  emptyContent: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: Font.semiBold, fontSize: 17, color: C.text, marginTop: 12 },
  emptyDesc: { fontFamily: Font.regular, fontSize: 14, color: C.textSecondary, textAlign: "center", marginTop: 6 },
  card: { borderRadius: 16, overflow: "hidden", marginBottom: 12, ...Platform.select({ web: { boxShadow: `0 3px 10px ${C.shadow}` }, default: { shadowColor: C.text, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 } }) },
  cardTicketHeader: { padding: 14, paddingBottom: 12, flexDirection: "row", alignItems: "center" },
  cardRouteName: { fontFamily: Font.bold, fontSize: 16, color: "#fff" },
  cardRouteFromTo: { fontFamily: Font.regular, fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  vanCodeBadge: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  vanCodeText: { fontFamily: Font.bold, fontSize: 13, color: "#E0E7FF" },
  cardBody: { backgroundColor: C.surface, padding: 14 },
  cardMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontFamily: Font.semiBold, fontSize: 12 },
  cardDate: { fontFamily: Font.semiBold, fontSize: 13, color: C.textMuted },
  detailRow: { flexDirection: "row", gap: 16, flexWrap: "wrap", marginBottom: 10 },
  detailItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailText: { fontFamily: Font.regular, fontSize: 13, color: C.text },
  seatBadgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  seatBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  seatBadgeText: { fontFamily: Font.bold, fontSize: 12 },
  seatTierLabel: { fontFamily: Font.regular, fontSize: 10 },
  tierBreakdownWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  tierBreakdownSmall: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted },
  trackBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: C.indigoBorder, backgroundColor: C.indigoSoft },
  trackBtnText: { fontFamily: Font.semiBold, fontSize: 14, color: C.indigo },
  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: C.redBorder, backgroundColor: C.redSoft },
  cancelBtnDisabled: { opacity: 0.6 },
  cancelBtnText: { fontFamily: Font.semiBold, fontSize: 14, color: C.red },
  btnPrimary: { backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, alignItems: "center" },
  btnPrimaryText: { fontFamily: Font.bold, fontSize: 15, color: "#fff" },
});
}
