import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useCart } from "@/context/CartContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { searchProducts, getTrendingSearches, useGetCategories } from "@workspace/api-client-react";
import { WishlistHeart } from "@/components/WishlistHeart";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";

const C = Colors.light;
const HISTORY_KEY = "@ajkmart_search_history";
const MAX_HISTORY = 10;

type SortOption = "relevance" | "price_asc" | "price_desc" | "rating" | "newest";
const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: "relevance", label: T("sortRelevance") },
  { key: "price_asc", label: T("sortPriceLow") },
  { key: "price_desc", label: T("sortPriceHigh") },
  { key: T("ratingLabel"), label: T("sortTopRated") },
  { key: "newest", label: T("newest") },
];

type ServiceKey = "mart" | "food" | "pharmacy";

interface SearchResult {
  id: string;
  name: string;
  price: number;
  image?: string;
  type: ServiceKey;
  category?: string;
  originalPrice?: number;
  rating?: number;
  vendorName?: string;
}

const SERVICE_META: Record<ServiceKey, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  mart:     { label: T("martTitle"),     icon: "basket-outline",   color: "#7C3AED", bg: "#F3E8FF" },
  food:     { label: T("food"),     icon: "restaurant-outline", color: "#D97706", bg: "#FEF3C7" },
  pharmacy: { label: T("navPharmacy"), icon: "medical-outline",  color: "#059669", bg: "#D1FAE5" },
};

const SERVICE_ROUTES: Record<ServiceKey, "/mart" | "/food" | "/pharmacy"> = {
  mart: "/mart",
  food: "/food",
  pharmacy: "/pharmacy",
};

