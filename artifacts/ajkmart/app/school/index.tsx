import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { Font } from "@/constants/typography";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { useAuth } from "@/context/AuthContext";
import { API_BASE } from "@/utils/api";
import { useTheme } from "@/context/ThemeContext";

interface SchoolRoute {
  id: string;
  name: string;
  pickup: string;
  school: string;
  morningTime: string;
  afternoonTime: string;
  priceMonthly: number;
  priceWeekly: number;
  availableSeats: number;
}

export default function SchoolTransportScreen() {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { goBack } = useSmartBack();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [routes, setRoutes] = useState<SchoolRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRoutes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/school/routes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const items = data?.data ?? data?.routes ?? data ?? [];
        setRoutes(Array.isArray(items) ? items : []);
      }
    } catch {
      setRoutes([]);
    }
  }, [token]);

  useEffect(() => {
    fetchRoutes().finally(() => setLoading(false));
  }, [fetchRoutes]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRoutes();
    setRefreshing(false);
  }, [fetchRoutes]);

  return (
    <ScreenContainer scroll={false}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>School Transport</Text>
          <Text style={styles.headerSub}>Safe & scheduled rides for students</Text>
        </View>
        <View style={styles.schoolBadge}>
          <Text style={{ fontSize: 20 }}>🏫</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
      >
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={styles.loadingText}>Loading routes…</Text>
          </View>
        ) : routes.length === 0 ? (
          <View style={styles.centerBox}>
            <View style={styles.emptyIcon}>
              <Ionicons name="bus-outline" size={44} color={C.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No routes available</Text>
            <Text style={styles.emptySub}>School transport routes will appear here once configured.</Text>
          </View>
        ) : (
          routes.map(route => (
            <TouchableOpacity
              key={route.id}
              activeOpacity={0.8}
              onPress={() => router.push(
                `/school/book?routeId=${encodeURIComponent(route.id)}&routeName=${encodeURIComponent(route.name ?? "")}` as unknown as Href
              )}
              style={styles.card}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardIcon}>
                  <Ionicons name="bus" size={22} color="#0EA5E9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeName}>{route.name}</Text>
                  <Text style={styles.routeSchool}>{route.school}</Text>
                </View>
                {route.availableSeats > 0 ? (
                  <View style={styles.seatsChip}>
                    <Text style={styles.seatsText}>{route.availableSeats} seats</Text>
                  </View>
                ) : (
                  <View style={[styles.seatsChip, { backgroundColor: "#FEE2E2" }]}>
                    <Text style={[styles.seatsText, { color: "#DC2626" }]}>Full</Text>
                  </View>
                )}
              </View>

              <View style={styles.divider} />

              <View style={styles.cardDetail}>
                <Ionicons name="location-outline" size={14} color={C.textMuted} />
                <Text style={styles.detailText}>{route.pickup}</Text>
              </View>
              <View style={styles.cardDetail}>
                <Ionicons name="time-outline" size={14} color={C.textMuted} />
                <Text style={styles.detailText}>Morning: {route.morningTime} · Return: {route.afternoonTime}</Text>
              </View>

              <View style={styles.priceRow}>
                <View>
                  <Text style={styles.priceLabel}>Weekly</Text>
                  <Text style={styles.priceAmt}>Rs. {Number(route.priceWeekly).toLocaleString()}</Text>
                </View>
                <View>
                  <Text style={styles.priceLabel}>Monthly</Text>
                  <Text style={styles.priceAmt}>Rs. {Number(route.priceMonthly).toLocaleString()}</Text>
                </View>
                <View style={[styles.bookBtn, route.availableSeats === 0 && { opacity: 0.5 }]}>
                  <Text style={styles.bookBtnText}>Book →</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontFamily: Font.bold, fontSize: 18, color: C.text },
  headerSub: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted, marginTop: 1 },
  schoolBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.skyBg,
    alignItems: "center",
    justifyContent: "center",
  },
  centerBox: { alignItems: "center", paddingTop: 80, gap: 12 },
  loadingText: { fontFamily: Font.regular, fontSize: 14, color: C.textMuted },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontFamily: Font.bold, fontSize: 16, color: C.text },
  emptySub: { fontFamily: Font.regular, fontSize: 13, color: C.textMuted, textAlign: "center", paddingHorizontal: 32 },
  card: {
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
    ...Platform.select({ web: { boxShadow: `0 2px 8px ${C.shadow}` }, default: { shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 } }),
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.skyBg,
    alignItems: "center",
    justifyContent: "center",
  },
  routeName: { fontFamily: Font.bold, fontSize: 15, color: C.text },
  routeSchool: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted, marginTop: 2 },
  seatsChip: {
    backgroundColor: C.greenLightBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  seatsText: { fontFamily: Font.semiBold, fontSize: 11, color: C.greenDeep },
  divider: { height: 1, backgroundColor: C.borderLight },
  cardDetail: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontFamily: Font.regular, fontSize: 13, color: C.textMuted, flex: 1 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
  priceLabel: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted },
  priceAmt: { fontFamily: Font.bold, fontSize: 15, color: C.text },
  bookBtn: {
    marginLeft: "auto",
    backgroundColor: C.skyDark,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bookBtnText: { fontFamily: Font.bold, fontSize: 13, color: "#fff" },
});
}
