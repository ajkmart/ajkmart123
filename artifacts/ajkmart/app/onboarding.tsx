import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import Colors from "@/constants/colors";

const width = 375;

const ONBOARDING_SEEN_KEY = "@ajkmart_onboarding_seen";

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
    return val === "1";
  } catch {
    return false;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1");
  // eslint-disable-next-line ajk-local/no-silent-catch -- marking onboarding seen is non-critical; onboarding will just show again
  } catch {}
}

const DEFAULT_SLIDES = [
  {
    id: "default_1",
    title: "Welcome to AJKMart",
    subtitle: "Your all-in-one super app for shopping, food, rides, and more.",
    backgroundColor: "#0047B3",
  },
  {
    id: "default_2",
    title: "Shop Thousands of Products",
    subtitle: "Browse groceries, electronics, fashion, and daily essentials — all in one place.",
    backgroundColor: "#6D28D9",
  },
  {
    id: "default_3",
    title: "Fast Delivery to Your Door",
    subtitle: "Get your orders delivered quickly and track them in real time.",
    backgroundColor: "#065F46",
  },
];

interface Slide {
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
  backgroundColor?: string;
}

function SlideItem({ item, isLast, onSkip, onNext, onDone }: {
  item: Slide;
  isLast: boolean;
  onSkip: () => void;
  onNext: () => void;
  onDone: () => void;
}) {
  const C = Colors;
  const bg = item.backgroundColor ?? "#0047B3";
  return (
    <View style={[styles.slide, { width, backgroundColor: bg }]}>
      <View style={styles.slideInner}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.slideImage} resizeMode="contain" />
        ) : (
          <View style={styles.iconPlaceholder}>
            <Text style={styles.iconEmoji}>🛒</Text>
          </View>
        )}
        <Text style={styles.slideTitle}>{item.title}</Text>
        {!!item.subtitle && (
          <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
        )}
      </View>
      <View style={styles.slideActions}>
        {!isLast && (
          <TouchableOpacity onPress={onSkip} style={styles.skipBtn} activeOpacity={0.7}>
            <Text style={styles.skipTxt}>Skip</Text>
          </TouchableOpacity>
        )}
        {isLast ? (
          <TouchableOpacity onPress={onDone} style={styles.doneBtn} activeOpacity={0.8}>
            <Text style={styles.doneTxt}>Get Started</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onNext} style={styles.nextBtn} activeOpacity={0.8}>
            <Text style={styles.nextTxt}>Next</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { config } = usePlatformConfig();
  const flatListRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const rawSlides = config.onboarding?.slides;
  const slides: Slide[] = rawSlides && rawSlides.length > 0 ? (rawSlides as Slide[]) : DEFAULT_SLIDES;

  const handleFinish = async () => {
    await markOnboardingSeen();
    router.replace("/auth");
  };

  const handleNext = () => {
    const next = activeIndex + 1;
    if (next < slides.length) {
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    } else {
      handleFinish();
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={item => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => (
          <SlideItem
            item={item}
            isLast={index === slides.length - 1}
            onSkip={handleFinish}
            onNext={handleNext}
            onDone={handleFinish}
          />
        )}
      />
      <View style={[styles.dotsRow, { paddingBottom: insets.bottom + 16 }]}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0047B3" },
  slide: { flex: 1, alignItems: "center", justifyContent: "space-between" },
  slideInner: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingTop: 32 },
  slideImage: { width: width * 0.65, height: width * 0.65, marginBottom: 32 },
  iconPlaceholder: {
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: (width * 0.5) / 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  iconEmoji: { fontSize: 72 },
  slideTitle: {
    fontFamily: Platform.OS === "web" ? undefined : "Inter_700Bold",
    fontWeight: "700",
    fontSize: 26,
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 14,
    lineHeight: 34,
  },
  slideSubtitle: {
    fontFamily: Platform.OS === "web" ? undefined : "Inter_400Regular",
    fontSize: 15,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    lineHeight: 24,
  },
  slideActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 24,
    width: "100%",
  },
  skipBtn: { paddingVertical: 12, paddingHorizontal: 16 },
  skipTxt: { color: "rgba(255,255,255,0.6)", fontSize: 15, fontWeight: "500" },
  nextBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  nextTxt: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  doneBtn: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  doneTxt: { color: "#0047B3", fontSize: 16, fontWeight: "800" },
  dotsRow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: { borderRadius: 4, height: 8 },
  dotActive: { width: 24, backgroundColor: "#ffffff" },
  dotInactive: { width: 8, backgroundColor: "rgba(255,255,255,0.4)" },
});