function ServiceBadge({ type }: { type: ServiceKey }) {
  const m = SERVICE_META[type];
  return (
    <View style={[s.badge, { backgroundColor: m.bg }]}>
      <Ionicons name={m.icon} size={11} color={m.color} />
      <Text style={[s.badgeTxt, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

export default function UniversalSearchScreen() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { addItem, cartType, itemCount, clearCart } = useCart();
  const { config } = usePlatformConfig();
  const params = useLocalSearchParams<{ category?: string }>();

  const [query, setQuery] = useState(params.category ? `category:${params.category}` : "");
  const [sections, setSections] = useState<Array<{ title: string; data: SearchResult[]; type: ServiceKey }>>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [trendingTerms, setTrendingTerms] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [showFilters, setShowFilters] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minRating, setMinRating] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: catData } = useGetCategories({});
  const allCategories = (catData?.categories || []).flatMap(cat => [
    cat,
    ...(cat.children || []),
  ]);

  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(raw => {
      if (raw) {
        try { setSearchHistory(JSON.parse(raw)); } catch {}
      }
    });
    getTrendingSearches({ limit: 12 })
      .then(terms => { if (terms.length > 0) setTrendingTerms(terms); })
      .catch(() => {});
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (params.category) {
      fetchResults(params.category, false, 1);
    }
  }, [params.category]);

  const saveToHistory = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setSearchHistory(prev => {
      const filtered = prev.filter(h => h.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, MAX_HISTORY);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setSearchHistory([]);
    AsyncStorage.removeItem(HISTORY_KEY);
  }, []);

  const enabledServices: ServiceKey[] = [
    ...(config.features.mart ? ["mart" as ServiceKey] : []),
    ...(config.features.food ? ["food" as ServiceKey] : []),
    ...(config.features.pharmacy ? ["pharmacy" as ServiceKey] : []),
  ];

  const fetchResults = useCallback(async (q: string, fromExplicit = false, page = 1) => {
    if (!q.trim()) { setSections([]); setTotalPages(0); setCurrentPage(1); return; }
    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    setSearchError(false);
    if (fromExplicit) saveToHistory(q);

    try {
      const results = await Promise.allSettled(
        enabledServices.map((svc) =>
          searchProducts({
            q: q.trim(),
            type: svc,
            sort: sortBy !== "relevance" ? sortBy : undefined,
            minPrice: minPrice || undefined,
            maxPrice: maxPrice || undefined,
            minRating: minRating || undefined,
            category: filterCategory || params.category || undefined,
            page,
            perPage: 20,
          }).then((data) => ({
            products: data.products.map((p) => ({
              id: p.id,
              name: p.name,
              price: Number(p.price),
              image: p.image ?? undefined,
              category: p.category ?? undefined,
              originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
              rating: p.rating ?? undefined,
              vendorName: p.vendorName ?? undefined,
              type: svc,
            } as SearchResult)),
            totalPages: data.totalPages,
          }))
        )
      );

      const newSections: Array<{ title: string; data: SearchResult[]; type: ServiceKey }> = [];
      let anySuccess = false;
      let maxPages = 0;
      results.forEach((result, i) => {
        const svc = enabledServices[i]!;
        if (result.status === "fulfilled" && result.value.products.length > 0) {
          if (page > 1) {
            const existingIdx = sections.findIndex(sec => sec.type === svc);
            if (existingIdx >= 0) {
              const existingIds = new Set(sections[existingIdx]!.data.map(d => d.id));
              const newItems = result.value.products.filter(p => !existingIds.has(p.id));
              newSections.push({
                title: SERVICE_META[svc].label,
                data: [...sections[existingIdx]!.data, ...newItems],
                type: svc,
              });
            } else {
              newSections.push({ title: SERVICE_META[svc].label, data: result.value.products, type: svc });
            }
          } else {
            newSections.push({ title: SERVICE_META[svc].label, data: result.value.products, type: svc });
          }
          if (result.value.totalPages > maxPages) maxPages = result.value.totalPages;
          anySuccess = true;
        } else if (page > 1) {
          const existing = sections.find(sec => sec.type === svc);
          if (existing) newSections.push(existing);
        }
      });

      if (page > 1) {
        const unchanged = sections.filter(sec => !newSections.some(ns => ns.type === sec.type));
        setSections([...newSections, ...unchanged]);
      } else {
        setSections(newSections);
      }
      setTotalPages(maxPages);
      setCurrentPage(page);
      if (!anySuccess && page === 1 && results.every((r) => r.status === "rejected")) {
        setSearchError(true);
      }
    } catch {
      if (page === 1) setSearchError(true);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [enabledServices.join(","), saveToHistory, sortBy, minPrice, maxPrice, minRating, filterCategory, sections]);

  const loadNextPage = useCallback(() => {
    if (currentPage < totalPages && !loadingMore && query.trim()) {
      fetchResults(query, false, currentPage + 1);
    }
  }, [currentPage, totalPages, loadingMore, query, fetchResults]);

  const onChangeText = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setSections([]); return; }
    debounceRef.current = setTimeout(() => fetchResults(text), 300);
  };

  const doAddItem = (item: SearchResult) => {
    addItem({ productId: item.id, name: item.name, price: item.price, quantity: 1, image: item.image, type: item.type as "mart" | "food" });
    setAdded((prev) => ({ ...prev, [item.id]: true }));
    setTimeout(() => setAdded((prev) => ({ ...prev, [item.id]: false })), 1500);
  };

  const handleAdd = (item: SearchResult) => {
    if (item.type === "pharmacy") {
      router.push("/pharmacy");
      return;
    }
    if (itemCount > 0 && cartType !== item.type && cartType !== "none") {
      const meta = SERVICE_META[item.type];
      Alert.alert(
        `Switch to ${meta.label}?`,
        `Your cart has items from another service. Adding this item will clear your current cart.`,
        [
          { text: T("cancelLabel"), style: "cancel" },
          { text: "Clear & Add", style: "destructive", onPress: () => { clearCart(); doAddItem(item); } },
        ],
      );
      return;
    }
    doAddItem(item);
  };

  const totalResults = sections.reduce((acc, sec) => acc + sec.data.length, 0);

  return (
    <View style={[s.screen, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </Pressable>
        <View style={s.inputWrap}>
          <Ionicons name="search-outline" size={18} color={C.textMuted} />
          <TextInput
            ref={inputRef}
            style={s.input}
            value={query}
            onChangeText={onChangeText}
            placeholder="Search across all services…"
            placeholderTextColor={C.textMuted}
            returnKeyType="search"
            autoCapitalize="none"
            autoFocus
            onSubmitEditing={() => { if (query.trim()) fetchResults(query, true); }}
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(""); setSections([]); }}>
              <Ionicons name="close-circle" size={18} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={s.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
          {SORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => { setSortBy(opt.key); if (query.trim()) fetchResults(query); }}
              style={[s.sortChip, sortBy === opt.key && s.sortChipActive]}
            >
              <Text style={[s.sortChipTxt, sortBy === opt.key && s.sortChipTxtActive]}>{opt.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setShowFilters(!showFilters)} style={[s.sortChip, showFilters && s.sortChipActive]}>
            <Ionicons name="options-outline" size={13} color={showFilters ? "#fff" : C.textSecondary} />
            <Text style={[s.sortChipTxt, showFilters && s.sortChipTxtActive]}>Filters</Text>
          </Pressable>
        </ScrollView>
        {showFilters && (
          <View style={s.filterPanel}>
            <View style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Price Range (Rs.)</Text>
              <View style={s.filterPriceRow}>
                <View style={s.filterField}>
                  <TextInput style={s.filterInput} value={minPrice} onChangeText={setMinPrice} keyboardType="numeric" placeholder="Min" placeholderTextColor={C.textMuted} />
                </View>
                <Text style={s.filterDash}>—</Text>
                <View style={s.filterField}>
                  <TextInput style={s.filterInput} value={maxPrice} onChangeText={setMaxPrice} keyboardType="numeric" placeholder="Max" placeholderTextColor={C.textMuted} />
                </View>
              </View>
            </View>

            <View style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <Pressable onPress={() => setFilterCategory("")} style={[s.ratingChip, filterCategory === "" && s.ratingChipActive]}>
                  <Text style={[s.ratingChipTxt, filterCategory === "" && s.ratingChipTxtActive]}>All</Text>
                </Pressable>
                {allCategories.map(cat => (
                  <Pressable key={cat.id} onPress={() => setFilterCategory(filterCategory === cat.id ? "" : cat.id)} style={[s.ratingChip, filterCategory === cat.id && s.ratingChipActive]}>
                    <Text style={[s.ratingChipTxt, filterCategory === cat.id && s.ratingChipTxtActive]}>{cat.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Sort By</Text>
              <View style={s.ratingChipsRow}>
                {SORT_OPTIONS.map(opt => (
                  <Pressable key={opt.key} onPress={() => setSortBy(opt.key)} style={[s.ratingChip, sortBy === opt.key && s.ratingChipActive]}>
                    <Text style={[s.ratingChipTxt, sortBy === opt.key && s.ratingChipTxtActive]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={s.filterSection}>
              <Text style={s.filterSectionTitle}>Minimum Rating</Text>
              <View style={s.ratingChipsRow}>
                {["", "3", "3.5", "4", "4.5"].map(val => {
                  const isSelected = minRating === val;
                  const label = val === "" ? "Any" : `${val}★+`;
                  return (
                    <Pressable
                      key={val}
                      onPress={() => setMinRating(val)}
                      style={[s.ratingChip, isSelected && s.ratingChipActive]}
                    >
                      {val !== "" && <Ionicons name="star" size={11} color={isSelected ? "#fff" : "#F59E0B"} />}
                      <Text style={[s.ratingChipTxt, isSelected && s.ratingChipTxtActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={s.filterActions}>
              <Pressable
                onPress={() => {
                  setMinPrice("");
                  setMaxPrice("");
                  setMinRating("");
                  setFilterCategory("");
                  setSortBy("relevance");
                  if (query.trim()) fetchResults(query);
                }}
                style={s.filterClearBtn}
              >
                <Text style={s.filterClearTxt}>Clear All</Text>
              </Pressable>
              <Pressable onPress={() => { if (query.trim()) fetchResults(query); }} style={s.filterApply}>
                <Ionicons name="checkmark" size={14} color="#fff" />
                <Text style={s.filterApplyTxt}>Apply Filters</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {loading && (
        <View style={s.center}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={s.emptySub}>Searching all services…</Text>
        </View>
      )}

      {!loading && query.trim() && totalResults === 0 && searchError && (
        <View style={s.center}>
          <View style={s.errorIconWrap}>
            <Ionicons name="wifi-outline" size={40} color="#EF4444" />
          </View>
          <Text style={[s.emptyTxt, { color: "#EF4444" }]}>Search failed</Text>
          <Text style={s.emptySub}>Check your connection and try again</Text>
          <Pressable onPress={() => fetchResults(query)} style={s.retryBtn}>
            <Ionicons name="refresh-outline" size={14} color="#fff" />
            <Text style={s.retryBtnTxt}>Retry</Text>
          </Pressable>
        </View>
      )}

      {!loading && query.trim() && totalResults === 0 && !searchError && (
        <View style={s.center}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="search-outline" size={40} color={C.textMuted} />
          </View>
          <Text style={s.emptyTxt}>No results for "{query}"</Text>
          <Text style={s.emptySub}>Try a different keyword or browse a service</Text>
          <View style={s.noResultsCtaRow}>
            {enabledServices.filter((sv) => sv !== "pharmacy").map((sv) => {
              const m = SERVICE_META[sv];
              return (
                <Pressable key={sv} onPress={() => router.push(SERVICE_ROUTES[sv])} style={[s.ctaBtn, { backgroundColor: m.bg }]}>
                  <Ionicons name={m.icon} size={14} color={m.color} />
                  <Text style={[s.ctaBtnTxt, { color: m.color }]}>Browse {m.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {!loading && !query.trim() && (
        <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
          {searchHistory.length > 0 && (
            <View style={s.historySection}>
              <View style={s.historyHeader}>
                <Ionicons name="time-outline" size={16} color={C.textSecondary} />
                <Text style={s.historyTitle}>Recent Searches</Text>
                <Pressable onPress={clearHistory} style={s.clearHistoryBtn}>
                  <Text style={s.clearHistoryTxt}>Clear</Text>
                </Pressable>
              </View>
              <View style={s.historyChips}>
                {searchHistory.map((term, i) => (
                  <Pressable
                    key={`${term}-${i}`}
                    onPress={() => { setQuery(term); fetchResults(term, true); }}
                    style={s.historyChip}
                  >
                    <Ionicons name="time-outline" size={13} color={C.textMuted} />
                    <Text style={s.historyChipTxt}>{term}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {trendingTerms.length > 0 && (
            <View style={s.suggestSection}>
              <View style={s.suggestHeader}>
                <Ionicons name="trending-up-outline" size={16} color={C.primary} />
                <Text style={s.suggestTitle}>Trending Searches</Text>
              </View>
              <View style={s.suggestChips}>
                {trendingTerms.map((term) => (
                  <Pressable
                    key={term}
                    onPress={() => { setQuery(term); fetchResults(term, true); }}
                    style={s.suggestChip}
                  >
                    <Text style={s.suggestChipTxt}>{term}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={s.browseSection}>
            <Text style={s.browseTitle}>Browse by Service</Text>
            <View style={s.browseGrid}>
              {enabledServices.map(sv => {
                const m = SERVICE_META[sv];
                return (
                  <Pressable key={sv} onPress={() => router.push(SERVICE_ROUTES[sv])} style={[s.browseCard, { backgroundColor: m.bg }]}>
                    <View style={[s.browseIconWrap, { backgroundColor: m.color + "20" }]}>
                      <Ionicons name={m.icon} size={24} color={m.color} />
                    </View>
                    <Text style={[s.browseLabel, { color: m.color }]}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Animated.View>
      )}

      {!loading && totalResults > 0 && (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={s.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={s.sectionHeader}>
              <Ionicons name={SERVICE_META[section.type].icon} size={14} color={SERVICE_META[section.type].color} />
              <Text style={[s.sectionTitle, { color: SERVICE_META[section.type].color }]}>{section.title}</Text>
              <View style={[s.sectionCount, { backgroundColor: SERVICE_META[section.type].bg }]}>
                <Text style={[s.sectionCountTxt, { color: SERVICE_META[section.type].color }]}>{section.data.length}</Text>
              </View>
              <View style={[s.sectionDivider, { backgroundColor: SERVICE_META[section.type].color + "30" }]} />
            </View>
          )}
          onEndReached={loadNextPage}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
              style={s.card}
            >
              <View style={s.cardImgWrap}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <Ionicons name={SERVICE_META[item.type].icon} size={20} color={C.textMuted} />
                )}
                <WishlistHeart productId={item.id} size={14} style={{ position: "absolute", top: 4, right: 4 }} />
              </View>
              <View style={s.cardInfo}>
                <View style={s.cardMeta}>
                  <Text style={s.cardName} numberOfLines={2}>{item.name}</Text>
                  <ServiceBadge type={item.type} />
                </View>
                {item.vendorName && (
                  <Text style={s.cardVendor} numberOfLines={1}>{item.vendorName}</Text>
                )}
                <View style={s.cardBottom}>
                  {item.originalPrice && Number(item.originalPrice) > item.price ? (
                    <View style={s.priceRow}>
                      <Text style={s.cardPrice}>Rs. {item.price.toLocaleString()}</Text>
                      <Text style={s.cardOriginal}>Rs. {Number(item.originalPrice).toLocaleString()}</Text>
                    </View>
                  ) : (
                    <Text style={s.cardPrice}>Rs. {item.price.toLocaleString()}</Text>
                  )}
                  {item.rating != null && (
                    <View style={s.cardRating}>
                      <Ionicons name="star" size={10} color="#F59E0B" />
                      <Text style={s.cardRatingTxt}>{item.rating}</Text>
                    </View>
                  )}
                </View>
              </View>
              {item.type === "pharmacy" ? (
                <Pressable onPress={(e) => { e?.stopPropagation?.(); router.push("/pharmacy"); }} style={s.viewBtn}>
                  <Ionicons name="arrow-forward" size={16} color="#059669" />
                </Pressable>
              ) : (
                <Pressable onPress={(e) => { e?.stopPropagation?.(); handleAdd(item); }} style={[s.addBtn, added[item.id] && s.addBtnDone]}>
                  <Ionicons name={added[item.id] ? "checkmark" : "add"} size={18} color="#fff" />
                </Pressable>
              )}
            </Pressable>
          )}
          ListFooterComponent={loadingMore ? (
            <View style={s.loadMoreWrap}>
              <ActivityIndicator size="small" color={C.primary} />
              <Text style={s.loadMoreTxt}>Loading more...</Text>
            </View>
          ) : null}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: C.background },
  header:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10, gap: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:   { padding: 6 },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surfaceSecondary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  input:     { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: C.text },
  list:      { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 14, paddingBottom: 6 },
  sectionTitle:  { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5, textTransform: "uppercase" },
  sectionCount:  { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  sectionCountTxt: { fontSize: 10, fontFamily: "Inter_700Bold" },
  sectionDivider: { flex: 1, height: 1, marginLeft: 6 },
  card:      { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: 16, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border, gap: 12 },
  cardImgWrap: { width: 56, height: 56, borderRadius: 12, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  cardInfo:  { flex: 1 },
  cardMeta:  { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 2, gap: 8 },
  cardName:  { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: C.text },
  cardVendor: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.textMuted, marginBottom: 4 },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  priceRow:  { flexDirection: "row", alignItems: "center", gap: 8 },
  cardPrice: { fontSize: 14, fontFamily: "Inter_700Bold", color: C.primary },
  cardOriginal: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.textMuted, textDecorationLine: "line-through" },
  cardRating: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  cardRatingTxt: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#92400E" },
  badge:     { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt:  { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  addBtn:    { width: 36, height: 36, borderRadius: 12, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  addBtnDone:{ backgroundColor: "#10B981" },
  viewBtn:   { width: 36, height: 36, borderRadius: 12, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" },
  center:    { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60, gap: 8 },
  emptyTxt:  { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.text, marginTop: 8 },
  emptySub:  { fontSize: 13, fontFamily: "Inter_400Regular", color: C.textMuted },
  errorIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  retryBtn:  { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#EF4444", borderRadius: 12 },
  retryBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  noResultsCtaRow: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap", justifyContent: "center" },
  ctaBtn:    { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  ctaBtnTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  historySection: { paddingHorizontal: 16, paddingTop: 16 },
  historyHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  historyTitle: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.textSecondary },
  clearHistoryBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  clearHistoryTxt: { fontFamily: "Inter_500Medium", fontSize: 12, color: C.danger },
  historyChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  historyChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  historyChipTxt: { fontFamily: "Inter_400Regular", fontSize: 13, color: C.text },

  suggestSection: { paddingHorizontal: 16, paddingTop: 20 },
  suggestHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  suggestTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.text },
  suggestChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestChip: { backgroundColor: C.primarySoft, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  suggestChipTxt: { fontFamily: "Inter_500Medium", fontSize: 13, color: C.primary },

  browseSection: { paddingHorizontal: 16, paddingTop: 24 },
  browseTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: C.text, marginBottom: 12 },
  browseGrid: { flexDirection: "row", gap: 10 },
  browseCard: { flex: 1, borderRadius: 16, padding: 16, alignItems: "center", gap: 10 },
  browseIconWrap: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  browseLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  filterBar: { backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 8 },
  sortChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.surfaceSecondary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: C.border },
  sortChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  sortChipTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: C.textSecondary },
  sortChipTxtActive: { color: "#fff" },
  filterPanel: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, gap: 10 },
  filterSection: { gap: 6 },
  filterSectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: C.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  filterPriceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  filterField: { flex: 1 },
  filterDash: { fontSize: 14, color: C.textMuted },
  filterInput: { backgroundColor: C.surfaceSecondary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontFamily: "Inter_400Regular", color: C.text, borderWidth: 1, borderColor: C.border },
  ratingChipsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  ratingChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.surfaceSecondary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: C.border },
  ratingChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  ratingChipTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: C.textSecondary },
  ratingChipTxtActive: { color: "#fff" },
  filterActions: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "flex-end", paddingTop: 4 },
  filterClearBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  filterClearTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: C.danger },
  filterApply: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  filterApplyTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },

  loadMoreWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  loadMoreTxt: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.textMuted },
});
