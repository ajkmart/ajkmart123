import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
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

const PICKER_ORIGIN = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

export function MapPickerModal({
  visible,
  label = "Location",
  initialLat,
  initialLng,
  onConfirm,
  onClose,
}: Props) {
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setHasError(false);
    }
  }, [visible]);

  const lat = initialLat ?? 33.7294;
  const lng = initialLng ?? 73.3872;
  const src = `${PICKER_ORIGIN}/api/maps/picker?lat=${lat}&lng=${lng}&zoom=14&label=${encodeURIComponent(label)}`;

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as {
          type: string;
          lat: number;
          lng: number;
          address: string;
        };
        if (payload.type !== "MAP_PICKER_CONFIRM") return;
        if (typeof payload.lat !== "number" || typeof payload.lng !== "number") return;
        onConfirm({
          lat: payload.lat,
          lng: payload.lng,
          address: payload.address ?? `${payload.lat.toFixed(5)}, ${payload.lng.toFixed(5)}`,
        });
      // eslint-disable-next-line ajk-local/no-silent-catch -- malformed WebView message JSON is ignored safely
      } catch {
      }
    },
    [onConfirm],
  );

  const handleRetry = () => {
    setHasError(false);
    setLoading(true);
    setRetryKey(k => k + 1);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Select {label}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.mapWrap}>
          {loading && !hasError && (
            <View style={styles.loader}>
              <View style={styles.loaderIconWrap}>
                <ActivityIndicator size="large" color={C.primary} />
              </View>
              <Text style={styles.loaderTxt}>Loading map...</Text>
              <Text style={styles.loaderSub}>This may take a moment</Text>
            </View>
          )}

          {hasError ? (
            <View style={styles.errorWrap}>
              <View style={styles.errorIconCircle}>
                <Ionicons name="wifi-outline" size={32} color={C.textMuted} />
              </View>
              <Text style={styles.errorTitle}>Map Unavailable</Text>
              <Text style={styles.errorMsg}>
                Unable to load the map. Please check your connection and try again.
              </Text>
              <TouchableOpacity activeOpacity={0.7} style={styles.retryBtn} onPress={handleRetry}>
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.retryTxt}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7} style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeTxt}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <WebView
              key={retryKey}
              source={{ uri: src }}
              style={[styles.webview, loading && styles.hidden]}
              onLoadEnd={() => setLoading(false)}
              onError={() => { setLoading(false); setHasError(true); }}
              onMessage={handleMessage}
              javaScriptEnabled
              domStorageEnabled
              geolocationEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              mixedContentMode="compatibility"
            />
          )}
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
    position: "relative",
  },
  webview: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    zIndex: 10,
    backgroundColor: "#fff",
  },
  loaderIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  loaderTxt: {
    fontFamily: Font.medium,
    fontSize: 15,
    color: C.text,
  },
  loaderSub: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: C.textMuted,
  },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  errorIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  errorTitle: {
    fontFamily: Font.bold,
    fontSize: 18,
    color: C.text,
    textAlign: "center",
  },
  errorMsg: {
    fontFamily: Font.regular,
    fontSize: 14,
    color: C.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  retryTxt: {
    fontFamily: Font.bold,
    fontSize: 15,
    color: "#fff",
  },
  closeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  closeTxt: {
    fontFamily: Font.semiBold,
    fontSize: 14,
    color: C.textMuted,
  },
});
}
