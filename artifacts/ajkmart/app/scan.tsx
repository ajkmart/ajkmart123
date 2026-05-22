import { Ionicons } from "@expo/vector-icons";
import { createLogger } from "@/utils/logger";
import { withErrorBoundary } from "@/utils/withErrorBoundary";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  Linking,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import React, { useRef, useState, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PermissionGuide } from "@/components/PermissionGuide";
import Colors from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useToast } from "@/context/ToastContext";
import { API_BASE } from "@/utils/api";
import { useTheme } from "@/context/ThemeContext";

const log = createLogger("[scan]");

export default withErrorBoundary(ScanScreenInner);

function ScanScreenInner() {
  const { colors: C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [permGuideVisible, setPermGuideVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);
  const [resolving, setResolving] = useState(false);
  const scanLockRef = useRef(false);

  const handleBarCodeScanned = async ({
    type,
    data,
  }: {
    type: string;
    data: string;
  }) => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    setScanned(true);

    const isUrl = data.startsWith("http://") || data.startsWith("https://");

    if (isUrl) {
      try {
        const url = new URL(data);
        const pathParts = url.pathname.split("/").filter(Boolean);
        const productIdx = pathParts.indexOf("product");
        if (productIdx !== -1 && pathParts[productIdx + 1]) {
          router.replace({
            pathname: "/product/[id]",
            params: { id: pathParts[productIdx + 1] },
          });
          return;
        }
        showToast("QR code URL — opening in browser", "info");
        await Linking.openURL(data);
        router.back();
      } catch {
        router.replace({ pathname: "/search", params: { q: data } });
      }
      return;
    }

    setResolving(true);
    try {
      const res = await fetch(
        `${API_BASE}/products/barcode/${encodeURIComponent(data)}`,
      );
      if (res.ok) {
        const json = await res.json();
        const result = json?.data ?? json;
        if (result?.found && result?.productId) {
          router.replace({
            pathname: "/product/[id]",
            params: { id: result.productId },
          });
          return;
        }
      }
    } catch (err) {
      log.warn("[scan] Barcode resolve failed:", err);
    } finally {
      setResolving(false);
    }

    router.replace({ pathname: "/search", params: { q: data } });
  };

  if (!permission) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[s.root, { paddingTop: Math.max(insets.top, 20) }]}>
        <PermissionGuide
          visible={permGuideVisible}
          type="camera"
          onClose={() => setPermGuideVisible(false)}
        />
        <View style={s.permContainer}>
          <View style={s.permIconWrap}>
            <Ionicons name="camera-outline" size={52} color={C.primary} />
          </View>
          <Text style={s.permTitle}>Camera Required</Text>
          <Text style={s.permSub}>
            Allow camera access to scan product barcodes and QR codes.
          </Text>
          <TouchableOpacity
            activeOpacity={0.75}
            style={s.permBtn}
            onPress={async () => {
              const result = await requestPermission();
              if (!result.granted && !result.canAskAgain) {
                setPermGuideVisible(true);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Allow camera access"
          >
            <Ionicons name="camera" size={18} color="#fff" />
            <Text style={s.permBtnTxt}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            style={s.backBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={16} color={C.textSecondary} />
            <Text style={s.backBtnTxt}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: [
            "qr",
            "ean13",
            "ean8",
            "code128",
            "code39",
            "upc_a",
            "upc_e",
            "pdf417",
            "datamatrix",
            "aztec",
          ],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      <View style={[s.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={s.headerBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Scan Barcode</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          style={s.headerBtn}
          onPress={() => setTorch((t) => !t)}
          accessibilityRole="button"
          accessibilityLabel={torch ? "Turn off torch" : "Turn on torch"}
        >
          <Ionicons
            name={torch ? "flash" : "flash-outline"}
            size={22}
            color={torch ? "#FBBF24" : "#fff"}
          />
        </TouchableOpacity>
      </View>

      <View style={s.overlay}>
        <View style={s.topMask} />
        <View style={s.middleRow}>
          <View style={s.sideMask} />
          <View style={s.scanFrame}>
            <View style={[s.corner, s.tl]} />
            <View style={[s.corner, s.tr]} />
            <View style={[s.corner, s.bl]} />
            <View style={[s.corner, s.br]} />
            {!scanned && <View style={s.scanLine} />}
          </View>
          <View style={s.sideMask} />
        </View>
        <View style={s.bottomMask}>
          {resolving ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={s.hint}>Looking up product...</Text>
            </>
          ) : (
            <Text style={s.hint}>
              {scanned
                ? "Scanned! Opening results..."
                : "Point camera at a barcode or QR code"}
            </Text>
          )}
          {scanned && !resolving && (
            <TouchableOpacity
              activeOpacity={0.75}
              style={s.rescanBtn}
              onPress={() => {
                scanLockRef.current = false;
                setScanned(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="Scan again"
            >
              <Ionicons name="refresh-outline" size={16} color={C.primary} />
              <Text style={s.rescanTxt}>Scan Again</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const FRAME = 240;
const CORNER = 24;
const BORDER = 3;

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "#000" },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#000",
    },
    header: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 12,
      zIndex: 20,
    },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.15)",
    },
    headerTitle: {
      fontFamily: Font.bold,
      fontSize: 17,
      color: "#fff",
    },
    overlay: { ...(StyleSheet.absoluteFillObject as object), zIndex: 10 },
    topMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
    middleRow: { flexDirection: "row", height: FRAME },
    sideMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
    scanFrame: { width: FRAME, height: FRAME, position: "relative" },
    bottomMask: {
      flex: 1.2,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      paddingTop: 28,
      gap: 16,
    },
    hint: {
      fontFamily: Font.medium,
      fontSize: 14,
      color: "rgba(255,255,255,0.8)",
      textAlign: "center",
      paddingHorizontal: 32,
    },
    rescanBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.2)",
    },
    rescanTxt: { fontFamily: Font.semiBold, fontSize: 13, color: "#fff" },
    corner: {
      position: "absolute",
      width: CORNER,
      height: CORNER,
      borderColor: "#fff",
    },
    tl: {
      top: 0,
      left: 0,
      borderTopWidth: BORDER,
      borderLeftWidth: BORDER,
      borderTopLeftRadius: 4,
    },
    tr: {
      top: 0,
      right: 0,
      borderTopWidth: BORDER,
      borderRightWidth: BORDER,
      borderTopRightRadius: 4,
    },
    bl: {
      bottom: 0,
      left: 0,
      borderBottomWidth: BORDER,
      borderLeftWidth: BORDER,
      borderBottomLeftRadius: 4,
    },
    br: {
      bottom: 0,
      right: 0,
      borderBottomWidth: BORDER,
      borderRightWidth: BORDER,
      borderBottomRightRadius: 4,
    },
    scanLine: {
      position: "absolute",
      left: 8,
      right: 8,
      top: "45%",
      height: 2,
      backgroundColor: "#22C55E",
      borderRadius: 1,
      opacity: 0.85,
    },
    permContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      gap: 16,
    },
    permIconWrap: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: C.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    permTitle: {
      fontFamily: Font.bold,
      fontSize: 22,
      color: C.text,
      textAlign: "center",
    },
    permSub: {
      fontFamily: Font.regular,
      fontSize: 14,
      color: C.textSecondary,
      textAlign: "center",
      lineHeight: 22,
    },
    permBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingHorizontal: 28,
      paddingVertical: 14,
      marginTop: 8,
    },
    permBtnTxt: { fontFamily: Font.bold, fontSize: 15, color: "#fff" },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
    backBtnTxt: { fontFamily: Font.medium, fontSize: 14, color: C.textSecondary },
  });
}
