import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  TouchableOpacity,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import Colors from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type MapPickerResult = {
  lat: number;
  lng: number;
  address: string;
};

type Props = {
  visible: boolean;
  label?: string;
  initialLat?: number;
  initialLng?: number;
  onConfirm: (result: MapPickerResult) => void;
  onClose: () => void;
};

// Always derive the picker origin from the actual runtime host so the
// component works correctly behind Replit's proxied preview, where
// EXPO_PUBLIC_DOMAIN may be set but differ from the real proxied origin.
// This is a .web.tsx file — window is always available here.
function getRuntimeOrigin(): string {
  return window.location.origin;
}

export function MapPickerModal({ visible, label = "Location", initialLat, initialLng, onConfirm, onClose }: Props) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Resolve at render time so it always reflects the real proxied host,
  // never a stale build-time env-var value.
  const pickerOrigin = getRuntimeOrigin();

  const lat = initialLat ?? 33.7294;
  const lng = initialLng ?? 73.3872;
  const src = `${pickerOrigin}/api/maps/picker?lat=${lat}&lng=${lng}&zoom=14&label=${encodeURIComponent(label)}`;

  useEffect(() => {
    if (!visible) { setLoading(true); return; }

    function handleMessage(e: MessageEvent) {
      if (e.origin !== pickerOrigin) return;
      if (!e.data || e.data.type !== "MAP_PICKER_CONFIRM") return;
      const { lat, lng, address } = e.data as { lat: number; lng: number; address: string; type: string };
      if (typeof lat !== "number" || typeof lng !== "number") return;
      onConfirm({ lat, lng, address: address ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [visible, onConfirm]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: 0 }]}>
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Select {label}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.mapWrap}>
          {loading && (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={C.primary} />
              <Text style={styles.loaderTxt}>Loading map...</Text>
            </View>
          )}
          <iframe
            ref={iframeRef}
            src={src}
            style={{ width: "100%", height: "100%", border: "none", display: loading ? "none" : "block" }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups"
            allow="geolocation"
            onLoad={() => setLoading(false)}
            title={`Map picker — ${label}`}
          />
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: "#fff",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: Font.bold,
    fontSize: 17,
    color: C.text,
  },
  mapWrap: {
    flex: 1,
    backgroundColor: C.surfaceSecondary,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loaderTxt: {
    fontFamily: Font.medium,
    fontSize: 14,
    color: C.textMuted,
  },
});
}
