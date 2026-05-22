import { createLogger } from "@/lib/logger";
import { Bot, Flag, MoreVertical, Paperclip, Send, Sparkles, Trash2, UserX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { api } from "../lib/api";
import { playRequestSound, stopSound } from "../lib/notificationSound";
import { setAiTabActive } from "../lib/push";
import { useAuth } from "../lib/rider-auth";
import { useSocket } from "../lib/socket";
const log = createLogger("[Chat]");

interface OtherUser {
  id: string;
  name: string | null;
  ajkId: string | null;
}
interface Conversation {
  id: string;
  otherUser: OtherUser;
  lastMessage: { content: string } | null;
  unreadCount: number;
  lastMessageAt: string | null;
}
interface Message {
  id: string;
  content: string;
  senderId: string;
  messageType: string;
  createdAt: string;
  deliveryStatus: string;
  voiceNoteUrl?: string;
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
}
interface CommRequest {
  id: string;
  status: string;
  sender?: { name: string; ajkId: string };
}
interface SearchResult {
  id: string;
  name: string;
  ajkId: string;
  role: string;
}
interface IncomingCallData {
  callId: string;
  callerId: string;
  callerName?: string;
  callerAjkId?: string;
}
interface CallSignal {
  callId: string;
  callerId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}
interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export default function Chat() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const search = useSearch();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [searchId, setSearchId] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [sending, setSending] = useState(false);
  const [ajkId, setAjkId] = useState("");
  const [requests, setRequests] = useState<CommRequest[]>([]);

  /* Pre-select the AI tab when the page is opened with ?tab=ai (notification tap) */
  const [tab, setTab] = useState<"chats" | "requests" | "search" | "ai">(() => {
    try {
      const params = new URLSearchParams(search);
      if (params.get("tab") === "ai") return "ai";
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "[Chat] URLSearchParams parse failed — defaulting to chats tab"
      );
    }
    return "chats";
  });
  const [typing, setTyping] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [callTimer, setCallTimer] = useState(0);
  const [muted, setMuted] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  /* AI Assistant state */
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiScrollRef = useRef<HTMLDivElement>(null);

  /* When the URL query string changes to ?tab=ai (e.g. rider is already on
     /chat and taps an AI reply notification), switch to the AI Help tab
     immediately without remounting the component. */
  useEffect(() => {
    try {
      const params = new URLSearchParams(search);
      if (params.get("tab") === "ai") setTab("ai");
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "[Chat] tab sync URLSearchParams parse failed"
      );
    }
  }, [search]);

  /* Notify push.ts whether the AI Help tab is currently the active, visible tab.
     This lets the foreground push handler suppress redundant ai_chat banners
     while the rider is already reading the reply. */
  useEffect(() => {
    const isActive = tab === "ai" && !selectedConv;
    setAiTabActive(isActive);
    return () => {
      setAiTabActive(false);
    };
  }, [tab, selectedConv]);

  /* File upload + overflow menu state */
  const [uploading, setUploading] = useState(false);
  const [showConvMenu, setShowConvMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trickleIceRef = useRef<boolean | null>(null);

  /* Initialize remote audio element (reused for all tracks) */
  useEffect(() => {
    if (!remoteAudioRef.current) {
      const audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      remoteAudioRef.current = audio;
    }
  }, []);

  const loadConversations = useCallback(() => {
    api
      .apiFetch("/communication/conversations")
      .then(setConversations)
      .catch((err) => {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "[Chat] loadConversations failed"
        );
      });
  }, []);

  const loadRequests = useCallback(() => {
    api
      .apiFetch("/communication/requests?type=received")
      .then(setRequests)
      .catch((err) => {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "[Chat] loadRequests failed"
        );
      });
  }, []);

  const endCall = useCallback(() => {
    stopSound();
    if (callId) {
      api
        .apiFetch(`/communication/calls/${callId}/end`, {
          method: "POST",
          body: JSON.stringify({ duration: callTimer }),
        })
        .catch((err) => {
          log.error(
            { err: err instanceof Error ? err.message : String(err) },
            "[Chat] endCall API failed"
          );
        });
      const otherId = selectedConv?.otherUser?.id;
      if (otherId && socket) socket.emit("comm:call:end", { callId, targetUserId: otherId });
    }
    /* Clean up peer connection, media streams, and timer */
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCallActive(false);
    setCallId(null);
    setCallTimer(0);
    setIncomingCall(null);
    trickleIceRef.current = null;
  }, [callId, callTimer, selectedConv, socket]);

  /* Keep a ref that always points at the latest endCall so socket
     event handlers registered on mount don't capture a stale closure. */
  const endCallRef = useRef(endCall);
  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  /* Stable handler refs — updated every render so closures are always current
     without needing to re-register listeners (which would remove ALL listeners
     for the event, including those registered by other mounted components). */
  const handlersRef = useRef<{
    onMessageNew: (msg: Message) => void;
    onTypingStart: () => void;
    onTypingStop: () => void;
    onMessageRead: () => void;
    onRequestNew: () => void;
    onRequestAccepted: () => void;
    onCallIncoming: (data: IncomingCallData) => Promise<void>;
    onCallEnded: () => void;
    onCallRejected: () => void;
    onCallOffer: (data: CallSignal) => Promise<void>;
    onCallAnswer: (data: CallSignal) => Promise<void>;
    onCallIce: (data: CallSignal) => Promise<void>;
    onCallAnswered: (data: { callId: string }) => void;
    onRequestCancelled: () => void;
    onRequestRejected: () => void;
    onMessageSent: (data: { id: string; conversationId: string }) => void;
    onMessagesReadAll: (data: { conversationId: string }) => void;
  } | null>(null);

  /* Socket event listeners - keyed on user?.id to rebind on user change */
  useEffect(() => {
    if (!socket || !user?.id) return;

    api
      .apiFetch("/communication/me/ajk-id")
      .then((d) => setAjkId(d.ajkId))
      .catch((err) => {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "[Chat] fetchAjkId failed"
        );
      });
    loadConversations();
    loadRequests();

    const onMessageNew = (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
      loadConversations();
    };
    const onTypingStart = () => setTyping(true);
    const onTypingStop = () => setTyping(false);
    const onMessageRead = () =>
      setMessages((prev) => prev.map((m) => ({ ...m, deliveryStatus: "read" })));
    const onRequestNew = () => loadRequests();
    const onRequestAccepted = () => {
      loadConversations();
      loadRequests();
    };
    const onCallIncoming = async (data: IncomingCallData) => {
      setIncomingCall(data);
      playRequestSound();
    };
    const onCallEnded = () => {
      stopSound();
      endCallRef.current();
    };
    const onCallRejected = () => {
      stopSound();
      endCallRef.current();
    };
    const onCallOffer = async (data: CallSignal) => {
      if (!pcRef.current || !data.sdp) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      if (trickleIceRef.current === false) {
        await new Promise<void>((resolve) => {
          if (!pcRef.current) {
            resolve();
            return;
          }
          pcRef.current.onicegatheringstatechange = () => {
            if (pcRef.current?.iceGatheringState === "complete") resolve();
          };
          setTimeout(resolve, 5000);
        });
      }
      socket.emit("call:signal", {
        type: "answer",
        callId: data.callId,
        targetUserId: data.callerId,
        sdp: pcRef.current?.localDescription,
      });
    };
    const onCallAnswer = async (data: CallSignal) => {
      if (!pcRef.current || !data.sdp) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
    };
    const onCallIce = async (data: CallSignal) => {
      if (!pcRef.current || !data.candidate) return;
      await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    };

    const onCallAnswered = (_data: { callId: string }) => {
      setCallActive(true);
      setCallTimer(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);
    };
    const onRequestCancelled = () => loadRequests();
    const onRequestRejected = () => loadRequests();
    const onMessageSent = (data: { id: string; conversationId: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.id ? { ...m, deliveryStatus: "sent" } : m))
      );
    };
    const onMessagesReadAll = (_data: { conversationId: string }) => {
      setMessages((prev) => prev.map((m) => ({ ...m, deliveryStatus: "read" })));
    };

    handlersRef.current = {
      onMessageNew,
      onTypingStart,
      onTypingStop,
      onMessageRead,
      onRequestNew,
      onRequestAccepted,
      onCallIncoming,
      onCallEnded,
      onCallRejected,
      onCallOffer,
      onCallAnswer,
      onCallIce,
      onCallAnswered,
      onRequestCancelled,
      onRequestRejected,
      onMessageSent,
      onMessagesReadAll,
    };

    /* Alias handler: `comm:typing` with { isTyping } dispatches to start/stop */
    const onTyping = (data: { isTyping: boolean; userId: string; conversationId: string }) => {
      if (data.isTyping) onTypingStart();
      else onTypingStop();
    };
    /* Alias handler: `call:signal` dispatches SDP offer/answer and ICE candidates */
    const onCallSignal = (data: {
      type: "offer" | "answer" | "ice-candidate";
      callId: string;
      sdp?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
      callerId?: string;
      targetUserId?: string;
    }) => {
      if (data.type === "offer") void onCallOffer(data as CallSignal);
      else if (data.type === "answer") void onCallAnswer(data as CallSignal);
      else if (data.type === "ice-candidate") void onCallIce(data as CallSignal);
    };

    /* Primary event names (match the server implementation).
       Note: comm:call:offer/answer/ice-candidate listeners are replaced by
       the single call:signal listener below — outgoing signals now emit
       call:signal so the server routes via its canonical call:signal handler. */
    socket.on("comm:message:new", onMessageNew);
    socket.on("comm:typing:start", onTypingStart);
    socket.on("comm:typing:stop", onTypingStop);
    socket.on("comm:message:read", onMessageRead);
    socket.on("comm:request:new", onRequestNew);
    socket.on("comm:request:accepted", onRequestAccepted);
    socket.on("comm:call:incoming", onCallIncoming);
    socket.on("comm:call:ended", onCallEnded);
    socket.on("comm:call:rejected", onCallRejected);
    socket.on("comm:call:answered", onCallAnswered);
    socket.on("comm:request:cancelled", onRequestCancelled);
    socket.on("comm:request:rejected", onRequestRejected);
    socket.on("comm:message:sent", onMessageSent);
    socket.on("comm:messages:read-all", onMessagesReadAll);
    /* Spec-mandated aliases — handled in parallel so either name works */
    socket.on("comm:message", onMessageNew);
    socket.on("comm:typing", onTyping);
    socket.on("call:incoming", onCallIncoming);
    /* call:signal is the canonical SDP/ICE signaling event (offer/answer/ice-candidate) */
    socket.on("call:signal", onCallSignal);

    return () => {
      const h = handlersRef.current;
      if (!h) return;
      socket.off("comm:message:new", h.onMessageNew);
      socket.off("comm:typing:start", h.onTypingStart);
      socket.off("comm:typing:stop", h.onTypingStop);
      socket.off("comm:message:read", h.onMessageRead);
      socket.off("comm:request:new", h.onRequestNew);
      socket.off("comm:request:accepted", h.onRequestAccepted);
      socket.off("comm:call:incoming", h.onCallIncoming);
      socket.off("comm:call:ended", h.onCallEnded);
      socket.off("comm:call:rejected", h.onCallRejected);
      socket.off("comm:call:answered", h.onCallAnswered);
      socket.off("comm:request:cancelled", h.onRequestCancelled);
      socket.off("comm:request:rejected", h.onRequestRejected);
      socket.off("comm:message:sent", h.onMessageSent);
      socket.off("comm:messages:read-all", h.onMessagesReadAll);
      socket.off("comm:message", h.onMessageNew);
      socket.off("comm:typing", onTyping);
      socket.off("call:incoming", h.onCallIncoming);
      socket.off("call:signal", onCallSignal);
      handlersRef.current = null;
    };
  }, [socket, user?.id, loadConversations, loadRequests]);

  const selectConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
    setShowConvMenu(false);
    if (socket) socket.emit("join", `conversation:${conv.id}`);
    try {
      const msgs = await api.apiFetch(`/communication/conversations/${conv.id}/messages`);
      setMessages(msgs);
      await api.apiFetch(`/communication/conversations/${conv.id}/read-all`, { method: "PATCH" });
      setSendError(null);
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to load messages");
    }
    setTimeout(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo(0, el.scrollHeight);
    }, 100);
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedConv || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const msg = await api.apiFetch(`/communication/conversations/${selectedConv.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: input, messageType: "text" }),
      });
      setMessages((prev) => [...prev, msg]);
      setInput("");
      loadConversations();
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to send message");
    }
    setSending(false);
  };

  /* ── File / image attachment ── */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv) return;
    setUploading(true);
    setSendError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const uploaded = await api.uploadFile({
        file: base64,
        filename: file.name,
        mimeType: file.type,
      });
      const isImage = file.type.startsWith("image/");
      const msg = await api.apiFetch(`/communication/conversations/${selectedConv.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: isImage ? "[image]" : `[file: ${file.name}]`,
          messageType: isImage ? "image" : "file",
          ...(isImage
            ? { imageUrl: uploaded.url }
            : { fileUrl: uploaded.url, fileName: file.name }),
        }),
      });
      setMessages((prev) => [...prev, msg]);
      loadConversations();
      setTimeout(() => {
        const el = scrollRef.current;
        if (el) el.scrollTo(0, el.scrollHeight);
      }, 100);
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to upload file");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ── Block user ── */
  const handleBlock = async () => {
    if (!selectedConv) return;
    setShowConvMenu(false);
    try {
      await api.apiFetch("/communication/block", {
        method: "POST",
        body: JSON.stringify({ blockedUserId: selectedConv.otherUser.id }),
      });
      setSelectedConv(null);
      loadConversations();
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to block user");
    }
  };

  /* ── Report user ── */
  const handleReport = async () => {
    if (!selectedConv || !reportReason.trim()) return;
    setShowReportModal(false);
    try {
      await api.apiFetch("/communication/report", {
        method: "POST",
        body: JSON.stringify({ reportedUserId: selectedConv.otherUser.id, reason: reportReason }),
      });
      setReportReason("");
      setSendError(null);
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to report user");
    }
  };

  const searchUser = async () => {
    if (!searchId.trim()) return;
    try {
      const result = await api.apiFetch(`/communication/search/${searchId.toUpperCase()}`);
      setSearchResult(result);
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "[Chat] searchUser failed"
      );
    }
  };

  const sendRequest = async (receiverId: string) => {
    try {
      await api.apiFetch("/communication/requests", {
        method: "POST",
        body: JSON.stringify({ receiverId }),
      });
      setSearchResult(null);
      setSearchId("");
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to send request");
    }
  };

  const acceptRequest = async (id: string) => {
    try {
      await api.apiFetch(`/communication/requests/${id}/accept`, { method: "PATCH" });
      loadRequests();
      loadConversations();
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to accept request");
    }
  };

  const rejectRequest = async (id: string) => {
    try {
      await api.apiFetch(`/communication/requests/${id}/reject`, { method: "PATCH" });
      loadRequests();
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to reject request");
    }
  };

  const startCall = async (calleeId: string) => {
    try {
      if (pcRef.current) pcRef.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());

      const data = await api.apiFetch("/communication/calls/initiate", {
        method: "POST",
        body: JSON.stringify({ calleeId, conversationId: selectedConv?.id }),
      });

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch (mediaErr) {
        setSendError((mediaErr as Error)?.message || "Microphone access denied");
        return;
      }
      localStreamRef.current = stream;

      setCallId(data.callId);
      setCallActive(true);
      timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);
      const trickleIce = data.trickleIce !== false;
      trickleIceRef.current = trickleIce;

      const pc = new RTCPeerConnection({ iceServers: data.iceServers, iceCandidatePoolSize: 10 });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate && trickleIce && socket) {
          socket.emit("call:signal", {
            type: "ice-candidate",
            callId: data.callId,
            targetUserId: calleeId,
            candidate: e.candidate,
          });
        }
      };

      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
          remoteAudioRef.current.play().catch((err) => {
            log.error(
              { err: err instanceof Error ? err.message : String(err) },
              "[Chat] remoteAudio.play (call) failed"
            );
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!trickleIce) {
        await new Promise<void>((resolve) => {
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === "complete") resolve();
          };
          setTimeout(resolve, 5000);
        });
      }
      socket?.emit("call:signal", {
        type: "offer",
        callId: data.callId,
        targetUserId: calleeId,
        sdp: pc.localDescription,
      });
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to start call");
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
      setMuted(!muted);
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleAcceptCall = async () => {
    try {
      if (!incomingCall) return;
      if (pcRef.current) pcRef.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());

      const ad = await api.apiFetch(`/communication/calls/${incomingCall.callId}/answer`, {
        method: "POST",
      });
      setCallActive(true);
      setCallId(incomingCall.callId);
      timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localStreamRef.current = stream;
      const trickleIce = ad.trickleIce !== false;
      trickleIceRef.current = trickleIce;

      const pc = new RTCPeerConnection({
        iceServers: ad.iceServers || [{ urls: "stun:stun.l.google.com:19302" }],
        iceCandidatePoolSize: 10,
      });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate && trickleIce && socket) {
          socket.emit("comm:call:ice-candidate", {
            callId: incomingCall.callId,
            targetUserId: incomingCall.callerId,
            candidate: e.candidate,
          });
        }
      };

      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
          remoteAudioRef.current.play().catch((err) => {
            log.error(
              { err: err instanceof Error ? err.message : String(err) },
              "[Chat] remoteAudio.play (answer) failed"
            );
          });
        }
      };

      setIncomingCall(null);
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to answer call");
    }
  };

  /* ── AI Assistant ── */
  const sendAiMessage = async () => {
    const text = aiInput.trim();
    if (!text || aiLoading) return;

    const userMsg: AiMessage = { role: "user", content: text };
    const newHistory = [...aiMessages, userMsg];
    setAiMessages(newHistory);
    setAiInput("");
    setAiLoading(true);

    try {
      const result = await api.aiChat(text, newHistory.slice(-10));
      setAiMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "[Chat] aiChat API failed"
      );
    } finally {
      setAiLoading(false);
      setTimeout(() => aiScrollRef.current?.scrollTo(0, aiScrollRef.current.scrollHeight), 100);
    }
  };

  const SUGGESTED_QUESTIONS = [
    "How do I increase my earnings?",
    "How does the wallet withdrawal work?",
    "What should I do if a customer isn't available?",
    "How do I report a problem with an order?",
  ];

  return (
    <div className="flex h-full flex-col bg-white">
      {incomingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="mx-4 w-full max-w-sm rounded-3xl bg-white p-8 text-center">
            <div className="mb-4 text-6xl">📞</div>
            <h2 className="mb-2 text-xl font-bold">Incoming Call</h2>
            <p className="mb-6 text-gray-500">
              {incomingCall.callerName} ({incomingCall.callerAjkId})
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={async () => {
                  const captured = incomingCall;
                  setIncomingCall(null);
                  stopSound();
                  if (captured) {
                    try {
                      await api.apiFetch(`/communication/calls/${captured.callId}/reject`, {
                        method: "POST",
                      });
                    } catch (e) {
                      setSendError((e as Error)?.message || "Failed to reject call");
                    }
                  }
                }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-2xl text-white"
              >
                ✕
              </button>
              <button
                onClick={handleAcceptCall}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-2xl text-white"
              >
                📞
              </button>
            </div>
          </div>
        </div>
      )}

      {callActive && (
        <div className="flex items-center justify-between bg-green-600 px-4 py-3 text-white">
          <span className="font-bold">🔊 Call Active — {fmt(callTimer)}</span>
          <div className="flex gap-2">
            <button
              onClick={toggleMute}
              className={`rounded-lg px-3 py-1 text-sm font-bold ${muted ? "bg-red-500" : "bg-white/20"}`}
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button onClick={endCall} className="rounded-lg bg-red-500 px-3 py-1 text-sm font-bold">
              End
            </button>
          </div>
        </div>
      )}

      <div className="px-4 pt-4 pb-2">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-gray-800">💬 Messages</h1>
          {ajkId && (
            <button
              onClick={() => navigator.clipboard.writeText(ajkId)}
              className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700"
            >
              {ajkId} 📋
            </button>
          )}
        </div>
        {!selectedConv && (
          <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
            {(["chats", "requests", "search", "ai"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex flex-shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition ${tab === t ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600"}`}
              >
                {t === "ai" && <Sparkles size={13} />}
                {t === "chats"
                  ? "Chats"
                  : t === "requests"
                    ? `Requests${requests.length ? ` (${requests.length})` : ""}`
                    : t === "search"
                      ? "Search"
                      : "AI Help"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        className={`flex-1 overflow-y-auto px-4 ${tab === "ai" && !selectedConv ? "flex flex-col" : ""}`}
        ref={tab === "ai" ? undefined : scrollRef}
      >
        {selectedConv ? (
          <div className="flex h-full flex-col">
            {/* Conversation header */}
            <div className="mb-3 flex items-center gap-3 border-b py-3">
              <button
                onClick={() => {
                  setSelectedConv(null);
                  setShowConvMenu(false);
                }}
                className="font-bold text-emerald-500"
              >
                ← Back
              </button>
              <div className="flex-1">
                <p className="font-bold text-gray-800">{selectedConv.otherUser?.name || "User"}</p>
                <p className="text-xs text-gray-400">{selectedConv.otherUser?.ajkId}</p>
              </div>
              <button
                onClick={() => startCall(selectedConv.otherUser?.id)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-lg text-white"
              >
                📞
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowConvMenu((v) => !v)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 transition-colors active:bg-gray-200"
                >
                  <MoreVertical size={18} className="text-gray-600" />
                </button>
                {showConvMenu && (
                  <div className="absolute top-12 right-0 z-50 min-w-[160px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
                    <button
                      onClick={() => {
                        setShowConvMenu(false);
                        setShowReportModal(true);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
                    >
                      <Flag size={15} className="text-amber-500" /> Report User
                    </button>
                    <button
                      onClick={handleBlock}
                      className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3 text-sm text-red-600 transition-colors hover:bg-red-50 active:bg-red-100"
                    >
                      <UserX size={15} /> Block User
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Message list */}
            <div className="flex-1 space-y-2 overflow-y-auto pb-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.senderId === user?.id ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${msg.senderId === user?.id ? "rounded-br-md bg-emerald-500 text-white" : "rounded-bl-md bg-gray-100 text-gray-800"}`}
                  >
                    {msg.messageType === "image" && msg.imageUrl ? (
                      <img
                        src={msg.imageUrl}
                        alt="Shared image"
                        className="mb-1 max-h-48 max-w-full rounded-lg object-cover"
                      />
                    ) : msg.messageType === "file" && msg.fileUrl ? (
                      <a
                        href={msg.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-2 text-sm underline ${msg.senderId === user?.id ? "text-emerald-100" : "text-blue-600"}`}
                      >
                        <Paperclip size={13} /> {msg.fileName || "File"}
                      </a>
                    ) : (
                      <p className="text-sm">{msg.content}</p>
                    )}
                    <span
                      className={`text-[10px] ${msg.senderId === user?.id ? "text-emerald-200" : "text-gray-400"}`}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {msg.senderId === user?.id && (msg.deliveryStatus === "read" ? " ✓✓" : " ✓")}
                    </span>
                  </div>
                </div>
              ))}
              {typing && <div className="text-xs text-gray-400 italic">typing...</div>}
            </div>
          </div>
        ) : tab === "chats" ? (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-gray-50"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-lg font-bold text-white">
                  {(conv.otherUser?.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between">
                    <p className="truncate font-bold">{conv.otherUser?.name || "User"}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm text-gray-500">
                      {conv.lastMessage?.content || "No messages"}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {conversations.length === 0 && (
              <div className="py-12 text-center">
                <p className="mb-4 text-5xl">💬</p>
                <p className="font-bold text-gray-600">No conversations yet</p>
              </div>
            )}
          </div>
        ) : tab === "requests" ? (
          <div className="space-y-2">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-2xl bg-gray-50 p-4"
              >
                <div>
                  <p className="font-bold">{req.sender?.name || "Unknown"}</p>
                  <p className="text-xs text-gray-400">{req.sender?.ajkId}</p>
                </div>
                {req.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptRequest(req.id)}
                      className="rounded-xl bg-green-500 px-4 py-2 text-sm font-bold text-white"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => rejectRequest(req.id)}
                      className="rounded-xl bg-red-100 px-4 py-2 text-sm font-bold text-red-600"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
            {requests.length === 0 && (
              <p className="py-12 text-center text-gray-400">No pending requests</p>
            )}
          </div>
        ) : tab === "search" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="Enter AJK ID"
                className="h-12 flex-1 rounded-xl border px-4 outline-none"
              />
              <button
                onClick={searchUser}
                className="h-12 rounded-xl bg-emerald-500 px-6 text-sm font-bold text-white"
              >
                Search
              </button>
            </div>
            {searchResult && (
              <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-4">
                <div>
                  <p className="font-bold">{searchResult.name}</p>
                  <p className="text-xs text-gray-400">
                    {searchResult.ajkId} · {searchResult.role}
                  </p>
                </div>
                <button
                  onClick={() => sendRequest(searchResult.id)}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white"
                >
                  Send Request
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ── AI Assistant Tab ── */
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Header card */}
            <div className="mb-4 flex flex-shrink-0 items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                <Bot size={22} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-extrabold">AJKMart AI Assistant</p>
                <p className="text-xs text-emerald-100">
                  Ask anything about your rides, earnings & more
                </p>
              </div>
              {aiMessages.length > 0 && (
                <button
                  onClick={() => setAiMessages([])}
                  className="rounded-lg bg-white/20 p-1.5"
                  title="Clear chat"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {/* Messages area */}
            <div className="flex-1 space-y-3 overflow-y-auto pb-3" ref={aiScrollRef}>
              {aiMessages.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-center text-xs font-semibold text-gray-400">
                    Suggested questions
                  </p>
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setAiInput(q);
                      }}
                      className="w-full rounded-xl border border-gray-100 bg-gray-50 p-3.5 text-left text-sm font-medium text-gray-700 transition-colors hover:border-emerald-200 hover:bg-emerald-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : (
                aiMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="mt-0.5 mr-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
                        <Bot size={14} className="text-emerald-600" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "rounded-br-md bg-emerald-500 text-white" : "rounded-bl-md bg-gray-100 text-gray-800"}`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="mr-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <Bot size={14} className="text-emerald-600" />
                  </div>
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3">
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex flex-shrink-0 gap-2 border-t pt-3">
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendAiMessage()}
                placeholder="Ask me anything..."
                className="h-11 flex-1 rounded-xl border px-4 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                disabled={aiLoading}
              />
              <button
                onClick={sendAiMessage}
                disabled={aiLoading || !aiInput.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedConv && (
        <div className="border-t bg-white p-4">
          {sendError && (
            <div className="mb-3 flex items-center justify-between rounded-lg bg-red-50 p-3 text-sm text-red-600">
              <span>{sendError}</span>
              <button onClick={() => setSendError(null)} className="ml-2 font-bold text-red-700">
                <X size={14} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx,.txt"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition-colors active:bg-gray-200 disabled:opacity-50"
              title="Attach file or image"
            >
              {uploading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              ) : (
                <Paperclip size={18} />
              )}
            </button>
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                socket?.emit("comm:typing:start", {
                  conversationId: selectedConv.id,
                  userId: user?.id,
                });
                socket?.emit("rider:typing", {
                  isTyping: true,
                  conversationId: selectedConv.id,
                  userId: user?.id,
                });
              }}
              onBlur={() => {
                socket?.emit("comm:typing:stop", {
                  conversationId: selectedConv.id,
                  userId: user?.id,
                });
                socket?.emit("rider:typing", {
                  isTyping: false,
                  conversationId: selectedConv.id,
                  userId: user?.id,
                });
              }}
              placeholder="Type a message..."
              className="h-12 flex-1 rounded-xl border px-4 outline-none"
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button
              onClick={sendMessage}
              disabled={sending}
              className="h-12 rounded-xl bg-emerald-500 px-6 font-bold text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Report modal */}
      {showReportModal && selectedConv && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-extrabold text-gray-900">
                <Flag size={16} className="text-amber-500" /> Report{" "}
                {selectedConv.otherUser?.name || "User"}
              </h3>
              <button
                onClick={() => {
                  setShowReportModal(false);
                  setReportReason("");
                }}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100"
              >
                <X size={14} className="text-gray-500" />
              </button>
            </div>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe the issue (e.g. harassment, spam, inappropriate content)..."
              className="mb-4 min-h-[100px] w-full resize-none rounded-2xl border-2 border-gray-200 p-3 text-sm outline-none focus:border-amber-400"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowReportModal(false);
                  setReportReason("");
                }}
                className="flex-1 rounded-2xl border-2 border-gray-200 py-3 text-sm font-bold text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleReport}
                disabled={!reportReason.trim()}
                className="flex-1 rounded-2xl bg-amber-500 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
