import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  type AppStateStatus,
  Image,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { createLogger } from "@/utils/logger";
const log = createLogger("[PopupEngine]");

const MIN_FETCH_INTERVAL_MS = 30_000;

interface Popup {
  id: string;
  title: string;
  body: string | null;
  mediaUrl: string | null;
  ctaText: string | null;
  ctaLink: string | null;
  popupType: "modal" | "bottom_sheet" | "top_banner" | "floating_card";
  displayFrequency: "once" | "daily" | "every_session";
  priority: number;
  colorFrom: string;
  colorTo: string;
  textColor: string;
  animation: string | null;
}

const SESSION_KEY = "ajkmart_popup_session";
const SEEN_PREFIX = "ajkmart_popup_seen_";
const SEEN_DATE_PREFIX = "ajkmart_popup_date_";

async function getOrCreateSessionId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const newId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem(SESSION_KEY, newId);
    return newId;
  } catch {
    return `sess_fallback_${Date.now()}`;
  }
}

const sessionSeenIds = new Set<string>();

async function shouldShowPopup(popup: Popup): Promise<boolean> {
  try {
    const frequency = popup.displayFrequency;
    const seenKey = `${SEEN_PREFIX}${popup.id}`;
    const datKey = `${SEEN_DATE_PREFIX}${popup.id}`;

    if (frequency === "once") {
      const seen = await AsyncStorage.getItem(seenKey);
      return !seen;
    }

    if (frequency === "daily") {
      const lastDate = await AsyncStorage.getItem(datKey);
      if (!lastDate) return true;
      const today = new Date().toDateString();
      return lastDate !== today;
    }

    if (frequency === "every_session") {
      return !sessionSeenIds.has(popup.id);
    }

    return true;
  } catch {
    return true;
  }
}

async function markPopupSeen(popup: Popup): Promise<void> {
  try {
    if (popup.displayFrequency === "once") {
      await AsyncStorage.setItem(`${SEEN_PREFIX}${popup.id}`, "1");
    } else if (popup.displayFrequency === "daily") {
      await AsyncStorage.setItem(`${SEEN_DATE_PREFIX}${popup.id}`, new Date().toDateString());
    } else if (popup.displayFrequency === "every_session") {
      sessionSeenIds.add(popup.id);
    }
  } catch (e) {
    log.warn("markPopupSeen failed:", e);
  }
}

async function sendImpression(popupId: string, action: "view" | "click" | "dismiss", token: string | null, sessionId: string, apiBase: string): Promise<void> {
  try {
    await fetch(`${apiBase}/popups/impression`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ popupId, action, sessionId }),
    });
  } catch (e) {
    log.warn("sendImpression failed:", e);
  }
}

function usePopupAnimation(type: string, animation: string | null) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(type === "top_banner" ? -80 : type === "bottom_sheet" ? 300 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(animation === "scale" ? 0.7 : 1)).current;

  const animateIn = useCallback(() => {
    const animations: Animated.CompositeAnimation[] = [
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
    ];
    if (type === "top_banner") {
      animations.push(Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 100, useNativeDriver: true }));
    } else if (type === "bottom_sheet") {
      animations.push(Animated.spring(slideAnim, { toValue: 0, friction: 9, tension: 80, useNativeDriver: true }));
    } else if (animation === "scale" || animation === "bounce") {
      animations.push(Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }));
    }
    Animated.parallel(animations).start();
  }, []);

  const animateOut = useCallback((cb: () => void) => {
    const animations: Animated.CompositeAnimation[] = [
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ];
    if (type === "top_banner") {
      animations.push(Animated.timing(slideAnim, { toValue: -80, duration: 200, useNativeDriver: true }));
    } else if (type === "bottom_sheet") {
      animations.push(Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }));
    }
    Animated.parallel(animations).start(() => cb());
  }, []);

  return { fadeAnim, slideAnim, scaleAnim, animateIn, animateOut };
}

interface PopupRendererProps {
  popup: Popup;
  onDismiss: () => void;
  onCta: () => void;
}

