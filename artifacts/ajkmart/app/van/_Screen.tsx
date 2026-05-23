import React, { useState, useEffect, useMemo } from "react";
import {
  ActivityIndicator, Alert, TouchableOpacity, ScrollView, StyleSheet,
  Text, TextInput, View, Platform,
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
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { useTheme } from "@/context/ThemeContext";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

type SeatTier = "window" | "aisle" | "economy";

const TIER_COLORS: Record<SeatTier, { bg: string; border: string; textColor: string; label: string }> = {
  window:  { bg: "#FFFBEB", border: "#F59E0B", textColor: "#B45309", label: "Window" },
  aisle:   { bg: "#EFF6FF", border: "#3B82F6", textColor: "#1D4ED8", label: "Aisle" },
  economy: { bg: "#F0FDF4", border: "#22C55E", textColor: "#15803D", label: "Economy" },
};

interface VanRoute {
  id: string; name: string; nameUrdu?: string; fromAddress: string; toAddress: string;
  farePerSeat: string; fareWindow?: string | null; fareAisle?: string | null; fareEconomy?: string | null;
  distanceKm?: string; durationMin?: number; notes?: string;
}
interface VanSchedule {
  id: string; departureTime: string; returnTime?: string; daysOfWeek: number[];
  totalSeats?: number; vehiclePlate?: string; vehicleModel?: string; vanCode?: string | null;
  seatLayout?: unknown;
}
interface RouteDetail extends VanRoute { schedules: VanSchedule[]; }

interface AvailabilityData {
  bookedSeats: number[]; totalSeats: number; seatsPerRow: number; available: boolean; reason?: string;
  seatTiers: Record<string, SeatTier>;
  fareWindow: number; fareAisle: number; fareEconomy: number; farePerSeat: number;
  vanCode?: string | null; tripStatus?: string;
}

type Step = "routes" | "schedules" | "date" | "seats" | "confirm";

export default function VanServiceScreen() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const { colors: C } = useTheme();
  const ss = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { goBack: smartGoBack } = useSmartBack();
  const topPad = Math.max(insets.top, 12);
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const { language } = useLanguage();
  const T = (key: any) => tDual(key, language);

  const [step, setStep] = useState<Step>("routes");
  const [loading, setLoading] = useState(false);

  const [routes, setRoutes] = useState<VanRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteDetail | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<VanSchedule | null>(null);
  const [travelDate, setTravelDate] = useState<string>(() => new Date().toISOString().split("T")[0]!);
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "wallet">("cash");
  const [passengerName, setPassengerName] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/van/routes`)
      .then(r => r.json())
      .then(j => setRoutes(j.data ?? []))
      .catch(() => showToast("Could not load routes. Please try again.", "error"))
      .finally(() => setLoading(false));
  }, []);

  async function selectRoute(r: VanRoute) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/van/routes/${r.id}`);
      const j = await res.json();
      setSelectedRoute(j.data ?? null);
      setSelectedSchedule(null);
      setAvailability(null);
      setSelectedSeats([]);
      setStep("schedules");
    } catch {
      showToast("Could not load schedules.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function checkAvailability(scheduleId: string, date: string) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/van/schedules/${scheduleId}/availability?date=${date}`);
      const j = await res.json();
      setAvailability(j.data ?? null);
      setSelectedSeats([]);
      setStep("seats");
    } catch {
      showToast("Could not check seat availability.", "error");
    } finally {
      setLoading(false);
    }
  }

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
    if (!selectedSchedule || !selectedRoute) return;
    if (selectedSeats.length === 0) { showToast("Please select at least one seat.", "error"); return; }
    if (!user) { showToast("Please log in to book.", "error"); router.push("/auth"); return; }
    setBookingLoading(true);
    try {
      const res = await fetch(`${API_BASE}/van/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": token || "" },
        body: JSON.stringify({
          scheduleId: selectedSchedule.id,
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

  function goBack() {
    if (step === "schedules") { setStep("routes"); setSelectedRoute(null); }
    else if (step === "date") { setStep("schedules"); }
    else if (step === "seats") { setStep("date"); setAvailability(null); setSelectedSeats([]); }
    else if (step === "confirm") { setStep("seats"); }
    else smartGoBack();
  }

  function renderHeader(title: string, sub?: string) {
    return (
      <LinearGradient colors={["#4338CA","#6366F1","#818CF8"]} start={{ x:0, y:0 }} end={{ x:1, y:1 }}
        style={[ss.headerGradient, { paddingTop: topPad + 14 }]}>
        <View style={ss.headerRow}>
          <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={ss.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={ss.headerTitle}>{title}</Text>
            {sub ? <Text style={ss.headerSub}>{sub}</Text> : null}
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/van/bookings")} hitSlop={12}>
            <Ionicons name="calendar-outline" size={22} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  /* ═══ ROUTES ═══ */
  if (step === "routes") {
    const showTieredFare = routes.some(r => r.fareWindow || r.fareAisle || r.fareEconomy);
    return (
      <View style={ss.root}>
        {renderHeader(T("navVanService"), "Fixed-route commuter vans")}
        {loading ? <View style={ss.center}><ActivityIndicator color={C.primary} size="large" /></View> : (
          <ScrollView contentContainerStyle={ss.content}>
            {routes.length === 0 ? (
              <View style={ss.empty}>
                <Ionicons name="bus-outline" size={48} color={C.textMuted} />
                <Text style={ss.emptyTitle}>No Routes Available</Text>
                <Text style={ss.emptyDesc}>Van service routes will appear here.</Text>
              </View>
            ) : routes.map(r => {
              const hasWindow = r.fareWindow && parseFloat(r.fareWindow) > 0;
              const fareMin = Math.min(
                hasWindow ? parseFloat(r.fareWindow!) : parseFloat(r.farePerSeat),
                r.fareAisle ? parseFloat(r.fareAisle) : parseFloat(r.farePerSeat),
                r.fareEconomy ? parseFloat(r.fareEconomy) : parseFloat(r.farePerSeat),
              );
              const fareMax = Math.max(
                hasWindow ? parseFloat(r.fareWindow!) : parseFloat(r.farePerSeat),
                r.fareAisle ? parseFloat(r.fareAisle) : parseFloat(r.farePerSeat),
                r.fareEconomy ? parseFloat(r.fareEconomy) : parseFloat(r.farePerSeat),
              );
              return (
                <TouchableOpacity activeOpacity={0.7} key={r.id} style={ss.routeCard} onPress={() => selectRoute(r)}>
                  <View style={ss.routeIcon}>
                    <Ionicons name="bus" size={22} color="#6366F1" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ss.routeName}>{r.name}</Text>
                    <Text style={ss.routeFromTo}>{r.fromAddress} → {r.toAddress}</Text>
                    {r.distanceKm ? <Text style={ss.routeMeta}>{r.distanceKm} km{r.durationMin ? ` · ${r.durationMin} min` : ""}</Text> : null}
                  </View>
                  <View style={ss.routeFareCol}>
                    {fareMin !== fareMax ? (
                      <>
                        <Text style={ss.routeFare}>Rs {fareMin.toFixed(0)}–{fareMax.toFixed(0)}</Text>
                        <Text style={ss.routeFareLabel}>per seat</Text>
                      </>
                    ) : (
                      <>
                        <Text style={ss.routeFare}>Rs {parseFloat(r.farePerSeat).toFixed(0)}</Text>
                        <Text style={ss.routeFareLabel}>per seat</Text>
                      </>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  /* ═══ SCHEDULES ═══ */
  if (step === "schedules" && selectedRoute) return (
    <View style={ss.root}>
      {renderHeader(selectedRoute.name, `${selectedRoute.fromAddress} → ${selectedRoute.toAddress}`)}
      <ScrollView contentContainerStyle={ss.content}>
        <Text style={ss.sectionLabel}>Select Departure Time</Text>
        {selectedRoute.schedules.length === 0 ? (
          <View style={ss.empty}><Text style={ss.emptyDesc}>No active schedules for this route.</Text></View>
        ) : selectedRoute.schedules.map(s => (
          <TouchableOpacity activeOpacity={0.7} key={s.id} style={[ss.scheduleCard, selectedSchedule?.id === s.id && ss.scheduleCardSelected]}
            onPress={() => { setSelectedSchedule(s); setStep("date"); }}>
            <View style={ss.scheduleRow}>
              <Ionicons name="time-outline" size={20} color="#6366F1" />
              <Text style={ss.scheduleTime}>{s.departureTime}</Text>
              {s.returnTime ? <><Text style={ss.scheduleSep}>·</Text><Ionicons name="return-down-back-outline" size={16} color={C.textMuted} /><Text style={ss.scheduleReturnTime}>{s.returnTime}</Text></> : null}
            </View>
            {s.vanCode ? (
              <View style={ss.vanCodeBadge}>
                <Ionicons name="id-card-outline" size={14} color="#6366F1" />
                <Text style={ss.vanCodeText}>{s.vanCode}</Text>
              </View>
            ) : null}
            <View style={ss.daysRow}>
              {(Array.isArray(s.daysOfWeek) ? s.daysOfWeek as number[] : []).map(d => {
                const today = new Date().getDay();
                const isToday = today === (d === 7 ? 0 : d);
                return <View key={d} style={[ss.dayBadge, isToday && ss.dayBadgeActive]}><Text style={[ss.dayBadgeText, isToday && ss.dayBadgeTextActive]}>{DAY_NAMES[d === 7 ? 0 : d]}</Text></View>;
              })}
            </View>
            {s.vehiclePlate ? <Text style={ss.vehicleText}>{s.vehicleModel || T("vanVehicle")} · {s.vehiclePlate} · {s.totalSeats ?? "?"} seats</Text> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  /* ═══ DATE ═══ */
  if (step === "date" && selectedSchedule) return (
    <View style={ss.root}>
      {renderHeader("Select Travel Date")}
      <ScrollView contentContainerStyle={ss.content}>
        <Text style={ss.sectionLabel}>Choose your travel date</Text>
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() + i);
          const iso = d.toISOString().split("T")[0]!;
          const label = i === 0 ? T("today") : i === 1 ? "Tomorrow" : `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${d.toLocaleString("default",{month:"short"})}`;
          const dow = d.getDay() === 0 ? 7 : d.getDay();
          const running = (Array.isArray(selectedSchedule.daysOfWeek) ? selectedSchedule.daysOfWeek as number[] : []).includes(dow);
          return (
            <TouchableOpacity activeOpacity={0.7} key={iso} style={[ss.datePill, travelDate === iso && ss.datePillSelected, !running && ss.datePillDisabled]}
              onPress={() => { if (!running) return; setTravelDate(iso); }}>
              <Text style={[ss.datePillText, travelDate === iso && ss.datePillTextSelected, !running && ss.datePillTextDisabled]}>{label}</Text>
              {!running && <Text style={ss.notRunning}>Not running</Text>}
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 12 }} />
        <View style={ss.inputRow}>
          <Ionicons name="calendar-outline" size={20} color={C.textMuted} style={{ marginRight: 10 }} />
          <TextInput
            style={[ss.dateInput, { flex: 1 }]}
            value={travelDate}
            onChangeText={v => { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setTravelDate(v); else setTravelDate(v); }}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
        </View>
        <TouchableOpacity activeOpacity={0.7} style={[ss.btnPrimary, loading && ss.btnDisabled]}
          onPress={() => {
            if (!selectedRoute || !selectedSchedule) return;
            router.push({
              pathname: "/van/seats",
              params: {
                routeId: selectedRoute.id,
                scheduleId: selectedSchedule.id,
                travelDate,
                routeName: selectedRoute.name,
                fromAddress: selectedRoute.fromAddress,
                toAddress: selectedRoute.toAddress,
                departureTime: selectedSchedule.departureTime,
                vanCode: selectedSchedule.vanCode ?? "",
              },
            });
          }} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={ss.btnPrimaryText}>Check Availability</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  /* ═══ SEATS ═══ */
  if (step === "seats" && selectedSchedule && selectedRoute && availability) {
    const totalSeats = availability.totalSeats;
    const seatsPerRow = availability.seatsPerRow ?? 4;
    const gap = seatsPerRow >= 5 ? 6 : 10;
    const seatSize = seatsPerRow <= 3 ? 68 : seatsPerRow === 5 ? 48 : 56;
    const rows: number[][] = [];
    const allSeats = Array.from({ length: totalSeats }, (_, i) => i + 1);
    for (let i = 0; i < allSeats.length; i += seatsPerRow) {
      rows.push(allSeats.slice(i, i + seatsPerRow));
    }
    const isLastRow = (seatNum: number) => seatNum > totalSeats - seatsPerRow;

    return (
      <View style={ss.root}>
        {renderHeader("Select Seats")}
        <ScrollView contentContainerStyle={ss.content}>
          {!availability.available && availability.reason === "not_running_this_day" ? (
            <View style={ss.empty}>
              <Ionicons name="calendar-outline" size={36} color={C.textMuted} />
              <Text style={ss.emptyTitle}>Not Running This Day</Text>
              <Text style={ss.emptyDesc}>This van does not operate on the selected date. Please choose a different date.</Text>
              <TouchableOpacity activeOpacity={0.7} style={[ss.btnPrimary, { marginTop: 16 }]} onPress={() => setStep("date")}><Text style={ss.btnPrimaryText}>Change Date</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Tier pricing legend */}
              <View style={ss.tierLegend}>
                {(["window", "aisle", "economy"] as SeatTier[]).map(tier => {
                  const t = TIER_COLORS[tier];
                  const fare = tier === "window" ? availability.fareWindow : tier === "aisle" ? availability.fareAisle : availability.fareEconomy;
                  return (
                    <View key={tier} style={[ss.tierLegendItem, { backgroundColor: t.bg, borderColor: t.border }]}>
                      <Text style={[ss.tierLegendLabel, { color: t.textColor }]}>{t.label}</Text>
                      <Text style={[ss.tierLegendFare, { color: t.textColor }]}>Rs {fare.toFixed(0)}</Text>
                    </View>
                  );
                })}
              </View>

              <View style={ss.seatLegend}>
                {[{color:"#F5F5F5",border:"#D1D5DB",label:"Available"},{color:"#6366F1",border:"#6366F1",label:"Selected"},{color:"#FEE2E2",border:"#FCA5A5",label:"Booked"}].map(l => (
                  <View key={l.label} style={ss.legendItem}>
                    <View style={[ss.legendBox, { backgroundColor: l.color, borderColor: l.border }]} />
                    <Text style={ss.legendLabel}>{l.label}</Text>
                  </View>
                ))}
              </View>

              {/* Driver seat */}
              <View style={ss.driverRow}>
                <View style={ss.driverSeat}><Ionicons name="person" size={16} color="#6B7280" /><Text style={ss.driverLabel}>Driver</Text></View>
                <View style={{ flex: 1 }} />
                <Ionicons name="bus-outline" size={20} color="#9CA3AF" />
              </View>

              {/* Seat grid */}
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
                            ss.seat, { width: seatSize, height: seatSize },
                            booked ? ss.seatBooked :
                            sel ? { backgroundColor: "#6366F1", borderColor: "#4F46E5", borderWidth: 2 } :
                            { backgroundColor: "#F9FAFB", borderColor: tc.border, borderWidth: 2 },
                          ]}
                          onPress={() => toggleSeat(num)} disabled={booked}>
                          <Text style={[ss.seatNum, { color: booked ? "#EF4444" : sel ? "#fff" : tc.textColor }]}>{num}</Text>
                          {!booked && !sel && <View style={[ss.tierDot, { backgroundColor: tc.border }]} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>

              {selectedSeats.length > 0 ? (
                <View style={ss.seatSummary}>
                  <Text style={ss.seatSummaryText}>
                    {selectedSeats.length} seat{selectedSeats.length > 1 ? "s" : ""} selected
                  </Text>
                  {getTierBreakdown().map(tb => (
                    <View key={tb.tier} style={ss.tierBreakdownRow}>
                      <View style={[ss.tierBreakdownDot, { backgroundColor: TIER_COLORS[tb.tier].border }]} />
                      <Text style={ss.tierBreakdownText}>{TIER_COLORS[tb.tier].label} × {tb.count}</Text>
                      <Text style={ss.tierBreakdownFare}>Rs {(tb.count * tb.fare).toFixed(0)}</Text>
                    </View>
                  ))}
                  <View style={[ss.tierBreakdownRow, { borderTopWidth: 1, borderTopColor: "#C7D2FE", paddingTop: 8, marginTop: 4 }]}>
                    <Text style={[ss.tierBreakdownText, { fontFamily: Font.bold, color: "#4338CA" }]}>Total</Text>
                    <Text style={[ss.tierBreakdownFare, { fontFamily: Font.bold, fontSize: 16, color: "#4338CA" }]}>Rs {getSelectedTotal().toFixed(0)}</Text>
                  </View>
                  <TouchableOpacity activeOpacity={0.7} style={[ss.btnPrimary, { marginTop: 12 }]} onPress={() => setStep("confirm")}>
                    <Text style={ss.btnPrimaryText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  /* ═══ CONFIRM ═══ */
  if (step === "confirm" && selectedRoute && selectedSchedule && availability) {
    const fareTotal = getSelectedTotal();
    return (
      <View style={ss.root}>
        {renderHeader("Confirm Booking")}
        <ScrollView contentContainerStyle={ss.content}>
          {/* Ticket card */}
          <View style={ss.ticketCard}>
            <LinearGradient colors={["#4338CA","#6366F1"]} start={{x:0,y:0}} end={{x:1,y:1}} style={ss.ticketHeader}>
              <Ionicons name="bus" size={24} color="#fff" />
              <Text style={ss.ticketTitle}>{selectedRoute.name}</Text>
              {availability.vanCode ? <Text style={ss.ticketVanCode}>{availability.vanCode}</Text> : null}
            </LinearGradient>
            <View style={ss.ticketBody}>
              <View style={ss.confirmRow}><Text style={ss.confirmLabel}>From</Text><Text style={ss.confirmValue}>{selectedRoute.fromAddress}</Text></View>
              <View style={ss.confirmRow}><Text style={ss.confirmLabel}>To</Text><Text style={ss.confirmValue}>{selectedRoute.toAddress}</Text></View>
              <View style={ss.confirmRow}><Text style={ss.confirmLabel}>Departure</Text><Text style={ss.confirmValue}>{selectedSchedule.departureTime}</Text></View>
              <View style={ss.confirmRow}><Text style={ss.confirmLabel}>Date</Text><Text style={ss.confirmValue}>{travelDate}</Text></View>
              <View style={ss.confirmRow}><Text style={ss.confirmLabel}>Seats</Text><Text style={ss.confirmValue}>{selectedSeats.join(", ")}</Text></View>
              {getTierBreakdown().map(tb => (
                <View key={tb.tier} style={ss.confirmRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={[ss.tierBreakdownDot, { backgroundColor: TIER_COLORS[tb.tier].border }]} />
                    <Text style={ss.confirmLabel}>{TIER_COLORS[tb.tier].label} × {tb.count}</Text>
                  </View>
                  <Text style={ss.confirmValue}>Rs {(tb.count * tb.fare).toFixed(0)}</Text>
                </View>
              ))}
              <View style={[ss.confirmRow, ss.confirmTotal]}>
                <Text style={ss.confirmTotalLabel}>Total</Text>
                <Text style={ss.confirmTotalValue}>Rs {fareTotal.toFixed(0)}</Text>
              </View>
            </View>
          </View>

          <Text style={ss.sectionLabel}>Passenger Details (optional)</Text>
          <View style={ss.inputGroup}>
            <View style={ss.inputRow}>
              <Ionicons name="person-outline" size={18} color={C.textMuted} style={{ marginRight: 10 }} />
              <TextInput style={{ flex: 1, fontFamily: Font.regular, fontSize: 14, color: C.text }} placeholder="Passenger name" value={passengerName} onChangeText={setPassengerName} />
            </View>
            <View style={ss.inputRow}>
              <Ionicons name="call-outline" size={18} color={C.textMuted} style={{ marginRight: 10 }} />
              <TextInput style={{ flex: 1, fontFamily: Font.regular, fontSize: 14, color: C.text }} placeholder="Passenger phone" value={passengerPhone} onChangeText={setPassengerPhone} keyboardType="phone-pad" />
            </View>
          </View>

          <Text style={ss.sectionLabel}>Payment Method</Text>
          <View style={ss.payRow}>
            {(["cash","wallet"] as const).map(pm => (
              <TouchableOpacity activeOpacity={0.7} key={pm} style={[ss.payBtn, paymentMethod === pm && ss.payBtnSelected]} onPress={() => setPaymentMethod(pm)}>
                <Ionicons name={pm === "cash" ? "cash-outline" : "wallet-outline"} size={18} color={paymentMethod === pm ? "#fff" : C.textMuted} />
                <Text style={[ss.payBtnText, paymentMethod === pm && { color: "#fff" }]}>{pm === "cash" ? T("paymentCashLabel") : T("paymentWallet")}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity activeOpacity={0.7} style={[ss.btnPrimary, bookingLoading && ss.btnDisabled]} onPress={bookSeats} disabled={bookingLoading}>
            {bookingLoading ? <ActivityIndicator color="#fff" /> : <Text style={ss.btnPrimaryText}>Confirm Booking</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return <View style={[ss.root, ss.center]}><ActivityIndicator color={C.primary} /></View>;
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
  sectionLabel: { fontFamily: Font.semiBold, fontSize: 13, color: C.textMuted, marginBottom: 12, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  routeCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 10, ...Platform.select({ web: { boxShadow: `0 2px 8px ${C.shadow}` }, default: { shadowColor: C.text, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 } }) },
  routeIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 12 },
  routeName: { fontFamily: Font.semiBold, fontSize: 15, color: C.text },
  routeFromTo: { fontFamily: Font.regular, fontSize: 13, color: C.textSecondary, marginTop: 2 },
  routeMeta: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted, marginTop: 2 },
  routeFareCol: { alignItems: "flex-end", marginRight: 8 },
  routeFare: { fontFamily: Font.bold, fontSize: 15, color: C.success },
  routeFareLabel: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted },
  scheduleCard: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: "transparent", ...Platform.select({ web: { boxShadow: `0 2px 8px ${C.shadow}` }, default: { shadowColor: C.text, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 } }) },
  scheduleCardSelected: { borderColor: C.primary },
  scheduleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  scheduleTime: { fontFamily: Font.bold, fontSize: 20, color: C.text },
  scheduleSep: { color: C.textMuted },
  scheduleReturnTime: { fontFamily: Font.regular, fontSize: 14, color: C.textSecondary },
  vanCodeBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.primarySoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", marginTop: 8 },
  vanCodeText: { fontFamily: Font.bold, fontSize: 13, color: C.primaryDark },
  daysRow: { flexDirection: "row", gap: 6, marginTop: 10 },
  dayBadge: { backgroundColor: C.surfaceSecondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  dayBadgeActive: { backgroundColor: C.primarySoft },
  dayBadgeText: { fontFamily: Font.semiBold, fontSize: 11, color: C.textMuted },
  dayBadgeTextActive: { color: C.primary },
  vehicleText: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted, marginTop: 8 },
  datePill: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 2, borderColor: "transparent" },
  datePillSelected: { borderColor: C.primary, backgroundColor: C.primarySoft },
  datePillDisabled: { opacity: 0.5 },
  datePillText: { fontFamily: Font.semiBold, fontSize: 15, color: C.text },
  datePillTextSelected: { color: C.primaryDark },
  datePillTextDisabled: { color: C.textMuted },
  notRunning: { fontFamily: Font.regular, fontSize: 11, color: C.danger },
  inputGroup: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16, gap: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceSecondary, borderRadius: 10, padding: 12, marginBottom: 8 },
  dateInput: { fontFamily: Font.regular, fontSize: 15, color: C.text },
  btnPrimary: { backgroundColor: C.primary, borderRadius: 14, padding: 16, alignItems: "center", marginTop: 8 },
  btnPrimaryText: { fontFamily: Font.bold, fontSize: 16, color: "#fff" },
  btnDisabled: { opacity: 0.6 },
  tierLegend: { flexDirection: "row", gap: 8, marginBottom: 12, justifyContent: "center" },
  tierLegendItem: { flex: 1, alignItems: "center", paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, borderWidth: 1.5 },
  tierLegendLabel: { fontFamily: Font.semiBold, fontSize: 11, marginBottom: 2 },
  tierLegendFare: { fontFamily: Font.bold, fontSize: 14 },
  seatLegend: { flexDirection: "row", gap: 16, marginBottom: 16, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendBox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5 },
  legendLabel: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
  driverRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, paddingHorizontal: 4 },
  driverSeat: { width: 56, height: 40, backgroundColor: C.surfaceSecondary, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2 },
  driverLabel: { fontFamily: Font.semiBold, fontSize: 10, color: C.textMuted },
  seat: { borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 2 },
  seatBooked: { backgroundColor: C.redSoft, borderColor: C.redBorder, borderWidth: 2 },
  seatNum: { fontFamily: Font.bold, fontSize: 13 },
  tierDot: { width: 6, height: 6, borderRadius: 3 },
  seatSummary: { backgroundColor: C.primarySoft, borderRadius: 14, padding: 14, marginTop: 8 },
  seatSummaryText: { fontFamily: Font.semiBold, fontSize: 14, color: C.primaryDark, marginBottom: 8, textAlign: "center" },
  tierBreakdownRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3, gap: 6 },
  tierBreakdownDot: { width: 8, height: 8, borderRadius: 4 },
  tierBreakdownText: { fontFamily: Font.regular, fontSize: 13, color: C.text, flex: 1 },
  tierBreakdownFare: { fontFamily: Font.semiBold, fontSize: 13, color: C.text },
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
  payRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  payBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.surfaceSecondary, borderRadius: 12, padding: 14, borderWidth: 2, borderColor: C.border },
  payBtnSelected: { backgroundColor: C.primary, borderColor: C.primary },
  payBtnText: { fontFamily: Font.semiBold, fontSize: 14, color: C.textMuted },
});
}
