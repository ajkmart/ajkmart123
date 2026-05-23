import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { createLogger } from "@/utils/logger";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { io, type Socket } from "socket.io-client";
import Colors, { spacing, radii, shadows } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useTheme } from "@/context/ThemeContext";
import { API_BASE, SOCKET_BASE } from "@/utils/api";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
const log = createLogger("[Chat]");

const SOCKET_URL = SOCKET_BASE;

interface Message {
  id: string;
  content: string;
  senderId: string;
  messageType: string;
  createdAt: string;
  deliveryStatus: string;
}

interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

interface CallSignal {
  callId: string;
  callerName?: string;
  callerId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export default function ChatDetailScreen() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const { colors: C } = useTheme();
  const st = useMemo(() => makeStyles(C), [C]);
  const { id, name, ajkId: otherAjkId, otherId } = useLocalSearchParams<{ id: string; name: string; ajkId: string; otherId: string }>();
  const insets = useSafeAreaInsets();
  const { token, user, refreshToken } = useAuth();
  const { showToast } = useToast();
  const { goBack } = useSmartBack();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [callId, setCallId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const flatRef = useRef<FlatList<Message>>(null);
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const trickleIceRef = useRef<boolean>(true);

  const apiFetch = useCallback(async (path: string, opts: RequestInit = {}) => {
    const doRequest = async (authToken: string | null) =>
      fetch(`${API_BASE}/communication${path}`, {
        ...opts,
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          ...(opts.headers as Record<string, string>),
        },
      });

    let res = await doRequest(token);

    if (res.status === 401) {
      const newToken = await refreshToken();
      if (newToken) {
        res = await doRequest(newToken);
      }
      if (res.status === 401) {
        showToast("Session expired. Please sign in again.", "error");
        throw new Error("Unauthorized");
      }
    }

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed");
    return json.data !== undefined ? json.data : json;
  }, [token, refreshToken, showToast]);

  const cleanupPeerConnection = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  const endCall = useCallback(() => {
    if (callId) {
      apiFetch(`/calls/${callId}/end`, { method: "POST", body: JSON.stringify({ duration: callTimer }) }).catch((err) => { log.warn("[Chat] Failed to end call:", err); });
      if (otherId) socketRef.current?.emit("comm:call:end", { callId, targetUserId: otherId });
    }
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupPeerConnection();
    setCallActive(false);
    setCallId(null);
    setCallTimer(0);
    setMuted(false);
  }, [callId, callTimer, otherId, apiFetch, cleanupPeerConnection]);

