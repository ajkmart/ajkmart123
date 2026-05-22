import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors, { spacing, radii, typography } from "@/constants/colors";

const C = Colors.light;

type Props = {
  visible: boolean;
  targetService: string;
  currentService: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function CartSwitchModal({ visible, targetService, currentService, onCancel, onConfirm }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: C.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onCancel} />
        <View style={{
          backgroundColor: C.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing.xxl + 16,
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: "center", marginBottom: spacing.lg }} />
          <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", marginBottom: spacing.md }}>
              <Ionicons name="swap-horizontal-outline" size={28} color="#D97706" />
            </View>
            <Text style={{ ...typography.h3, color: C.text, textAlign: "center" }}>
              Switch to {targetService}?
            </Text>
            <Text style={{ ...typography.body, color: C.textSecondary, textAlign: "center", marginTop: spacing.sm, lineHeight: 20 }}>
              Your {currentService} cart has items in it. Switching to {targetService} will clear your current cart.
            </Text>
          </View>
          <Pressable
            onPress={onConfirm}
            style={{
              backgroundColor: C.danger,
              borderRadius: radii.md,
              paddingVertical: 14,
              alignItems: "center",
              marginBottom: spacing.sm,
            }}
          >
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>Clear Cart & Switch</Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            style={{
              backgroundColor: C.surfaceSecondary,
              borderRadius: radii.md,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.textSecondary }}>Keep Current Cart</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
