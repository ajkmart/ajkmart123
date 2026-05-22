import React, { useEffect, useRef } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import Colors, { radii } from "@/constants/colors";

const C = Colors.light;

export function SkeletonBlock({
  w,
  h,
  r = radii.lg,
  style,
}: {
  w: number | string;
  h: number;
  r?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const op = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, []);
  return (
    <Animated.View
      style={[
        {
          width: w as number,
          height: h,
          borderRadius: r,
          backgroundColor: C.slate,
          opacity: op,
        },
        style,
      ]}
    />
  );
}