function TopBannerPopup({ popup, onDismiss, onCta, style }: PopupRendererProps & { style: Animated.WithAnimatedValue<ViewStyle> }) {
  const colors: [string, string] = [popup.colorFrom || "#7C3AED", popup.colorTo || "#4F46E5"];
  return (
    <Animated.View style={[styles.topBannerContainer, style]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.topBannerGradient}>
        <View style={styles.topBannerContent}>
          <Text style={[styles.topBannerTitle, { color: popup.textColor || "#fff" }]} numberOfLines={1}>{popup.title}</Text>
          {popup.ctaText && (
            <TouchableOpacity onPress={onCta} style={styles.topBannerCta} accessibilityRole="button" accessibilityLabel={popup.ctaText}>
              <Text style={[styles.topBannerCtaText, { color: popup.textColor || "#fff" }]}>{popup.ctaText}</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={onDismiss} style={styles.topBannerClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close banner">
          <Text style={{ color: popup.textColor || "#fff", fontSize: 18, fontWeight: "bold" }}>×</Text>
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

function BottomSheetPopup({ popup, onDismiss, onCta, style }: PopupRendererProps & { style: Animated.WithAnimatedValue<ViewStyle> }) {
  const colors: [string, string] = [popup.colorFrom || "#7C3AED", popup.colorTo || "#4F46E5"];
  return (
    <Animated.View style={[styles.bottomSheetContainer, style]}>
      <View style={styles.bottomSheetHandle} />
      <LinearGradient colors={colors} style={styles.bottomSheetGradient}>
        {popup.mediaUrl && (
          <Image source={{ uri: popup.mediaUrl }} style={styles.bottomSheetImage} resizeMode="cover" />
        )}
        <Text style={[styles.bottomSheetTitle, { color: popup.textColor || "#fff" }]}>{popup.title}</Text>
        {popup.body && (
          <Text style={[styles.bottomSheetBody, { color: `${popup.textColor || "#fff"}CC` }]}>{popup.body}</Text>
        )}
        <View style={styles.bottomSheetActions}>
          {popup.ctaText && (
            <TouchableOpacity onPress={onCta} style={styles.ctaButton} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={popup.ctaText}>
              <Text style={styles.ctaButtonText}>{popup.ctaText}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onDismiss} style={styles.dismissButton} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="Dismiss">
            <Text style={[styles.dismissButtonText, { color: `${popup.textColor || "#fff"}99` }]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function FloatingCardPopup({ popup, onDismiss, onCta, style }: PopupRendererProps & { style: Animated.WithAnimatedValue<ViewStyle> }) {
  const colors: [string, string] = [popup.colorFrom || "#7C3AED", popup.colorTo || "#4F46E5"];
  return (
    <Animated.View style={[styles.floatingCardContainer, style]}>
      <LinearGradient colors={colors} style={styles.floatingCard}>
        {popup.mediaUrl && (
          <Image source={{ uri: popup.mediaUrl }} style={styles.floatingCardImage} resizeMode="cover" />
        )}
        <TouchableOpacity onPress={onDismiss} style={styles.floatingCardClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={{ color: popup.textColor || "#fff", fontSize: 18, fontWeight: "bold" }}>×</Text>
        </TouchableOpacity>
        <Text style={[styles.floatingCardTitle, { color: popup.textColor || "#fff" }]}>{popup.title}</Text>
        {popup.body && (
          <Text style={[styles.floatingCardBody, { color: `${popup.textColor || "#fff"}CC` }]}>{popup.body}</Text>
        )}
        {popup.ctaText && (
          <TouchableOpacity onPress={onCta} style={styles.ctaButton} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={popup.ctaText}>
            <Text style={styles.ctaButtonText}>{popup.ctaText}</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

function FullscreenModalPopup({ popup, onDismiss, onCta, style }: PopupRendererProps & { style: Animated.WithAnimatedValue<ViewStyle> }) {
  const colors: [string, string] = [popup.colorFrom || "#7C3AED", popup.colorTo || "#4F46E5"];
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient colors={colors} style={styles.modalGradient}>
        {popup.mediaUrl && (
          <Image source={{ uri: popup.mediaUrl }} style={styles.modalImage} resizeMode="cover" />
        )}
        <TouchableOpacity onPress={onDismiss} style={styles.modalClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={{ color: popup.textColor || "#fff", fontSize: 24, fontWeight: "bold" }}>×</Text>
        </TouchableOpacity>
        <View style={styles.modalContent}>
          <Text style={[styles.modalTitle, { color: popup.textColor || "#fff" }]}>{popup.title}</Text>
          {popup.body && (
            <Text style={[styles.modalBody, { color: `${popup.textColor || "#fff"}CC` }]}>{popup.body}</Text>
          )}
          {popup.ctaText && (
            <TouchableOpacity onPress={onCta} style={styles.ctaButton} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={popup.ctaText}>
              <Text style={styles.ctaButtonText}>{popup.ctaText}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onDismiss} style={[styles.dismissButton, { marginTop: 12 }]} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="Maybe later">
            <Text style={[styles.dismissButtonText, { color: `${popup.textColor || "#fff"}80` }]}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

interface PopupEngineProps {
  apiBase: string;
  triggerKey?: string;
}

export function PopupEngine({ apiBase, triggerKey = "app_open" }: PopupEngineProps) {
  const { user, token } = useAuth();
  const { width: W } = useWindowDimensions();
  const [queue, setQueue] = useState<Popup[]>([]);
  const [current, setCurrent] = useState<Popup | null>(null);
  const [visible, setVisible] = useState(false);
  const sessionIdRef = useRef<string>("");
  const sessionReady = useRef(false);
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const lastFetchTimeRef = useRef<number>(0);
  const fetchControllerRef = useRef<AbortController | null>(null);

  const { fadeAnim, slideAnim, scaleAnim, animateIn, animateOut } = usePopupAnimation(
    current?.popupType ?? "modal",
    current?.animation ?? null
  );

  useEffect(() => {
    isMountedRef.current = true;
    getOrCreateSessionId().then(id => {
      sessionIdRef.current = id;
      sessionReady.current = true;
    }).catch((e) => {
      log.warn("getOrCreateSessionId failed:", e);
    });
    return () => {
      isMountedRef.current = false;
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
      if (fetchControllerRef.current) fetchControllerRef.current.abort();
    };
  }, []);

  const fetchPopups = useCallback(async () => {
    if (!isMountedRef.current) return;

    const now = Date.now();
    if (now - lastFetchTimeRef.current < MIN_FETCH_INTERVAL_MS) return;
    lastFetchTimeRef.current = now;

    if (fetchControllerRef.current) fetchControllerRef.current.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    try {
      const sessionId = sessionIdRef.current;
      const url = `${apiBase}/popups/active?sessionId=${sessionId}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });
      if (!res.ok || !isMountedRef.current) return;
      const data = await res.json();
      const popups: Popup[] = data?.data?.popups ?? data?.popups ?? [];
      const eligible: Popup[] = [];
      for (const popup of popups) {
        if (!isMountedRef.current) return;
        const show = await shouldShowPopup(popup);
        if (show) eligible.push(popup);
      }
      if (!isMountedRef.current) return;
      const capped = eligible.slice(0, 10);
      if (capped.length > 0) {
        setQueue(capped);
        showNext(capped, 0);
      }
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "AbortError") return;
      log.warn("fetchPopups error:", e);
    }
  }, [apiBase, token]);

  useEffect(() => {
    if (!sessionReady.current) {
      getOrCreateSessionId().then(id => {
        sessionIdRef.current = id;
        sessionReady.current = true;
        fetchPopups();
      }).catch((e) => {
        log.warn("getOrCreateSessionId error:", e);
      });
    } else {
      fetchPopups();
    }
  }, [triggerKey, fetchPopups]);

  useEffect(() => {
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === "active" && isMountedRef.current) {
        fetchPopups();
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [fetchPopups]);

  const showNext = (q: Popup[], idx: number) => {
    if (idx >= q.length || !isMountedRef.current) return;
    const popup = q[idx]!;
    setCurrent(popup);
    setVisible(true);
    setTimeout(() => animateIn(), 50);
    sendImpression(popup.id, "view", token, sessionIdRef.current, apiBase);
    markPopupSeen(popup);

    if (popup.popupType === "top_banner") {
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
      const popupId = popup.id;
      autoDismissTimer.current = setTimeout(() => {
        autoDismissTimer.current = null;
        setCurrent(prev => {
          if (prev?.id === popupId) {
            handleDismiss(q, idx, "dismiss");
          }
          return prev;
        });
      }, 4000);
    }
  };

  const handleDismiss = useCallback(async (q: Popup[], idx: number, action: "dismiss" | "click" = "dismiss") => {
    if (autoDismissTimer.current) {
      clearTimeout(autoDismissTimer.current);
      autoDismissTimer.current = null;
    }
    if (!current) return;
    sendImpression(current.id, action, token, sessionIdRef.current, apiBase);
    animateOut(() => {
      setVisible(false);
      setCurrent(null);
      if (idx + 1 < q.length) {
        setTimeout(() => showNext(q, idx + 1), 400);
      }
    });
  }, [current, token, apiBase, animateOut]);

  const handleCta = useCallback(() => {
    if (!current) return;
    const ctaLink = current.ctaLink;
    const qIdx = queue.indexOf(current);
    handleDismiss(queue, qIdx, "click");
    if (ctaLink) {
      if (ctaLink.startsWith("http")) {
        Linking.openURL(ctaLink).catch((e) => {
          log.warn("Linking.openURL failed:", e);
        });
      } else {
        try {
          router.push(ctaLink as Parameters<typeof router.push>[0]);
        } catch (e) {
          log.warn("Router push failed for popup CTA:", e);
        }
      }
    }
  }, [current, queue, handleDismiss]);

  if (!current || !visible) return null;

  const qIdx = queue.indexOf(current);
  const type = current.popupType;

  if (type === "top_banner") {
    return (
      <View style={styles.topBannerWrapper} pointerEvents="box-none">
        <TopBannerPopup
          popup={current}
          onDismiss={() => handleDismiss(queue, qIdx)}
          onCta={handleCta}
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        />
      </View>
    );
  }

  if (type === "bottom_sheet") {
    return (
      <Modal transparent visible animationType="none" onRequestClose={() => handleDismiss(queue, qIdx)} statusBarTranslucent>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdropOverlay, { opacity: fadeAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => handleDismiss(queue, qIdx)} accessibilityLabel="Close popup" />
        </Animated.View>
        <View style={styles.bottomSheetModalContainer} pointerEvents="box-none">
          <BottomSheetPopup
            popup={current}
            onDismiss={() => handleDismiss(queue, qIdx)}
            onCta={handleCta}
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          />
        </View>
      </Modal>
    );
  }

  if (type === "floating_card") {
    return (
      <Modal transparent visible animationType="none" onRequestClose={() => handleDismiss(queue, qIdx)} statusBarTranslucent>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdropOverlay, { opacity: fadeAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => handleDismiss(queue, qIdx)} accessibilityLabel="Close popup" />
        </Animated.View>
        <View style={[styles.floatingCardModal, { width: W }]} pointerEvents="box-none">
          <FloatingCardPopup
            popup={current}
            onDismiss={() => handleDismiss(queue, qIdx)}
            onCta={handleCta}
            style={{
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            }}
          />
        </View>
      </Modal>
    );
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={() => handleDismiss(queue, qIdx)} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <FullscreenModalPopup
          popup={current}
          onDismiss={() => handleDismiss(queue, qIdx)}
          onCta={handleCta}
          style={{
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropOverlay: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  topBannerWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  topBannerContainer: {
    overflow: "hidden",
  },
  topBannerGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 50 : 28,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  topBannerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topBannerTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  topBannerCta: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  topBannerCtaText: {
    fontSize: 11,
    fontWeight: "700",
  },
  topBannerClose: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  bottomSheetModalContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomSheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  bottomSheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 8,
    position: "absolute",
    top: 4,
    zIndex: 1,
  },
  bottomSheetGradient: {
    padding: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  bottomSheetImage: {
    width: "100%",
    height: 160,
    borderRadius: 16,
    marginBottom: 16,
  },
  bottomSheetTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  bottomSheetBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  bottomSheetActions: {
    flexDirection: "column",
    gap: 10,
  },
  floatingCardModal: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  floatingCardContainer: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    overflow: "hidden",
    ...Platform.select({ web: { boxShadow: "0 8px 20px rgba(0,0,0,0.35)" }, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 16 } }),
  },
  floatingCard: {
    padding: 24,
  },
  floatingCardImage: {
    width: "100%",
    height: 140,
    borderRadius: 16,
    marginBottom: 16,
  },
  floatingCardClose: {
    position: "absolute",
    top: 12,
    right: 14,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 15,
  },
  floatingCardTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  floatingCardBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalGradient: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 50,
  },
  modalImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.25,
  },
  modalClose: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 30,
    right: 20,
    width: 36,
    height: 36,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  modalContent: {
    flex: 1,
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 12,
    textAlign: "center",
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 28,
  },
  ctaButton: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  ctaButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  dismissButton: {
    alignItems: "center",
    paddingVertical: 10,
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
