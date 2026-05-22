import React from "react";
import { Modal, View, Text, ScrollView, TouchableOpacity } from "react-native";

interface ReleaseNote {
  id: string;
  version: string;
  releaseDate: string;
  notes: string[];
  sortOrder: number;
}

export function WhatsNewSheet({
  visible,
  releaseNotes,
  appVersion,
  onDismiss,
}: {
  visible: boolean;
  releaseNotes: ReleaseNote[];
  appVersion: string;
  onDismiss: () => void;
}) {
  const currentNotes = releaseNotes.filter((n) => n.version === appVersion);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "80%" }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
            <Text style={{ fontSize: 28, marginRight: 10 }}>🎉</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#111827" }}>What's New</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#6B7280" }}>Version {appVersion}</Text>
            </View>
          </View>
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {currentNotes.length > 0 ? (
              currentNotes[0].notes.map((note, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 12 }}>
                  <Text style={{ color: "#7C3AED", fontSize: 16, marginRight: 8, marginTop: 1 }}>•</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#374151", lineHeight: 22, flex: 1 }}>{note}</Text>
                </View>
              ))
            ) : (
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "#6B7280", lineHeight: 22 }}>
                Bug fixes and performance improvements.
              </Text>
            )}
          </ScrollView>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onDismiss}
            style={{ backgroundColor: "#7C3AED", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 16 }}
          >
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>Got it!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default null;
