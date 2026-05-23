import React, { useState, useCallback, useMemo } from "react";
import { withErrorBoundary } from "@/utils/withErrorBoundary";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import Colors, { spacing, radii, shadows } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { CountdownTimer } from "@/components/user-shared";
import { API_BASE } from "@/utils/api";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
const T = (key: TranslationKey) => tDual(key, "en");

type IoniconsName = ComponentProps<typeof Ionicons>["name"];


type OfferType = {
  id: string;
  name: string;
  description?: string;
  type: string;
  code?: string;
  discountPct?: number;
  discountFlat?: number;
  cashbackPct?: number;
  freeDelivery?: boolean;
  buyQty?: number;
  getQty?: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  appliesTo?: string;
  endDate: string;
  startDate: string;
  usedCount: number;
  usageLimit?: number;
};

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: IoniconsName; colors: [string, string] }
> = {
  percentage: {
    label: "% Off",
    icon: "pricetag",
    colors: ["#7C3AED", "#4F46E5"],
  },
  flat_discount: {
    label: "Flat Off",
    icon: "cash-outline",
    colors: ["#2563EB", "#1D4ED8"],
  },
  bogo: { label: "BOGO", icon: "gift-outline", colors: ["#059669", "#047857"] },
  free_delivery: {
    label: "Free Ship",
    icon: "bicycle",
    colors: ["#0891B2", "#0E7490"],
  },
  combo: {
    label: "Bundle",
    icon: "cube-outline",
    colors: ["#EA580C", "#C2410C"],
  },
  first_order: {
    label: "New User",
    icon: "star-outline",
    colors: ["#DB2777", "#BE185D"],
  },
  cashback: {
    label: "Cashback",
    icon: "wallet-outline",
    colors: ["#D97706", "#B45309"],
  },
  happy_hour: {
    label: "Happy Hour",
    icon: "time-outline",
    colors: ["#7C3AED", "#6D28D9"],
  },
  category: {
    label: T("categoryLabel"),
    icon: "grid-outline",
    colors: ["#DC2626", "#B91C1C"],
  },
};

function discountLabel(o: OfferType): string {
  if (o.type === "bogo" && o.buyQty && o.getQty)
    return `Buy ${o.buyQty} Get ${o.getQty} Free`;
  if (o.type === "free_delivery") return T("freeDelivery");
  if (o.type === "cashback" && o.cashbackPct)
    return `${o.cashbackPct}% Cashback`;
  if (o.discountPct) return `${o.discountPct}% Off`;
  if (o.discountFlat) return `Rs.${o.discountFlat} Off`;
  return "Special Offer";
}

