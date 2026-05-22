import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useToast } from "@/context/ToastContext";
import { CancelModal } from "@/components/CancelModal";
import type { CancelTarget } from "@/components/CancelModal";
import { useRideStatus } from "@/hooks/useRideStatus";
import { NegotiationScreen } from "@/components/ride/NegotiationScreen";
import { RideStatusSkeleton } from "@/components/ride/Skeletons";
import { staticMapUrl } from "@/hooks/useMaps";
import {
  getDispatchStatus,
  retryRideDispatch,
  rateRide,
} from "@workspace/api-client-react";
import { usePlatformConfig } from "@/context/PlatformConfigContext";

const C = Colors.light;

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type RideTrackerProps = {
  rideId: string;
  initialType: string;
  userId: string;
  token: string | null;
  cancellationFee: number;
  onReset: () => void;
};

export function RideTracker({
  rideId,
  initialType,
  userId,
  token,
  cancellationFee,
  onReset,
}: RideTrackerProps) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { showToast } = useToast();

  const slideUp = useRef(new Animated.Value(50)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  const { ride, setRide, connectionType, reconnect } = useRideStatus(rideId);
  const { config } = usePlatformConfig();
  const sosEnabled = config.features?.sos !== false;
  const [sosLoading, setSosLoading] = useState(false);
  const [sosSent, setSosSent] = useState(false);

  const [cancelling, setCancelling] = useState(false);
  const [cancelModalTarget, setCancelModalTarget] =
    useState<CancelTarget | null>(null);
  const [rating, setRating] = useState(0);
  const [ratingDone, setRatingDone] = useState(false);
  const [ratingComment, setRatingComment] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [dispatchInfo, setDispatchInfo] = useState<any>(null);
  const [retrying, setRetrying] = useState(false);
  const prevStatus = useRef<string>("");
  const [cancelResult, setCancelResult] = useState<{
    cancellationFee?: number;
    cancelReason?: string;
  } | null>(null);
  const [acceptedAt, setAcceptedAt] = useState<number | null>(null);
  const CANCEL_GRACE_SEC = 180;

  /* ── Trip OTP — shown to customer when rider has arrived ── */
  const [tripOtp, setTripOtp] = useState<string | null>(null);
  const [otpCopied, setOtpCopied] = useState(false);

  /* ── Live rider location via Socket.io ── */
  const [riderLivePos, setRiderLivePos] = useState<{ lat: number; lng: number } | null>(null);
  const socketRef = useRef<{ disconnect: () => void } | null>(null);

  useEffect(() => {
    /* Only the three valid ride statuses from the server state machine should
       keep the socket open — "picked_up" and "in_progress" are delivery-order
       statuses that can never appear on a ride record. */
    const ACTIVE_STATUSES = ["accepted", "arrived", "in_transit"];
    const isActive = ACTIVE_STATUSES.includes(ride?.status ?? "");
    if (!isActive || !rideId) return;

    const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
    const socketUrl = `https://${domain}`;
    const socketIoPath = "/api/socket.io";

    let socket: import("socket.io-client").Socket | null = null;
    let unmounted = false;
    import("socket.io-client").then(({ io }) => {
      if (unmounted) return;
      socket = io(socketUrl, {
        path: socketIoPath,
        query: { rooms: `ride:${rideId}` },
        auth: token ? { token } : {},
        extraHeaders: token ? { Authorization: `Bearer ${token}` } : {},
        transports: ["polling", "websocket"],
      });
      socketRef.current = socket;
      socket.on("rider:location", (payload: { latitude: number; longitude: number }) => {
        setRiderLivePos({ lat: payload.latitude, lng: payload.longitude });
      });
      socket.on("ride:otp", (payload: { rideId: string; otp: string }) => {
        if (payload.rideId === rideId && payload.otp) {
          setTripOtp(payload.otp);
        }
      });
    });

    return () => {
      unmounted = true;
      if (socket) socket.disconnect();
      socketRef.current = null;
    };
    /* NOTE: ride?.status is intentionally NOT in the dep array.
       Including it would tear down and re-create the socket on every status
       transition (accepted → arrived → in_transit), causing a live-location gap
       the customer sees as the rider pin freezing. The socket connection is keyed
       only on the ride ID and auth token — status checks run inside the effect. */
  }, [rideId, token]);

  useEffect(() => {
    AsyncStorage.getItem(`rated_ride_${rideId}`).then(val => {
      if (val === "1") setRatingDone(true);
    }).catch(() => {});
  }, [rideId]);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const st = ride?.status;
    if (st === "accepted" && !acceptedAt) setAcceptedAt(Date.now());
  }, [ride?.status, acceptedAt]);

  /* ── Populate OTP from polling data (fallback if socket event missed) ── */
  useEffect(() => {
    if (ride?.status === "arrived" && (ride as any)?.tripOtp && !tripOtp) {
      setTripOtp((ride as any).tripOtp);
    }
    if (ride?.status === "in_transit") {
      setTripOtp(null); // clear once trip starts
    }
  }, [ride?.status, (ride as any)?.tripOtp]);

  useEffect(() => {
    const st = ride?.status;
    const prev = prevStatus.current;
    const pendingStatuses = ["searching", "bargaining"];
    if (
      st &&
      !pendingStatuses.includes(st) &&
      pendingStatuses.includes(prev)
    ) {
      slideUp.setValue(50);
      fadeIn.setValue(0);
      Animated.parallel([
        Animated.spring(slideUp, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
        }),
        Animated.timing(fadeIn, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
    if (!prevStatus.current && st && !pendingStatuses.includes(st)) {
      slideUp.setValue(0);
      fadeIn.setValue(1);
    }
    prevStatus.current = st || "";
  }, [ride?.status]);

  useEffect(() => {
    const status = ride?.status;
    if (status !== "searching" && status !== "no_riders") return;
    const poll = async () => {
      try {
        const d = await getDispatchStatus(rideId);
        setDispatchInfo(d);
      } catch (err) {
        console.warn("[RideTracker] Dispatch status poll failed:", err instanceof Error ? err.message : String(err));
      }
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [rideId, ride?.status]);

  const handleRetryDispatch = async () => {
    setRetrying(true);
    try {
      await retryRideDispatch(rideId);
      setRide((r: any) => (r ? { ...r, status: "searching" } : r));
      setDispatchInfo(null);
    } catch {
      showToast("Could not retry. Please try again.", "error");
    }
    setRetrying(false);
  };

  const rideApiBase = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

  const graceSecondsLeft = acceptedAt
    ? Math.max(0, CANCEL_GRACE_SEC - Math.floor((Date.now() - acceptedAt) / 1000))
    : null;
  const inGracePeriod = graceSecondsLeft !== null && graceSecondsLeft > 0;
  const effectiveCancellationFee = inGracePeriod ? 0 : cancellationFee;

  const openUnifiedCancelModal = () => {
    const riderAssigned = [
      "accepted",
      "arrived",
      "in_transit",
    ].includes(ride?.status || "");
    setCancelModalTarget({
      id: rideId,
      type: "ride",
      status: ride?.status || "searching",
      fare: ride?.fare,
      paymentMethod: ride?.paymentMethod,
      riderAssigned,
    });
  };

  const openInMaps = () => {
    if (
      !ride?.pickupLat ||
      !ride?.pickupLng ||
      !ride?.dropLat ||
      !ride?.dropLng
    )
      return;
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&origin=${ride.pickupLat},${ride.pickupLng}&destination=${ride.dropLat},${ride.dropLng}&travelmode=driving`,
    );
  };

  const status = ride?.status ?? "searching";
  const rideType = ride?.type ?? initialType;
  const STEPS = ["accepted", "arrived", "in_transit", "completed"];
  const LABELS = ["Accepted", "Arrived", "On Route", "Done"];
  const stepIdx = STEPS.indexOf(status);
  const elapsedStr =
    elapsed < 60
      ? `${elapsed}s`
      : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  if (!ride) {
    return <RideStatusSkeleton />;
  }

  if (status === "bargaining") {
    return (
      <NegotiationScreen
        rideId={rideId}
        ride={ride}
        setRide={setRide}
        elapsed={elapsed}
        cancellationFee={effectiveCancellationFee}
        token={token}
        broadcastTimeoutSec={ride?.broadcastTimeoutSec ?? 300}
        estimatedFare={ride?.estimatedFare ?? ride?.fare}
        minOffer={ride?.minOffer}
      />
    );
  }

  if (status === "no_riders" || (status === "searching" && elapsed >= 180)) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0F172A" }}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
        >
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: "rgba(239,68,68,0.12)",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <Ionicons name="car-outline" size={44} color="#EF4444" />
          </View>
          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 24,
              color: "#fff",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            No Drivers Available
          </Text>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              color: "rgba(255,255,255,0.5)",
              textAlign: "center",
              lineHeight: 22,
              marginBottom: 12,
            }}
          >
            {dispatchInfo?.notifiedRiders > 0
              ? `We notified ${dispatchInfo.notifiedRiders} driver(s) but none accepted.`
              : "No drivers are available right now. Try again shortly."}
          </Text>
          {dispatchInfo && (
            <View
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 12,
                marginBottom: 24,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                {dispatchInfo.notifiedRiders} riders notified ·{" "}
                {dispatchInfo.elapsedSec}s elapsed
                {dispatchInfo.dispatchLoopCount != null
                  ? ` · Round ${dispatchInfo.dispatchLoopCount}/${dispatchInfo.maxLoops}`
                  : ""}
              </Text>
            </View>
          )}
          <Pressable
            onPress={handleRetryDispatch}
            disabled={retrying}
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              paddingVertical: 16,
              paddingHorizontal: 32,
              alignItems: "center",
              width: "100%",
              marginBottom: 12,
              opacity: retrying ? 0.6 : 1,
            }}
          >
            {retrying ? (
              <ActivityIndicator color={C.primary} size="small" />
            ) : (
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 15,
                  color: C.primary,
                }}
              >
                Retry Search
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={onReset}
            style={{
              backgroundColor: "rgba(245,158,11,0.18)",
              borderWidth: 1.5,
              borderColor: "rgba(245,158,11,0.4)",
              borderRadius: 16,
              paddingVertical: 14,
              paddingHorizontal: 32,
              alignItems: "center",
              width: "100%",
              marginBottom: 12,
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons name="trending-up-outline" size={16} color="#F59E0B" />
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 15,
                color: "#F59E0B",
              }}
            >
              Increase Offer
            </Text>
          </Pressable>
          <Pressable
            onPress={onReset}
            style={{
              backgroundColor: "rgba(99,102,241,0.15)",
              borderWidth: 1.5,
              borderColor: "rgba(99,102,241,0.35)",
              borderRadius: 16,
              paddingVertical: 14,
              paddingHorizontal: 32,
              alignItems: "center",
              width: "100%",
              marginBottom: 12,
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons name="swap-horizontal-outline" size={16} color="#818CF8" />
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 15,
                color: "#818CF8",
              }}
            >
              Try a Different Service
            </Text>
          </Pressable>
          <Pressable
            onPress={() => openUnifiedCancelModal()}
            disabled={cancelling}
            style={{
              borderWidth: 1.5,
              borderColor: "rgba(239,68,68,0.4)",
              borderRadius: 16,
              paddingVertical: 14,
              paddingHorizontal: 32,
              alignItems: "center",
              width: "100%",
              marginBottom: 12,
            }}
          >
            {cancelling ? (
              <ActivityIndicator color="#EF4444" size="small" />
            ) : (
              <>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#EF4444" }}>
                  Cancel Ride
                </Text>
                {inGracePeriod && graceSecondsLeft !== null && (
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#16A34A", marginTop: 2 }}>
                    Free cancel: {Math.floor(graceSecondsLeft / 60)}:{String(graceSecondsLeft % 60).padStart(2, "0")} left
                  </Text>
                )}
              </>
            )}
          </Pressable>
          <Pressable
            onPress={onReset}
            style={{
              borderWidth: 1.5,
              borderColor: "rgba(255,255,255,0.15)",
              borderRadius: 16,
              paddingVertical: 14,
              paddingHorizontal: 32,
              alignItems: "center",
              width: "100%",
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 15,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              Go Back
            </Text>
          </Pressable>
        </View>

        {cancelModalTarget && (
          <CancelModal
            target={cancelModalTarget}
            cancellationFee={effectiveCancellationFee}
            apiBase={rideApiBase}
            token={token}
            onClose={() => setCancelModalTarget(null)}
            onDone={(result) => {
              setCancelResult({
                cancellationFee: result?.cancellationFee,
                cancelReason: result?.cancelReason,
              });
              setRide((r: any) =>
                r ? { ...r, status: "cancelled" } : r,
              );
            }}
          />
        )}
      </View>
    );
  }

  if (status === "searching") {
    return (
      <View style={{ flex: 1, backgroundColor: "#0F172A" }}>
        <View
          style={{
            position: "absolute",
            top: topPad + 16,
            left: 20,
            zIndex: 10,
          }}
        >
          <Pressable
            onPress={() => router.push("/(tabs)")}
            hitSlop={8}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.1)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
        </View>

        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
        >
          <View
            style={{
              width: 160,
              height: 160,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <ActivityIndicator size="large" color="#FCD34D" />
          </View>
          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 22,
              color: "#fff",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Finding Your Driver
          </Text>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              color: "rgba(255,255,255,0.5)",
              textAlign: "center",
              lineHeight: 22,
            }}
          >
            Searching nearby drivers... {elapsedStr}
          </Text>

          {connectionType === "sse" && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 12,
                backgroundColor: "rgba(16,185,129,0.15)",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 10,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "#10B981",
                }}
              />
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 11,
                  color: "#10B981",
                }}
              >
                Live updates
              </Text>
            </View>
          )}

          {dispatchInfo && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 16,
                backgroundColor: "rgba(255,255,255,0.06)",
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Ionicons
                name="navigate-outline"
                size={13}
                color="rgba(255,255,255,0.5)"
              />
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                Round {(dispatchInfo.dispatchLoopCount ?? 0) + 1}/
                {dispatchInfo.maxLoops || "?"} ·{" "}
                {dispatchInfo.attemptCount || 0} contacted
              </Text>
            </View>
          )}

          <View
            style={{
              flexDirection: "row",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              overflow: "hidden",
              marginTop: 36,
              width: "100%",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            {[
              { val: "50+", lbl: "Active Drivers" },
              { val: "2–5", lbl: "Min ETA" },
            ].map((s, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  alignItems: "center",
                  padding: 16,
                  borderLeftWidth: i > 0 ? 1 : 0,
                  borderLeftColor: "rgba(255,255,255,0.08)",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 22,
                    color: "#fff",
                  }}
                >
                  {s.val}
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 11,
                    color: "rgba(255,255,255,0.4)",
                    marginTop: 4,
                  }}
                >
                  {s.lbl}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View
          style={{
            paddingHorizontal: 24,
            paddingBottom: Math.max(insets.bottom, 24) + 16,
          }}
        >
          <Pressable
            onPress={() => openUnifiedCancelModal()}
            disabled={cancelling}
            style={{
              alignItems: "center",
              padding: 16,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: "rgba(239,68,68,0.3)",
              backgroundColor: "rgba(239,68,68,0.08)",
            }}
          >
            {cancelling ? (
              <ActivityIndicator color="#EF4444" size="small" />
            ) : (
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 15,
                  color: "#EF4444",
                }}
              >
                Cancel Ride
              </Text>
            )}
          </Pressable>
        </View>

        {cancelModalTarget && (
          <CancelModal
            target={cancelModalTarget}
            cancellationFee={effectiveCancellationFee}
            apiBase={rideApiBase}
            token={token}
            onClose={() => setCancelModalTarget(null)}
            onDone={(result) => {
              setCancelResult({
                cancellationFee: result?.cancellationFee,
                cancelReason: result?.cancelReason,
              });
              setRide((r: any) =>
                r ? { ...r, status: "cancelled" } : r,
              );
            }}
          />
        )}
      </View>
    );
  }

  if (status === "cancelled") {
    const wasWallet = ride?.paymentMethod === "wallet";
    const appliedFee = cancelResult?.cancellationFee ?? 0;
    const cancelReason = cancelResult?.cancelReason;
    return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <View
          style={{
            paddingTop: topPad + 24,
            paddingBottom: 36,
            alignItems: "center",
            paddingHorizontal: 24,
            backgroundColor: "#fff",
            borderBottomWidth: 1,
            borderBottomColor: C.border,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: "#FEE2E2",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons name="close-circle" size={40} color="#EF4444" />
          </View>
          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 22,
              color: C.text,
            }}
          >
            Ride Cancelled
          </Text>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              color: C.textMuted,
              marginTop: 6,
            }}
          >
            Your ride has been cancelled
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          {appliedFee > 0 && (
            <View
              style={{
                backgroundColor: "#FEF2F2",
                borderRadius: 16,
                padding: 16,
                gap: 8,
                borderWidth: 1,
                borderColor: "#FEE2E2",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    backgroundColor: "#FEE2E2",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="cash-outline" size={16} color="#DC2626" />
                </View>
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 14,
                    color: "#991B1B",
                  }}
                >
                  Cancellation Fee Applied
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: "#374151",
                  lineHeight: 19,
                }}
              >
                Rs. {appliedFee} cancellation fee has been charged.
              </Text>
            </View>
          )}
          {wasWallet && (
            <View
              style={{
                backgroundColor: "#F0FDF4",
                borderRadius: 16,
                padding: 16,
                gap: 8,
                borderWidth: 1,
                borderColor: "#D1FAE5",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    backgroundColor: "#D1FAE5",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="wallet-outline"
                    size={16}
                    color="#10B981"
                  />
                </View>
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 14,
                    color: "#065F46",
                  }}
                >
                  Refund Initiated
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: "#374151",
                  lineHeight: 19,
                }}
              >
                Rs. {Math.round((ride?.fare ?? 0) - appliedFee)} will be refunded to your wallet.
              </Text>
            </View>
          )}
          {cancelReason && (
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: C.textMuted,
                  marginBottom: 4,
                }}
              >
                Reason
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: C.text,
                }}
              >
                {cancelReason}
              </Text>
            </View>
          )}
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: C.border,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: C.textMuted,
              }}
            >
              Ride #{rideId.slice(-8).toUpperCase()}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={() => router.push("/(tabs)")}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: 16,
                borderRadius: 14,
                backgroundColor: "#F1F5F9",
              }}
            >
              <Ionicons
                name="home-outline"
                size={17}
                color={C.textSecondary}
              />
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  color: C.textSecondary,
                }}
              >
                Home
              </Text>
            </Pressable>
            <Pressable
              onPress={onReset}
              style={{
                flex: 2,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: 16,
                borderRadius: 14,
                backgroundColor: C.primary,
              }}
            >
              <Ionicons name="add" size={17} color="#fff" />
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 14,
                  color: "#fff",
                }}
              >
                Book New Ride
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (status === "completed") {
    return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <View
          style={{
            paddingTop: topPad + 24,
            paddingBottom: 32,
            alignItems: "center",
            paddingHorizontal: 24,
            backgroundColor: "#fff",
            borderBottomWidth: 1,
            borderBottomColor: C.border,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: "#D1FAE5",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons
              name="checkmark-circle"
              size={40}
              color="#10B981"
            />
          </View>
          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 22,
              color: C.text,
            }}
          >
            Ride Complete!
          </Text>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              color: C.textMuted,
              marginTop: 6,
            }}
          >
            Rs. {ride?.fare} · {parseFloat(ride?.distance ?? "0").toFixed(1)} km
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, gap: 14 }}
        >
          {!ratingDone ? (
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 20,
                padding: 20,
                alignItems: "center",
                gap: 12,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 16,
                  color: C.text,
                }}
              >
                Rate Your Driver
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 12,
                  marginVertical: 4,
                }}
              >
                {[1, 2, 3, 4, 5].map((s) => (
                  <Pressable key={s} onPress={() => setRating(s)}>
                    <Ionicons
                      name={s <= rating ? "star" : "star-outline"}
                      size={36}
                      color={s <= rating ? "#F59E0B" : "#D1D5DB"}
                    />
                  </Pressable>
                ))}
              </View>
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: C.textMuted,
                }}
              >
                {rating === 0
                  ? "Tap to rate"
                  : rating === 5
                    ? "Excellent!"
                    : rating >= 4
                      ? "Great ride!"
                      : rating >= 3
                        ? "It was okay"
                        : "Could be better"}
              </Text>
              {rating > 0 && (
                <>
                  <TextInput
                    placeholder="Add a comment (optional)..."
                    value={ratingComment}
                    onChangeText={setRatingComment}
                    style={{
                      width: "100%",
                      borderWidth: 1,
                      borderColor: C.border,
                      borderRadius: 14,
                      padding: 12,
                      fontFamily: "Inter_400Regular",
                      fontSize: 14,
                      color: C.text,
                      marginTop: 4,
                    }}
                    placeholderTextColor={C.textMuted}
                  />
                  <Pressable
                    onPress={async () => {
                      try {
                        await rateRide(rideId, {
                          stars: rating,
                          comment: ratingComment || undefined,
                        });
                        setRatingDone(true);
                        AsyncStorage.setItem(`rated_ride_${rideId}`, "1").catch(() => {});
                      } catch {
                        showToast(
                          "Could not submit rating. Please try again.",
                          "error",
                        );
                      }
                    }}
                    style={{
                      backgroundColor: C.primary,
                      borderRadius: 14,
                      paddingVertical: 14,
                      paddingHorizontal: 24,
                      width: "100%",
                      alignItems: "center",
                      marginTop: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: 14,
                        color: "#fff",
                      }}
                    >
                      Submit Rating
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <View
              style={{
                backgroundColor: "#D1FAE5",
                borderRadius: 16,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={20}
                color="#059669"
              />
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  color: "#065F46",
                }}
              >
                Thanks for rating!
              </Text>
            </View>
          )}

          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 20,
              borderWidth: 1,
              borderColor: C.border,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                backgroundColor: C.surfaceSecondary,
                padding: 14,
                borderBottomWidth: 1,
                borderBottomColor: C.border,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 14,
                  color: C.text,
                }}
              >
                Receipt
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 11,
                  color: C.textMuted,
                }}
              >
                #{rideId.slice(-8).toUpperCase()}
              </Text>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              {[
                {
                  lbl: "Vehicle",
                  val:
                    rideType === "bike"
                      ? "Bike"
                      : rideType === "car"
                        ? "Car"
                        : rideType === "rickshaw"
                          ? "Rickshaw"
                          : rideType,
                },
                { lbl: "Distance", val: `${parseFloat(ride?.distance ?? "0").toFixed(1)} km` },
                {
                  lbl: "Payment",
                  val:
                    ride?.paymentMethod === "wallet" ? "Wallet" : ride?.paymentMethod === "jazzcash" ? "JazzCash" : ride?.paymentMethod === "easypaisa" ? "EasyPaisa" : "Cash",
                },
                {
                  lbl: "Driver",
                  val: ride?.riderName || "AJK Driver",
                },
              ].map((r) => (
                <View
                  key={r.lbl}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_400Regular",
                      fontSize: 13,
                      color: C.textMuted,
                    }}
                  >
                    {r.lbl}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 13,
                      color: C.text,
                    }}
                  >
                    {r.val}
                  </Text>
                </View>
              ))}
              <View
                style={{
                  height: 1,
                  backgroundColor: C.border,
                  marginVertical: 4,
                }}
              />
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 15,
                    color: C.text,
                  }}
                >
                  Total
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 22,
                    color: C.success,
                  }}
                >
                  Rs. {ride?.fare}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 20,
              padding: 16,
              gap: 14,
              borderWidth: 1,
              borderColor: C.border,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 14,
                  color: C.text,
                }}
              >
                Route
              </Text>
              <Pressable
                onPress={openInMaps}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: "#EFF6FF",
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 10,
                }}
              >
                <Ionicons
                  name="navigate-outline"
                  size={12}
                  color="#4285F4"
                />
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 11,
                    color: "#4285F4",
                  }}
                >
                  Map
                </Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ alignItems: "center", gap: 4 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: "#10B981",
                  }}
                />
                <View
                  style={{
                    flex: 1,
                    width: 2,
                    backgroundColor: C.border,
                    minHeight: 20,
                  }}
                />
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: "#EF4444",
                  }}
                />
              </View>
              <View style={{ flex: 1, gap: 16 }}>
                <View>
                  <Text
                    style={{
                      fontFamily: "Inter_400Regular",
                      fontSize: 11,
                      color: C.textMuted,
                    }}
                  >
                    Pickup
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 13,
                      color: C.text,
                      marginTop: 2,
                    }}
                  >
                    {ride?.pickupAddress}
                  </Text>
                </View>
                <View>
                  <Text
                    style={{
                      fontFamily: "Inter_400Regular",
                      fontSize: 11,
                      color: C.textMuted,
                    }}
                  >
                    Drop-off
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 13,
                      color: C.text,
                      marginTop: 2,
                    }}
                  >
                    {ride?.dropAddress}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: "#F0FDF4",
              padding: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#D1FAE5",
            }}
          >
            <Ionicons
              name="shield-checkmark"
              size={14}
              color="#059669"
            />
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                color: "#065F46",
              }}
            >
              Insured ride · Verified driver · GPS tracked
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={() => router.push("/(tabs)")}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: 16,
                borderRadius: 14,
                backgroundColor: "#F1F5F9",
              }}
            >
              <Ionicons
                name="home-outline"
                size={17}
                color={C.textSecondary}
              />
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  color: C.textSecondary,
                }}
              >
                Home
              </Text>
            </Pressable>
            <Pressable
              onPress={onReset}
              style={{
                flex: 2,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: 16,
                borderRadius: 14,
                backgroundColor: C.primary,
              }}
            >
              <Ionicons name="add" size={17} color="#fff" />
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 14,
                  color: "#fff",
                }}
              >
                Book New Ride
              </Text>
            </Pressable>
          </View>
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    );
  }

  type StatusCfg = { color: string; icon: string; title: string; sub: string };
  const statusCfgs: Record<string, StatusCfg> = {
    accepted: {
      color: "#1A56DB",
      icon: "car",
      title: "Driver Is Coming",
      sub: "Your driver has accepted the ride",
    },
    arrived: {
      color: "#D97706",
      icon: "location",
      title: "Driver Has Arrived",
      sub: "Your driver is at the pickup point",
    },
    in_transit: {
      color: "#059669",
      icon: "navigate",
      title: "On Your Way",
      sub: "Trip in progress",
    },
  };
  const hdrCfg = statusCfgs[status] ?? statusCfgs["accepted"]!;
  const canCancel = ["accepted", "arrived", "in_transit"].includes(status);

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <View
        style={{
          paddingTop: topPad + 16,
          paddingBottom: 20,
          paddingHorizontal: 20,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
        >
          <Pressable
            onPress={() => router.push("/(tabs)")}
            hitSlop={8}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: C.surfaceSecondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </Pressable>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              backgroundColor: `${hdrCfg.color}15`,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name={hdrCfg.icon as any}
              size={26}
              color={hdrCfg.color}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 18,
                color: C.text,
              }}
            >
              {hdrCfg.title}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                color: C.textMuted,
                marginTop: 3,
              }}
            >
              {hdrCfg.sub}
            </Text>
          </View>
        </View>
      </View>

      {connectionType === "polling" && (
        <Pressable
          onPress={reconnect}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: "#FEF3C7",
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: "#FDE68A",
          }}
        >
          <Ionicons name="wifi-outline" size={15} color="#D97706" />
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "#92400E", flex: 1 }}>
            Live updates paused — tap to reconnect
          </Text>
          <Ionicons name="refresh-outline" size={15} color="#D97706" />
        </Pressable>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, gap: 14 }}
      >
        <Animated.View
          style={{
            opacity: fadeIn,
            transform: [{ translateY: slideUp }],
            gap: 14,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 20,
              padding: 18,
              borderWidth: 1,
              borderColor: C.border,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 14,
                color: C.text,
                marginBottom: 18,
              }}
            >
              Ride Progress
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
              }}
            >
              {STEPS.map((step, i) => {
                const done = stepIdx >= i;
                const active = stepIdx === i;
                const isLast = i === STEPS.length - 1;
                return (
                  <React.Fragment key={step}>
                    <View
                      style={{
                        alignItems: "center",
                        flex: 1,
                        gap: 6,
                      }}
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: done
                            ? active
                              ? hdrCfg.color
                              : "#10B981"
                            : "#F1F5F9",
                          alignItems: "center",
                          justifyContent: "center",
                          ...(active
                            ? {
                                shadowColor: hdrCfg.color,
                                shadowOffset: {
                                  width: 0,
                                  height: 2,
                                },
                                shadowOpacity: 0.3,
                                shadowRadius: 6,
                              }
                            : {}),
                        }}
                      >
                        {done ? (
                          <Ionicons
                            name="checkmark"
                            size={15}
                            color="#fff"
                          />
                        ) : (
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: "#CBD5E1",
                            }}
                          />
                        )}
                      </View>
                      <Text
                        style={{
                          fontSize: 10,
                          textAlign: "center",
                          color: done ? C.text : C.textMuted,
                          fontFamily: active
                            ? "Inter_700Bold"
                            : "Inter_400Regular",
                        }}
                      >
                        {LABELS[i]}
                      </Text>
                    </View>
                    {!isLast && (
                      <View
                        style={{
                          height: 2,
                          flex: 0.4,
                          backgroundColor:
                            stepIdx > i ? "#10B981" : "#F1F5F9",
                          marginTop: 15,
                          borderRadius: 1,
                        }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          </View>

          {/* ── OTP Security Card — shown when driver has arrived ── */}
          {status === "arrived" && tripOtp && (
            <View
              style={{
                backgroundColor: "#FFFBEB",
                borderRadius: 20,
                padding: 20,
                borderWidth: 2,
                borderColor: "#F59E0B",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: "#FDE68A",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="shield-checkmark" size={20} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: "#92400E" }}>
                    Trip Security Code
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "#B45309", marginTop: 1 }}>
                    Share this with your driver to start the trip
                  </Text>
                </View>
              </View>

              {/* 4-digit OTP display */}
              <View style={{ flexDirection: "row", gap: 10, justifyContent: "center", marginBottom: 16 }}>
                {tripOtp.split("").map((digit, idx) => (
                  <View
                    key={idx}
                    style={{
                      width: 56,
                      height: 64,
                      borderRadius: 14,
                      backgroundColor: "#fff",
                      borderWidth: 2,
                      borderColor: "#F59E0B",
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: "#F59E0B",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.15,
                      shadowRadius: 4,
                      elevation: 3,
                    }}
                  >
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 32, color: "#92400E" }}>
                      {digit}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Copy button */}
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync(tripOtp);
                  setOtpCopied(true);
                  setTimeout(() => setOtpCopied(false), 2500);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  backgroundColor: otpCopied ? "#10B981" : "#F59E0B",
                  paddingVertical: 10,
                  borderRadius: 12,
                }}
              >
                <Ionicons
                  name={otpCopied ? "checkmark-circle" : "copy-outline"}
                  size={16}
                  color="#fff"
                />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: "#fff" }}>
                  {otpCopied ? "Copied!" : "Copy Code"}
                </Text>
              </Pressable>
            </View>
          )}

          {ride?.riderName && (
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 20,
                padding: 18,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    backgroundColor: `${hdrCfg.color}12`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 22,
                      color: hdrCfg.color,
                    }}
                  >
                    {ride.riderName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 16,
                      color: C.text,
                    }}
                  >
                    {ride.riderName}
                  </Text>
                  {ride.riderPhone && (
                    <Text
                      style={{
                        fontFamily: "Inter_400Regular",
                        fontSize: 12,
                        color: C.textMuted,
                        marginTop: 2,
                      }}
                    >
                      {ride.riderPhone}
                    </Text>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 3,
                      marginTop: 5,
                    }}
                  >
                    {ride?.riderAvgRating != null && (
                      <>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Ionicons
                            key={s}
                            name={s <= Math.round(ride.riderAvgRating) ? "star" : "star-outline"}
                            size={11}
                            color="#F59E0B"
                          />
                        ))}
                        <Text
                          style={{
                            fontFamily: "Inter_400Regular",
                            fontSize: 10,
                            color: C.textMuted,
                            marginLeft: 4,
                          }}
                        >
                          {ride.riderAvgRating.toFixed(1)}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
                <View
                  style={{
                    backgroundColor: C.surfaceSecondary,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 22 }}>
                    {
                      ({
                        bike: "🏍️",
                        car: "🚗",
                        rickshaw: "🛺",
                        daba: "🚐",
                        school_shift: "🚌",
                      } as Record<string, string>)[rideType] ?? "🚗"
                    }
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 10,
                      color: C.textSecondary,
                      marginTop: 3,
                    }}
                  >
                    {
                      ({
                        bike: "Bike",
                        car: "Car",
                        rickshaw: "Rickshaw",
                        daba: "Daba",
                        school_shift: "School",
                      } as Record<string, string>)[rideType] ?? rideType
                    }
                  </Text>
                </View>
              </View>

              {(riderLivePos != null || ride.riderLat != null) &&
                (status === "accepted" || status === "arrived" || status === "in_transit") &&
                (() => {
                  /* Prefer live socket position, fall back to polling data */
                  const effLat = riderLivePos?.lat ?? ride.riderLat!;
                  const effLng = riderLivePos?.lng ?? ride.riderLng!;
                  if (effLat == null || effLng == null) return null;

                  const km = ride.pickupLat != null
                    ? haversineKm(effLat, effLng, ride.pickupLat, ride.pickupLng!)
                    : null;
                  const nearby = km != null && km < 0.2;
                  const stale = riderLivePos == null &&
                    ride.riderLocAge != null && ride.riderLocAge > 90;
                  const isLive = riderLivePos != null;

                  /* Build static map markers: rider (green) + pickup (red) */
                  const mapMarkers: Array<{ lat: number; lng: number; color: string }> = [
                    { lat: effLat, lng: effLng, color: "green" },
                    ...(ride.pickupLat != null
                      ? [{ lat: ride.pickupLat, lng: ride.pickupLng!, color: "red" }]
                      : []),
                  ];
                  const mapImgUrl = staticMapUrl(mapMarkers, { width: 600, height: 200, zoom: km != null && km < 1 ? 16 : 14 });

                  return (
                    <>
                      {/* Live map showing rider position */}
                      <View
                        style={{
                          borderRadius: 14,
                          overflow: "hidden",
                          marginBottom: 10,
                          borderWidth: 1,
                          borderColor: "#E2E8F0",
                        }}
                      >
                        <Image
                          source={{ uri: mapImgUrl }}
                          style={{ width: "100%", height: 180 }}
                          resizeMode="cover"
                        />
                        {/* Live indicator overlay */}
                        <View
                          style={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            backgroundColor: isLive ? "#10B981" : "#94A3B8",
                            borderRadius: 8,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff", opacity: isLive ? 1 : 0.6 }} />
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#fff" }}>
                            {isLive ? "LIVE" : "LAST KNOWN"}
                          </Text>
                        </View>
                      </View>

                      {/* Distance badge */}
                      {km != null && (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            backgroundColor: nearby ? "#F0FDF4" : "#EFF6FF",
                            borderRadius: 12,
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            marginBottom: 14,
                            borderWidth: 1,
                            borderColor: nearby ? "#D1FAE5" : "#DBEAFE",
                          }}
                        >
                          <Ionicons
                            name={nearby ? "location" : "navigate-outline"}
                            size={16}
                            color={nearby ? "#10B981" : C.primary}
                          />
                          <Text
                            style={{
                              fontFamily: "Inter_600SemiBold",
                              fontSize: 13,
                              color: nearby ? "#065F46" : "#1E40AF",
                              flex: 1,
                            }}
                          >
                            {nearby
                              ? "Driver is nearby!"
                              : `${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} away`}
                          </Text>
                          {isLive && (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" }} />
                          )}
                          {stale && (
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: C.textMuted }}>
                              stale
                            </Text>
                          )}
                        </View>
                      )}
                    </>
                  );
                })()}

              <View style={{ flexDirection: "row", gap: 10 }}>
                {ride.riderPhone && (
                  <Pressable
                    onPress={() =>
                      Linking.openURL(`tel:${ride.riderPhone}`)
                    }
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: 14,
                      borderRadius: 14,
                      backgroundColor: C.primary,
                    }}
                  >
                    <Ionicons name="call" size={18} color="#fff" />
                    <Text
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: 14,
                        color: "#fff",
                      }}
                    >
                      Call
                    </Text>
                  </Pressable>
                )}
                {ride.riderPhone && (
                  <Pressable
                    onPress={() =>
                      Linking.openURL(
                        `https://wa.me/92${ride.riderPhone.replace(/^(\+92|0)/, "")}`,
                      )
                    }
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      backgroundColor: "#25D366",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="logo-whatsapp"
                      size={24}
                      color="#fff"
                    />
                  </Pressable>
                )}
                {sosEnabled && (
                <Pressable
                  onPress={async () => {
                    if (sosSent) return;
                    setSosLoading(true);
                    try {
                      const resp = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/sos`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        body: JSON.stringify({ rideId }),
                      });
                      if (resp.ok) {
                        setSosSent(true);
                      } else {
                        showToast("SOS failed — please call emergency contacts directly");
                      }
                    } catch {
                      showToast("SOS failed — please call emergency contacts directly");
                    }
                    setSosLoading(false);
                  }}
                  disabled={sosLoading || sosSent}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    backgroundColor: sosSent ? "#6B7280" : "#EF4444",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: sosSent ? 0.7 : 1,
                  }}
                >
                  {sosLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "#fff", letterSpacing: 0.5 }}>
                      {sosSent ? "SENT" : "SOS"}
                    </Text>
                  )}
                </Pressable>
                )}
              </View>
            </View>
          )}

          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 20,
              padding: 16,
              gap: 14,
              borderWidth: 1,
              borderColor: C.border,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 14,
                color: C.text,
              }}
            >
              Trip Details
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ alignItems: "center", gap: 4 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: "#10B981",
                  }}
                />
                <View
                  style={{
                    flex: 1,
                    width: 2,
                    backgroundColor: C.border,
                    minHeight: 20,
                  }}
                />
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: "#EF4444",
                  }}
                />
              </View>
              <View style={{ flex: 1, gap: 16 }}>
                <View>
                  <Text
                    style={{
                      fontFamily: "Inter_400Regular",
                      fontSize: 11,
                      color: C.textMuted,
                    }}
                  >
                    Pickup
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 13,
                      color: C.text,
                      marginTop: 2,
                    }}
                  >
                    {ride?.pickupAddress}
                  </Text>
                </View>
                <View>
                  <Text
                    style={{
                      fontFamily: "Inter_400Regular",
                      fontSize: 11,
                      color: C.textMuted,
                    }}
                  >
                    Drop-off
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 13,
                      color: C.text,
                      marginTop: 2,
                    }}
                  >
                    {ride?.dropAddress}
                  </Text>
                </View>
              </View>
            </View>
            <View
              style={{ height: 1, backgroundColor: C.border }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: C.textMuted,
                }}
              >
                Fare
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 16,
                  color: C.success,
                }}
              >
                Rs. {ride?.fare}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={openInMaps}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: "#EFF6FF",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: "#DBEAFE",
            }}
          >
            <Ionicons
              name="navigate-outline"
              size={16}
              color="#4285F4"
            />
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
                color: "#4285F4",
              }}
            >
              Open in Google Maps
            </Text>
          </Pressable>

          {canCancel && (
            <Pressable
              onPress={() => openUnifiedCancelModal()}
              disabled={cancelling}
              style={{
                alignItems: "center",
                padding: 16,
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: "#FCA5A5",
                backgroundColor: "#FEF2F2",
              }}
            >
              {cancelling ? (
                <ActivityIndicator color="#DC2626" size="small" />
              ) : (
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 15,
                    color: "#DC2626",
                  }}
                >
                  Cancel Ride
                </Text>
              )}
            </Pressable>
          )}
        </Animated.View>
        <View style={{ height: 24 }} />
      </ScrollView>

      {cancelModalTarget && (
        <CancelModal
          target={cancelModalTarget}
          cancellationFee={effectiveCancellationFee}
          apiBase={rideApiBase}
          token={token}
          onClose={() => setCancelModalTarget(null)}
          onDone={(result) => {
            setCancelResult({
              cancellationFee: result?.cancellationFee,
              cancelReason: result?.cancelReason,
            });
            setRide((r: any) =>
              r ? { ...r, status: "cancelled" } : r,
            );
          }}
        />
      )}
    </View>
  );
}
