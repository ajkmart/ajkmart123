import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { adminAbsoluteFetch } from "@/lib/adminFetcher";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Headphones,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

async function apiFetch(path: string, opts: RequestInit = {}) {
  return adminAbsoluteFetch(`/api${path}`, opts);
}

type Conversation = {
  userId: string;
  lastMessage: string;
  lastAt: string;
  totalMessages: number;
  unreadCount: number;
  isResolved: boolean;
};

type ChatMessage = {
  id: string;
  userId: string;
  message: string;
  isFromSupport: boolean;
  isReadByAdmin: boolean;
  isResolved: boolean;
  createdAt: string;
};

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
}

export default function SupportChatPage() {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    data: convsData,
    isLoading: convsLoading,
    refetch: refetchConvs,
    dataUpdatedAt: convsUpdatedAt,
  } = useQuery({
    queryKey: ["admin-support-conversations"],
    queryFn: () => apiFetch("/support-chat/conversations"),
    refetchInterval: 15000,
  });

  const { data: msgsData, isLoading: msgsLoading } = useQuery({
    queryKey: ["admin-support-messages", selectedUserId],
    queryFn: () => apiFetch(`/support-chat/conversations/${selectedUserId}`),
    enabled: !!selectedUserId,
    refetchInterval: false,
  });

  const resolveMut = useMutation({
    mutationFn: ({ userId, resolved }: { userId: string; resolved: boolean }) =>
      apiFetch(`/support-chat/conversations/${userId}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ resolved }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-support-conversations"] });
      void qc.invalidateQueries({ queryKey: ["admin-support-messages", selectedUserId] });
    },
  });

  const conversations: Conversation[] = convsData?.conversations ?? [];
  const messages = useMemo<ChatMessage[]>(() => msgsData?.messages ?? [], [msgsData?.messages]);

  const filtered = conversations.filter(
    (c) =>
      !search ||
      c.userId.toLowerCase().includes(search.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(search.toLowerCase())
  );

  const selected = conversations.find((c) => c.userId === selectedUserId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!selectedUserId) return;
    void qc.invalidateQueries({ queryKey: ["admin-support-conversations"] });
  }, [selectedUserId, qc]);

  useEffect(() => {
    const origin = window.location.origin;
    const socket = io(origin, { path: "/api/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("support_message", (msg: ChatMessage) => {
      qc.setQueryData(
        ["admin-support-messages", msg.userId],
        (old: { messages: ChatMessage[] } | undefined) => {
          if (!old) return old;
          const exists = old.messages.some((m) => m.id === msg.id);
          if (exists) return old;
          return { ...old, messages: [...old.messages, msg] };
        }
      );
      void qc.invalidateQueries({ queryKey: ["admin-support-conversations"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [qc]);

  const handleSend = useCallback(async () => {
    if (!selectedUserId || !reply.trim() || sending) return;
    setSending(true);
    try {
      const json = await adminAbsoluteFetch(
        `/api/admin/support-chat/conversations/${selectedUserId}/reply`,
        {
          method: "POST",
          body: JSON.stringify({ message: reply.trim() }),
        }
      )
        .then((d: any) => ({ data: d }))
        .catch((e: any) => ({ error: e?.message || "Failed" }));
      if (!("error" in json) && json.data?.message) {
        qc.setQueryData(
          ["admin-support-messages", selectedUserId],
          (old: { messages: ChatMessage[] } | undefined) => {
            if (!old) return old;
            const exists = old.messages.some((m) => m.id === json.data.message?.id);
            if (exists) return old;
            return { ...old, messages: [...old.messages, json.data.message] };
          }
        );
        void qc.invalidateQueries({ queryKey: ["admin-support-conversations"] });
        setReply("");
        inputRef.current?.focus();
      }
    } finally {
      setSending(false);
    }
  }, [selectedUserId, reply, sending, qc]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const totalUnread = conversations.reduce((s, c) => s + (c.unreadCount || 0), 0);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Support Chat page crashed. Please reload.
        </div>
      }
    >
      <div className="flex h-[calc(100vh-56px)] flex-col">
        <PageHeader
          icon={Headphones}
          title="Support Chat"
          subtitle="Manage live customer conversations"
          iconBgClass="bg-blue-100"
          iconColorClass="text-blue-600"
          actions={
            <LastUpdated
              dataUpdatedAt={convsUpdatedAt}
              onRefresh={refetchConvs}
              isRefreshing={convsLoading}
            />
          }
        />
        <div className="flex min-h-0 flex-1 bg-gray-50">
          {/* Sidebar */}
          <div
            className={cn(
              "flex flex-col border-r bg-white",
              selectedUserId ? "hidden w-80 shrink-0 md:flex" : "flex w-full md:w-80 md:shrink-0"
            )}
          >
            <div className="border-b p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle className="text-primary h-5 w-5" />
                  <h1 className="text-base font-bold text-gray-900">Support Inbox</h1>
                  {totalUnread > 0 && (
                    <Badge className="min-w-[20px] rounded-full bg-red-500 px-1.5 py-0 text-center text-xs text-white">
                      {totalUnread}
                    </Badge>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => refetchConvs()}
                  className="h-7 w-7"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-gray-400" />
                <Input
                  placeholder="Search conversations..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 rounded-xl pl-8 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {convsLoading ? (
                <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                  Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center text-gray-400">
                  <MessageCircle className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No conversations yet</p>
                </div>
              ) : (
                filtered.map((conv) => {
                  const isSelected = selectedUserId === conv.userId;
                  const shortId = conv.userId.slice(-6).toUpperCase();
                  return (
                    <button
                      key={conv.userId}
                      onClick={() => setSelectedUserId(conv.userId)}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50",
                        isSelected && "bg-primary/5 border-l-primary border-l-2"
                      )}
                    >
                      <div className="relative shrink-0">
                        <div className="from-primary/20 to-primary/40 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br">
                          <User className="text-primary h-4 w-4" />
                        </div>
                        {conv.unreadCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                            {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center justify-between gap-1">
                          <span className="truncate text-sm font-semibold text-gray-800">
                            User #{shortId}
                          </span>
                          <span className="shrink-0 text-[10px] text-gray-400">
                            {timeAgo(conv.lastAt)}
                          </span>
                        </div>
                        <p className="truncate text-xs leading-relaxed text-gray-500">
                          {conv.lastMessage}
                        </p>
                        {conv.isResolved && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-green-600">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Resolved
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Chat panel */}
          {selectedUserId ? (
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Header */}
              <div className="flex items-center gap-3 border-b bg-white px-4 py-3 shadow-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 md:hidden"
                  onClick={() => setSelectedUserId(null)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="from-primary/20 to-primary/40 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br">
                  <User className="text-primary h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    User #{selectedUserId.slice(-6).toUpperCase()}
                  </p>
                  <p className="truncate text-xs text-gray-400">{selectedUserId}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selected?.isResolved ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-amber-300 text-xs text-amber-700 hover:bg-amber-50"
                      onClick={() => resolveMut.mutate({ userId: selectedUserId, resolved: false })}
                    >
                      <Circle className="h-3 w-3" /> Reopen
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-green-300 text-xs text-green-700 hover:bg-green-50"
                      onClick={() => resolveMut.mutate({ userId: selectedUserId, resolved: true })}
                    >
                      <CheckCheck className="h-3 w-3" /> Mark Resolved
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {msgsLoading ? (
                  <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                    Loading messages…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
                    <AlertCircle className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No messages yet</p>
                  </div>
                ) : (
                  messages.map((msg: ChatMessage) => {
                    const isSupport = msg.isFromSupport;
                    return (
                      <div
                        key={msg.id}
                        className={cn("flex", isSupport ? "justify-end" : "justify-start")}
                      >
                        {!isSupport && (
                          <div className="mt-1 mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100">
                            <User className="h-3.5 w-3.5 text-gray-500" />
                          </div>
                        )}
                        <div
                          className={cn(
                            "max-w-[72%] rounded-2xl px-4 py-2.5 shadow-sm",
                            isSupport
                              ? "bg-primary rounded-br-sm text-white"
                              : "rounded-bl-sm border border-gray-100 bg-white text-gray-800"
                          )}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {msg.message}
                          </p>
                          <p
                            className={cn(
                              "mt-1 text-[10px]",
                              isSupport ? "text-right text-white/60" : "text-gray-400"
                            )}
                          >
                            {formatTime(msg.createdAt)}
                            {isSupport && <span className="ml-1">✓ Support</span>}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t bg-white px-4 py-3">
                {selected?.isResolved ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 py-2 text-sm text-green-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Conversation resolved — reopen to reply</span>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <Input
                      ref={inputRef}
                      placeholder="Type a reply…"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="min-h-[40px] flex-1 rounded-xl text-sm"
                    />
                    <Button
                      onClick={handleSend}
                      disabled={!reply.trim() || sending}
                      className="h-10 w-10 shrink-0 rounded-xl p-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-gray-400 md:flex">
              <MessageCircle className="h-14 w-14 opacity-20" />
              <p className="text-base font-medium">Select a conversation</p>
              <p className="text-sm">Choose from the list to view and reply</p>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
