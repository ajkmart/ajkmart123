import React, { useEffect, useState, useRef } from "react";
import { createLogger } from "@/utils/logger";
import {
  TouchableOpacity,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { SOCKET_BASE } from "@/utils/api";
const log = createLogger("[van-tracking]");

const SOCKET_URL = SOCKET_BASE;

interface VanLocation {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  updatedAt: string;
  stopsAway?: number;
}

function buildMapHtml(
  vanLat: number,
  vanLng: number,
  pickupLat: number,
  pickupLng: number,
) {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%}</style>
</head><body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false}).setView([${vanLat},${vanLng}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'OSM'}).addTo(map);

var vanIcon=L.divIcon({className:'',html:'<div style="width:36px;height:36px;background:#6366F1;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:18px">\\u{1F690}</div>',iconSize:[36,36],iconAnchor:[18,18]});
var pickupIcon=L.divIcon({className:'',html:'<div style="width:28px;height:28px;background:#EF4444;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px">\\u{1F4CD}</div>',iconSize:[28,28],iconAnchor:[14,14]});

var vanMarker=L.marker([${vanLat},${vanLng}],{icon:vanIcon}).addTo(map).bindPopup('Van Location');
var pickupMarker=L.marker([${pickupLat},${pickupLng}],{icon:pickupIcon}).addTo(map).bindPopup('Your Pickup Point');
var vanCircle=L.circle([${vanLat},${vanLng}],{radius:50,color:'#6366F1',fillColor:'#818CF8',fillOpacity:0.15,weight:2}).addTo(map);

var bounds=L.latLngBounds([[${vanLat},${vanLng}],[${pickupLat},${pickupLng}]]);
if(bounds.isValid())map.fitBounds(bounds,{padding:[40,40]});

