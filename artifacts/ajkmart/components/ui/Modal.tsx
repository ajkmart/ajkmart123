import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal as RNModal,
  TouchableOpacity,
  Text,
  View,
} from "react-native";
import { radii, shadows, spacing } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useTypography } from "@/hooks/useTypography";

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
}

export function Modal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  showCloseButton = true,
}: ModalProps) {
  const { colors: C } = useTheme();
  const T = useTypography();

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={0.7} style={{ flex: 1, backgroundColor: C.overlay, justifyContent: "center", alignItems: "center", padding: spacing.xxl }} onPress={onClose}>
        <TouchableOpacity activeOpacity={0.7} style={{ backgroundColor: C.surface, borderRadius: radii.xxl, padding: spacing.xxl, maxWidth: 400, width: "100%", ...shadows.xl }} onPress={(e) => e.stopPropagation()}>
          {(title || showCloseButton) && (
            <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.lg }}>
              <View style={{ flex: 1 }}>
                {title && <Text style={{ ...T.h3, color: C.text }}>{title}</Text>}
                {subtitle && <Text style={{ ...T.caption, color: C.textMuted, marginTop: 4 }}>{subtitle}</Text>}
              </View>
              {showCloseButton && (
                <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", marginLeft: spacing.sm }} hitSlop={8}>
                  <Ionicons name="close" size={22} color={C.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          )}
          {children}
        </TouchableOpacity>
      </TouchableOpacity>
    </RNModal>
  );
}
