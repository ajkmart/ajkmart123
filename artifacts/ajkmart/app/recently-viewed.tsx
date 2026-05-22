import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import { withErrorBoundary } from "@/utils/withErrorBoundary";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Alert,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import Colors from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { Font } from "@/constants/typography";
import { ScreenContainer } from "@/components/ui/ScreenContainer";

const RECENTLY_VIEWED_KEY = "recently_viewed_products";

interface RecentItem {
  id: string;
  name: string;
  image: string | null;
  price: number;
  originalPrice?: number;
}

export default withErrorBoundary(RecentlyViewedScreenInner);

function RecentlyViewedScreenInner() {
  const { colors: C } = useTheme();
  const { width } = useWindowDimensions();
  const CARD_W = (width - 16 * 2 - 12) / 2;
  const styles = useMemo(() => makeStyles(C, CARD_W), [C, CARD_W]);
  const { goBack } = useSmartBack();
  const [items, setItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setItems(Array.isArray(parsed) ? parsed : []);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleClear = useCallback(() => {
    Alert.alert("Clear History", "Remove all recently viewed products?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          // eslint-disable-next-line ajk-local/no-silent-catch -- clearing history is non-critical; list is cleared in state regardless
          await AsyncStorage.removeItem(RECENTLY_VIEWED_KEY).catch(() => {});
          setItems([]);
        },
      },
    ]);
  }, []);

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={goBack}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recently Viewed</Text>
        {items.length > 0 ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleClear}
            style={styles.clearBtn}
          >
            <Ionicons name="trash-outline" size={18} color={C.danger} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadItems}
            tintColor={C.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {!loading && items.length === 0 ? (
          <View style={styles.emptyCenter}>
            <View style={styles.emptyIcon}>
              <Ionicons name="time-outline" size={48} color={C.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No browsing history</Text>
            <Text style={styles.emptySub}>
              Products you view will appear here
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/(tabs)")}
              style={styles.browseBtn}
            >
              <Ionicons name="basket-outline" size={16} color={C.textInverse} />
              <Text style={styles.browseBtnTxt}>Browse Products</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.grid}>
            {items.map((item) => {
              const origPrice = item.originalPrice || 0;
              const discount =
                origPrice > item.price
                  ? Math.round(((origPrice - item.price) / origPrice) * 100)
                  : 0;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.7}
                  onPress={() =>
                    router.push({
                      pathname: "/product/[id]",
                      params: { id: item.id },
                    })
                  }
                  style={styles.card}
                >
                  <View style={styles.cardImg}>
                    {item.image ? (
                      <Image
                        source={{ uri: item.image }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons
                        name="cube-outline"
                        size={28}
                        color={C.textMuted}
                      />
                    )}
                    {discount > 0 && (
                      <View style={styles.discBadge}>
                        <Text style={styles.discTxt}>{discount}% OFF</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardPrice}>
                        Rs. {Number(item.price).toLocaleString()}
                      </Text>
                      {origPrice > item.price && (
                        <Text style={styles.cardOrigPrice}>
                          Rs. {origPrice.toLocaleString()}
                        </Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function makeStyles(C: typeof Colors.light, CARD_W: number) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
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
    clearBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: C.dangerSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 16,
      paddingTop: 16,
      gap: 12,
    },
    card: {
      width: CARD_W,
      backgroundColor: C.surface,
      borderRadius: 18,
      overflow: "hidden",
      ...Platform.select({
        web: { boxShadow: "0 2px 8px rgba(15,23,42,0.06)" },
        default: {
          shadowColor: C.text,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 2,
        },
      }),
    },
    cardImg: {
      height: 120,
      backgroundColor: C.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    discBadge: {
      position: "absolute",
      top: 8,
      left: 8,
      backgroundColor: C.danger,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    discTxt: { fontFamily: Font.bold, fontSize: 9, color: C.textInverse },
    cardBody: { padding: 12 },
    cardName: {
      fontFamily: Font.semiBold,
      fontSize: 13,
      color: C.text,
      marginBottom: 6,
      minHeight: 34,
    },
    cardFooter: { flexDirection: "row", alignItems: "baseline", gap: 6 },
    cardPrice: { fontFamily: Font.bold, fontSize: 15, color: C.text },
    cardOrigPrice: {
      fontFamily: Font.regular,
      fontSize: 11,
      color: C.textMuted,
      textDecorationLine: "line-through",
    },

    emptyCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 100,
      gap: 10,
    },
    emptyIcon: {
      width: 80,
      height: 80,
      borderRadius: 24,
      backgroundColor: C.surfaceSecondary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    emptyTitle: { fontFamily: Font.bold, fontSize: 17, color: C.text },
    emptySub: {
      fontFamily: Font.regular,
      fontSize: 13,
      color: C.textMuted,
      textAlign: "center",
      paddingHorizontal: 40,
    },
    browseBtn: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: C.primary,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 14,
    },
    browseBtnTxt: { fontFamily: Font.bold, fontSize: 14, color: C.textInverse },
  });
}