function handleMsg(e){
  try{
    var d=JSON.parse(typeof e==='string'?e:e.data);
    if(!d||typeof d!=='object'||Array.isArray(d))return;
    if(d.type==='vanPos'){
      if(typeof d.lat!=='number'||typeof d.lng!=='number')return;
      vanMarker.setLatLng([d.lat,d.lng]);
      vanCircle.setLatLng([d.lat,d.lng]);
      map.panTo([d.lat,d.lng]);
    }
  }catch(x){
    if(typeof console!=='undefined')
      console.warn('[van-tracking] Failed to handle position message:',x instanceof Error?x.message:String(x));
  }
}
window.addEventListener('message',handleMsg);
document.addEventListener('message',handleMsg);
<\/script></body></html>`;
}

function TrackingMap({
  location,
  pickupLat,
  pickupLng,
}: {
  location: VanLocation | null;
  pickupLat: number;
  pickupLng: number;
}) {
  const vanLat = location?.latitude ?? pickupLat;
  const vanLng = location?.longitude ?? pickupLng;

  if (Platform.OS === "web") {
    // Hook order is stable here: Platform.OS is a build-time constant per
    // bundle, so the web vs. native branch is chosen once and never flips.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const html = buildMapHtml(vanLat, vanLng, pickupLat, pickupLng);

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (location && iframeRef.current?.contentWindow) {
        // The iframe is rendered from an inline srcDoc (no external origin),
        // so "*" is the correct and safe targetOrigin — there is no sensitive
        // cross-origin document to leak data to.
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            type: "vanPos",
            lat: location.latitude,
            lng: location.longitude,
          }),
          "*",
        );
      }
    }, [location?.latitude, location?.longitude]);

    return (
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          borderRadius: 20,
        }}
        sandbox="allow-scripts"
        title="Van Tracking Map"
      />
    );
  }

  const WebView = require("react-native-webview").default;
  // Hook order is stable here: Platform.OS is a build-time constant per
  // bundle, so the web vs. native branch is chosen once and never flips.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const webViewRef = useRef<any>(null);
  const html = buildMapHtml(vanLat, vanLng, pickupLat, pickupLng);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (location && webViewRef.current) {
      webViewRef.current.postMessage(
        JSON.stringify({
          type: "vanPos",
          lat: location.latitude,
          lng: location.longitude,
        }),
      );
    }
  }, [location?.latitude, location?.longitude]);

  return (
    <WebView
      ref={webViewRef}
      originWhitelist={["*"]}
      source={{ html }}
      style={{ flex: 1, borderRadius: 20 }}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
    />
  );
}

function getStatusMessage(
  location: VanLocation | null,
  stopsAway?: number,
): { title: string; subtitle: string } {
  if (!location) {
    return {
      title: "Waiting for departure",
      subtitle: "The driver has not started the trip yet",
    };
  }
  if (stopsAway != null && stopsAway > 0) {
    return {
      title: `Van is ${stopsAway} stop${stopsAway > 1 ? "s" : ""} away`,
      subtitle: `Moving at ${location.speed != null && location.speed > 0 ? (location.speed * 3.6).toFixed(0) + " km/h" : "standby"}`,
    };
  }
  if (location.speed != null && location.speed > 1) {
    return {
      title: "Van is on the way",
      subtitle: `Speed: ${(location.speed * 3.6).toFixed(0)} km/h · Last: ${new Date(location.updatedAt).toLocaleTimeString()}`,
    };
  }
  return {
    title: "Van is nearby",
    subtitle: `Last update: ${new Date(location.updatedAt).toLocaleTimeString()}`,
  };
}

export default function VanTrackingScreen() {
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const topPad = Math.max(insets.top, 12);
  const params = useLocalSearchParams<{
    scheduleId: string;
    date: string;
    pickupLat: string;
    pickupLng: string;
  }>();
  const { scheduleId, date } = params;
  const pickupLat = parseFloat(params.pickupLat || "0") || 33.6844;
  const pickupLng = parseFloat(params.pickupLng || "0") || 73.0479;

  const { token } = useAuth();
  const [location, setLocation] = useState<VanLocation | null>(null);
  const [tripStatus, setTripStatus] = useState<string>("in_progress");
  const [connected, setConnected] = useState(false);
  const [stopsAway, setStopsAway] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!scheduleId || !date) return;

    let io: ReturnType<typeof import("socket.io-client").io> | undefined;
    let mounted = true;

    (async () => {
      try {
        const { io: ioConnect } = await import("socket.io-client");
        if (!mounted) return;
        io = ioConnect(SOCKET_URL, {
          path: "/api/socket.io",
          transports: ["websocket", "polling"],
          query: { rooms: `van:${scheduleId}:${date}` },
          auth: { token: token || "" },
        });

        io.on("connect", () => {
          if (mounted) setConnected(true);
        });
        io.on("disconnect", () => {
          if (mounted) setConnected(false);
        });

        io.on("van:location", (data: VanLocation) => {
          if (mounted) {
            setLocation(data);
            if (data.stopsAway != null) setStopsAway(data.stopsAway);
          }
        });

        io.on(
          "van:trip-update",
          (data: { event: string; stopsAway?: number }) => {
            if (mounted) {
              if (data.event === "trip_completed") setTripStatus("completed");
              if (data.stopsAway != null) setStopsAway(data.stopsAway);
            }
          },
        );
      } catch (err) {
        log.warn("Socket connection failed:", err);
      }
    })();

    return () => {
      mounted = false;
      if (io) io.disconnect();
    };
  }, [scheduleId, date, token]);

  const isCompleted = tripStatus === "completed";
  const status = getStatusMessage(location, stopsAway);

  return (
    <View style={ss.root}>
      <LinearGradient
        colors={["#4338CA", "#6366F1", "#818CF8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[ss.header, { paddingTop: topPad + 14 }]}
      >
        <View style={ss.headerRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={goBack}
            style={ss.backBtn}
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={ss.headerTitle}>Live Van Tracking</Text>
            <Text style={ss.headerSub}>{date}</Text>
          </View>
          <View
            style={[
              ss.connectionDot,
              { backgroundColor: connected ? "#22C55E" : "#EF4444" },
            ]}
          />
        </View>
      </LinearGradient>

      <View style={ss.content}>
        {isCompleted ? (
          <View style={ss.statusCard}>
            <Ionicons name="checkmark-done-circle" size={48} color="#16A34A" />
            <Text style={ss.statusTitle}>Trip Completed</Text>
            <Text style={ss.statusDesc}>
              Your van trip has been completed. Thank you for riding with us!
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              style={ss.btnPrimary}
              onPress={goBack}
            >
              <Text style={ss.btnPrimaryText}>Back to Bookings</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={ss.mapContainer}>
              <TrackingMap
                location={location}
                pickupLat={pickupLat}
                pickupLng={pickupLng}
              />
            </View>

            <View style={ss.statusBar}>
              <View style={ss.statusBarIcon}>
                <Ionicons name="bus" size={20} color="#6366F1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ss.statusBarTitle}>{status.title}</Text>
                <Text style={ss.statusBarSub}>{status.subtitle}</Text>
              </View>
              {location && (
                <View style={ss.liveBadge}>
                  <View style={ss.liveIndicator} />
                  <Text style={ss.liveText}>LIVE</Text>
                </View>
              )}
            </View>

            <View style={ss.pickupInfo}>
              <Ionicons name="location" size={16} color="#EF4444" />
              <Text style={ss.pickupText}>
                Your pickup point is marked on the map
              </Text>
            </View>

            {!connected && (
              <View style={ss.offlineBanner}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={16}
                  color="#DC2626"
                />
                <Text style={ss.offlineText}>
                  Reconnecting to live tracking...
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F6F8" },
  header: { paddingHorizontal: 16, paddingBottom: 18 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: Font.bold, fontSize: 20, color: "#fff" },
  headerSub: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  connectionDot: { width: 10, height: 10, borderRadius: 5 },
  content: { flex: 1, padding: 16 },
  mapContainer: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
    minHeight: 300,
    ...Platform.select({
      web: { boxShadow: "0 4px 12px rgba(0,0,0,0.06)" },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 4,
      },
    }),
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 12,
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  statusBarIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  statusBarTitle: { fontFamily: Font.semiBold, fontSize: 15, color: "#111827" },
  statusBarSub: {
    fontFamily: Font.regular,
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
  },
  liveText: { fontFamily: Font.bold, fontSize: 10, color: "#16A34A" },
  pickupInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  pickupText: { fontFamily: Font.regular, fontSize: 13, color: "#C2410C" },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  offlineText: { fontFamily: Font.regular, fontSize: 13, color: "#DC2626" },
  statusCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  statusTitle: { fontFamily: Font.bold, fontSize: 20, color: "#16A34A" },
  statusDesc: {
    fontFamily: Font.regular,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  btnPrimary: {
    backgroundColor: "#6366F1",
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  btnPrimaryText: { fontFamily: Font.bold, fontSize: 15, color: "#fff" },
});
