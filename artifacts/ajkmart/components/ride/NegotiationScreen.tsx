import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "@/context/ToastContext";
import { CancelModal } from "@/components/CancelModal";
import type { CancelTarget } from "@/components/CancelModal";
import {
  acceptRideBid as acceptRideBidApi,
  customerCounterOffer as customerCounterOfferApi,
} from "@workspace/api-client-react";

type NegotiationScreenProps = {
  rideId: string;
  ride: any;
  setRide: (updater: (r: any) => any) => void;
  elapsed: number;
  cancellationFee: number;
  token: string | null;
  broadcastTimeoutSec?: number;
  estimatedFare?: number;
  minOffer?: number;
};

export function NegotiationScreen({
  rideId,
  ride,
  setRide,
  elapsed,
  cancellationFee,
  token,
  broadcastTimeoutSec = 300,
  estimatedFare,
  minOffer: minOfferProp,
}: NegotiationScreenProps) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { showToast } = useToast();

  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const ring3 = useRef(new Animated.Value(1)).current;
  const ring1Op = useRef(new Animated.Value(0.55)).current;
  const ring2Op = useRef(new Animated.Value(0.38)).current;
  const ring3Op = useRef(new Animated.Value(0.22)).current;

  const [updateOfferInput, setUpdateOfferInput] = useState("");
  const [updateOfferLoading, setUpdateOfferLoading] = useState(false);
  const [showUpdateOffer, setShowUpdateOffer] = useState(false);
  const [acceptBidId, setAcceptBidId] = useState<string | null>(null);
  const [cancelModalTarget, setCancelModalTarget] =
    useState<CancelTarget | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [offerError, setOfferError] = useState("");
  const [connectionLost, setConnectionLost] = useState(false);
  const consecutiveFailsRef = useRef(0);

  const rideApiBase = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

  useEffect(() => {
    const pulse = (
      scale: Animated.Value,
      op: Animated.Value,
      d: number,
      resetOp: number,
    ) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(d),
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 1.55,
              duration: 1300,
              useNativeDriver: true,
            }),
            Animated.timing(op, {
              toValue: 0,
              duration: 1300,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(op, {
              toValue: resetOp,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
    const a1 = pulse(ring1, ring1Op, 0, 0.55);
    const a2 = pulse(ring2, ring2Op, 350, 0.38);
    const a3 = pulse(ring3, ring3Op, 700, 0.22);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, []);

  useEffect(() => {
    const HEARTBEAT_MS = 15000;
    const FAIL_THRESHOLD = 2;
    const interval = setInterval(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${rideApiBase}/rides/${rideId}`, {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          consecutiveFailsRef.current = 0;
          setConnectionLost(false);
        } else {
          consecutiveFailsRef.current++;
        }
      } catch {
        clearTimeout(timeout);
        consecutiveFailsRef.current++;
      }
      if (consecutiveFailsRef.current >= FAIL_THRESHOLD) {
        setConnectionLost(true);
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [rideId, token, rideApiBase]);

  const offeredFare = ride?.offeredFare ?? 0;
  const bids: any[] = ride?.bids ?? [];
  const sortedBids = [...bids].sort((a, b) => a.fare - b.fare);
  const hasBids = bids.length > 0;
  const elapsedStr =
    elapsed < 60
      ? `${elapsed}s`
      : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  const remaining = Math.max(0, broadcastTimeoutSec - elapsed);
  const remainingMin = Math.floor(remaining / 60);
  const remainingSec = remaining % 60;
  const timerStr = `${remainingMin}:${String(remainingSec).padStart(2, "0")}`;
  const timerPct = broadcastTimeoutSec > 0 ? remaining / broadcastTimeoutSec : 1;
  const timerUrgent = timerPct < 0.2;

  const serverMinOffer = ride?.minOffer ?? minOfferProp;
  const minCounterOffer = serverMinOffer
    ? Math.ceil(serverMinOffer)
    : estimatedFare
      ? Math.ceil(estimatedFare * 0.7)
      : Math.ceil(offeredFare * 0.7);

  const validateOffer = (val: string): string => {
    const amt = parseFloat(val);
    if (isNaN(amt) || amt <= 0) return "Please enter a valid amount";
    if (amt < minCounterOffer)
      return `Minimum offer is Rs. ${minCounterOffer}`;
    return "";
  };

  const acceptBid = async (bidId: string) => {
    setAcceptBidId(bidId);
    try {
      const d = await acceptRideBidApi(rideId, { bidId });
      setRide(() => d as any);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "Could not accept bid. Please try again.";
      showToast(msg, "error");
    }
    setAcceptBidId(null);
  };

  const sendUpdateOffer = async () => {
    const err = validateOffer(updateOfferInput);
    if (err) {
      setOfferError(err);
      showToast(err, "error");
      return;
    }
    const amt = parseFloat(updateOfferInput);
    setUpdateOfferLoading(true);
    setOfferError("");
    try {
      const d = await customerCounterOfferApi(rideId, { offeredFare: String(amt) });
      setRide(() => d as any);
      setUpdateOfferInput("");
      setShowUpdateOffer(false);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "Could not update offer. Please try again.";
      showToast(msg, "error");
    }
    setUpdateOfferLoading(false);
  };

  const openUnifiedCancelModal = () => {
    const riderAssigned = [
      "accepted",
      "arrived",
      "in_transit",
    ].includes(ride?.status || "");
    setCancelModalTarget({
      id: rideId,
      type: "ride",
      status: ride?.status || "bargaining",
      fare: ride?.fare,
      paymentMethod: ride?.paymentMethod,
      riderAssigned,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0F172A" }}>
      <LinearGradient
        colors={["#1E293B", "#0F172A"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        }}
      />

      <View
        style={{
          paddingTop: topPad + 16,
          paddingHorizontal: 20,
          paddingBottom: 14,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
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
            <View>
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 18,
                  color: "#fff",
                }}
              >
                Live Negotiation
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.5)",
                  marginTop: 2,
                }}
              >
                #{rideId.slice(-8).toUpperCase()} · {elapsedStr}
              </Text>
            </View>
          </View>
          <View
            style={{
              backgroundColor: "rgba(251,191,36,0.15)",
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 10,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(251,191,36,0.3)",
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 20,
                color: "#FCD34D",
              }}
            >
              Rs. {offeredFare}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 10,
                color: "rgba(251,191,36,0.7)",
              }}
            >
              Your Offer
            </Text>
          </View>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 20,
          paddingBottom: 10,
          gap: 10,
        }}
      >
        <Ionicons
          name="timer-outline"
          size={16}
          color={timerUrgent ? "#EF4444" : "rgba(255,255,255,0.6)"}
        />
        <View
          style={{
            flex: 1,
            height: 4,
            backgroundColor: "rgba(255,255,255,0.1)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: 4,
              borderRadius: 2,
              width: `${Math.max(timerPct * 100, 0)}%`,
              backgroundColor: timerUrgent ? "#EF4444" : "#FCD34D",
            }}
          />
        </View>
        <Text
          style={{
            fontFamily: "Inter_700Bold",
            fontSize: 14,
            color: timerUrgent ? "#EF4444" : "#FCD34D",
            minWidth: 44,
            textAlign: "right",
          }}
        >
          {timerStr}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 120,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        {!hasBids && (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <View
              style={{
                width: 160,
                height: 160,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Animated.View
                style={{
                  position: "absolute",
                  width: 160,
                  height: 160,
                  borderRadius: 80,
                  backgroundColor: "rgba(251,191,36,0.06)",
                  transform: [{ scale: ring3 }],
                  opacity: ring3Op,
                }}
              />
              <Animated.View
                style={{
                  position: "absolute",
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  backgroundColor: "rgba(251,191,36,0.1)",
                  transform: [{ scale: ring2 }],
                  opacity: ring2Op,
                }}
              />
              <Animated.View
                style={{
                  position: "absolute",
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: "rgba(251,191,36,0.16)",
                  transform: [{ scale: ring1 }],
                  opacity: ring1Op,
                }}
              />
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: "rgba(251,191,36,0.25)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="chatbubbles" size={28} color="#FCD34D" />
              </View>
            </View>
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 20,
                color: "#fff",
                textAlign: "center",
              }}
            >
              Waiting for Riders
            </Text>
            <Text
              style={{
                fontFamily: "Inter_400Regular",
                fontSize: 13,
                color: "rgba(255,255,255,0.5)",
                textAlign: "center",
                marginTop: 8,
                lineHeight: 20,
                maxWidth: 260,
              }}
            >
              Riders are reviewing your offer. You'll see bids appear here.
            </Text>
            {connectionLost && (
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 8,
                backgroundColor: "rgba(239,68,68,0.15)", borderRadius: 12,
                paddingHorizontal: 14, paddingVertical: 8, marginTop: 12,
                borderWidth: 1, borderColor: "rgba(239,68,68,0.25)",
              }}>
                <Ionicons name="cloud-offline-outline" size={16} color="#EF4444" />
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "#FCA5A5" }}>
                  Connection lost — tap below to reconnect
                </Text>
              </View>
            )}
            {(remaining <= 0 || connectionLost) && (
              <Pressable
                onPress={async () => {
                  try {
                    const res = await fetch(`${rideApiBase}/rides/${rideId}/retry`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                      },
                    });
                    if (res.ok) {
                      setConnectionLost(false);
                      showToast("Searching for more riders...", "success");
                    } else {
                      showToast("Could not refresh. Please try again.", "error");
                    }
                  } catch {
                    setConnectionLost(true);
                    showToast("Connection issue. Please try again.", "error");
                  }
                }}
                style={{
                  marginTop: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: "rgba(251,191,36,0.2)",
                  borderRadius: 14,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderWidth: 1,
                  borderColor: "rgba(251,191,36,0.3)",
                }}
              >
                <Ionicons name="refresh-outline" size={18} color="#FCD34D" />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#FCD34D" }}>
                  {connectionLost ? "Reconnect & Search Again" : "Refresh & Search Again"}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {hasBids && (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "#10B981",
                }}
              />
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                {bids.length} Bid{bids.length > 1 ? "s" : ""} Received
              </Text>
            </View>
            {sortedBids.map((bid: any) => (
              <View
                key={bid.id}
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: 20,
                  padding: 18,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.1)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: "rgba(251,191,36,0.15)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 22 }}>🏍️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: 16,
                        color: "#fff",
                      }}
                    >
                      {bid.riderName}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                      {bid.ratingAvg != null && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Ionicons name="star" size={11} color="#FCD34D" />
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#FCD34D" }}>
                            {bid.ratingAvg.toFixed(1)}
                          </Text>
                          {bid.totalRides > 0 && (
                            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                              ({bid.totalRides})
                            </Text>
                          )}
                        </View>
                      )}
                      {bid.vehiclePlate && (
                        <View style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 }}>
                            {bid.vehiclePlate}
                          </Text>
                        </View>
                      )}
                      {bid.vehicleType && (
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                          {bid.vehicleType}
                        </Text>
                      )}
                    </View>
                    {bid.note ? (
                      <Text
                        style={{
                          fontFamily: "Inter_400Regular",
                          fontSize: 12,
                          color: "rgba(255,255,255,0.5)",
                          marginTop: 3,
                        }}
                      >
                        {bid.note}
                      </Text>
                    ) : null}
                    {bid.ratingAvg == null && bid.totalRides === 0 && (
                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                        New rider
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: 22,
                        color: "#FCD34D",
                      }}
                    >
                      Rs. {Math.round(bid.fare)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Inter_400Regular",
                        fontSize: 10,
                        color: "rgba(255,255,255,0.4)",
                        marginTop: 2,
                      }}
                    >
                      {bid.fare === offeredFare
                        ? "Matches your offer"
                        : bid.fare > offeredFare
                          ? `+Rs. ${Math.round(bid.fare - offeredFare)}`
                          : `-Rs. ${Math.round(offeredFare - bid.fare)} savings`}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => acceptBid(bid.id)}
                  disabled={acceptBidId !== null}
                  style={{
                    backgroundColor: "#10B981",
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                    opacity: acceptBidId !== null ? 0.6 : 1,
                  }}
                >
                  {acceptBidId === bid.id ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color="#fff"
                      />
                      <Text
                        style={{
                          fontFamily: "Inter_700Bold",
                          fontSize: 14,
                          color: "#fff",
                        }}
                      >
                        Accept Rs. {Math.round(bid.fare)}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            ))}
          </>
        )}

        <View
          style={{
            backgroundColor: "rgba(255,255,255,0.06)",
            borderRadius: 18,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Pressable
            onPress={() => {
              setShowUpdateOffer((v) => !v);
              setOfferError("");
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Ionicons
                name="create-outline"
                size={18}
                color="rgba(255,255,255,0.6)"
              />
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                Update Your Offer
              </Text>
            </View>
            <Ionicons
              name={showUpdateOffer ? "chevron-up" : "chevron-down"}
              size={16}
              color="rgba(255,255,255,0.4)"
            />
          </Pressable>
          {showUpdateOffer && (
            <View
              style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}
            >
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                A new offer cancels all pending bids · Min: Rs. {minCounterOffer}
              </Text>
              {offerError ? (
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: "#EF4444",
                  }}
                >
                  {offerError}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    borderWidth: 1,
                    borderColor: offerError
                      ? "rgba(239,68,68,0.5)"
                      : "rgba(255,255,255,0.12)",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 14,
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    Rs.
                  </Text>
                  <TextInput
                    value={updateOfferInput}
                    onChangeText={(v) => {
                      setUpdateOfferInput(v);
                      setOfferError("");
                    }}
                    keyboardType="numeric"
                    placeholder={String(Math.ceil(offeredFare * 1.1))}
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    style={{
                      flex: 1,
                      fontFamily: "Inter_700Bold",
                      fontSize: 18,
                      color: "#fff",
                      paddingVertical: 12,
                      paddingHorizontal: 6,
                    }}
                  />
                </View>
                <Pressable
                  onPress={sendUpdateOffer}
                  disabled={updateOfferLoading || !updateOfferInput}
                  style={{
                    backgroundColor: "#F59E0B",
                    borderRadius: 12,
                    paddingHorizontal: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity:
                      !updateOfferInput || updateOfferLoading ? 0.5 : 1,
                  }}
                >
                  {updateOfferLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: 13,
                        color: "#fff",
                      }}
                    >
                      Send
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 24) + 8,
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
            backgroundColor: "rgba(239,68,68,0.1)",
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
              Cancel Offer
            </Text>
          )}
        </Pressable>
      </View>

      {cancelModalTarget && (
        <CancelModal
          target={cancelModalTarget}
          cancellationFee={cancellationFee}
          apiBase={rideApiBase}
          token={token}
          onClose={() => setCancelModalTarget(null)}
          onDone={(result) => {
            setRide((r: any) =>
              r ? { ...r, status: "cancelled" } : r,
            );
          }}
        />
      )}
    </View>
  );
}
