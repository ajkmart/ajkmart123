import { useRef } from "react";
import { Animated } from "react-native";

interface CollapsibleHeaderConfig {
  expandedHeight: number;
  collapsedHeight: number;
  scrollThreshold?: number;
  searchBarHeight?: number;
  statsRowHeight?: number;
}

export function useCollapsibleHeader(config: CollapsibleHeaderConfig) {
  const { expandedHeight, collapsedHeight, scrollThreshold, searchBarHeight = 48, statsRowHeight = 36 } = config;
  const threshold = scrollThreshold ?? expandedHeight - collapsedHeight;
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerHeight = scrollY.interpolate({
    inputRange: [0, threshold],
    outputRange: [expandedHeight, collapsedHeight],
    extrapolate: "clamp",
  });

  const collapseProgress = scrollY.interpolate({
    inputRange: [0, threshold],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const searchOpacity = scrollY.interpolate({
    inputRange: [0, threshold * 0.3],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const searchTranslateY = scrollY.interpolate({
    inputRange: [0, threshold * 0.3],
    outputRange: [0, -8],
    extrapolate: "clamp",
  });

  const searchMaxHeight = scrollY.interpolate({
    inputRange: [0, threshold * 0.4],
    outputRange: [searchBarHeight, 0],
    extrapolate: "clamp",
  });

  const searchMarginTop = scrollY.interpolate({
    inputRange: [0, threshold * 0.4],
    outputRange: [0, -4],
    extrapolate: "clamp",
  });

  const subtitleOpacity = scrollY.interpolate({
    inputRange: [threshold * 0.3, threshold * 0.7],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const subtitleMaxHeight = scrollY.interpolate({
    inputRange: [threshold * 0.3, threshold * 0.7],
    outputRange: [20, 0],
    extrapolate: "clamp",
  });

  const statsOpacity = scrollY.interpolate({
    inputRange: [0, threshold * 0.5],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const statsMaxHeight = scrollY.interpolate({
    inputRange: [0, threshold * 0.6],
    outputRange: [statsRowHeight, 0],
    extrapolate: "clamp",
  });

  const scrollHandler = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false },
  );

  return {
    scrollY,
    headerHeight,
    collapseProgress,
    searchOpacity,
    searchTranslateY,
    searchMaxHeight,
    searchMarginTop,
    subtitleOpacity,
    subtitleMaxHeight,
    statsOpacity,
    statsMaxHeight,
    scrollHandler,
    scrollEventThrottle: 16 as const,
  };
}
