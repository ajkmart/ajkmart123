import { Ionicons } from "@expo/vector-icons";
import { createLogger } from "@/utils/logger";
import { router } from "expo-router";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors, { spacing, radii } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useTheme } from "@/context/ThemeContext";
import { API_BASE } from "@/utils/api";
import * as Clipboard from "expo-clipboard";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";

const log = createLogger("[chat/index]");

interface Conversation {
  id: string;
  otherUser: { id: string; name: string; ajkId: string; roles: string };
  lastMessage: { content: string } | null;
  unreadCount: number;
  lastMessageAt: string | null;
}

interface CommRequest {
  id: string;
  status: string;
  sender: { id: string; name: string; ajkId: string; roles: string };
}

export default function ChatListScreen() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<"chats" | "requests">("chats");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<CommRequest[]>([]);
  const [ajkId, setAjkId] = useState("");
  const [loading, setLoading] = useState(true);

  const apiFetch = useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${API_BASE}/communication${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers as any) },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed");
    return json.data !== undefined ? json.data : json;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [convs, reqs, me] = await Promise.all([
        apiFetch("/conversations"),
        apiFetch("/requests?type=received"),
        apiFetch("/me/ajk-id"),
      ]);
      setConversations(convs);
      setRequests(reqs.filter((r: any) => r.status === "pending"));
      setAjkId(me.ajkId);
    } catch (err) {
      log.warn("[chat/index] Failed to load conversations:", err);
    }
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const acceptRequest = async (id: string) => {
    try {
      await apiFetch(`/requests/${id}/accept`, { method: "PATCH" });
      showToast("Request accepted!", "success");
      load();
    } catch { showToast("Failed to accept", "error"); }
  };

  const rejectRequest = async (id: string) => {
    try {
      await apiFetch(`/requests/${id}/reject`, { method: "PATCH" });
      load();
    } catch (err) {
      log.warn("[chat/index] Failed to reject request:", err);
    }
  };

  const copyAjkId = async () => {
    await Clipboard.setStringAsync(ajkId);
    showToast("AJK ID copied!", "success");
  };

  const renderConversation = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={s.convRow}
      onPress={() => router.push(`/chat/${item.id}?name=${encodeURIComponent(item.otherUser?.name || T("user"))}&ajkId=${item.otherUser?.ajkId}&otherId=${item.otherUser?.id}`)}
      activeOpacity={0.7}
    >
      <View style={s.avatar}>
        <Text style={s.avatarText}>{(item.otherUser?.name || "?").charAt(0).toUpperCase()}</Text>
      </View>
      <View style={s.convInfo}>
        <View style={s.convTop}>
          <Text style={s.convName} numberOfLines={1}>{item.otherUser?.name || T("user")}</Text>
          {item.lastMessageAt && (
            <Text style={s.convTime}>{new Date(item.lastMessageAt).toLocaleDateString()}</Text>
          )}
        </View>
        <View style={s.convBottom}>
          <Text style={s.convMsg} numberOfLines={1}>{item.lastMessage?.content || "No messages yet"}</Text>
          {item.unreadCount > 0 && (
            <View style={s.badge}><Text style={s.badgeText}>{item.unreadCount > 9 ? "9+" : item.unreadCount}</Text></View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderRequest = ({ item }: { item: CommRequest }) => (
    <View style={s.reqRow}>
      <View style={s.avatar}>
        <Text style={s.avatarText}>{(item.sender?.name || "?").charAt(0).toUpperCase()}</Text>
      </View>
      <View style={s.convInfo}>
        <Text style={s.convName}>{item.sender?.name || T("unknown")}</Text>
        <Text style={s.reqRole}>{item.sender?.ajkId} · {item.sender?.roles}</Text>
      </View>
      <View style={s.reqActions}>
        <TouchableOpacity style={s.acceptBtn} onPress={() => acceptRequest(item.id)}>
          <Ionicons name="checkmark" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={s.rejectBtn} onPress={() => rejectRequest(item.id)}>
          <Ionicons name="close" size={18} color={C.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Messages</Text>
        <View style={s.headerRight}>
          {ajkId ? (
            <TouchableOpacity style={s.ajkBadge} onPress={copyAjkId}>
              <Text style={s.ajkText}>{ajkId}</Text>
              <Ionicons name="copy-outline" size={12} color={C.primary} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={s.searchBtn} onPress={() => router.push("/chat/search")}>
            <Ionicons name="search" size={22} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === "chats" && s.tabActive]} onPress={() => setTab("chats")}>
          <Text style={[s.tabText, tab === "chats" && s.tabTextActive]}>Chats</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === "requests" && s.tabActive]} onPress={() => setTab("requests")}>
          <Text style={[s.tabText, tab === "requests" && s.tabTextActive]}>
            Requests{requests.length > 0 ? ` (${requests.length})` : ""}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : tab === "chats" ? (
        <FlatList
          data={conversations}
          keyExtractor={c => c.id}
          renderItem={renderConversation}
          contentContainerStyle={conversations.length === 0 ? s.emptyContainer : { paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="chatbubbles-outline" size={64} color={C.textTertiary} />
              <Text style={s.emptyTitle}>No conversations yet</Text>
              <Text style={s.emptyDesc}>Search for users by AJK ID to start chatting</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => router.push("/chat/search")}>
                <Text style={s.emptyBtnText}>Search Users</Text>
              </TouchableOpacity>
            </View>
          }
          onRefresh={load}
          refreshing={loading}
        />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={r => r.id}
          renderItem={renderRequest}
          contentContainerStyle={requests.length === 0 ? s.emptyContainer : { paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="mail-open-outline" size={64} color={C.textTertiary} />
              <Text style={s.emptyTitle}>No pending requests</Text>
            </View>
          }
          onRefresh={load}
          refreshing={loading}
        />
      )}
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    title: { fontSize: 28, fontFamily: Font.bold, color: C.text },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    ajkBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${C.primary}15`, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.full },
    ajkText: { fontSize: 11, fontFamily: Font.bold, color: C.primary },
    searchBtn: { padding: 8 },
    tabs: { flexDirection: "row", paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
    tab: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: radii.xl, marginRight: 8 },
    tabActive: { backgroundColor: C.primary },
    tabText: { fontSize: 14, fontFamily: Font.semiBold, color: C.textSecondary },
    tabTextActive: { color: "#fff" },
    convRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: 14, gap: 12 },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primary, justifyContent: "center", alignItems: "center" },
    avatarText: { fontSize: 18, fontFamily: Font.bold, color: "#fff" },
    convInfo: { flex: 1 },
    convTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    convName: { fontSize: 15, fontFamily: Font.semiBold, color: C.text, flex: 1 },
    convTime: { fontSize: 11, fontFamily: Font.regular, color: C.textTertiary, marginLeft: 8 },
    convBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
    convMsg: { fontSize: 13, fontFamily: Font.regular, color: C.textSecondary, flex: 1 },
    badge: { backgroundColor: C.primary, width: 20, height: 20, borderRadius: 10, justifyContent: "center", alignItems: "center", marginLeft: 8 },
    badgeText: { fontSize: 10, fontFamily: Font.bold, color: "#fff" },
    reqRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: 14, gap: 12 },
    reqRole: { fontSize: 12, fontFamily: Font.regular, color: C.textTertiary },
    reqActions: { flexDirection: "row", gap: 8 },
    acceptBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.success, justifyContent: "center", alignItems: "center" },
    rejectBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: `${C.error}15`, justifyContent: "center", alignItems: "center" },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    emptyContainer: { flex: 1 },
    empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
    emptyTitle: { fontSize: 18, fontFamily: Font.semiBold, color: C.text, marginTop: 16 },
    emptyDesc: { fontSize: 14, fontFamily: Font.regular, color: C.textSecondary, textAlign: "center", marginTop: 8 },
    emptyBtn: { marginTop: 20, backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radii.xl },
    emptyBtnText: { fontSize: 14, fontFamily: Font.semiBold, color: "#fff" },
  });
}