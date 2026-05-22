import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { ImageUploader } from "../components/ImageUploader";
import { PageHeader } from "../components/PageHeader";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { SafeImage } from "../components/ui/SafeImage";
import { api } from "../lib/api";
import { vendorEnv } from "../lib/envValidation";
import { patchLeafletDefaultIcon } from "../lib/leafletIconFix";
import { BTN_PRIMARY, CARD, INPUT, LABEL, TEXTAREA, errMsg, fc } from "../lib/ui";
import { useCurrency, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { useAuth } from "../lib/vendor-auth";

/* Fix Leaflet icons in Vite */
patchLeafletDefaultIcon();

/* ── Vendor tile config ── */
function useVendorTileConfig() {
  const [tile, setTile] = useState({
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    provider: "osm",
  });
  useEffect(() => {
    fetch(`${vendorEnv.baseUrl}api/maps/config?app=vendor`)
      .then((r) => r.json())
      .then((d: any) => {
        const cfg = d?.data ?? d;
        const prov = cfg?.provider ?? "osm";
        const tok = cfg?.token ?? "";
        if (prov === "mapbox" && tok) {
          setTile({
            url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${tok}`,
            attribution: '© <a href="https://www.mapbox.com/">Mapbox</a> © OpenStreetMap',
            provider: "mapbox",
          });
        } else if (prov === "google" && tok) {
          setTile({
            url: `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${tok}`,
            attribution: "© Google Maps",
            provider: "google",
          });
        }
      })
      .catch((err) => {
        console.warn("[artifacts/vendor-app/src/pages/Store.tsx]", err);
      }); // eslint-disable-line no-console
  }, []);
  return tile;
}

/* ── Draggable marker + click-to-set ── */
function DraggableMarker({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return (
    <Marker
      draggable
      position={[lat, lng]}
      ref={markerRef}
      eventHandlers={{
        dragend() {
          const m = markerRef.current;
          if (m) {
            const ll = m.getLatLng();
            onChange(ll.lat, ll.lng);
          }
        },
      }}
    />
  );
}

/* ── Auto-pan map when lat/lng change ── */
function PanTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DEFAULT_HOURS = Object.fromEntries(
  DAYS.map((d) => [d, { open: "09:00", close: "22:00", closed: false }])
);

export default function Store() {
  const { user, refreshUser } = useAuth();
  const { config } = usePlatformConfig();
  const { symbol: currencySymbol, code: _currencyCode } = useCurrency();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const promoEnabled = config.vendor?.promoEnabled !== false;
  const qc = useQueryClient();
  const [tab, setTab] = useState<"info" | "hours" | "schedule" | "promos" | "location">("info");
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );
  const showToast = (m: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(m);
    toastTimerRef.current = setTimeout(() => setToast(""), 3000);
  };

  const [sf, setSf] = useState({
    storeName: user?.storeName || "",
    storeCategory: user?.storeCategory || "",
    storeDescription: user?.storeDescription || "",
    storeBanner: user?.storeBanner || "",
    storeAnnouncement: user?.storeAnnouncement || "",
    storeDeliveryTime: user?.storeDeliveryTime || "",
    storeMinOrder: user?.storeMinOrder ? String(user.storeMinOrder) : "0",
  });
  const s = (k: string, v: any) => setSf((p) => ({ ...p, [k]: v }));

  const [hours, setHours] = useState<
    Record<string, { open: string; close: string; closed: boolean }>
  >(() => {
    if (!user?.storeHours) return DEFAULT_HOURS;
    if (typeof user.storeHours === "string") {
      try {
        return JSON.parse(user.storeHours);
      } catch (err) {
        console.warn("[artifacts/vendor-app/src/pages/Store.tsx]", err);
      } // eslint-disable-line no-console
    }
    return user.storeHours;
  });

  useEffect(() => {
    if (!user) return;
    setSf({
      storeName: user.storeName || "",
      storeCategory: user.storeCategory || "",
      storeDescription: user.storeDescription || "",
      storeBanner: user.storeBanner || "",
      storeAnnouncement: user.storeAnnouncement || "",
      storeDeliveryTime: user.storeDeliveryTime || "",
      storeMinOrder: user.storeMinOrder ? String(user.storeMinOrder) : "0",
    });
    if (user.storeHours) {
      const parsed =
        typeof user.storeHours === "string"
          ? (() => {
              try {
                return JSON.parse(user.storeHours as string);
              } catch (err) {
                console.warn("[artifacts/vendor-app/src/pages/Store.tsx]", err);
              }
            })() // eslint-disable-line no-console
          : user.storeHours;
      if (parsed) setHours(parsed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.id,
    user?.storeName,
    user?.storeCategory,
    user?.storeDescription,
    user?.storeBanner,
    user?.storeAnnouncement,
    user?.storeDeliveryTime,
    user?.storeMinOrder,
    user?.storeHours,
  ]);

  const storeMut = useMutation({
    mutationFn: () => api.updateStore({ ...sf, storeMinOrder: Number(sf.storeMinOrder) }),
    onSuccess: () => {
      void refreshUser();
      showToast("✅ Store info saved!");
    },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const hoursMut = useMutation({
    mutationFn: () => {
      for (const day of DAYS) {
        const h = hours[day];
        if (h && !h.closed && h.open >= h.close) {
          throw new Error(`${day}: Closing time must be after opening time`);
        }
      }
      return api.updateStore({ storeHours: hours });
    },
    onSuccess: () => {
      setHoursError("");
      void refreshUser();
      showToast("✅ Hours saved!");
    },
    onError: (e: Error) => {
      setHoursError(errMsg(e));
      showToast("❌ " + errMsg(e));
    },
  });

  const { data: promoData, isLoading: promoLoad } = useQuery({
    queryKey: ["vendor-promos"],
    queryFn: () => api.getPromos(),
    enabled: tab === "promos",
  });
  const promos: any[] = Array.isArray(promoData?.promos) ? promoData.promos : [];

  const [pf, setPf] = useState({
    code: "",
    description: "",
    discountPct: "",
    discountFlat: "",
    minOrderAmount: "",
    usageLimit: "",
    expiresAt: "",
    type: "pct" as "pct" | "flat",
  });
  const p = (k: string, v: string) => setPf((x) => ({ ...x, [k]: v }));
  const [editingPromo, setEditingPromo] = useState<Record<string, string | number | null> | null>(
    null
  );
  const [hoursError, setHoursError] = useState("");

  /* ── Location tab state ── */
  const DEFAULT_LAT = 34.3697,
    DEFAULT_LNG = 73.4716; // Abbottabad default
  const [locLat, setLocLat] = useState<number>(() => Number(user?.storeLat) || DEFAULT_LAT);
  const [locLng, setLocLng] = useState<number>(() => Number(user?.storeLng) || DEFAULT_LNG);
  const [locHasPin, setLocHasPin] = useState(() => Boolean(user?.storeLat && user?.storeLng));
  const tile = useVendorTileConfig();

  useEffect(() => {
    if (user?.storeLat && user?.storeLng) {
      setLocLat(Number(user.storeLat));
      setLocLng(Number(user.storeLng));
      setLocHasPin(true);
    }
  }, [user?.storeLat, user?.storeLng]);

  const locMut = useMutation({
    mutationFn: () => api.updateStore({ storeLat: locLat, storeLng: locLng }),
    onSuccess: () => {
      void refreshUser();
      showToast("✅ Store location saved!");
    },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const discountValue = pf.type === "pct" ? Number(pf.discountPct) : Number(pf.discountFlat);
  const promoDiscountValid = discountValue > 0;

  const createPromoMut = useMutation({
    mutationFn: () => {
      if (!promoDiscountValid) throw new Error("Discount must be greater than 0%");
      return api.createPromo({
        code: pf.code,
        description: pf.description,
        discountPct: pf.type === "pct" && pf.discountPct ? Number(pf.discountPct) : null,
        discountFlat: pf.type === "flat" && pf.discountFlat ? Number(pf.discountFlat) : null,
        minOrderAmount: pf.minOrderAmount ? Number(pf.minOrderAmount) : 0,
        usageLimit: pf.usageLimit ? Number(pf.usageLimit) : null,
        expiresAt: pf.expiresAt || null,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-promos"] });
      setPf({
        code: "",
        description: "",
        discountPct: "",
        discountFlat: "",
        minOrderAmount: "",
        usageLimit: "",
        expiresAt: "",
        type: "pct",
      });
      showToast("✅ Promo created!");
    },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const updatePromoMut = useMutation({
    mutationFn: (id: string) =>
      api.updatePromo(id, {
        description: pf.description,
        discountPct: pf.type === "pct" && pf.discountPct ? Number(pf.discountPct) : null,
        discountFlat: pf.type === "flat" && pf.discountFlat ? Number(pf.discountFlat) : null,
        minOrderAmount: pf.minOrderAmount ? Number(pf.minOrderAmount) : 0,
        usageLimit: pf.usageLimit ? Number(pf.usageLimit) : null,
        expiresAt: pf.expiresAt || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-promos"] });
      setEditingPromo(null);
      setPf({
        code: "",
        description: "",
        discountPct: "",
        discountFlat: "",
        minOrderAmount: "",
        usageLimit: "",
        expiresAt: "",
        type: "pct",
      });
      showToast("✅ Promo updated!");
    },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const togglePromoMut = useMutation({
    mutationFn: (id: string) => api.togglePromo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-promos"] }),
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const deletePromoMut = useMutation({
    mutationFn: (id: string) => api.deletePromo(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-promos"] });
      showToast("🗑️ Promo deleted");
    },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  /* ── Weekly Schedule (backed by vendor_schedules table) ── */
  const SCHED_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const { data: schedData, isLoading: schedLoading } = useQuery({
    queryKey: ["vendor-schedule"],
    queryFn: () => api.getSchedule(),
    enabled: tab === "schedule",
  });
  const [localSched, setLocalSched] = useState<
    Array<{
      dayOfWeek: number;
      dayName: string;
      openTime: string;
      closeTime: string;
      isEnabled: boolean;
    }>
  >([]);
  const [schedInited, setSchedInited] = useState(false);
  useEffect(() => {
    if (schedData?.schedule && !schedInited) {
      setLocalSched(
        schedData.schedule.map((s: any) => ({
          dayOfWeek: s.dayOfWeek,
          dayName: s.dayName,
          openTime: s.openTime,
          closeTime: s.closeTime,
          isEnabled: s.isEnabled,
        }))
      );
      setSchedInited(true);
    }
  }, [schedData, schedInited]);
  const schedMut = useMutation({
    mutationFn: () =>
      api.updateSchedule(
        localSched.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          openTime: s.openTime,
          closeTime: s.closeTime,
          isEnabled: s.isEnabled,
        }))
      ),
    onSuccess: (d: any) => {
      if (d?.schedule)
        setLocalSched(
          d.schedule.map((s: any) => ({
            dayOfWeek: s.dayOfWeek,
            dayName: s.dayName,
            openTime: s.openTime,
            closeTime: s.closeTime,
            isEnabled: s.isEnabled,
          }))
        );
      showToast("Schedule saved!");
    },
    onError: (e: Error) => showToast(errMsg(e)),
  });
  const updateSchedDay = (
    i: number,
    patch: Partial<{ openTime: string; closeTime: string; isEnabled: boolean }>
  ) => setLocalSched((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  type TabKey = "info" | "hours" | "schedule" | "promos" | "location";
  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: "info", label: T("storeInfo"), icon: "🏪" },
    { key: "hours", label: T("hoursLabel"), icon: "🕐" },
    { key: "schedule", label: "Schedule", icon: "📅" },
    { key: "promos", label: T("promosLabel"), icon: "🎟️" },
    { key: "location", label: "Location", icon: "📍" },
  ];

  return (
    <div className="bg-[#0A0F1A] md:bg-transparent">
      <PageHeader
        title={T("myStore")}
        subtitle={user?.storeName || T("storeSettings")}
        actions={
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${user?.storeIsOpen ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}
          >
            {user?.storeIsOpen ? "🟢 Open" : "🔴 Closed"}
          </span>
        }
      />

      {/* Tabs */}
      <div className="sticky top-0 z-10 flex border-b border-gray-200 bg-white">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`android-press flex min-h-0 flex-1 flex-col items-center border-b-2 py-3 text-[11px] font-bold transition-colors md:flex-row md:justify-center md:gap-2 md:text-sm ${tab === t.key ? "border-blue-500 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            <span className="mb-0.5 text-lg md:mb-0 md:text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4 px-4 py-4 md:px-0 md:py-4">
        {/* ── STORE INFO ── */}
        {tab === "info" && (
          <div className="space-y-4 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
            <div className="space-y-4">
              {user?.storeBanner && (
                <div className="h-36 overflow-hidden rounded-2xl bg-gray-100">
                  <SafeImage
                    src={user.storeBanner}
                    alt="Banner"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div className={`${CARD} space-y-3 p-4`}>
                {[
                  {
                    label: T("storeName"),
                    key: "storeName",
                    placeholder: "My Awesome Store",
                    type: "text",
                  },
                  {
                    label: T("categoryLabel"),
                    key: "storeCategory",
                    placeholder: "restaurant / grocery / pharmacy...",
                    type: "text",
                  },
                ].map(({ label, key, placeholder, type }) => (
                  <div key={key}>
                    <label className={LABEL}>{label}</label>
                    <input
                      type={type}
                      value={(sf as Record<string, string>)[key]}
                      onChange={(e) => s(key, e.target.value)}
                      placeholder={placeholder}
                      className={INPUT}
                    />
                  </div>
                ))}
                <div>
                  <div className="mb-1 flex items-baseline justify-between">
                    <label className={LABEL}>{T("announcementNotice")}</label>
                    <span
                      className={`text-[10px] font-semibold ${sf.storeAnnouncement.length > 140 ? "text-red-500" : "text-gray-400"}`}
                    >
                      {sf.storeAnnouncement.length}/160
                    </span>
                  </div>
                  <textarea
                    value={sf.storeAnnouncement}
                    onChange={(e) => s("storeAnnouncement", e.target.value)}
                    placeholder="20% off all items today!"
                    rows={2}
                    maxLength={160}
                    className={TEXTAREA}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className={`${CARD} space-y-3 p-4`}>
                <ImageUploader
                  value={sf.storeBanner}
                  onChange={(url) => s("storeBanner", url)}
                  label={T("bannerImage")}
                  placeholder="https://..."
                  previewHeight="h-36"
                />
                <div>
                  <label className={LABEL}>{T("deliveryTime")}</label>
                  <input
                    type="text"
                    value={sf.storeDeliveryTime}
                    onChange={(e) => s("storeDeliveryTime", e.target.value)}
                    placeholder="30-45 min"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>
                    {T("minOrder")} ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={sf.storeMinOrder}
                    onChange={(e) => s("storeMinOrder", e.target.value)}
                    placeholder="0"
                    className={INPUT}
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-baseline justify-between">
                    <label className={LABEL}>{T("aboutStore")}</label>
                    <span
                      className={`text-[10px] font-semibold ${sf.storeDescription.length > 450 ? "text-red-500" : "text-gray-400"}`}
                    >
                      {sf.storeDescription.length}/500
                    </span>
                  </div>
                  <textarea
                    value={sf.storeDescription}
                    onChange={(e) => s("storeDescription", e.target.value)}
                    placeholder="Tell customers about your store..."
                    rows={3}
                    maxLength={500}
                    className={TEXTAREA}
                  />
                </div>
              </div>
              <button
                onClick={() => storeMut.mutate()}
                disabled={storeMut.isPending}
                className={BTN_PRIMARY}
              >
                {storeMut.isPending ? T("saving") : `💾 ${T("saveStoreInfo")}`}
              </button>
            </div>
          </div>
        )}

        {/* ── HOURS ── */}
        {tab === "hours" && (
          <div className="space-y-4 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
            <div className={CARD}>
              <Accordion type="single" collapsible defaultValue="weekdays">
                <AccordionItem value="weekdays" className="border-0">
                  <AccordionTrigger className="rounded-t-2xl bg-gray-50 px-4 py-3.5 hover:no-underline">
                    <div>
                      <span className="block text-left text-sm font-bold text-gray-800">
                        {T("hoursLabel")} (Mon–Fri)
                      </span>
                      <span className="text-xs text-gray-400">
                        {T("opens")} / {T("closes")}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-0 pb-0">
                    <div className="divide-y divide-gray-50">
                      {DAYS.slice(0, 5).map((day) => {
                        const h = hours[day] || { open: "09:00", close: "22:00", closed: false };
                        return (
                          <div key={day} className="px-4 py-3">
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-sm font-bold text-gray-800">{day}</p>
                              <button
                                onClick={() =>
                                  setHours((prev) => ({
                                    ...prev,
                                    [day]: { ...h, closed: !h.closed },
                                  }))
                                }
                                className={`android-press min-h-0 rounded-full px-3 py-1.5 text-xs font-bold ${h.closed ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}
                              >
                                {h.closed ? T("closedLabel") : T("openLabel")}
                              </button>
                            </div>
                            {!h.closed && (
                              <div className="flex items-center gap-3">
                                <div className="flex-1">
                                  <p className="mb-1 text-[10px] font-bold text-gray-400">
                                    {T("opens").toUpperCase()}
                                  </p>
                                  <input
                                    type="time"
                                    value={h.open}
                                    onChange={(e) =>
                                      setHours((prev) => ({
                                        ...prev,
                                        [day]: { ...h, open: e.target.value },
                                      }))
                                    }
                                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:border-blue-500 focus:outline-none"
                                  />
                                </div>
                                <span className="mt-4 font-bold text-gray-300">—</span>
                                <div className="flex-1">
                                  <p className="mb-1 text-[10px] font-bold text-gray-400">
                                    {T("closes").toUpperCase()}
                                  </p>
                                  <input
                                    type="time"
                                    value={h.close}
                                    onChange={(e) =>
                                      setHours((prev) => ({
                                        ...prev,
                                        [day]: { ...h, close: e.target.value },
                                      }))
                                    }
                                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:border-blue-500 focus:outline-none"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            <div className={CARD}>
              <Accordion type="single" collapsible defaultValue="weekend">
                <AccordionItem value="weekend" className="border-0">
                  <AccordionTrigger className="rounded-t-2xl bg-gray-50 px-4 py-3.5 hover:no-underline">
                    <div>
                      <span className="block text-left text-sm font-bold text-gray-800">
                        {T("weekendHours")}
                      </span>
                      <span className="text-xs text-gray-400">
                        {T("opens")} / {T("closes")}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-0 pb-0">
                    <div className="divide-y divide-gray-50">
                      {DAYS.slice(5).map((day) => {
                        const h = hours[day] || { open: "09:00", close: "22:00", closed: false };
                        return (
                          <div key={day} className="px-4 py-3">
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-sm font-bold text-gray-800">{day}</p>
                              <button
                                onClick={() =>
                                  setHours((prev) => ({
                                    ...prev,
                                    [day]: { ...h, closed: !h.closed },
                                  }))
                                }
                                className={`android-press min-h-0 rounded-full px-3 py-1.5 text-xs font-bold ${h.closed ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}
                              >
                                {h.closed ? T("closedLabel") : T("openLabel")}
                              </button>
                            </div>
                            {!h.closed && (
                              <div className="flex items-center gap-3">
                                <div className="flex-1">
                                  <p className="mb-1 text-[10px] font-bold text-gray-400">
                                    {T("opens").toUpperCase()}
                                  </p>
                                  <input
                                    type="time"
                                    value={h.open}
                                    onChange={(e) =>
                                      setHours((prev) => ({
                                        ...prev,
                                        [day]: { ...h, open: e.target.value },
                                      }))
                                    }
                                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:border-blue-500 focus:outline-none"
                                  />
                                </div>
                                <span className="mt-4 font-bold text-gray-300">—</span>
                                <div className="flex-1">
                                  <p className="mb-1 text-[10px] font-bold text-gray-400">
                                    {T("closes").toUpperCase()}
                                  </p>
                                  <input
                                    type="time"
                                    value={h.close}
                                    onChange={(e) =>
                                      setHours((prev) => ({
                                        ...prev,
                                        [day]: { ...h, close: e.target.value },
                                      }))
                                    }
                                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:border-blue-500 focus:outline-none"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            <div className="mt-4 space-y-2 md:col-span-2 md:mt-0">
              {hoursError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
                  <p className="text-sm font-medium text-red-600">⚠️ {hoursError}</p>
                </div>
              )}
              <button
                onClick={() => hoursMut.mutate()}
                disabled={hoursMut.isPending}
                className={BTN_PRIMARY}
              >
                {hoursMut.isPending ? T("saving") : `💾 ${T("save")} ${T("hoursLabel")}`}
              </button>
            </div>
          </div>
        )}

        {/* ── WEEKLY SCHEDULE ── */}
        {tab === "schedule" && (
          <div className="space-y-4">
            <div className={`${CARD} p-4`}>
              <p className="mb-1 text-base font-bold text-gray-800">Weekly Auto-Schedule</p>
              <p className="mb-4 text-xs text-gray-500">
                Set your regular operating hours for each day. Enabled days will automatically
                toggle your store open/closed.
              </p>
              {schedLoading ? (
                <div className="py-8 text-center text-gray-400">Loading schedule...</div>
              ) : localSched.length === 0 ? (
                <div className="py-8 text-center text-gray-400">
                  <p>No schedule data found.</p>
                  <button
                    onClick={() => {
                      setLocalSched(
                        SCHED_DAYS.map((name, i) => ({
                          dayOfWeek: i,
                          dayName: name,
                          openTime: "09:00",
                          closeTime: "21:00",
                          isEnabled: false,
                        }))
                      );
                    }}
                    className="mt-2 text-sm font-bold text-blue-500 underline"
                  >
                    Initialize Schedule
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {localSched.map((day, i) => (
                    <div key={day.dayOfWeek} className="py-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-800">{day.dayName}</p>
                        <button
                          onClick={() => updateSchedDay(i, { isEnabled: !day.isEnabled })}
                          className={`rounded-full px-3 py-1.5 text-xs font-bold ${day.isEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}
                        >
                          {day.isEnabled ? "Enabled" : "Disabled"}
                        </button>
                      </div>
                      {day.isEnabled && (
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <p className="mb-1 text-[10px] font-bold text-gray-400">OPEN</p>
                            <input
                              type="time"
                              value={day.openTime}
                              onChange={(e) => updateSchedDay(i, { openTime: e.target.value })}
                              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                          <span className="mt-4 font-bold text-gray-300">-</span>
                          <div className="flex-1">
                            <p className="mb-1 text-[10px] font-bold text-gray-400">CLOSE</p>
                            <input
                              type="time"
                              value={day.closeTime}
                              onChange={(e) => updateSchedDay(i, { closeTime: e.target.value })}
                              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => schedMut.mutate()}
              disabled={schedMut.isPending || localSched.length === 0}
              className={BTN_PRIMARY}
            >
              {schedMut.isPending ? T("saving") : "Save Schedule"}
            </button>
          </div>
        )}

        {/* ── PROMOS ── */}
        {tab === "promos" && !promoEnabled && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <p className="mb-3 text-4xl">🔒</p>
            <p className="text-base font-bold text-amber-800">{T("promoDisabled")}</p>
            <p className="mt-1 text-sm leading-relaxed text-amber-600">{T("promoCodesDesc")}</p>
          </div>
        )}
        {tab === "promos" && promoEnabled && (
          <div className="space-y-4 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
            <div>
              <div className={`${CARD} space-y-3 p-4`}>
                <p className="text-base font-bold text-gray-800">🎟️ {T("createPromoCode")}</p>
                <div>
                  <label className={LABEL}>{T("promoCode")} *</label>
                  <input
                    value={pf.code}
                    onChange={(e) => p("code", e.target.value.toUpperCase())}
                    placeholder="SUMMER20"
                    className={`${INPUT} font-extrabold tracking-[0.2em]`}
                  />
                </div>
                <div>
                  <label className={LABEL}>{T("discountType")}</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => p("type", "pct")}
                      className={`android-press h-11 min-h-0 flex-1 rounded-xl border-2 text-sm font-bold ${pf.type === "pct" ? "border-blue-500 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-400"}`}
                    >
                      % {T("percentage")}
                    </button>
                    <button
                      onClick={() => p("type", "flat")}
                      className={`android-press h-11 min-h-0 flex-1 rounded-xl border-2 text-sm font-bold ${pf.type === "flat" ? "border-blue-500 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-400"}`}
                    >
                      {currencySymbol} {T("flatAmount")}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>
                      {pf.type === "pct" ? `${T("percentage")} %` : T("flatAmount")} *
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={pf.type === "pct" ? pf.discountPct : pf.discountFlat}
                      onChange={(e) =>
                        p(pf.type === "pct" ? "discountPct" : "discountFlat", e.target.value)
                      }
                      placeholder={pf.type === "pct" ? "20" : "100"}
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>
                      {T("minOrder")} ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={pf.minOrderAmount}
                      onChange={(e) => p("minOrderAmount", e.target.value)}
                      placeholder="500"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>{T("usageLimit")}</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={pf.usageLimit}
                      onChange={(e) => p("usageLimit", e.target.value)}
                      placeholder="100"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>{T("expiresOn")}</label>
                    <input
                      type="date"
                      value={pf.expiresAt}
                      onChange={(e) => p("expiresAt", e.target.value)}
                      className={INPUT}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className={LABEL}>{T("descriptionLabel")}</label>
                    <input
                      value={pf.description}
                      onChange={(e) => p("description", e.target.value)}
                      placeholder="Get 20% off on all items"
                      className={INPUT}
                    />
                  </div>
                </div>
                {!promoDiscountValid && (pf.discountPct !== "" || pf.discountFlat !== "") && (
                  <p className="text-xs font-medium text-red-500">
                    ⚠️ {T("discountMustBePositive")}
                  </p>
                )}
                <button
                  onClick={() => createPromoMut.mutate()}
                  disabled={!pf.code || !promoDiscountValid || createPromoMut.isPending}
                  className={BTN_PRIMARY}
                >
                  {createPromoMut.isPending ? T("loading") : `🎟️ ${T("createPromoCode")}`}
                </button>
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-bold text-gray-700">{T("activePromoCodes")}</p>
              {promoLoad ? (
                <div className="skeleton h-16 rounded-2xl" />
              ) : promos.length === 0 ? (
                <div className={`${CARD} px-4 py-12 text-center`}>
                  <p className="mb-2 text-4xl">🎟️</p>
                  <p className="text-base font-bold text-gray-600">{T("noPromoCodes")}</p>
                  <p className="mt-1 text-sm text-gray-400">{T("createPromoCode")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {promos.map((pm: any) => (
                    <div
                      key={pm.id}
                      className={`${CARD} border-2 ${pm.isActive ? "border-blue-200" : "border-gray-200 opacity-60"}`}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xl font-extrabold tracking-widest text-gray-800">
                              {pm.code}
                            </p>
                            {pm.description && (
                              <p className="mt-0.5 text-xs text-gray-500">{pm.description}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600">
                                {pm.discountPct > 0
                                  ? `${pm.discountPct}% OFF`
                                  : `${currencySymbol} ${pm.discountFlat} OFF`}
                              </span>
                              {pm.minOrderAmount > 0 && (
                                <span className="text-xs text-gray-400">
                                  Min: {fc(pm.minOrderAmount, currencySymbol)}
                                </span>
                              )}
                              {pm.usageLimit && (
                                <span className="text-xs text-gray-400">
                                  {pm.usedCount}/{pm.usageLimit} used
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 gap-2">
                            <button
                              onClick={() => {
                                if (editingPromo?.id === pm.id) {
                                  setEditingPromo(null);
                                  return;
                                }
                                setEditingPromo(pm);
                                setPf({
                                  code: pm.code,
                                  description: pm.description || "",
                                  discountPct: pm.discountPct ? String(pm.discountPct) : "",
                                  discountFlat: pm.discountFlat ? String(pm.discountFlat) : "",
                                  minOrderAmount: pm.minOrderAmount
                                    ? String(pm.minOrderAmount)
                                    : "",
                                  usageLimit: pm.usageLimit ? String(pm.usageLimit) : "",
                                  expiresAt: pm.expiresAt ? pm.expiresAt.split("T")[0] : "",
                                  type: pm.discountFlat > 0 ? "flat" : "pct",
                                });
                              }}
                              className="android-press h-9 min-h-0 rounded-xl bg-blue-50 px-3 text-xs font-bold text-blue-600"
                            >
                              {editingPromo?.id === pm.id ? T("cancelConfirm") : `✏️ ${T("edit")}`}
                            </button>
                            <button
                              onClick={() => togglePromoMut.mutate(pm.id)}
                              className={`android-press h-9 min-h-0 rounded-xl px-3 text-xs font-bold ${pm.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                            >
                              {pm.isActive ? T("active") : T("inactiveLabel")}
                            </button>
                            <button
                              onClick={() => deletePromoMut.mutate(pm.id)}
                              className="android-press h-9 min-h-0 rounded-xl bg-red-50 px-3 text-xs font-bold text-red-600"
                            >
                              Del
                            </button>
                          </div>
                        </div>
                        {editingPromo?.id === pm.id && (
                          <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={LABEL}>
                                  {pf.type === "pct" ? `${T("percentage")} %` : T("flatAmount")}
                                </label>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  value={pf.type === "pct" ? pf.discountPct : pf.discountFlat}
                                  onChange={(e) =>
                                    p(
                                      pf.type === "pct" ? "discountPct" : "discountFlat",
                                      e.target.value
                                    )
                                  }
                                  className={INPUT}
                                />
                              </div>
                              <div>
                                <label className={LABEL}>
                                  {T("minOrder")} ({currencySymbol})
                                </label>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  value={pf.minOrderAmount}
                                  onChange={(e) => p("minOrderAmount", e.target.value)}
                                  className={INPUT}
                                />
                              </div>
                              <div>
                                <label className={LABEL}>{T("usageLimit")}</label>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  value={pf.usageLimit}
                                  onChange={(e) => p("usageLimit", e.target.value)}
                                  className={INPUT}
                                />
                              </div>
                              <div>
                                <label className={LABEL}>{T("expiresOn")}</label>
                                <input
                                  type="date"
                                  value={pf.expiresAt}
                                  onChange={(e) => p("expiresAt", e.target.value)}
                                  className={INPUT}
                                />
                              </div>
                              <div className="col-span-2">
                                <label className={LABEL}>{T("descriptionLabel")}</label>
                                <input
                                  value={pf.description}
                                  onChange={(e) => p("description", e.target.value)}
                                  className={INPUT}
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => updatePromoMut.mutate(pm.id)}
                              disabled={updatePromoMut.isPending}
                              className="android-press h-10 w-full rounded-xl bg-blue-600 text-sm font-bold text-white"
                            >
                              {updatePromoMut.isPending ? T("saving") : `✓ ${T("save")}`}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── LOCATION TAB ── */}
        {tab === "location" && (
          <div className="space-y-4">
            <div className={`${CARD} p-4`}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">Store Location</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Drag the pin or tap the map to set your store's exact location.
                  </p>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-600">
                  {tile.provider.toUpperCase()}
                </span>
              </div>

              {/* Map */}
              <div
                className="overflow-hidden rounded-xl border border-gray-200"
                style={{ height: 300 }}
              >
                <MapContainer
                  center={[locLat, locLng]}
                  zoom={14}
                  style={{ height: "100%", width: "100%" }}
                  scrollWheelZoom={true}
                >
                  <TileLayer url={tile.url} attribution={tile.attribution} maxZoom={19} />
                  <PanTo lat={locLat} lng={locLng} />
                  <DraggableMarker
                    lat={locLat}
                    lng={locLng}
                    onChange={(lat, lng) => {
                      setLocLat(lat);
                      setLocLng(lng);
                      setLocHasPin(true);
                    }}
                  />
                </MapContainer>
              </div>
              <p className="mt-1.5 text-center text-[11px] text-gray-400">
                Tap on the map or drag the marker to adjust position
              </p>

              {/* Coordinates display */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={locLat.toFixed(6)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) {
                        setLocLat(v);
                        setLocHasPin(true);
                      }
                    }}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={locLng.toFixed(6)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) {
                        setLocLng(v);
                        setLocHasPin(true);
                      }
                    }}
                    className={INPUT}
                  />
                </div>
              </div>

              {/* Use current GPS */}
              <button
                type="button"
                className="android-press mt-3 h-10 w-full rounded-xl bg-gray-100 text-sm font-bold text-gray-800 transition-colors hover:bg-gray-200"
                onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setLocLat(pos.coords.latitude);
                        setLocLng(pos.coords.longitude);
                        setLocHasPin(true);
                      },
                      () => showToast("❌ Could not get GPS location"),
                      { enableHighAccuracy: true, timeout: 8000 }
                    );
                  } else {
                    showToast("❌ GPS not available on this device");
                  }
                }}
              >
                📡 Use My Current Location
              </button>

              {/* Google Maps link */}
              {locHasPin && (
                <a
                  href={`https://www.google.com/maps?q=${locLat},${locLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block text-center text-xs text-blue-600 underline"
                >
                  🗺️ Verify on Google Maps
                </a>
              )}
            </div>

            <button
              onClick={() => locMut.mutate()}
              disabled={locMut.isPending || !locHasPin}
              className={BTN_PRIMARY}
            >
              {locMut.isPending ? "Saving..." : "📍 Save Store Location"}
            </button>

            {!locHasPin && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-600">
                Tap on the map above to pin your store location
              </p>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div
          className="toast-in fixed top-0 right-0 left-0 z-50 flex justify-center"
          style={{
            paddingTop: "calc(env(safe-area-inset-top,0px) + 8px)",
            paddingLeft: "16px",
            paddingRight: "16px",
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 px-5 py-3 text-center text-sm font-semibold text-white shadow-2xl">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
