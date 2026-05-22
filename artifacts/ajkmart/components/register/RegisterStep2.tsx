import React from "react";
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { authColors as C, InputField } from "@/components/auth-shared";
import { s } from "./registerStyles";

export interface RegisterStep2Props {
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  username: string;
  usernameStatus: "" | "checking" | "available" | "taken";
  handleUsernameChange: (v: string) => void;
  handlePickPhoto: () => void;
  photoLoading: boolean;
  photoUri: string | null;
  isLowBandwidth: boolean;
  error: string;
  clearError: () => void;
}

export function RegisterStep2({
  name, setName, email, setEmail, username, usernameStatus, handleUsernameChange,
  handlePickPhoto, photoLoading, photoUri, isLowBandwidth,
  error, clearError,
}: RegisterStep2Props) {
  return (
    <>
      <InputField
        label="Full Name *"
        value={name}
        onChangeText={v => { setName(v); clearError(); }}
        placeholder="Enter your full name"
        autoCapitalize="words"
        autoFocus
        error={!!error && !name.trim()}
      />
      <View>
        <InputField
          label="Username *"
          value={username}
          onChangeText={handleUsernameChange}
          placeholder="e.g. ahmed_khan92"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          error={usernameStatus === "taken" || (!!error && username.length < 3)}
          rightIcon={
            usernameStatus === "available" ? "checkmark-circle" :
            usernameStatus === "taken" ? "close-circle" :
            undefined
          }
          rightIconColor={usernameStatus === "available" ? C.success : C.danger}
        />
        {usernameStatus === "checking" && (
          <View style={s.usernameCheckRow}>
            <ActivityIndicator size="small" color={C.primary} />
            <Text style={s.usernameCheckText}>Checking availability...</Text>
          </View>
        )}
        {usernameStatus === "available" && (
          <Text style={[s.usernameHint, { color: C.success }]}>Username is available!</Text>
        )}
        {usernameStatus === "taken" && (
          <Text style={[s.usernameHint, { color: C.danger }]}>Username already taken</Text>
        )}
        {!usernameStatus && (
          <Text style={s.fieldHint}>Letters, numbers, underscore only. Min 3 characters.</Text>
        )}
      </View>
      <InputField
        label="Email (optional)"
        value={email}
        onChangeText={v => { setEmail(v); clearError(); }}
        placeholder="email@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        error={!!error && !!email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
      />
      <Text style={s.fieldLabel}>Profile Photo (Optional)</Text>
      <TouchableOpacity activeOpacity={0.7}
        onPress={handlePickPhoto}
        disabled={photoLoading}
        style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 8, padding: 12, backgroundColor: "#F9FAFB", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB" }}
        accessibilityRole="button"
        accessibilityLabel="Choose profile photo"
      >
        {photoLoading ? (
          <ActivityIndicator size="small" color={C.primary} />
        ) : photoUri && !isLowBandwidth ? (
          <Image source={{ uri: photoUri }} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#E5E7EB" }} />
        ) : photoUri && isLowBandwidth ? (
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="checkmark-circle" size={28} color="#059669" />
          </View>
        ) : (
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="camera-outline" size={24} color={C.primary} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: "#374151" }}>
            {photoUri ? "Change Photo" : "Add Profile Photo"}
          </Text>
          <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
            {photoUri ? "Looking good!" : "Help others recognize you"}
          </Text>
        </View>
        {!photoLoading && <Ionicons name="chevron-forward" size={16} color={C.textMuted} />}
      </TouchableOpacity>
    </>
  );
}
