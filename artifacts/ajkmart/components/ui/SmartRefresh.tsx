import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from "react-native";
import Colors, { spacing } from "@/constants/colors";

const C = Colors.light;

interface SmartRefreshProps extends ScrollViewProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  lastUpdated?: Date | null;
  accentColor?: string;
}

const PULL_THRESHOLD = 80;
const INDICATOR_SIZE = 36;

function formatLastUpdated(date: Date | null | undefined): string {
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "Just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function BrandedSpinner({ size = INDICATOR_SIZE, color = C.primary }: { size?: number; color?: string }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <View style={[si.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}>
        <View style={[si.arc, { backgroundColor: color, top: 0, left: size / 2 - 3, borderRadius: 3 }]} />
      </View>
    </Animated.View>
  );
}

function PullIndicator({
  pullProgress,
  refreshing,
  color,
}: {
  pullProgress: Animated.Value;
  refreshing: boolean;
  color: string;
}) {
  const scale = pullProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.7, 1],
    extrapolate: "clamp",
  });

  const opacity = pullProgress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0.5, 1],
    extrapolate: "clamp",
  });

  const pullRotate = pullProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={[pi.wrap, { opacity, transform: [{ scale }] }]}>
      <View style={[pi.circle, { borderColor: color + "20" }]}>
        {refreshing ? (
          <BrandedSpinner size={22} color={color} />
        ) : (
          <Animated.View style={{ transform: [{ rotate: pullRotate }] }}>
            <View style={[pi.arrowUp, { borderBottomColor: color }]} />
            <View style={[pi.arrowLine, { backgroundColor: color }]} />
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

export function SmartRefresh({
  onRefresh,
  children,
  lastUpdated,
  accentColor = C.primary,
  ...scrollProps
}: SmartRefreshProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastTime, setLastTime] = useState<Date | null>(lastUpdated ?? null);
  const [timeStr, setTimeStr] = useState("");
  const pullProgress = useRef(new Animated.Value(0)).current;
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    setLastTime(lastUpdated ?? null);
  }, [lastUpdated]);

  useEffect(() => {
    setTimeStr(formatLastUpdated(lastTime));
    const iv = setInterval(() => setTimeStr(formatLastUpdated(lastTime)), 15000);
    return () => clearInterval(iv);
  }, [lastTime]);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
      setLastTime(new Date());
    } catch {}
    setRefreshing(false);
    Animated.timing(pullProgress, { toValue: 0, duration: 300, useNativeDriver: false }).start();
  }, [onRefresh]);

  const scrollY = useRef(0);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollY.current = y;
    if (isWeb && y < 0 && !refreshing) {
      const progress = Math.min(Math.abs(y) / PULL_THRESHOLD, 1);
      pullProgress.setValue(progress);
    }
    scrollProps.onScroll?.(e);
  }, [refreshing, isWeb]);

  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isWeb && scrollY.current < -PULL_THRESHOLD && !refreshing) {
      doRefresh();
    } else if (isWeb && !refreshing) {
      Animated.timing(pullProgress, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    }
    scrollProps.onScrollEndDrag?.(e);
  }, [isWeb, refreshing, doRefresh]);

  if (!isWeb) {
    return (
      <ScrollView
        {...scrollProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={doRefresh}
            tintColor={accentColor}
            colors={[accentColor, C.accent, C.success]}
            progressBackgroundColor={C.surface}
            title={refreshing ? "Updating..." : timeStr ? `Updated ${timeStr}` : "Pull to refresh"}
            titleColor={C.textMuted}
          />
        }
      >
        {children}
        {timeStr ? (
          <View style={ts.wrap}>
            <Text style={ts.text}>Updated {timeStr}</Text>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={webBar.wrap}>
        <View style={webBar.inner}>
          {refreshing ? (
            <View style={webBar.statusRow}>
              <BrandedSpinner size={14} color={accentColor} />
              <Text style={[webBar.statusText, { color: accentColor }]}>Updating...</Text>
            </View>
          ) : timeStr ? (
            <Text style={webBar.timeText}>Updated {timeStr}</Text>
          ) : null}
        </View>
      </View>

      <PullIndicator pullProgress={pullProgress} refreshing={refreshing} color={accentColor} />

      <ScrollView
        {...scrollProps}
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEnd}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const si = StyleSheet.create({
  ring: {
    borderWidth: 2.5,
    borderStyle: "solid",
    borderTopColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  arc: {
    position: "absolute",
    width: 6,
    height: 6,
  },
});

const pi = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.1)" },
      default: { shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
    }),
  },
  arrowUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    alignSelf: "center",
  },
  arrowLine: {
    width: 2,
    height: 8,
    alignSelf: "center",
    borderRadius: 1,
  },
});

const webBar = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 18,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  timeText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },
});

const ts = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
  },
  text: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },
});
