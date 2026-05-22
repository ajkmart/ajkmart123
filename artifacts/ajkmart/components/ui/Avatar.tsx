import React from "react";
import { Image, Text, View, type ImageStyle, type ViewStyle } from "react-native";
import { useTheme } from "@/context/ThemeContext";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<AvatarSize, { size: number; fontSize: number }> = {
  xs: { size: 28, fontSize: 11 },
  sm: { size: 36, fontSize: 13 },
  md: { size: 44, fontSize: 16 },
  lg: { size: 56, fontSize: 20 },
  xl: { size: 72, fontSize: 26 },
};

interface AvatarProps {
  uri?: string | null;
  name?: string | null;
  size?: AvatarSize;
  style?: ViewStyle | ImageStyle;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

export function Avatar({ uri, name, size = "md", style }: AvatarProps) {
  const { colors: C } = useTheme();
  const s = SIZE_MAP[size];

  function getColor(n: string): string {
    const palette = [
      C.primary, C.mart, C.food, C.wallet, C.pharmacy,
      C.parcel, C.emerald, C.indigo, C.purple, C.cyan,
    ];
    let hash = 0;
    for (let i = 0; i < n.length; i++) {
      hash = n.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  }

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          { width: s.size, height: s.size, borderRadius: s.size / 2, backgroundColor: C.surfaceSecondary },
          style as ImageStyle,
        ]}
      />
    );
  }

  const initials = name ? getInitials(name) : "?";
  const bg = name ? getColor(name) : C.textMuted;

  return (
    <View
      style={[
        {
          width: s.size,
          height: s.size,
          borderRadius: s.size / 2,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
        },
        style as ViewStyle,
      ]}
    >
      <Text style={{ fontSize: s.fontSize, color: "#FFFFFF", fontFamily: "Inter_700Bold" }}>{initials}</Text>
    </View>
  );
}
