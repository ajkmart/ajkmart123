import React, { useState } from "react";
import { Modal, View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { _domain } from "./_shared";

export function TermsModal({
  visible,
  termsVersion,
  onAccept,
}: {
  visible: boolean;
  termsVersion: string;
  onAccept: () => void;
}) {
  const { token } = useAuth();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    if (accepting) return;
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch(`https://${_domain}/api/platform-config/accept-terms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ termsVersion }),
      });
      if (!res.ok) throw new Error("Failed to record acceptance");
      onAccept();
    } catch {
      setError("Unable to save your acceptance. Please check your connection and try again.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "80%" }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#111827", marginBottom: 6 }}>
            Updated Terms & Conditions
          </Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
            Version {termsVersion} — We've updated our terms of service. Please review and accept to continue.
          </Text>
          <ScrollView style={{ maxHeight: 220, backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, marginBottom: 20 }}>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#374151", lineHeight: 22 }}>
              By using AJKMart, you agree to our Terms of Service and Privacy Policy. You must be at
              least 13 years of age to use our services. We collect and process your data as described
              in our Privacy Policy. You may not misuse our services or interfere with their normal
              operation. We reserve the right to suspend or terminate accounts that violate these
              terms.{"\n\n"}These terms were last updated and require your explicit acknowledgment to
              continue using the platform.
            </Text>
          </ScrollView>
          {error && (
            <View style={{ backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#DC2626" }}>{error}</Text>
            </View>
          )}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleAccept}
            disabled={accepting}
            style={{ backgroundColor: accepting ? "#A78BFA" : "#7C3AED", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 }}
          >
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" }}>
              {accepting ? "Accepting..." : "I Accept the Terms"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default null;
