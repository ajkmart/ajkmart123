import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { io, type Socket } from "socket.io-client";
import Colors, { spacing, radii, shadows } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { API_BASE, SOCKET_BASE, unwrapApiResponse } from "@/utils/api";
import { useSmartBack } from "@/hooks/useSmartBack";

import { useTheme } from "@/context/ThemeContext";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function isWithinSupportHours(
  schedule:
    | Record<string, { open: string; close: string; closed?: boolean }>
    | null
    | undefined,
  supportHours: string,
): { withinHours: boolean; label: string } {
  if (!schedule || Object.keys(schedule).length === 0) {
    return { withinHours: true, label: supportHours || "Support Team" };
  }
  const now = new Date();
  const dayKey = DAY_KEYS[now.getDay()];
  const dayConfig = schedule[dayKey];
  if (!dayConfig || dayConfig.closed) {
    return { withinHours: false, label: `Closed today · ${supportHours}` };
  }
  const [openH, openM] = (dayConfig.open || "00:00").split(":").map(Number);
  const [closeH, closeM] = (dayConfig.close || "23:59").split(":").map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const openMins = openH * 60 + openM;
  const closeMins = closeH * 60 + closeM;
  const withinHours = nowMins >= openMins && nowMins < closeMins;
  const label = withinHours
    ? `Open until ${dayConfig.close}`
    : `Opens at ${dayConfig.open} · ${supportHours}`;
  return { withinHours, label };
}

const SOCKET_URL = SOCKET_BASE;

const draftKey = (userId: string) => `support_chat_draft:${userId}`;
const cacheKey = (userId: string) => `support_chat_messages:${userId}`;

interface ChatMessage {
  id: string;
  userId: string;
  message: string;
  isFromSupport: boolean;
  createdAt: string;
}