  const createPeerConnection = useCallback((iceServers: IceServer[], targetUserId: string, activeCallId: string, trickleIce: boolean = true) => {
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 10 });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate && trickleIce) {
        socketRef.current?.emit("comm:call:ice-candidate", { callId: activeCallId, targetUserId, candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      if (Platform.OS === "web") {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        // eslint-disable-next-line ajk-local/no-silent-catch -- browser autoplay policy may block audio; silently ignored
        audio.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        endCall();
      }
    };

    return pc;
  }, [endCall]);

  useEffect(() => {
    const loadMessages = async () => {
      setLoading(true);
      try {
        const msgs = await apiFetch(`/conversations/${id}/messages`);
        setMessages(msgs);
        await apiFetch(`/conversations/${id}/read-all`, { method: "PATCH" });
      } catch (err) {
        log.warn("Failed to load messages:", err instanceof Error ? err.message : String(err));
      }
      setLoading(false);
    };
    loadMessages();

    const socket = io(SOCKET_URL, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["polling", "websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join", `conversation:${id}`);
    });

    socket.on("comm:message:new", (msg: Message) => {
      setMessages(prev => {
        const exists = prev.some(m => m.id === msg.id);
        return exists ? prev : [...prev, msg];
      });
    });
    socket.on("comm:typing:start", () => setTyping(true));
    socket.on("comm:typing:stop", () => setTyping(false));
    socket.on("comm:message:read", () => {
      setMessages(prev => prev.map(m => ({ ...m, deliveryStatus: "read" })));
    });
    socket.on("comm:call:incoming", (data: CallSignal) => {
      Alert.alert("Incoming Call", `${data.callerName || "Someone"} is calling`, [
        { text: T("reject"), style: "destructive", onPress: () => apiFetch(`/calls/${data.callId}/reject`, { method: "POST" }) },
        { text: "Answer", onPress: () => answerIncoming(data.callId, data.callerId || "") },
      ]);
    });
    socket.on("comm:call:ended", () => endCall());
    socket.on("comm:call:answered", () => {
      setCallActive(true);
      setCallTimer(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);
    });
    socket.on("comm:request:cancelled", () => {});
    socket.on("comm:request:rejected", () => {});
    socket.on("comm:message:sent", (data: { id: string }) => {
      setMessages(prev => prev.map(m => m.id === data.id ? { ...m, deliveryStatus: "sent" } : m));
    });
    socket.on("comm:messages:read-all", () => {
      setMessages(prev => prev.map(m => ({ ...m, deliveryStatus: "read" })));
    });

    socket.on("comm:call:offer", async (data: CallSignal) => {
      if (!pcRef.current || !data.sdp) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        if (!trickleIceRef.current) {
          await new Promise<void>(resolve => {
            const pc = pcRef.current;
            if (!pc) { resolve(); return; }
            pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") resolve(); };
            setTimeout(resolve, 5000);
          });
        }
        socket.emit("comm:call:answer", { callId: data.callId, targetUserId: data.callerId, sdp: pcRef.current?.localDescription });
      } catch (err) {
        log.warn("WebRTC offer handling failed:", err instanceof Error ? err.message : String(err));
        showToast("Call connection failed. Please try again.", "error");
      }
    });

    socket.on("comm:call:answer", async (data: CallSignal) => {
      if (!pcRef.current || !data.sdp) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } catch (err) {
        log.warn("WebRTC answer handling failed:", err instanceof Error ? err.message : String(err));
      }
    });

    socket.on("comm:call:ice-candidate", async (data: CallSignal) => {
      if (!pcRef.current || !data.candidate) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        log.warn("ICE candidate handling failed:", err instanceof Error ? err.message : String(err));
      }
    });

    return () => { socket.disconnect(); };
  }, [id, token]);

  const answerIncoming = async (inCallId: string, callerId: string) => {
    try {
      const answerData = await apiFetch(`/calls/${inCallId}/answer`, { method: "POST" });
      setCallId(inCallId);
      setCallActive(true);
      setCallTimer(0);
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);

      const iceServers: IceServer[] = answerData.iceServers || [{ urls: "stun:stun.l.google.com:19302" }];
      const trickleIce: boolean = answerData.trickleIce !== false;
      trickleIceRef.current = trickleIce;

      if (Platform.OS === "web") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        localStreamRef.current = stream;
        const pc = createPeerConnection(iceServers, callerId, inCallId, trickleIce);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
      } else {
        createPeerConnection(iceServers, callerId, inCallId, trickleIce);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Answer failed";
      showToast(msg, "error");
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const msg = await apiFetch(`/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: input.trim(), messageType: "text" }),
      });
      setMessages(prev => [...prev, msg]);
      setInput("");
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Send failed";
      showToast(msg, "error");
    }
    setSending(false);
  };

  const startCall = async () => {
    try {
      const data = await apiFetch("/calls/initiate", {
        method: "POST",
        body: JSON.stringify({ calleeId: otherId, conversationId: id }),
      });
      setCallId(data.callId);
      setCallActive(true);
      setCallTimer(0);
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);

      const iceServers: IceServer[] = data.iceServers || [{ urls: "stun:stun.l.google.com:19302" }];
      const trickleIce: boolean = data.trickleIce !== false;

      if (Platform.OS === "web") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        localStreamRef.current = stream;
        const pc = createPeerConnection(iceServers, otherId || "", data.callId, trickleIce);
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (!trickleIce) {
          await new Promise<void>(resolve => {
            pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") resolve(); };
            setTimeout(resolve, 5000);
          });
        }
        socketRef.current?.emit("comm:call:offer", { callId: data.callId, targetUserId: otherId, sdp: pc.localDescription });
      } else {
        createPeerConnection(iceServers, otherId || "", data.callId, trickleIce);
      }

      showToast("Call started", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Call failed";
      showToast(msg, "error");
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMuted(!audioTrack.enabled);
      }
    }
  };

  const translateMessage = async (text: string) => {
    try {
      const data = await apiFetch("/translate", { method: "POST", body: JSON.stringify({ text, targetLang: "english" }) });
      showToast(`Translation: ${data.translated}`, "success");
    } catch { showToast("Translation failed", "error"); }
  };

  const onTyping = () => {
    socketRef.current?.emit("comm:typing:start", { conversationId: id, userId: user?.id });
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.senderId === user?.id;
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onLongPress={() => !isMine && translateMessage(item.content)}
        style={[st.msgWrap, isMine ? st.msgMine : st.msgTheirs]}
      >
        <View style={[st.msgBubble, isMine ? st.bubbleMine : st.bubbleTheirs]}>
          <Text style={[st.msgText, isMine && st.msgTextMine]}>{item.content}</Text>
          <View style={st.msgMeta}>
            <Text style={[st.msgTime, isMine && st.msgTimeMine]}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
            {isMine && (
              <Ionicons
                name={item.deliveryStatus === "read" ? "checkmark-done" : "checkmark"}
                size={14}
                color={isMine ? "rgba(255,255,255,0.7)" : C.textTertiary}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[st.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={st.header}>
        <TouchableOpacity onPress={goBack} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={st.headerInfo}>
          <Text style={st.headerName} numberOfLines={1}>{name || T("user")}</Text>
          <Text style={st.headerMeta}>{otherAjkId}{typing ? " · typing..." : ""}</Text>
        </View>
        <TouchableOpacity style={st.callBtn} onPress={startCall} disabled={callActive}>
          <Ionicons name="call" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {callActive && (
        <View style={st.callBar}>
          <TouchableOpacity onPress={toggleMute} style={st.muteBtn}>
            <Ionicons name={muted ? "mic-off" : "mic"} size={18} color="#fff" />
          </TouchableOpacity>
          <Text style={st.callText}>Call Active — {fmt(callTimer)}</Text>
          <TouchableOpacity style={st.endCallBtn} onPress={endCall}>
            <Text style={st.endCallText}>End</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 8 }}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={st.emptyChat}>
              <Ionicons name="chatbubble-outline" size={48} color={C.textTertiary} />
              <Text style={st.emptyChatText}>No messages yet. Say hello!</Text>
            </View>
          }
        />
      )}

      <View style={[st.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TextInput
          style={st.input}
          placeholder="Type a message..."
          placeholderTextColor={C.textTertiary}
          value={input}
          onChangeText={t => { setInput(t); onTyping(); }}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[st.sendBtn, (!input.trim() || sending) && st.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || sending}
        >
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 },
    backBtn: { padding: 4 },
    headerInfo: { flex: 1 },
    headerName: { fontSize: 17, fontFamily: Font.semiBold, color: C.text },
    headerMeta: { fontSize: 12, fontFamily: Font.regular, color: C.textSecondary },
    callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.success, justifyContent: "center", alignItems: "center" },
    callBar: { flexDirection: "row", alignItems: "center", backgroundColor: C.success, paddingHorizontal: spacing.lg, paddingVertical: 10, gap: 8 },
    callText: { flex: 1, fontSize: 14, fontFamily: Font.bold, color: "#fff" },
    muteBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.2)", justifyContent: "center", alignItems: "center" },
    endCallBtn: { backgroundColor: C.error, paddingHorizontal: 16, paddingVertical: 6, borderRadius: radii.lg },
    endCallText: { fontSize: 13, fontFamily: Font.bold, color: "#fff" },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    msgWrap: { marginBottom: 6 },
    msgMine: { alignItems: "flex-end" },
    msgTheirs: { alignItems: "flex-start" },
    msgBubble: { maxWidth: "78%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
    bubbleMine: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
    bubbleTheirs: { backgroundColor: C.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.border },
    msgText: { fontSize: 15, fontFamily: Font.regular, color: C.text, lineHeight: 21 },
    msgTextMine: { color: "#fff" },
    msgMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    msgTime: { fontSize: 10, fontFamily: Font.regular, color: C.textTertiary },
    msgTimeMine: { color: "rgba(255,255,255,0.7)" },
    emptyChat: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 80 },
    emptyChatText: { fontSize: 15, fontFamily: Font.regular, color: C.textSecondary, marginTop: 12 },
    inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: spacing.md, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface, gap: 8 },
    input: { flex: 1, fontSize: 15, fontFamily: Font.regular, color: C.text, backgroundColor: C.background, borderRadius: radii.xl, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100, borderWidth: 1, borderColor: C.border },
    sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.primary, justifyContent: "center", alignItems: "center" },
    sendBtnDisabled: { opacity: 0.5 },
  });
}