function OfferCard({
  offer,
  onPress,
  bookmarked,
  onBookmark,
}: {
  offer: OfferType;
  onPress: () => void;
  bookmarked?: boolean;
  onBookmark?: () => void;
}) {
  const { colors: C } = useTheme();
  const { width: W } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(C, W), [C, W]);
  const conf = TYPE_CONFIG[offer.type] ?? TYPE_CONFIG["percentage"]!;
  const endTime = new Date(offer.endDate);
  const isFlash = offer.type === "percentage" || offer.type === "flat_discount";
  const claimedPct = offer.usageLimit
    ? Math.min(100, Math.round((offer.usedCount / offer.usageLimit) * 100))
    : null;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.cardWrap}>
      <LinearGradient
        colors={conf.colors}
        style={styles.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Decorative circles */}
        <View
          style={[
            styles.decorCircle,
            { width: 90, height: 90, top: -30, right: -20, opacity: 0.18 },
          ]}
        />
        <View
          style={[
            styles.decorCircle,
            { width: 60, height: 60, bottom: -15, left: -10, opacity: 0.12 },
          ]}
        />

        <View style={styles.cardInner}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.badgePill}>
                <Ionicons name={conf.icon} size={11} color="#fff" />
                <Text style={styles.badgeTxt}>{conf.label}</Text>
              </View>
              <Text style={styles.discountTxt}>{discountLabel(offer)}</Text>
              <Text style={styles.offerName} numberOfLines={1}>
                {offer.name}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              {onBookmark && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    onBookmark();
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={bookmarked ? "bookmark" : "bookmark-outline"}
                    size={20}
                    color="#fff"
                  />
                </TouchableOpacity>
              )}
              {offer.code && (
                <View style={styles.codePill}>
                  <Text style={styles.codeTxt}>{offer.code}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={{ gap: 6, marginTop: 10 }}>
            {offer.minOrderAmount && offer.minOrderAmount > 0 ? (
              <Text style={styles.conditionTxt}>
                Min order: Rs.{offer.minOrderAmount}
              </Text>
            ) : null}
            {claimedPct !== null && (
              <View>
                <View style={styles.progressBg}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${claimedPct}%` } as ViewStyle,
                    ]}
                  />
                </View>
                <Text style={styles.claimedTxt}>{claimedPct}% claimed</Text>
              </View>
            )}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={styles.endsIn}>
                {isFlash ? "⚡ Ends in: " : "⏰ Valid till: "}
              </Text>
              <CountdownTimer targetTime={endTime} />
            </View>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function OfferDetailSheet({
  offer,
  onClose,
  onUseNow,
}: {
  offer: OfferType;
  onClose: () => void;
  onUseNow: () => void;
}) {
  const { colors: C } = useTheme();
  const { width: W } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(C, W), [C, W]);
  const conf = TYPE_CONFIG[offer.type] ?? TYPE_CONFIG["percentage"]!;

  return (
    <Modal
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.sheetBackdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={styles.sheet}>
        <LinearGradient
          colors={conf.colors}
          style={styles.sheetHeader}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={styles.sheetTitle}>{discountLabel(offer)}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.sheetSubtitle}>{offer.name}</Text>
        </LinearGradient>
        <ScrollView style={{ padding: 20 }}>
          {offer.code && (
            <View style={styles.codeBox}>
              <Text style={styles.codeBoxLabel}>Promo Code</Text>
              <Text style={styles.codeBoxCode}>{offer.code}</Text>
              <Text style={styles.codeBoxHint}>Enter this code at checkout</Text>
            </View>
          )}
          {offer.description && (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.detailSectionTitle}>About this offer</Text>
              <Text style={styles.detailText}>{offer.description}</Text>
            </View>
          )}
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.detailSectionTitle}>Offer Details</Text>
            {[
              offer.discountPct &&
                `${offer.discountPct}% discount on your order`,
              offer.discountFlat && `Rs.${offer.discountFlat} flat discount`,
              offer.cashbackPct && `${offer.cashbackPct}% wallet cashback`,
              offer.freeDelivery && "Free delivery included",
              offer.buyQty && `Buy ${offer.buyQty}, Get ${offer.getQty} free`,
              offer.minOrderAmount &&
                offer.minOrderAmount > 0 &&
                `Minimum order: Rs.${offer.minOrderAmount}`,
              offer.maxDiscount && `Maximum discount: Rs.${offer.maxDiscount}`,
              offer.appliesTo &&
                offer.appliesTo !== "all" &&
                `Applies to: ${offer.appliesTo}`,
              offer.usageLimit && `Limited to ${offer.usageLimit} total uses`,
            ]
              .filter(Boolean)
              .map((line, i) => (
                <View key={i} style={styles.detailRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={conf.colors[0]}
                  />
                  <Text style={styles.detailText}>{line}</Text>
                </View>
              ))}
          </View>
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.detailSectionTitle}>Validity</Text>
            <Text style={styles.detailText}>
              {new Date(offer.startDate).toLocaleDateString("en-PK", {
                dateStyle: "long",
              })}{" "}
              —{" "}
              {new Date(offer.endDate).toLocaleDateString("en-PK", {
                dateStyle: "long",
              })}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onUseNow}
            style={[styles.useNowBtn, { backgroundColor: conf.colors[0] }]}
          >
            <Text style={styles.useNowTxt}>Use Now</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={{ height: 30 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ── Group Sections ── */
type GroupKey =
  | "flashDeals"
  | "freeDelivery"
  | "categoryOffers"
  | "newUserSpecials"
  | "cashback"
  | "happyHour"
  | "bogoDeals"
  | "bundles";
const GROUP_LABELS: Record<GroupKey, { label: string; emoji: string }> = {
  flashDeals: { label: T("navFlashDeals"), emoji: "⚡" },
  freeDelivery: { label: T("freeDelivery"), emoji: "🚚" },
  categoryOffers: { label: "Category Offers", emoji: "🏷️" },
  newUserSpecials: { label: "New User Specials", emoji: "⭐" },
  cashback: { label: "Cashback Offers", emoji: "💰" },
  happyHour: { label: "Happy Hour", emoji: "⏰" },
  bogoDeals: { label: "Buy X Get Y", emoji: "🎁" },
  bundles: { label: "Bundle Deals", emoji: "📦" },
};

/* ══════════════════════════════════
   Main Screen
══════════════════════════════════ */
export default withErrorBoundary(OffersScreenInner);

function OffersScreenInner() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const { colors: C } = useTheme();
  const { width: W } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(C, W), [C, W]);
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const qc = useQueryClient();
  const [selectedOffer, setSelectedOffer] = useState<OfferType | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "saved" | GroupKey>("all");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["public-offers"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/promotions/public`);
      if (!r.ok) throw new Error(`Failed to load offers (${r.status})`);
      const json = await r.json();
      return json?.data ?? json;
    },
    staleTime: 60000,
  });

  const { data: forYouData } = useQuery({
    queryKey: ["offers-for-you"],
    queryFn: async () => {
      if (!token) return null;
      const r = await fetch(`${API_BASE}/promotions/for-you`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok)
        throw new Error(`Failed to load personalized offers (${r.status})`);
      const json = await r.json();
      return json?.data ?? json;
    },
    enabled: !!token,
    staleTime: 120000,
  });

  const { data: bookmarksData } = useQuery({
    queryKey: ["offer-bookmarks"],
    queryFn: async () => {
      if (!token) return null;
      const r = await fetch(`${API_BASE}/promotions/bookmarks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Failed to load bookmarks (${r.status})`);
      const json = await r.json();
      return json?.data ?? json;
    },
    enabled: !!token,
    staleTime: 30000,
  });

  const bookmarkedOffers: OfferType[] = bookmarksData?.offers ?? [];
  const bookmarkedIds = new Set(bookmarkedOffers.map((o: OfferType) => o.id));

  const toggleBookmark = useMutation({
    mutationFn: async (offerId: string) => {
      const r = await fetch(`${API_BASE}/promotions/bookmarks/${offerId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Failed to toggle bookmark (${r.status})`);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offer-bookmarks"] });
    },
  });

  const allOffers: OfferType[] = data?.offers ?? [];
  const grouped: Partial<Record<GroupKey, OfferType[]>> = data?.grouped ?? {};
  const forYouOffers: OfferType[] = forYouData?.offers ?? [];

  const displayOffers: OfferType[] =
    activeTab === "all"
      ? allOffers
      : activeTab === "saved"
        ? bookmarkedOffers
        : (grouped[activeTab as GroupKey] ?? []);

  const handleUseNow = useCallback((offer: OfferType) => {
    setSelectedOffer(null);
    if (offer.code) {
      router.push({ pathname: "/cart", params: { promoCode: offer.code } });
    } else {
      router.push("/cart");
    }
  }, []);

  const tabOptions: {
    key: "all" | "saved" | GroupKey;
    label: string;
    emoji: string;
  }[] = [
    { key: "all", label: T("allTypes"), emoji: "🎯" },
    { key: "saved", label: T("savedFeedback"), emoji: "🔖" },
    { key: "flashDeals", label: "Flash", emoji: "⚡" },
    { key: "freeDelivery", label: "Free Ship", emoji: "🚚" },
    { key: "cashback", label: "Cashback", emoji: "💰" },
    { key: "newUserSpecials", label: "New User", emoji: "⭐" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Offers & Deals</Text>
          <Text style={styles.headerSub}>
            {allOffers.length > 0
              ? `${allOffers.length} offers available`
              : "Find great deals"}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {tabOptions.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.8}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Text style={styles.tabEmoji}>{tab.emoji}</Text>
            <Text
              style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          paddingTop: 8,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={() => {
              refetch();
            }}
            colors={[C.primary]}
          />
        }
      >
        {isLoading ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text
              style={{
                color: C.textMuted,
                marginTop: 12,
                fontFamily: Font.regular,
              }}
            >
              Loading offers...
            </Text>
          </View>
        ) : isError ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>⚠️</Text>
            <Text style={styles.emptyTitle}>Could not load offers</Text>
            <Text style={styles.emptySubtitle}>Check your connection and try again.</Text>
            <TouchableOpacity
              onPress={() => refetch()}
              style={{
                marginTop: 16,
                paddingHorizontal: 24,
                paddingVertical: 10,
                backgroundColor: C.primary,
                borderRadius: 20,
              }}
            >
              <Text style={{ fontFamily: Font.semiBold, color: "#fff", fontSize: 14 }}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        ) : displayOffers.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>
              {activeTab === "saved" ? "🔖" : "🏷️"}
            </Text>
            <Text style={styles.emptyTitle}>
              {activeTab === "saved"
                ? "No saved offers"
                : "No offers right now"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === "saved"
                ? "Tap the bookmark icon to save offers for later"
                : "Check back soon for great deals!"}
            </Text>
          </View>
        ) : (
          <>
            {/* For You section */}
            {activeTab === "all" && forYouOffers.length > 0 && (
              <View style={{ marginBottom: 8 }}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionEmoji}>✨</Text>
                  <Text style={styles.sectionTitle}>For You</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
                >
                  {forYouOffers.slice(0, 5).map((offer) => (
                    <View key={offer.id} style={{ width: W * 0.78 }}>
                      <OfferCard
                        offer={offer}
                        onPress={() => setSelectedOffer(offer)}
                        bookmarked={bookmarkedIds.has(offer.id)}
                        onBookmark={
                          token
                            ? () => toggleBookmark.mutate(offer.id)
                            : undefined
                        }
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Group sections when on "all" tab */}
            {activeTab === "all" ? (
              Object.entries(GROUP_LABELS).map(([key, cfg]) => {
                const groupOffers: OfferType[] = grouped[key as GroupKey] ?? [];
                if (groupOffers.length === 0) return null;
                return (
                  <View key={key} style={{ marginBottom: 8 }}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionEmoji}>{cfg.emoji}</Text>
                      <Text style={styles.sectionTitle}>{cfg.label}</Text>
                      <Text style={styles.sectionCount}>{groupOffers.length}</Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
                    >
                      {groupOffers.map((offer) => (
                        <View key={offer.id} style={{ width: W * 0.78 }}>
                          <OfferCard
                            offer={offer}
                            onPress={() => setSelectedOffer(offer)}
                            bookmarked={bookmarkedIds.has(offer.id)}
                            onBookmark={
                              token
                                ? () => toggleBookmark.mutate(offer.id)
                                : undefined
                            }
                          />
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                );
              })
            ) : (
              <View style={{ paddingHorizontal: 16, gap: 12 }}>
                {displayOffers.map((offer) => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    onPress={() => setSelectedOffer(offer)}
                    bookmarked={bookmarkedIds.has(offer.id)}
                    onBookmark={
                      token ? () => toggleBookmark.mutate(offer.id) : undefined
                    }
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Offer Detail Bottom Sheet */}
      {selectedOffer && (
        <OfferDetailSheet
          offer={selectedOffer}
          onClose={() => setSelectedOffer(null)}
          onUseNow={() => handleUseNow(selectedOffer)}
        />
      )}
    </View>
  );
}

function makeStyles(C: typeof Colors.light, W: number) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: C.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { fontFamily: Font.bold, fontSize: 18, color: C.text },
    headerSub: {
      fontFamily: Font.regular,
      fontSize: 12,
      color: C.textMuted,
      marginTop: 1,
    },
    tabsScroll: { flexGrow: 0, paddingVertical: 10 },
    tab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: C.surfaceSecondary,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    tabActive: { backgroundColor: C.primary, borderColor: C.primary },
    tabEmoji: { fontSize: 13 },
    tabLabel: { fontFamily: Font.medium, fontSize: 12, color: C.textMuted },
    tabLabelActive: { color: "#fff" },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    sectionEmoji: { fontSize: 16 },
    sectionTitle: { fontFamily: Font.bold, fontSize: 15, color: C.text, flex: 1 },
    sectionCount: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
    cardWrap: { borderRadius: 18, overflow: "hidden", ...shadows.md },
    cardGradient: { borderRadius: 18, padding: 16 },
    cardInner: {},
    decorCircle: {
      position: "absolute",
      borderRadius: 999,
      backgroundColor: "#fff",
    },
    badgePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(255,255,255,0.25)",
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 3,
      alignSelf: "flex-start",
      marginBottom: 6,
    },
    badgeTxt: { fontFamily: Font.semiBold, fontSize: 10, color: "#fff" },
    discountTxt: {
      fontFamily: Font.bold,
      fontSize: 22,
      color: "#fff",
      letterSpacing: -0.5,
    },
    offerName: {
      fontFamily: Font.regular,
      fontSize: 12,
      color: "rgba(255,255,255,0.85)",
      marginTop: 2,
    },
    codePill: {
      backgroundColor: "rgba(255,255,255,0.25)",
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.4)",
      borderStyle: "dashed",
    },
    codeTxt: {
      fontFamily: Font.bold,
      fontSize: 12,
      color: "#fff",
      letterSpacing: 1.5,
    },
    conditionTxt: {
      fontFamily: Font.regular,
      fontSize: 11,
      color: "rgba(255,255,255,0.75)",
    },
    progressBg: {
      height: 4,
      backgroundColor: "rgba(255,255,255,0.3)",
      borderRadius: 99,
      overflow: "hidden",
    },
    progressFill: { height: 4, backgroundColor: "#fff", borderRadius: 99 },
    claimedTxt: {
      fontFamily: Font.regular,
      fontSize: 10,
      color: "rgba(255,255,255,0.7)",
      marginTop: 3,
    },
    endsIn: {
      fontFamily: Font.regular,
      fontSize: 11,
      color: "rgba(255,255,255,0.8)",
    },
    timerTxt: { fontFamily: Font.bold, fontSize: 11, color: "#fff" },
    empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 40 },
    emptyTitle: {
      fontFamily: Font.bold,
      fontSize: 18,
      color: C.text,
      marginTop: 12,
    },
    emptySubtitle: {
      fontFamily: Font.regular,
      fontSize: 14,
      color: C.textMuted,
      textAlign: "center",
      marginTop: 6,
    },
    // Sheet
    sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: "85%",
      overflow: "hidden",
    },
    sheetHeader: { padding: 20, paddingBottom: 24 },
    sheetTitle: { fontFamily: Font.bold, fontSize: 24, color: "#fff" },
    sheetSubtitle: {
      fontFamily: Font.regular,
      fontSize: 14,
      color: "rgba(255,255,255,0.85)",
      marginTop: 4,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    codeBox: {
      backgroundColor: C.surfaceSecondary,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      alignItems: "center",
      borderWidth: 2,
      borderColor: C.primary,
      borderStyle: "dashed",
    },
    codeBoxLabel: {
      fontFamily: Font.regular,
      fontSize: 12,
      color: C.textMuted,
      marginBottom: 6,
    },
    codeBoxCode: {
      fontFamily: Font.bold,
      fontSize: 24,
      color: C.primary,
      letterSpacing: 3,
    },
    codeBoxHint: {
      fontFamily: Font.regular,
      fontSize: 11,
      color: C.textMuted,
      marginTop: 4,
    },
    detailSectionTitle: {
      fontFamily: Font.semiBold,
      fontSize: 14,
      color: C.text,
      marginBottom: 10,
    },
    detailRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
      alignItems: "flex-start",
    },
    detailText: {
      fontFamily: Font.regular,
      fontSize: 13,
      color: C.textSecondary,
      flex: 1,
    },
    useNowBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 16,
      paddingVertical: 16,
      marginTop: 8,
    },
    useNowTxt: { fontFamily: Font.bold, fontSize: 16, color: "#fff" },
  });
}
