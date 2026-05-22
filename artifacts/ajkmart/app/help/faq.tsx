import { Ionicons } from "@expo/vector-icons";
import React, { useState, useCallback, useMemo } from "react";
import { withErrorBoundary } from "@/utils/withErrorBoundary";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Colors, { spacing, radii, shadows } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { API_BASE, unwrapApiResponse } from "@/utils/api";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useTheme } from "@/context/ThemeContext";

interface FAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
}

function FAQItem({ faq }: { faq: FAQ }) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => setExpanded((p) => !p)}
      style={styles.faqItem}
      accessibilityRole="button"
      accessibilityLabel={faq.question}
      accessibilityState={{ expanded }}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQ}>{faq.question}</Text>
        <View style={[styles.chevronWrap, expanded && styles.chevronWrapOpen]}>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={C.primary}
          />
        </View>
      </View>
      {expanded && (
        <View style={styles.faqBody}>
          <Text style={styles.faqA}>{faq.answer}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default withErrorBoundary(FAQScreenInner);

function FAQScreenInner() {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["platform-faqs"],
    queryFn: async () => {
      const resp = await fetch(`${API_BASE}/platform-config/faqs`);
      const json = await resp.json();
      return unwrapApiResponse<{ faqs: FAQ[] }>(json);
    },
    staleTime: 10 * 60 * 1000,
  });

  const faqs: FAQ[] = data?.faqs || [];

  const categories = useMemo(() => {
    const cats = Array.from(new Set(faqs.map((f) => f.category)));
    return cats;
  }, [faqs]);

  const filtered = useMemo(() => {
    let result = faqs;
    if (activeCategory)
      result = result.filter((f) => f.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.question.toLowerCase().includes(q) ||
          f.answer.toLowerCase().includes(q),
      );
    }
    return result;
  }, [faqs, activeCategory, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, FAQ[]>();
    for (const f of filtered) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return map;
  }, [filtered]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={goBack}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Help Center</Text>
          <Text style={styles.headerSub}>Frequently asked questions</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search questions..."
          placeholderTextColor={C.textMuted}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity activeOpacity={0.7} onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={styles.loadingTxt}>Loading FAQs...</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Ionicons
            name="cloud-offline-outline"
            size={48}
            color={C.textMuted}
          />
          <Text style={styles.emptyTitle}>Could not load FAQs</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => refetch()}
            style={styles.retryBtn}
          >
            <Ionicons name="refresh-outline" size={16} color="#fff" />
            <Text style={styles.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {categories.length > 0 && !search.trim() && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catScroll}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setActiveCategory(null)}
                style={[
                  styles.catChip,
                  !activeCategory && styles.catChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.catChipTxt,
                    !activeCategory && styles.catChipTxtActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  activeOpacity={0.7}
                  onPress={() =>
                    setActiveCategory((prev) => (prev === cat ? null : cat))
                  }
                  style={[
                    styles.catChip,
                    activeCategory === cat && styles.catChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.catChipTxt,
                      activeCategory === cat && styles.catChipTxtActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {grouped.size === 0 ? (
            <View style={styles.center}>
              <Ionicons name="search-outline" size={40} color={C.textMuted} />
              <Text style={styles.emptyTitle}>No results found</Text>
              <Text style={styles.emptySub}>Try a different search term</Text>
            </View>
          ) : (
            Array.from(grouped.entries()).map(([category, items]) => (
              <View key={category} style={styles.categorySection}>
                <View style={styles.categoryHeader}>
                  <View style={styles.categoryDot} />
                  <Text style={styles.categoryTitle}>{category}</Text>
                </View>
                <View style={styles.faqCard}>
                  {items.map((faq, idx) => (
                    <View key={faq.id}>
                      <FAQItem faq={faq} />
                      {idx < items.length - 1 && (
                        <View style={styles.divider} />
                      )}
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}

          <View style={styles.supportTip}>
            <Ionicons name="headset-outline" size={20} color={C.info} />
            <View style={{ flex: 1 }}>
              <Text style={styles.supportTipTitle}>Still need help?</Text>
              <Text style={styles.supportTipSub}>
                Chat with our support team for personalized assistance.
              </Text>
            </View>
          </View>

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    ...Platform.select({
      web: { boxShadow: `0 1px 3px ${C.shadow}` },
      default: { shadowColor: C.text, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
    }),
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceSecondary,
  },
  headerTitle: { fontFamily: Font.bold, fontSize: 16, color: C.text },
  headerSub: {
    fontFamily: Font.regular,
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: spacing.lg,
    marginVertical: 12,
    backgroundColor: C.surface,
    borderRadius: radii.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
    ...Platform.select({
      web: { boxShadow: `0 1px 3px ${C.shadow}` },
      default: { shadowColor: C.text, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
    }),
  },
  searchInput: {
    flex: 1,
    fontFamily: Font.regular,
    fontSize: 14,
    color: C.text,
    paddingVertical: 0,
  },
  scroll: { paddingBottom: 0 },
  catScroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 10,
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.full,
    backgroundColor: C.surfaceSecondary,
    borderWidth: 1,
    borderColor: C.border,
  },
  catChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  catChipTxt: { fontFamily: Font.medium, fontSize: 12, color: C.textSecondary },
  catChipTxtActive: { color: "#fff" },
  categorySection: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.primary,
  },
  categoryTitle: {
    fontFamily: Font.bold,
    fontSize: 13,
    color: C.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  faqCard: {
    backgroundColor: C.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: C.borderLight,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: `0 1px 3px ${C.shadow}` },
      default: { shadowColor: C.text, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
    }),
  },
  faqItem: { paddingHorizontal: spacing.lg, paddingVertical: 14 },
  faqHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  faqQ: {
    flex: 1,
    fontFamily: Font.semiBold,
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
  },
  chevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -2,
  },
  chevronWrapOpen: { backgroundColor: C.primary },
  faqBody: {
    marginTop: 10,
    backgroundColor: C.surfaceSecondary,
    borderRadius: radii.lg,
    padding: 12,
  },
  faqA: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.borderLight,
    marginHorizontal: spacing.lg,
  },
  supportTip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: C.infoSoft,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: C.indigoBorder,
  },
  supportTipTitle: {
    fontFamily: Font.bold,
    fontSize: 14,
    color: C.text,
    marginBottom: 3,
  },
  supportTipSub: {
    fontFamily: Font.regular,
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 18,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: Font.bold,
    fontSize: 18,
    color: C.text,
    textAlign: "center",
  },
  emptySub: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: C.textMuted,
    textAlign: "center",
  },
  loadingTxt: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: C.textMuted,
    marginTop: 8,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radii.xl,
    marginTop: 8,
  },
  retryTxt: { fontFamily: Font.semiBold, fontSize: 14, color: "#fff" },
});
}
