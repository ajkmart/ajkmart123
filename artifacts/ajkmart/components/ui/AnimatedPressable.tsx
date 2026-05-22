import React, { useEffect, useRef } from "react";
import { Animated, Pressable, type ViewStyle } from "react-native";

interface AnimatedPressableProps {
  children: React.ReactNode;
  onPress: () => void;
  style?: ViewStyle | ViewStyle[];
  delay?: number;
  disabled?: boolean;
}

export function AnimatedPressable({
  children,
  onPress,
  style,
  delay = 0,
  disabled = false,
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(0.96)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        delay,
        tension: 50,
        friction: 7,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 35 }).start();
  };

  return (
    <Animated.View style={[{ opacity, transform: [{ scale }] }, style]}>
      <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={disabled ? undefined : onPress} style={{ flex: 1 }} disabled={disabled}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