export default function SupportChatScreen() {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const { goBack } = useSmartBack();
  const { config } = usePlatformConfig();

  const scheduleRecord = config.supportHoursSchedule
    ? Object.fromEntries(config.supportHoursSchedule.map(({ day, open, close }) => [day, { open, close }]))
    : null;
  const { withinHours, label: hoursLabel } = isWithinSupportHours(
    scheduleRecord,
    config.platform.supportHours,
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [connected, setConnected] = useState(false);
  const flatRef = useRef<FlatList<ChatMessage>>(null);
  const socketRef = useRef<Socket | null>(null);

  const scrollToBottom = useCallback(() => {
    if (flatRef.current) {
      setTimeout(() => {
        flatRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, []);

  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const map = new Map<string, ChatMessage>();
      for (const m of prev) map.set(m.id, m);
      for (const m of incoming) map.set(m.id, m);
      return Array.from(map.values()).sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
  }, []);

  const uid = user?.id || "anon";

  useEffect(() => {
    if (!uid || uid === "anon") return;
    // eslint-disable-next-line ajk-local/no-silent-catch -- cache read failure is non-critical; chat starts empty
    AsyncStorage.getItem(cacheKey(uid))
      .then((raw) => {
        if (raw) {
          try {
            setMessages(JSON.parse(raw));
          // eslint-disable-next-line ajk-local/no-silent-catch -- malformed cache JSON is discarded; chat starts empty
          } catch {}
        }
      })
      .catch(() => {});
    // eslint-disable-next-line ajk-local/no-silent-catch -- draft read failure is non-critical; input starts empty
    AsyncStorage.getItem(draftKey(uid))
      .then((v) => {
        if (v) setInput(v);
      })
      .catch(() => {});
  }, [uid]);

  const persistMessages = useCallback(
    (msgs: ChatMessage[]) => {
      if (!uid || uid === "anon") return;
      // eslint-disable-next-line ajk-local/no-silent-catch -- chat cache write failure is non-critical; messages are shown in-memory
      AsyncStorage.setItem(cacheKey(uid), JSON.stringify(msgs)).catch(() => {});
    },
    [uid],
  );

  useEffect(() => {
    if (messages.length > 0) persistMessages(messages);
  }, [messages, persistMessages]);

  useEffect(() => {
    if (!uid || uid === "anon") return;
    // eslint-disable-next-line ajk-local/no-silent-catch -- draft persistence failure is non-critical; input is preserved in component state
    AsyncStorage.setItem(draftKey(uid), input).catch(() => {});
  }, [input, uid]);

  const fetchMessages = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setFetchError(false);
    try {
      const resp = await fetch(`${API_BASE}/support-chat/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await resp.json();
      const data = unwrapApiResponse<{ messages: ChatMessage[] }>(json);
      const incoming = data.messages || [];
      mergeMessages(incoming);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [token, mergeMessages]);

  useEffect(() => {
    if (!token || !user) return;
    fetchMessages();

    const socket = io(SOCKET_URL, {
      auth: { token },
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
    });
    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("support_message", (msg: ChatMessage) => {
      mergeMessages([msg]);
      scrollToBottom();
    });

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") fetchMessages();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      appStateSub.remove();
    };
  }, [token, user?.id]);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !token || sending) return;
    setSending(true);
    const optimisticId = `opt_${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: optimisticId,
      userId: user?.id || "",
      message: text,
      isFromSupport: false,
      createdAt: new Date().toISOString(),
    };
    setInput("");
    // eslint-disable-next-line ajk-local/no-silent-catch -- draft cleanup failure is non-critical; message is sent regardless
    AsyncStorage.removeItem(draftKey(uid)).catch(() => {});
    mergeMessages([optimisticMsg]);
    scrollToBottom();

    try {
      const resp = await fetch(`${API_BASE}/support-chat/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: text }),
      });
      const json = await resp.json();
      if (resp.ok) {
        const saved = json?.data?.message || json?.message;
        if (saved) {
          setMessages((prev) => {
            const filtered = prev.filter((m) => m.id !== optimisticId);
            const map = new Map<string, ChatMessage>();
            for (const m of filtered) map.set(m.id, m);
            map.set(saved.id, saved);
            return Array.from(map.values()).sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime(),
            );
          });
        } else {
          await fetchMessages();
        }
      } else {
        showToast(json?.error || "Failed to send message", "error");
        setInput(text);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
    } catch {
      showToast("Failed to send message. Check connection.", "error");
      setInput(text);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  };

  if (!user || !token) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={goBack}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Support Chat</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={48} color={C.textMuted} />
          <Text style={styles.emptyTitle}>Sign In Required</Text>
          <Text style={styles.emptySub}>
            Please sign in to chat with support.
          </Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push("/auth")}
            style={styles.signInBtn}
          >
            <Text style={styles.signInBtnTxt}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = !item.isFromSupport;
    const isOptimistic = item.id.startsWith("opt_");
    const time = new Date(item.createdAt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <View
        style={[
          styles.msgRow,
          isUser ? styles.msgRowUser : styles.msgRowSupport,
        ]}
      >
        {!isUser && (
          <View style={styles.supportAvatar}>
            <Ionicons name="headset-outline" size={14} color={C.primary} />
          </View>
        )}
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleSupport,
            isOptimistic && { opacity: 0.7 },
          ]}
        >
          <Text
            style={[
              styles.bubbleTxt,
              isUser ? styles.bubbleTxtUser : styles.bubbleTxtSupport,
            ]}
          >
            {item.message}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              alignSelf: isUser ? "flex-end" : "flex-start",
            }}
          >
            <Text
              style={[
                styles.timeStamp,
                isUser
                  ? { color: "rgba(255,255,255,0.7)" }
                  : { color: C.textMuted },
              ]}
            >
              {time}
            </Text>
            {isUser && isOptimistic && (
              <Ionicons
                name="time-outline"
                size={10}
                color="rgba(255,255,255,0.5)"
              />
            )}
            {isUser && !isOptimistic && (
              <Ionicons
                name="checkmark-done-outline"
                size={10}
                color="rgba(255,255,255,0.7)"
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={goBack}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Support Chat</Text>
          <View style={styles.onlineRow}>
            <View
              style={[
                styles.onlineDot,
                {
                  backgroundColor: connected
                    ? C.emerald
                    : withinHours
                      ? C.emerald
                      : C.textMuted,
                },
              ]}
            />
            <Text style={styles.onlineTxt}>
              {connected ? "Connected" : hoursLabel}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={fetchMessages}
          style={styles.backBtn}
        >
          <Ionicons name="refresh-outline" size={20} color={C.textSecondary} />
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.infoBanner,
          !withinHours && {
            backgroundColor: "#FEF3C7",
            borderBottomColor: "#FDE68A",
          },
        ]}
      >
        <Ionicons
          name={withinHours ? "information-circle-outline" : "time-outline"}
          size={14}
          color={withinHours ? C.info : "#D97706"}
        />
        <Text
          style={[styles.infoBannerTxt, !withinHours && { color: "#92400E" }]}
        >
          {withinHours
            ? "Typical reply time: a few hours. Messages are saved across sessions."
            : `Support is currently closed. Messages are saved and we'll reply during ${config.platform.supportHours || "business hours"}.`}
        </Text>
      </View>

      {loading && messages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      ) : fetchError && messages.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name="cloud-offline-outline"
            size={48}
            color={C.textMuted}
          />
          <Text style={styles.emptyTitle}>Could not load messages</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={fetchMessages}
            style={styles.retryBtn}
          >
            <Text style={styles.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.center}>
          <div style={styles.emptyIconWrap}>
            <Ionicons name="chatbubbles-outline" size={40} color={C.primary} />
          </div>
          <Text style={styles.emptyTitle}>How can we help?</Text>
          <Text style={styles.emptySub}>
            Send a message and our support team will get back to you as soon as
            possible.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.msgList}
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View
        style={[
          styles.inputBar,
          { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 },
        ]}
      >
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message…"
          placeholderTextColor={C.textMuted}
          multiline
          maxLength={1000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleSend}
          disabled={!input.trim() || sending}
          style={[
            styles.sendBtn,
            (!input.trim() || sending) && { opacity: 0.5 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    ...shadows.sm,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceSecondary,
  },
  headerTitle: { fontFamily: Font.bold, fontSize: 16, color: C.text },
  onlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.emerald,
  },
  onlineTxt: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.infoSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  infoBannerTxt: {
    fontFamily: Font.regular,
    fontSize: 11,
    color: C.info,
    flex: 1,
    lineHeight: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: 12,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { fontFamily: Font.bold, fontSize: 16, color: C.text },
  emptySub: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: C.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  signInBtn: {
    backgroundColor: C.primary,
    borderRadius: radii.xl,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 8,
  },
  signInBtnTxt: { fontFamily: Font.bold, fontSize: 14, color: "#fff" },
  retryBtn: {
    backgroundColor: C.primary,
    borderRadius: radii.xl,
    paddingHorizontal: 28,
    paddingVertical: 10,
    marginTop: 8,
  },
  retryTxt: { fontFamily: Font.bold, fontSize: 14, color: "#fff" },
  msgList: { paddingHorizontal: spacing.lg, paddingVertical: 16, gap: 10 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowSupport: { justifyContent: "flex-start" },
  supportAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  bubbleUser: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleSupport: {
    backgroundColor: C.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: C.borderLight,
    ...shadows.sm,
  },
  bubbleTxt: { fontFamily: Font.regular, fontSize: 14, lineHeight: 20 },
  bubbleTxtUser: { color: "#fff" },
  bubbleTxtSupport: { color: C.text },
  timeStamp: { fontFamily: Font.regular, fontSize: 10 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },
  input: {
    flex: 1,
    fontFamily: Font.regular,
    fontSize: 14,
    color: C.text,
    backgroundColor: C.surfaceSecondary,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  });
}
