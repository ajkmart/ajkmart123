import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import Colors, { spacing, radii } from "@/constants/colors";

const C = Colors.light;

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ANIM_CONFIG = {
  duration: 250,
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

interface AccordionProps {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBg?: string;
  badge?: string;
  badgeColor?: string;
  badgeBg?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  headerStyle?: object;
  containerStyle?: object;
}

export default function Accordion({
  title,
  icon,
  iconColor = C.primary,
  iconBg = C.primarySoft,
  badge,
  badgeColor,
  badgeBg,
  defaultOpen = false,
  children,
  headerStyle,
  containerStyle,
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const rotation = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(ANIM_CONFIG);
    Animated.timing(rotation, {
      toValue: open ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
    setOpen(prev => !prev);
  }, [open, rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={[styles.container, containerStyle]}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [
          styles.header,
          headerStyle,
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={styles.headerLeft}>
          {icon && (
            <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
              <Ionicons name={icon} size={16} color={iconColor} />
            </View>
          )}
          <Text style={styles.title}>{title}</Text>
          {badge && (
            <View style={[styles.badge, badgeBg ? { backgroundColor: badgeBg } : {}]}>
              <Text style={[styles.badgeText, badgeColor ? { color: badgeColor } : {}]}>{badge}</Text>
            </View>
          )}
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={16} color={C.textMuted} />
        </Animated.View>
      </Pressable>
      {open && <View style={styles.content}>{children}</View>}
    </View>
  );
}

interface AccordionGroupProps {
  children: React.ReactNode;
  style?: object;
}

export function AccordionGroup({ children, style }: AccordionGroupProps) {
  return <View style={[styles.group, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  group: {
    backgroundColor: C.surface,
    borderRadius: radii.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: C.text,
    flex: 1,
  },
  badge: {
    backgroundColor: C.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: C.primary,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
});
