import React from "react";
import { Platform, ScrollView, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: ("top" | "bottom" | "left" | "right")[];
  backgroundColor?: string;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  keyboardAware?: boolean;
}

export function ScreenContainer({
  children,
  scroll = true,
  edges = ["top", "left", "right"],
  backgroundColor,
  style,
  contentStyle,
  keyboardAware = false,
}: ScreenContainerProps) {
  const { colors: C } = useTheme();
  const bg = backgroundColor ?? C.background;

  const scrollContent = { flexGrow: 1, paddingBottom: Platform.OS === "web" ? 40 : 100 };

  const inner = scroll ? (
    keyboardAware ? (
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={[scrollContent, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </KeyboardAwareScrollViewCompat>
    ) : (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[scrollContent, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    )
  ) : (
    <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: bg }, style]}>
      {inner}
    </SafeAreaView>
  );
}
