import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useCallback , useMemo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors, { spacing, radii } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { API_BASE } from "@/utils/api";
import { useSmartBack } from "@/hooks/useSmartBack";

import { useTheme } from "@/context/ThemeContext";

export default function ChatSearchScreen() {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { showToast } = useToast();
  const { goBack } = useSmartBack();
  const [searchId, setSearchId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);

  const apiFetch = useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${API_BASE}/communication${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers as any) },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed");
    return json.data !== undefined ? json.data : json;
  }, [token]);

  const search = async () => {
    if (!searchId.trim()) return;
    setSearching(true);
    setResult(null);
    try {
      const data = await apiFetch(`/search/${searchId.toUpperCase().trim()}`);
      setResult(data);
    } catch (err: any) {
      showToast(err.message || "User not found", "error");
    }
    setSearching(false);
  };

  const sendRequest = async () => {
    if (!result) return;
    setSending(true);
    try {
      await apiFetch("/requests", { method: "POST", body: JSON.stringify({ receiverId: result.id }) });
      showToast("Request sent!", "success");
      setResult(null);
      setSearchId("");
    } catch (err: any) {
      showToast(err.message || "Failed to send request", "error");
    }
    setSending(false);
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={goBack} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={s.title}>Find User</Text>
      </View>

      <View style={s.searchBox}>
        <View style={s.inputWrap}>
          <Ionicons name="search" size={20} color={C.textTertiary} />
          <TextInput
            style={s.input}
            placeholder="Enter AJK ID (e.g., AJK-ABC123)"
            placeholderTextColor={C.textTertiary}
            value={searchId}
            onChangeText={setSearchId}
            autoCapitalize="characters"
            onSubmitEditing={search}
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity style={s.searchBtn} onPress={search} disabled={searching}>
          {searching ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.searchBtnText}>Search</Text>}
        </TouchableOpacity>
      </View>

      {result && (
        <View style={s.resultCard}>
          <View style={s.resultAvatar}>
            <Text style={s.resultAvatarText}>{(result.name || "?").charAt(0).toUpperCase()}</Text>
          </View>
          <View style={s.resultInfo}>
            <Text style={s.resultName}>{result.name || "Unknown"}</Text>
            <Text style={s.resultMeta}>{result.ajkId} · {result.role}</Text>
            <View style={s.onlineRow}>
              <View style={[s.dot, { backgroundColor: result.isOnline ? C.success : C.textTertiary }]} />
              <Text style={s.onlineText}>{result.isOnline ? "Online" : "Offline"}</Text>
            </View>
          </View>
          <TouchableOpacity style={s.sendBtn} onPress={sendRequest} disabled={sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Ionicons name="paper-plane" size={16} color="#fff" />
                <Text style={s.sendBtnText}>Request</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {!result && !searching && (
        <View style={s.info}>
          <Ionicons name="information-circle-outline" size={24} color={C.textTertiary} />
          <Text style={s.infoText}>
            Search for users by their unique AJK ID to send a communication request.
            Once accepted, you can chat and make voice calls.
          </Text>
        </View>
      )}
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: Font.bold, color: C.text },
  searchBox: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg, flexDirection: "row", gap: 8 },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: radii.xl, paddingHorizontal: 14, gap: 8, height: 48, borderWidth: 1, borderColor: C.border },
  input: { flex: 1, fontSize: 15, fontFamily: Font.regular, color: C.text },
  searchBtn: { backgroundColor: C.primary, paddingHorizontal: 20, borderRadius: radii.xl, justifyContent: "center", height: 48 },
  searchBtnText: { fontSize: 14, fontFamily: Font.bold, color: "#fff" },
  resultCard: { marginHorizontal: spacing.lg, backgroundColor: C.surface, borderRadius: radii.xl, padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.border },
  resultAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primary, justifyContent: "center", alignItems: "center" },
  resultAvatarText: { fontSize: 18, fontFamily: Font.bold, color: "#fff" },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 16, fontFamily: Font.semiBold, color: C.text },
  resultMeta: { fontSize: 12, fontFamily: Font.regular, color: C.textSecondary, marginTop: 2 },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  onlineText: { fontSize: 11, fontFamily: Font.regular, color: C.textSecondary },
  sendBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.xl },
  sendBtnText: { fontSize: 13, fontFamily: Font.bold, color: "#fff" },
  info: { marginHorizontal: spacing.lg, marginTop: spacing.md, flexDirection: "row", gap: 10, padding: spacing.md, backgroundColor: `${C.primary}08`, borderRadius: radii.lg },
  infoText: { flex: 1, fontSize: 13, fontFamily: Font.regular, color: C.textSecondary, lineHeight: 20 },
  });
}
