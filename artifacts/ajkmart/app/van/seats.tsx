import React, { useState, useEffect, useMemo } from "react";
import {
  ActivityIndicator, TouchableOpacity, ScrollView, StyleSheet,
  Text, TextInput, View, Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

type SeatTier = "window" | "aisle" | "economy";

const TIER_COLORS: Record<SeatTier, { bg: string; border: string; textColor: string; label: string }> = {
  window:  { bg: "#FFFBEB", border: "#F59E0B", textColor: "#B45309", label: "Window" },
  aisle:   { bg: "#EFF6FF", border: "#3B82F6", textColor: "#1D4ED8", label: "Aisle" },
  economy: { bg: "#F0FDF4", border: "#22C55E", textColor: "#15803D", label: "Economy" },
};

interface AvailabilityData {
  bookedSeats: number[]; totalSeats: number; seatsPerRow: number; available: boolean; reason?: string;
  seatTiers: Record<string, SeatTier>;
  fareWindow: number; fareAisle: number; fareEconomy: number; farePerSeat: number;
  vanCode?: string | null; tripStatus?: string;
}

type LocalStep = "seats" | "confirm";

export default function VanSeatsScreen() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 12);
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const params = useLocalSearchParams<{
    routeId: string; scheduleId: string; travelDate: string;
    routeName: string; fromAddress: string; toAddress: string;
    departureTime: string; vanCode?: string;
  }>();

  const { routeId, scheduleId, travelDate, routeName, fromAddress, toAddress, departureTime, vanCode } = params;

  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [step, setStep] = useState<LocalStep>("seats");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "wallet">("cash");
  const [passengerName, setPassengerName] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);

  useEffect(() => {
    if (!scheduleId || !travelDate) return;
    setLoading(true);
    fetch(`${API_BASE}/van/schedules/${scheduleId}/availability?date=${travelDate}`)
      .then(r => r.json())
      .then(j => setAvailability(j.data ?? null))
      .catch(() => showToast("Could not check seat availability.", "error"))
      .finally(() => setLoading(false));
  }, [scheduleId, travelDate]);

  function toggleSeat(num: number) {
    if (availability?.bookedSeats.includes(num)) return;
    setSelectedSeats(prev =>
      prev.includes(num) ? prev.filter(s => s !== num) : [...prev, num].sort((a, b) => a - b)
    );
  }

  function getSeatFare(seatNum: number): number {
    if (!availability) return 0;
    const tier = availability.seatTiers[String(seatNum)] || "aisle";
    if (tier === "window") return availability.fareWindow;
    if (tier === "economy") return availability.fareEconomy;
    return availability.fareAisle;
  }

  function getSelectedTotal(): number {
    return selectedSeats.reduce((sum, s) => sum + getSeatFare(s), 0);
  }

  function getTierBreakdown(): { tier: SeatTier; count: number; fare: number }[] {
    if (!availability) return [];
    const map: Record<string, { count: number; fare: number }> = {};
    for (const s of selectedSeats) {
      const tier = availability.seatTiers[String(s)] || "aisle";
      const fare = getSeatFare(s);
      if (!map[tier]) map[tier] = { count: 0, fare };
      map[tier]!.count++;
    }
    return Object.entries(map).map(([tier, v]) => ({ tier: tier as SeatTier, ...v }));
  }

  async function bookSeats() {
    if (selectedSeats.length === 0) { showToast("Please select at least one seat.", "error"); return; }
    if (!user) { showToast("Please log in to book.", "error"); router.push("/auth"); return; }
    setBookingLoading(true);
    try {
      const res = await fetch(`${API_BASE}/van/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": token || "" },
        body: JSON.stringify({
          scheduleId,
          travelDate,
          seatNumbers: selectedSeats,
          paymentMethod,
          ...(passengerName ? { passengerName } : {}),
          ...(passengerPhone ? { passengerPhone } : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok) { showToast(j.error || "Booking failed.", "error"); return; }
      showToast("Van seat(s) booked successfully!", "success");
      router.replace("/van/bookings");
    } catch {
      showToast("Booking failed. Please try again.", "error");
    } finally {
      setBookingLoading(false);
    }
  }

  function renderHeader(title: string, sub?: string) {
    return (
      <LinearGradient colors={["#4338CA","#6366F1","#818CF8"]} start={{ x:0, y:0 }} end={{ x:1, y:1 }}
        style={[s.headerGradient, { paddingTop: topPad + 14 }]}>
        <View style={s.headerRow}>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => step === "confirm" ? setStep("seats") : router.back()}
            style={s.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.headerTitle}>{title}</Text>
            {sub ? <Text style={s.headerSub}>{sub}</Text> : null}
          </View>
        </View>
      </LinearGradient>
    );
  }

  if (loading) {
    return (
      <View style={[s.root, s.center]}>
        {renderHeader("Select Seats")}
        <View style={s.center}><ActivityIndicator color={C.primary} size="large" /></View>
      </View>
    );
  }

  if (!availability) {
    return (
      <View style={s.root}>
        {renderHeader("Select Seats")}
        <View style={s.empty}>
          <Ionicons name="cloud-offline-outline" size={40} color={C.textMuted} />
          <Text style={s.emptyTitle}>Could Not Load Seats</Text>
          <Text style={s.emptyDesc}>Please go back and try again.</Text>
          <TouchableOpacity activeOpacity={0.7} style={[s.btnPrimary, { marginTop: 16 }]} onPress={() => router.back()}>
            <Text style={s.btnPrimaryText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === "confirm") {
    const fareTotal = getSelectedTotal();
    return (
      <View style={s.root}>
        {renderHeader("Confirm Booking")}
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.ticketCard}>
            <LinearGradient colors={["#4338CA","#6366F1"]} start={{x:0,y:0}} end={{x:1,y:1}} style={s.ticketHeader}>
              <Ionicons name="bus" size={24} color="#fff" />
              <Text style={s.ticketTitle}>{routeName}</Text>
              {(availability.vanCode || vanCode) ? (
                <Text style={s.ticketVanCode}>{availability.vanCode || vanCode}</Text>
              ) : null}
            </LinearGradient>
            <View style={s.ticketBody}>
              {[
                ["From", fromAddress],
                ["To", toAddress],
                ["Departure", departureTime],
                [T("date"), travelDate],
                ["Seats", selectedSeats.join(", ")],
              ].map(([label, value]) => (
                <View key={label} style={s.confirmRow}>
                  <Text style={s.confirmLabel}>{label}</Text>
                  <Text style={s.confirmValue}>{value}</Text>
                </View>
              ))}
              {getTierBreakdown().map(tb => (
                <View key={tb.tier} style={s.confirmRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={[s.tierDot, { backgroundColor: TIER_COLORS[tb.tier].border }]} />
                    <Text style={s.confirmLabel}>{TIER_COLORS[tb.tier].label} × {tb.count}</Text>
                  </View>
                  <Text style={s.confirmValue}>Rs {(tb.count * tb.fare).toFixed(0)}</Text>
                </View>
              ))}
              <View style={[s.confirmRow, s.confirmTotal]}>
                <Text style={s.confirmTotalLabel}>Total</Text>
                <Text style={s.confirmTotalValue}>Rs {fareTotal.toFixed(0)}</Text>
              </View>
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={s.sectionLabel}>Passenger Details (Optional)</Text>
            <View style={s.inputRow}>
              <Ionicons name="person-outline" size={18} color={C.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={{ flex: 1, fontFamily: Font.regular, fontSize: 14, color: "#111827" }}
                value={passengerName}
                onChangeText={setPassengerName}
                placeholder="Passenger name"
                maxLength={80}
              />
            </View>
            <View style={s.inputRow}>
              <Ionicons name="call-outline" size={18} color={C.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={{ flex: 1, fontFamily: Font.regular, fontSize: 14, color: "#111827" }}
                value={passengerPhone}
                onChangeText={setPassengerPhone}
                placeholder="Phone number"
                keyboardType="phone-pad"
                maxLength={20}
              />
            </View>
          </View>

          <Text style={[s.sectionLabel, { paddingHorizontal: 0, marginBottom: 10 }]}>Payment Method</Text>
          <View style={s.payRow}>
            {(["cash","wallet"] as const).map(pm => (
              <TouchableOpacity activeOpacity={0.7} key={pm}
                style={[s.payBtn, paymentMethod === pm && s.payBtnSelected]}
                onPress={() => setPaymentMethod(pm)}>
                <Ionicons name={pm === "cash" ? "cash-outline" : "wallet-outline"} size={18}
                  color={paymentMethod === pm ? "#fff" : C.textMuted} />
                <Text style={[s.payBtnText, paymentMethod === pm && { color: "#fff" }]}>
                  {pm === "cash" ? T("paymentCashLabel") : T("paymentWallet")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity activeOpacity={0.7}
            style={[s.btnPrimary, { marginTop: 20 }, bookingLoading && s.btnDisabled]}
            onPress={bookSeats} disabled={bookingLoading}>
            {bookingLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnPrimaryText}>Confirm Booking</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  const totalSeats = availability.totalSeats;
  const seatsPerRow = availability.seatsPerRow ?? 4;
  const gap = seatsPerRow >= 5 ? 6 : 10;
  const seatSize = seatsPerRow <= 3 ? 68 : seatsPerRow === 5 ? 48 : 56;
  const rows: number[][] = [];
  const allSeats = Array.from({ length: totalSeats }, (_, i) => i + 1);
  for (let i = 0; i < allSeats.length; i += seatsPerRow) {
    rows.push(allSeats.slice(i, i + seatsPerRow));
  }

  return (
    <View style={s.root}>
      {renderHeader("Select Seats", `${fromAddress} → ${toAddress}`)}
      <ScrollView contentContainerStyle={s.content}>
        {!availability.available && availability.reason === "not_running_this_day" ? (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={36} color={C.textMuted} />
            <Text style={s.emptyTitle}>Not Running This Day</Text>
            <Text style={s.emptyDesc}>This van does not operate on the selected date. Please go back and choose a different date.</Text>
            <TouchableOpacity activeOpacity={0.7} style={[s.btnPrimary, { marginTop: 16 }]} onPress={() => router.back()}>
              <Text style={s.btnPrimaryText}>Change Date</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={s.tierLegend}>
              {(["window", "aisle", "economy"] as SeatTier[]).map(tier => {
                const t = TIER_COLORS[tier];
                const fare = tier === "window" ? availability.fareWindow : tier === "aisle" ? availability.fareAisle : availability.fareEconomy;
                return (
                  <View key={tier} style={[s.tierLegendItem, { backgroundColor: t.bg, borderColor: t.border }]}>
                    <Text style={[s.tierLegendLabel, { color: t.textColor }]}>{t.label}</Text>
                    <Text style={[s.tierLegendFare, { color: t.textColor }]}>Rs {fare.toFixed(0)}</Text>
                  </View>
                );
              })}
            </View>

            <View style={s.seatLegend}>
              {[
                { color: "#F5F5F5", border: "#D1D5DB", label: "Available" },
                { color: "#6366F1", border: "#6366F1", label: "Selected" },
                { color: "#FEE2E2", border: "#FCA5A5", label: "Booked" },
              ].map(l => (
                <View key={l.label} style={s.legendItem}>
                  <View style={[s.legendBox, { backgroundColor: l.color, borderColor: l.border }]} />
                  <Text style={s.legendLabel}>{l.label}</Text>
                </View>
              ))}
            </View>

            <View style={s.driverRow}>
              <View style={s.driverSeat}>
                <Ionicons name="person" size={16} color="#6B7280" />
                <Text style={s.driverLabel}>Driver</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Ionicons name="bus-outline" size={20} color="#9CA3AF" />
            </View>

            <View style={{ gap, marginBottom: 8 }}>
              {rows.map((row, rowIdx) => (
                <View key={rowIdx} style={{ flexDirection: "row", gap, justifyContent: "center" }}>
                  {row.map(num => {
                    const booked = availability.bookedSeats.includes(num);
                    const sel = selectedSeats.includes(num);
                    const tier = (availability.seatTiers[String(num)] || "aisle") as SeatTier;
                    const tc = TIER_COLORS[tier];
                    return (
                      <TouchableOpacity activeOpacity={0.7} key={num}
                        style={[
                          s.seat, { width: seatSize, height: seatSize },
                          booked
                            ? s.seatBooked
                            : sel
                            ? { backgroundColor: "#6366F1", borderColor: "#4F46E5", borderWidth: 2 }
                            : { backgroundColor: "#F9FAFB", borderColor: tc.border, borderWidth: 2 },
                        ]}
                        onPress={() => toggleSeat(num)} disabled={booked}>
                        <Text style={[s.seatNum, { color: booked ? "#EF4444" : sel ? "#fff" : tc.textColor }]}>{num}</Text>
                        {!booked && !sel && <View style={[s.tierDot, { backgroundColor: tc.border }]} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            {selectedSeats.length > 0 && (
              <View style={s.seatSummary}>
                <Text style={s.seatSummaryText}>
                  {selectedSeats.length} seat{selectedSeats.length > 1 ? "s" : ""} selected
                </Text>
                {getTierBreakdown().map(tb => (
                  <View key={tb.tier} style={s.tierBreakdownRow}>
                    <View style={[s.tierDot, { backgroundColor: TIER_COLORS[tb.tier].border }]} />
                    <Text style={s.tierBreakdownText}>{TIER_COLORS[tb.tier].label} × {tb.count}</Text>
                    <Text style={s.tierBreakdownFare}>Rs {(tb.count * tb.fare).toFixed(0)}</Text>
                  </View>
                ))}
                <View style={[s.tierBreakdownRow, { borderTopWidth: 1, borderTopColor: "#C7D2FE", paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[s.tierBreakdownText, { fontFamily: Font.bold, color: "#4338CA" }]}>Total</Text>
                  <Text style={[s.tierBreakdownFare, { fontFamily: Font.bold, fontSize: 16, color: "#4338CA" }]}>
                    Rs {getSelectedTotal().toFixed(0)}
                  </Text>
                </View>
                <TouchableOpacity activeOpacity={0.7} style={[s.btnPrimary, { marginTop: 12 }]} onPress={() => setStep("confirm")}>
                  <Text style={s.btnPrimaryText}>Continue to Confirm</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  headerGradient: { paddingHorizontal: 16, paddingBottom: 18 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: Font.bold, fontSize: 20, color: "#fff" },
  headerSub: { fontFamily: Font.regular, fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", padding: 32 },
  emptyTitle: { fontFamily: Font.semiBold, fontSize: 17, color: C.text, marginTop: 12 },
  emptyDesc: { fontFamily: Font.regular, fontSize: 14, color: C.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 20 },
  sectionLabel: { fontFamily: Font.semiBold, fontSize: 13, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  tierLegend: { flexDirection: "row", gap: 8, marginBottom: 12, justifyContent: "center" },
  tierLegendItem: { flex: 1, alignItems: "center", paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, borderWidth: 1.5 },
  tierLegendLabel: { fontFamily: Font.semiBold, fontSize: 11, marginBottom: 2 },
  tierLegendFare: { fontFamily: Font.bold, fontSize: 14 },
  seatLegend: { flexDirection: "row", gap: 16, marginBottom: 16, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendBox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5 },
  legendLabel: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
  driverRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, paddingHorizontal: 4 },
  driverSeat: { width: 56, height: 40, backgroundColor: C.surfaceSecondary, borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 2 },
  driverLabel: { fontFamily: Font.semiBold, fontSize: 10, color: C.textMuted },
  seat: { borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 2 },
  seatBooked: { backgroundColor: C.redSoft, borderColor: C.redBorder, borderWidth: 2 },
  seatNum: { fontFamily: Font.bold, fontSize: 13 },
  tierDot: { width: 6, height: 6, borderRadius: 3 },
  seatSummary: { backgroundColor: C.primarySoft, borderRadius: 14, padding: 14, marginTop: 8 },
  seatSummaryText: { fontFamily: Font.semiBold, fontSize: 14, color: C.primary, marginBottom: 8, textAlign: "center" },
  tierBreakdownRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3, gap: 6 },
  tierBreakdownText: { fontFamily: Font.regular, fontSize: 13, color: C.text, flex: 1 },
  tierBreakdownFare: { fontFamily: Font.semiBold, fontSize: 13, color: C.text },
  btnPrimary: { backgroundColor: C.primary, borderRadius: 14, padding: 16, alignItems: "center" },
  btnPrimaryText: { fontFamily: Font.bold, fontSize: 16, color: "#fff" },
  btnDisabled: { opacity: 0.6 },
  ticketCard: { borderRadius: 16, overflow: "hidden", marginBottom: 16, ...Platform.select({ web: { boxShadow: `0 4px 12px ${C.shadow}` }, default: { shadowColor: C.text, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 } }) },
  ticketHeader: { padding: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  ticketTitle: { fontFamily: Font.bold, fontSize: 18, color: "#fff", flex: 1 },
  ticketVanCode: { fontFamily: Font.bold, fontSize: 14, color: "#E0E7FF", backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  ticketBody: { backgroundColor: C.surface, padding: 16 },
  confirmRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  confirmLabel: { fontFamily: Font.regular, fontSize: 13, color: C.textMuted },
  confirmValue: { fontFamily: Font.semiBold, fontSize: 13, color: C.text, maxWidth: "60%", textAlign: "right" },
  confirmTotal: { borderBottomWidth: 0, paddingTop: 12, marginTop: 4 },
  confirmTotalLabel: { fontFamily: Font.bold, fontSize: 15, color: C.text },
  confirmTotalValue: { fontFamily: Font.bold, fontSize: 18, color: C.success },
  inputGroup: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16, gap: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceSecondary, borderRadius: 10, padding: 12 },
  payRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
  payBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.surfaceSecondary, borderRadius: 12, padding: 14, borderWidth: 2, borderColor: C.border },
  payBtnSelected: { backgroundColor: C.primary, borderColor: C.primary },
  payBtnText: { fontFamily: Font.semiBold, fontSize: 14, color: C.textMuted },
});
}
