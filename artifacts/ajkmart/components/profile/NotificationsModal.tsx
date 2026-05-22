import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Modal, RefreshControl, ScrollView,
  Text, TouchableOpacity, View,
} from "react-native";
import { createLogger } from "@/utils/logger";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useToast } from "@/context/ToastContext";
import { useTheme } from "@/context/ThemeContext";
import {
  spacing, Font,
  API, unwrapApiResponse, relativeTime,
  getSharedStyles,
  type Notification,
} from "./shared";
const log = createLogger("[NotificationsModal]");

export function NotificationsModal({ visible, userId, token, onClose }: {
  visible: boolean; userId: string; token?: string; onClose: (unread: number) => void;
}) {
  const { colors: C } = useTheme();
  const { modalHdr, empty, notifItem } = useMemo(() => getSharedStyles(C), [C]);
  const { showToast } = useToast();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const authHdrs: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/notifications`, { headers: authHdrs });
      const d = unwrapApiResponse<{ notifications?: Notification[] }>(await r.json());
      setNotifs(d.notifications ?? []);
    } catch (err) {
      log.warn("Notifications load failed:", err instanceof Error ? err.message : String(err));
      showToast("Could not load notifications — tap retry to try again", "error");
    }
    setLoading(false);
  }, [userId, token]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const markOne = async (id: string) => {
    const res = await fetch(`${API}/notifications/${id}/read`, { method: "PATCH", headers: authHdrs });
    if (res.ok) setNotifs(p => p.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const handleNotifPress = async (n: Notification) => {
    if (!n.isRead) await markOne(n.id);
    onClose(notifs.filter(x => !x.isRead && x.id !== n.id).length);
    const meta = n.meta || {};
    const type: string = n.type || "";
    if ((type === "order" || type === "food" || type === "mart") && meta.orderId) {
      router.push({ pathname: "/orders/[id]", params: { id: meta.orderId } });
    } else if (type === "ride" && meta.rideId) {
      router.push(`/ride?rideId=${meta.rideId}`);
    } else if (type === "parcel" && meta.bookingId) {
      router.push({ pathname: "/orders/[id]", params: { id: meta.bookingId, type: "parcel" } });
    } else if (type === "pharmacy" && meta.orderId) {
      router.push({ pathname: "/orders/[id]", params: { id: meta.orderId, type: "pharmacy" } });
    } else if (type === "wallet") {
      router.push("/(tabs)/wallet");
    } else if (type === "deal" || type === "deals") {
      router.push("/(tabs)");
    } else if (n.link && typeof n.link === "string" && n.link.startsWith("/")) {
      router.push(n.link as Href);
    }
  };
  const markAll = async () => {
    setMarking(true);
    const res = await fetch(`${API}/notifications/read-all`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHdrs } });
    if (res.ok) setNotifs(p => p.map(n => ({ ...n, isRead: true })));
    setMarking(false);
  };
  const del = async (id: string) => {
    const res = await fetch(`${API}/notifications/${id}`, { method: "DELETE", headers: authHdrs });
    if (res.ok) setNotifs(p => p.filter(n => n.id !== id));
  };

  const unread = notifs.filter(n => !n.isRead).length;
  const typeMap: Record<string, [keyof typeof Ionicons.glyphMap, string, string]> = {
    wallet: ["wallet-outline", C.primary, C.primarySoft],
    ride: ["car-outline", C.success, C.successSoft],
    order: ["bag-outline", C.accent, C.accentSoft],
    food: ["restaurant-outline", C.accent, C.accentSoft],
    mart: ["cart-outline", C.primary, C.primarySoft],
    pharmacy: ["medkit-outline", C.info, C.infoSoft],
    parcel: ["cube-outline", C.success, C.successSoft],
    deal: ["pricetag-outline", C.info, C.infoSoft],
    deals: ["pricetag-outline", C.info, C.infoSoft],
    system: ["notifications-outline", C.textSecondary, C.surfaceSecondary],
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose(unread)}>
      <View style={{ flex: 1, backgroundColor: C.surface }}>
        <View style={modalHdr.wrap}>
          <View>
            <Text style={modalHdr.title}>Notifications</Text>
            {unread > 0 && <Text style={modalHdr.sub}>{unread} new</Text>}
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
            {unread > 0 && (
              <TouchableOpacity activeOpacity={0.7} onPress={markAll} disabled={marking} style={modalHdr.action} accessibilityRole="button" accessibilityLabel="Mark all as read">
                {marking ? <ActivityIndicator size="small" color={C.primary} /> : <Text style={modalHdr.actionTxt}>Mark all as read</Text>}
              </TouchableOpacity>
            )}
            <TouchableOpacity activeOpacity={0.7} onPress={() => onClose(unread)} style={modalHdr.close} accessibilityRole="button" accessibilityLabel="Close notifications">
              <Ionicons name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        {loading && notifs.length === 0 ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
        ) : notifs.length === 0 ? (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[C.primary]} tintColor={C.primary} />}
          >
            <View style={empty.wrap}>
              <Text style={{ fontSize: 52 }}>🔔</Text>
              <Text style={empty.title}>No notifications</Text>
              <Text style={empty.sub}>You're all caught up!</Text>
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: 6 }}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[C.primary]} tintColor={C.primary} />}
          >
            {notifs.map(n => {
              const [icon, color, bg] = typeMap[n.type] || typeMap.system!;
              return (
                <TouchableOpacity activeOpacity={0.7} key={n.id} onPress={() => handleNotifPress(n)} style={[notifItem.wrap, !n.isRead && notifItem.unread]} accessibilityRole="button" accessibilityLabel={`${n.title}, ${n.body}${!n.isRead ? ", unread" : ""}`}>
                  <View style={[notifItem.icon, { backgroundColor: bg }]}>
                    <Ionicons name={icon} size={19} color={color} />
                    {!n.isRead && <View style={notifItem.dot} />}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[notifItem.title, !n.isRead && { fontFamily: Font.bold }]}>{n.title}</Text>
                    <Text style={notifItem.body} numberOfLines={2}>{n.body}</Text>
                    <Text style={notifItem.time}>{relativeTime(n.createdAt)}</Text>
                  </View>
                  <TouchableOpacity activeOpacity={0.7} onPress={() => del(n.id)} style={notifItem.del} accessibilityRole="button" accessibilityLabel="Delete notification">
                    <Ionicons name="close" size={13} color={C.textMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
