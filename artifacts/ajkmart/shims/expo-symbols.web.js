// Web shim for expo-symbols (iOS SF Symbols — not available on web)
// Renders an accessible placeholder View so layout is preserved and
// screen readers receive a meaningful label when one is provided.
import React from "react";
import { View } from "react-native";

export function SymbolView({ style, size, name, accessibilityLabel, tintColor, ...rest }) {
  const sz = size ?? 24;
  const label = accessibilityLabel ?? name ?? "";
  return (
    <View
      style={[{ width: sz, height: sz }, style]}
      accessible={label.length > 0}
      accessibilityLabel={label || undefined}
      accessibilityRole="image"
    />
  );
}

export function SymbolImage({ style, size, name, accessibilityLabel, tintColor, ...rest }) {
  const sz = size ?? 24;
  const label = accessibilityLabel ?? name ?? "";
  return (
    <View
      style={[{ width: sz, height: sz }, style]}
      accessible={label.length > 0}
      accessibilityLabel={label || undefined}
      accessibilityRole="image"
    />
  );
}
