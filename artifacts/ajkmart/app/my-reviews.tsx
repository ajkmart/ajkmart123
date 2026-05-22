import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey, type Language } from "@workspace/i18n";
import { API_BASE } from "@/utils/api";

const C = Colors.light;

function T(key: TranslationKey, lang: Language): string {
  return tDual(key, lang);
}

function useFetch<T>(url: string, token: string | null) {
  const [data, setData]     = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError]   = React.useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      setData(await r.json());
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [url, token]);

  React.useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}

type Review = {
  id: string;
  orderId: string;
  rating: number;
  riderRating?: number | null;
  comment: string | null;
  orderType: string | null;
  createdAt: string;
  vendorName?: string | null;
  riderName?: string | null;
};

function StarRow({ value }: { value: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <Ionicons key={i} name={i <= value ? "star" : "star-outline"} size={13} color={i <= value ? "#f59e0b" : "#e5e7eb"} />
      ))}
    </View>
  );
}

export default function MyReviewsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { language } = useLanguage();
  const t = (k: TranslationKey) => T(k, language);

  const { data, loading, error, refetch } = useFetch<{ reviews: Review[]; total: number }>(
    `${API_BASE}/reviews/my`,
    token,
  );

  const reviews = data?.reviews ?? [];
  const total   = data?.total   ?? 0;

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </Pressable>
        <Text style={s.headerTitle}>{t("myReviews")}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={C.danger} />
          <Text style={s.errText}>{error}</Text>
          <Pressable onPress={refetch} style={s.retryBtn}>
            <Text style={s.retryTxt}>{t("retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={C.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary */}
          <View style={s.summaryCard}>
            <Ionicons name="star" size={28} color="#f59e0b" />
            <Text style={s.summaryCount}>{total}</Text>
            <Text style={s.summaryLabel}>{t("reviews")}</Text>
          </View>

          {reviews.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="star-outline" size={56} color="#d1d5db" />
              <Text style={s.emptyTitle}>{t("noReviews")}</Text>
              <Text style={s.emptySub}>{t("reviewsWillAppearHere")}</Text>
              <Pressable
                onPress={() => router.replace("/(tabs)")}
                style={{ marginTop: 16, backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 }}
              >
                <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                  Place an Order
                </Text>
              </Pressable>
            </View>
          ) : (
            reviews.map(r => (
              <View key={r.id} style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.typeBadge}>
                    <Ionicons
                      name={r.orderType === "ride" ? "car-outline" : "bag-outline"}
                      size={12}
                      color={r.orderType === "ride" ? "#3b82f6" : "#f97316"}
                    />
                    <Text style={[s.typeTxt, { color: r.orderType === "ride" ? "#3b82f6" : "#f97316" }]}>
                      {r.orderType === "ride" ? t("ride") : r.orderType ? r.orderType.charAt(0).toUpperCase() + r.orderType.slice(1) : t("orderReviews").split(" ")[0]}
                    </Text>
                  </View>
                  <Text style={s.date}>{fmtDate(r.createdAt)}</Text>
                </View>

                {/* Primary rating */}
                <View style={s.ratingRow}>
                  <Text style={s.ratingLabel}>
                    {r.riderRating ? t("vendor") : t("ratingLabel")}
                  </Text>
                  <StarRow value={r.rating} />
                </View>

                {/* Separate rider rating (only when dual-rated) */}
                {!!r.riderRating && (
                  <View style={s.ratingRow}>
                    <Text style={s.ratingLabel}>{t("rider")}</Text>
                    <StarRow value={r.riderRating} />
                  </View>
                )}

                {r.comment ? (
                  <Text style={s.comment}>"{r.comment}"</Text>
                ) : (
                  <Text style={s.noComment}>{t("noCommentAdded")}</Text>
                )}

                {(r.vendorName || r.riderName) && (
                  <Text style={s.subject}>
                    {r.vendorName ? `${t("vendor")}: ${r.vendorName}` : ""}
                    {r.riderName  ? ` · ${t("rider")}: ${r.riderName}` : ""}
                  </Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: "#f9fafb" },
  header:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  backBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  headerTitle:  { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "800", color: "#111" },
  centered:     { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  errText:      { fontSize: 14, color: "#ef4444", marginTop: 12, textAlign: "center" },
  retryBtn:     { marginTop: 16, backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  retryTxt:     { color: "#fff", fontWeight: "700", fontSize: 14 },
  list:         { padding: 16, gap: 12 },
  summaryCard:  { backgroundColor: "#fff", borderRadius: 20, padding: 20, alignItems: "center", marginBottom: 4, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  summaryCount: { fontSize: 32, fontWeight: "900", color: "#111", marginTop: 4 },
  summaryLabel: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  empty:        { alignItems: "center", paddingVertical: 48 },
  emptyTitle:   { fontSize: 16, fontWeight: "800", color: "#374151", marginTop: 12 },
  emptySub:     { fontSize: 13, color: "#9ca3af", marginTop: 6, textAlign: "center", maxWidth: 260 },
  card:         { backgroundColor: "#fff", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardTop:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  typeBadge:    { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f9fafb", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  typeTxt:      { fontSize: 11, fontWeight: "700" },
  ratingRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  ratingLabel:  { fontSize: 11, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  comment:      { fontSize: 13, color: "#374151", lineHeight: 20, fontStyle: "italic", marginBottom: 6, marginTop: 4 },
  noComment:    { fontSize: 12, color: "#d1d5db", marginBottom: 6, fontStyle: "italic", marginTop: 4 },
  subject:      { fontSize: 11, color: "#6b7280", marginBottom: 2 },
  date:         { fontSize: 11, color: "#9ca3af" },
});
