import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { createLogger } from "@/utils/logger";
import { withErrorBoundary } from "@/utils/withErrorBoundary";
import { router } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";

import { useTheme } from "@/context/ThemeContext";
import Colors, {
  spacing,
  radii,
  shadows,
  getFontFamily,
} from "@/constants/colors";
import { Font } from "@/constants/typography";
const log = createLogger("[Weather]");


const WMO_ICONS: Record<
  number,
  { icon: string; label: string; gradient: [string, string] }
> = {
  0: { icon: "sunny", label: "Clear Sky", gradient: ["#4facfe", "#00f2fe"] },
  1: {
    icon: "partly-sunny",
    label: "Mostly Clear",
    gradient: ["#a1c4fd", "#c2e9fb"],
  },
  2: {
    icon: "partly-sunny",
    label: "Partly Cloudy",
    gradient: ["#89ABE3", "#B6CEE8"],
  },
  3: { icon: "cloudy", label: "Overcast", gradient: ["#8e9eab", "#eef2f3"] },
  45: { icon: "cloud", label: "Foggy", gradient: ["#bdc3c7", "#2c3e50"] },
  48: { icon: "cloud", label: "Icy Fog", gradient: ["#E0EAFC", "#CFDEF3"] },
  51: {
    icon: "rainy",
    label: "Light Drizzle",
    gradient: ["#667db6", "#0082c8"],
  },
  53: { icon: "rainy", label: "Drizzle", gradient: ["#5f72bd", "#9b23ea"] },
  55: {
    icon: "rainy",
    label: "Heavy Drizzle",
    gradient: ["#373B44", "#4286f4"],
  },
  61: { icon: "rainy", label: "Light Rain", gradient: ["#74b9ff", "#0984e3"] },
  63: { icon: "rainy", label: "Rain", gradient: ["#6190E8", "#A7BFE8"] },
  65: { icon: "rainy", label: "Heavy Rain", gradient: ["#414345", "#232526"] },
  71: { icon: "snow", label: "Light Snow", gradient: ["#E0EAFC", "#CFDEF3"] },
  73: { icon: "snow", label: "Snow", gradient: ["#c9d6ff", "#e2e2e2"] },
  75: { icon: "snow", label: "Heavy Snow", gradient: ["#8e9eab", "#eef2f3"] },
  69: { icon: "rainy", label: "Showers", gradient: ["#667db6", "#0082c8"] },
  70: {
    icon: "rainy",
    label: "Moderate Showers",
    gradient: ["#373B44", "#4286f4"],
  },
  80: { icon: "rainy", label: "Showers", gradient: ["#667db6", "#0082c8"] },
  81: {
    icon: "rainy",
    label: "Moderate Showers",
    gradient: ["#373B44", "#4286f4"],
  },
  82: {
    icon: "thunderstorm",
    label: "Heavy Showers",
    gradient: ["#232526", "#414345"],
  },
  95: {
    icon: "thunderstorm",
    label: "Thunderstorm",
    gradient: ["#0f0c29", "#302b63"],
  },
  96: {
    icon: "thunderstorm",
    label: "Thunderstorm + Hail",
    gradient: ["#141E30", "#243B55"],
  },
  99: {
    icon: "thunderstorm",
    label: "Severe Thunderstorm",
    gradient: ["#0f0c29", "#24243e"],
  },
};

const SAVED_CITY_KEY = "weather_manual_city";
const FORECAST_CACHE_TTL = 30 * 60_000;

type ForecastData = {
  current: {
    temp: number;
    code: number;
    windSpeed: number;
    humidity: number;
    feelsLike: number;
    uvIndex: number;
    pressure: number;
    visibility: number;
  };
  hourly: {
    time: string;
    temp: number;
    code: number;
    precipitation: number;
    windSpeed: number;
    humidity: number;
  }[];
  daily: {
    date: string;
    tempMax: number;
    tempMin: number;
    code: number;
    precipitation: number;
    windSpeed: number;
    uvIndex: number;
    sunrise: string;
    sunset: string;
  }[];
  locationName: string;
  isGps: boolean;
};

async function fetchForecast(
  lat: number,
  lng: number,
): Promise<Omit<ForecastData, "locationName" | "isGps">> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature,uv_index,surface_pressure,visibility&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max,uv_index_max,sunrise,sunset&timezone=auto&forecast_days=7`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Weather fetch failed");
  const data = await resp.json();

  const cur = data.current;
  const current = {
    temp: Math.round(cur.temperature_2m),
    code: cur.weather_code ?? 0,
    windSpeed: Math.round(cur.wind_speed_10m ?? 0),
    humidity: Math.round(cur.relative_humidity_2m ?? 0),
    feelsLike: Math.round(cur.apparent_temperature ?? cur.temperature_2m),
    uvIndex: Math.round((cur.uv_index ?? 0) * 10) / 10,
    pressure: Math.round(cur.surface_pressure ?? 0),
    visibility: Math.round((cur.visibility ?? 0) / 1000),
  };

  const hourly: ForecastData["hourly"] = [];
  for (let i = 0; i < Math.min(48, data.hourly.time.length); i++) {
    hourly.push({
      time: data.hourly.time[i],
      temp: Math.round(data.hourly.temperature_2m[i]),
      code: data.hourly.weather_code[i] ?? 0,
      precipitation: data.hourly.precipitation_probability?.[i] ?? 0,
      windSpeed: Math.round(data.hourly.wind_speed_10m?.[i] ?? 0),
      humidity: Math.round(data.hourly.relative_humidity_2m?.[i] ?? 0),
    });
  }

  const daily: ForecastData["daily"] = [];
  for (let i = 0; i < data.daily.time.length; i++) {
    daily.push({
      date: data.daily.time[i],
      tempMax: Math.round(data.daily.temperature_2m_max[i]),
      tempMin: Math.round(data.daily.temperature_2m_min[i]),
      code: data.daily.weather_code[i] ?? 0,
      precipitation:
        Math.round((data.daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
      windSpeed: Math.round(data.daily.wind_speed_10m_max?.[i] ?? 0),
      uvIndex: Math.round((data.daily.uv_index_max?.[i] ?? 0) * 10) / 10,
      sunrise: data.daily.sunrise?.[i] ?? "",
      sunset: data.daily.sunset?.[i] ?? "",
    });
  }

  return { current, hourly, daily };
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const result = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lng,
    });
    if (result.length > 0) {
      const r = result[0];
      return (
        [r.city || r.subregion, r.region].filter(Boolean).join(", ") ||
        "Current Location"
      );
    }
  } catch (err) {
    log.warn(
      "Reverse geocode failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
  return "Current Location";
}

async function geocodeCity(
  city: string,
): Promise<{ lat: number; lng: number; name: string } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.results?.length) return null;
    const r = data.results[0];
    return {
      lat: r.latitude,
      lng: r.longitude,
      name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    };
  } catch {
    return null;
  }
}

type Tab = "hourly" | "daily";

const W = 375;

export default withErrorBoundary(WeatherDetailScreenInner);

function WeatherDetailScreenInner() {
  const { colors: C } = useTheme();
  const { width: W } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(C, W), [C, W]);
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("hourly");
  const [showCityInput, setShowCityInput] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { lat: number; lng: number; name: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [savedCity, setSavedCity] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);

  const loadWeather = useCallback(
    async (manualCity?: { lat: number; lng: number; name: string }) => {
      setLoading(true);
      setError(null);
      try {
        let lat: number;
        let lng: number;
        let locName = "";
        let isGps = false;

        if (manualCity) {
          lat = manualCity.lat;
          lng = manualCity.lng;
          locName = manualCity.name;
          isGps = false;
        } else {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            try {
              const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              lat = loc.coords.latitude;
              lng = loc.coords.longitude;
              locName = await reverseGeocode(lat, lng);
              isGps = true;
            } catch {
              const saved = await AsyncStorage.getItem(SAVED_CITY_KEY).catch(
                (err) => {
                  log.warn(
                    "AsyncStorage read failed for saved city (gps fallback):",
                    err,
                  );
                  return null;
                },
              );
              if (saved) {
                const parsed = JSON.parse(saved);
                lat = parsed.lat;
                lng = parsed.lng;
                locName = parsed.name;
                isGps = false;
              } else {
                setError("Could not get location. Add a city manually.");
                setLoading(false);
                return;
              }
            }
          } else {
            const saved = await AsyncStorage.getItem(SAVED_CITY_KEY).catch(
              (err) => {
                log.warn(
                  "AsyncStorage read failed for saved city (no-gps):",
                  err,
                );
                return null;
              },
            );
            if (saved) {
              const parsed = JSON.parse(saved);
              lat = parsed.lat;
              lng = parsed.lng;
              locName = parsed.name;
              isGps = false;
            } else {
              setError("Location permission denied. Add a city manually.");
              setLoading(false);
              return;
            }
          }
        }

        const cacheKey = `forecast_cache_${Math.round(lat * 10)}_${Math.round(lng * 10)}`;
        const cached = await AsyncStorage.getItem(cacheKey).catch((err) => {
          log.warn("AsyncStorage read failed for forecast cache:", err);
          return null;
        });
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed._ts < FORECAST_CACHE_TTL) {
              setForecast({ ...parsed, locationName: locName, isGps });
              setLoading(false);
              return;
            }
          } catch (parseErr) {
            log.warn(
              "Failed to parse forecast cache:",
              parseErr instanceof Error ? parseErr.message : String(parseErr),
            );
          }
        }

        const result = await fetchForecast(lat, lng);
        const fullData = {
          ...result,
          locationName: locName,
          isGps,
          _ts: Date.now(),
        };
        AsyncStorage.setItem(cacheKey, JSON.stringify(fullData)).catch(
          (err) => {
            log.warn("Failed to cache forecast data:", err);
          },
        );
        setForecast(fullData);
      } catch (e) {
        setError("Failed to load weather data. Please try again.");
      }
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(SAVED_CITY_KEY).catch((err) => {
        log.warn("AsyncStorage read failed for saved city:", err);
        return null;
      });
      if (saved) {
        try {
          setSavedCity(JSON.parse(saved));
        } catch (parseErr) {
          log.warn(
            "Failed to parse saved city:",
            parseErr instanceof Error ? parseErr.message : String(parseErr),
          );
        }
      }
      loadWeather();
    })();
  }, []);

  const handleSearchCity = useCallback(async () => {
    if (!cityQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery.trim())}&count=5&language=en&format=json`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`City search failed (${resp.status})`);
      const data = await resp.json();
      if (data.results?.length) {
        setSearchResults(
          data.results.map((r: any) => ({
            lat: r.latitude,
            lng: r.longitude,
            name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
          })),
        );
      } else {
        setSearchResults([]);
        setError("No cities found. Try a different name.");
      }
    } catch (e) {
      log.warn(
        "City search failed:",
        e instanceof Error ? e.message : String(e),
      );
      setSearchResults([]);
      setError("Search failed. Please check your connection and try again.");
    }
    setSearching(false);
  }, [cityQuery]);

  const handleSelectCity = useCallback(
    async (city: { lat: number; lng: number; name: string }) => {
      await AsyncStorage.setItem(SAVED_CITY_KEY, JSON.stringify(city)).catch(
        (err) => {
          log.warn("Failed to save selected city:", err);
        },
      );
      setSavedCity(city);
      setShowCityInput(false);
      setCityQuery("");
      setSearchResults([]);
      loadWeather(city);
    },
    [loadWeather],
  );

  const handleUseGps = useCallback(async () => {
    setShowCityInput(false);
    setCityQuery("");
    setSearchResults([]);
    loadWeather();
  }, [loadWeather]);

  const VALID_IONICON_WEATHER = new Set([
    "sunny",
    "partly-sunny",
    "cloudy",
    "cloud",
    "rainy",
    "snow",
    "thunderstorm",
  ]);
  const safeWmoIcon = (icon: string): keyof typeof Ionicons.glyphMap => {
    if (VALID_IONICON_WEATHER.has(icon))
      return icon as keyof typeof Ionicons.glyphMap;
    log.warn("Invalid WMO icon name:", icon);
    return "cloud-outline";
  };
  const wmo = forecast
    ? (WMO_ICONS[forecast.current.code] ?? WMO_ICONS[0]!)
    : WMO_ICONS[0]!;
  const gradient = wmo.gradient;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const h = d.getHours();
    if (h === 0) return "12 AM";
    if (h === 12) return "12 PM";
    return h > 12 ? `${h - 12} PM` : `${h} AM`;
  };

  const formatDay = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.getTime() === today.getTime()) return "Today";
    if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
    return d.toLocaleDateString("en", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatSunTime = (iso: string) => {
    if (!iso) return "--";
    const d = new Date(iso);
    return d.toLocaleTimeString("en", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const nowHourIndex = useMemo(() => {
    if (!forecast) return 0;
    const now = new Date();
    const idx = forecast.hourly.findIndex(
      (h) => new Date(h.time).getHours() === now.getHours(),
    );
    return Math.max(0, idx);
  }, [forecast]);

  const visibleHourly = forecast ? forecast.hourly.slice(nowHourIndex) : [];

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <LinearGradient
        colors={gradient}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 380 }}
      />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            onPress={goBack}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Weather</Text>
          <TouchableOpacity
            onPress={() => setShowCityInput((v) => !v)}
            style={styles.addCityBtn}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showCityInput ? "close" : "location"}
              size={18}
              color="#fff"
            />
          </TouchableOpacity>
        </View>

        {/* City search */}
        {showCityInput && (
          <View style={styles.searchWrap}>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={C.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search city..."
                placeholderTextColor={C.textMuted}
                value={cityQuery}
                onChangeText={setCityQuery}
                onSubmitEditing={handleSearchCity}
                returnKeyType="search"
                autoFocus
              />
              {searching && (
                <ActivityIndicator size="small" color={C.primary} />
              )}
            </View>
            {savedCity && (
              <TouchableOpacity
                onPress={handleUseGps}
                style={styles.gpsBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="navigate" size={14} color={C.primary} />
                <Text style={styles.gpsBtnText}>Use GPS Location</Text>
              </TouchableOpacity>
            )}
            {searchResults.map((city, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => handleSelectCity(city)}
                style={styles.resultRow}
                activeOpacity={0.7}
              >
                <Ionicons name="location-outline" size={16} color={C.primary} />
                <Text style={styles.resultText} numberOfLines={1}>
                  {city.name}
                </Text>
              </TouchableOpacity>
            ))}
            {searchResults.length === 0 &&
              cityQuery.length > 0 &&
              !searching && (
                <Text style={styles.noResult}>
                  No cities found. Try a different name.
                </Text>
              )}
          </View>
        )}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText}>Loading weather...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Ionicons
              name="cloud-offline-outline"
              size={48}
              color="rgba(255,255,255,0.6)"
            />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              onPress={() => setShowCityInput(true)}
              style={styles.errorBtn}
            >
              <Text style={styles.errorBtnText}>Add City Manually</Text>
            </TouchableOpacity>
          </View>
        ) : forecast ? (
          <>
            {/* Current weather hero */}
            <View style={styles.heroWrap}>
              <View style={styles.locationRow}>
                <Ionicons
                  name={forecast.isGps ? "navigate" : "location"}
                  size={14}
                  color="rgba(255,255,255,0.8)"
                />
                <Text style={styles.locationText}>{forecast.locationName}</Text>
                {forecast.isGps && <View style={styles.gpsDot} />}
              </View>
              <Text style={styles.heroTemp}>{forecast.current.temp}°</Text>
              <View style={styles.heroCondRow}>
                <Ionicons
                  name={safeWmoIcon(wmo.icon)}
                  size={24}
                  color="rgba(255,255,255,0.9)"
                />
                <Text style={styles.heroCondText}>{wmo.label}</Text>
              </View>
              <Text style={styles.heroFeelsLike}>
                Feels like {forecast.current.feelsLike}°C
              </Text>

              {/* Quick stats */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons
                    name="water-outline"
                    size={16}
                    color="rgba(255,255,255,0.7)"
                  />
                  <Text style={styles.statValue}>{forecast.current.humidity}%</Text>
                  <Text style={styles.statLabel}>Humidity</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Ionicons
                    name="speedometer-outline"
                    size={16}
                    color="rgba(255,255,255,0.7)"
                  />
                  <Text style={styles.statValue}>
                    {forecast.current.windSpeed} km/h
                  </Text>
                  <Text style={styles.statLabel}>Wind</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Ionicons
                    name="sunny-outline"
                    size={16}
                    color="rgba(255,255,255,0.7)"
                  />
                  <Text style={styles.statValue}>{forecast.current.uvIndex}</Text>
                  <Text style={styles.statLabel}>UV Index</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Ionicons
                    name="eye-outline"
                    size={16}
                    color="rgba(255,255,255,0.7)"
                  />
                  <Text style={styles.statValue}>
                    {forecast.current.visibility} km
                  </Text>
                  <Text style={styles.statLabel}>Visibility</Text>
                </View>
              </View>
            </View>

            {/* Forecast Tabs */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                onPress={() => setTab("hourly")}
                style={[styles.tabBtn, tab === "hourly" && styles.tabBtnActive]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    tab === "hourly" && styles.tabTextActive,
                  ]}
                >
                  Hourly
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTab("daily")}
                style={[styles.tabBtn, tab === "daily" && styles.tabBtnActive]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    tab === "daily" && styles.tabTextActive,
                  ]}
                >
                  7-Day
                </Text>
              </TouchableOpacity>
            </View>

            {tab === "hourly" ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.hScroll}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
              >
                {visibleHourly.map((h, i) => {
                  const isNow = i === 0;
                  const itemWmo = WMO_ICONS[h.code] ?? WMO_ICONS[0]!;
                  return (
                    <View
                      key={i}
                      style={[styles.hourCard, isNow && styles.hourCardNow]}
                    >
                      <Text
                        style={[styles.hourTime, isNow && styles.hourTimeNow]}
                      >
                        {isNow ? "Now" : formatTime(h.time)}
                      </Text>
                      <Ionicons
                        name={safeWmoIcon(itemWmo.icon)}
                        size={22}
                        color={isNow ? C.primary : "rgba(255,255,255,0.8)"}
                      />
                      <Text
                        style={[styles.hourTemp, isNow && styles.hourTempNow]}
                      >
                        {h.temp}°
                      </Text>
                      {h.precipitation > 0 && (
                        <View style={styles.hourPrecipRow}>
                          <Ionicons name="rainy" size={10} color="#60a5fa" />
                          <Text style={styles.hourPrecip}>
                            {h.precipitation}%
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.dailyWrap}>
                {forecast.daily.map((d, i) => {
                  const itemWmo = WMO_ICONS[d.code] ?? WMO_ICONS[0]!;
                  const isToday = i === 0;
                  return (
                    <View key={i} style={styles.dayRow}>
                      <Text style={styles.dayName}>
                        {isToday ? "Today" : formatDay(d.date)}
                      </Text>
                      <Ionicons
                        name={safeWmoIcon(itemWmo.icon)}
                        size={20}
                        color="rgba(255,255,255,0.9)"
                      />
                      <Text style={styles.dayTempMin}>{d.tempMin}°</Text>
                      <View style={styles.dayBarTrack}>
                        <LinearGradient
                          colors={["#60a5fa", "#f59e0b"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[
                            styles.dayBarFill,
                            {
                              left: `${((d.tempMin + 10) / 60) * 100}%`,
                              right: `${100 - ((d.tempMax + 10) / 60) * 100}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.dayTempMax}>{d.tempMax}°</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Extra details grid */}
            <View style={styles.detailsGrid}>
              <View style={styles.detailCard}>
                <View style={styles.detailCardHeader}>
                  <Ionicons
                    name="sunny-outline"
                    size={14}
                    color="rgba(255,255,255,0.4)"
                  />
                  <Text style={styles.detailCardTitle}>Sun</Text>
                </View>
                <View style={styles.sunRow}>
                  <View style={styles.sunItem}>
                    <Text style={styles.sunTime}>
                      {formatSunTime(forecast.daily[0]!.sunrise)}
                    </Text>
                    <Text style={styles.sunLabel}>Sunrise</Text>
                  </View>
                  <View style={styles.sunItem}>
                    <Text style={styles.sunTime}>
                      {formatSunTime(forecast.daily[0]!.sunset)}
                    </Text>
                    <Text style={styles.sunLabel}>Sunset</Text>
                  </View>
                </View>
              </View>

              <View style={styles.detailCard}>
                <View style={styles.detailCardHeader}>
                  <Ionicons
                    name="speedometer-outline"
                    size={14}
                    color="rgba(255,255,255,0.4)"
                  />
                  <Text style={styles.detailCardTitle}>Pressure</Text>
                </View>
                <Text style={styles.sunTime}>{forecast.current.pressure} hPa</Text>
                <Text style={styles.sunLabel}>Surface pressure</Text>
              </View>
            </View>

            <Text style={styles.source}>Data from Open-Meteo.com</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function makeStyles(C: typeof Colors.light, W: number) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 12,
      zIndex: 20,
    },
    backBtn: {
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
    addCityBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.15)",
    },
    searchWrap: {
      backgroundColor: C.surface,
      marginHorizontal: 16,
      marginTop: 8,
      borderRadius: 16,
      padding: 12,
      gap: 12,
      ...shadows.md,
      zIndex: 30,
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.surfaceSecondary,
      paddingHorizontal: 12,
      borderRadius: 12,
      height: 46,
      gap: 10,
    },
    searchInput: {
      flex: 1,
      fontFamily: Font.regular,
      fontSize: 15,
      color: C.text,
      paddingVertical: 8,
    },
    gpsBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 4,
    },
    gpsBtnText: {
      fontFamily: Font.medium,
      fontSize: 14,
      color: C.primary,
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    resultText: {
      fontFamily: Font.regular,
      fontSize: 14,
      color: C.text,
      flex: 1,
    },
    noResult: {
      fontFamily: Font.regular,
      fontSize: 13,
      color: C.textMuted,
      textAlign: "center",
      paddingVertical: 8,
    },
    loadingWrap: {
      paddingTop: 100,
      alignItems: "center",
      gap: 16,
    },
    loadingText: {
      fontFamily: Font.medium,
      fontSize: 15,
      color: "#fff",
      opacity: 0.8,
    },
    errorWrap: {
      paddingTop: 100,
      alignItems: "center",
      gap: 16,
      paddingHorizontal: 40,
    },
    errorText: {
      fontFamily: Font.regular,
      fontSize: 15,
      color: "#fff",
      textAlign: "center",
      lineHeight: 22,
      opacity: 0.9,
    },
    errorBtn: {
      backgroundColor: "rgba(255,255,255,0.2)",
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
    },
    errorBtnText: {
      fontFamily: Font.semiBold,
      fontSize: 14,
      color: "#fff",
    },
    heroWrap: {
      alignItems: "center",
      paddingTop: 20,
      paddingBottom: 40,
    },
    locationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(0,0,0,0.2)",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
    },
    locationText: {
      fontFamily: Font.bold,
      fontSize: 15,
      color: "#fff",
    },
    gpsDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#4ade80",
    },
    heroTemp: {
      fontFamily: Font.bold,
      fontSize: 80,
      color: "#fff",
      lineHeight: 90,
      ...Platform.select({
        web: { textShadow: "0px 2px 8px rgba(0,0,0,0.15)" },
        default: {
          textShadowColor: "rgba(0,0,0,0.15)",
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 8,
          elevation: 0,
        },
      }),
    },
    heroCondRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
    },
    heroCondText: {
      fontFamily: Font.semiBold,
      fontSize: 18,
      color: "rgba(255,255,255,0.9)",
    },
    heroFeelsLike: {
      fontFamily: Font.regular,
      fontSize: 13,
      color: "rgba(255,255,255,0.6)",
      marginTop: 4,
    },
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 20,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginHorizontal: 16,
    },
    statItem: {
      flex: 1,
      alignItems: "center",
      gap: 4,
    },
    statValue: {
      fontFamily: Font.semiBold,
      fontSize: 13,
      color: "#fff",
    },
    statLabel: {
      fontFamily: Font.regular,
      fontSize: 10,
      color: "rgba(255,255,255,0.5)",
    },
    statDivider: {
      width: 1,
      height: 28,
      backgroundColor: "rgba(255,255,255,0.15)",
    },
    tabRow: {
      flexDirection: "row",
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 12,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: 3,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: "center",
      borderRadius: 10,
    },
    tabBtnActive: {
      backgroundColor: C.surface,
      ...shadows.sm,
    },
    tabText: {
      fontFamily: Font.medium,
      fontSize: 13,
      color: "rgba(255,255,255,0.5)",
    },
    tabTextActive: {
      color: C.text,
      fontFamily: Font.semiBold,
    },
    hScroll: {
      marginBottom: 16,
    },
    hourCard: {
      width: 64,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: 16,
      paddingVertical: 12,
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
    },
    hourCardNow: {
      backgroundColor: C.surface,
      borderColor: C.primary + "30",
      ...shadows.sm,
    },
    hourTime: {
      fontFamily: Font.medium,
      fontSize: 11,
      color: "rgba(255,255,255,0.5)",
    },
    hourTimeNow: { color: C.primary },
    hourTemp: {
      fontFamily: Font.bold,
      fontSize: 16,
      color: "rgba(255,255,255,0.9)",
    },
    hourTempNow: { color: C.text },
    hourPrecipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    hourPrecip: {
      fontFamily: Font.regular,
      fontSize: 10,
      color: "#60a5fa",
    },
    dailyWrap: {
      marginHorizontal: 16,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: 16,
      paddingVertical: 6,
      paddingHorizontal: 14,
      marginBottom: 16,
    },
    dayRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.06)",
      gap: 8,
    },
    dayName: {
      fontFamily: Font.medium,
      fontSize: 13,
      color: "rgba(255,255,255,0.8)",
      width: 80,
    },
    dayTempMin: {
      fontFamily: Font.regular,
      fontSize: 13,
      color: "rgba(255,255,255,0.4)",
      width: 30,
      textAlign: "right",
    },
    dayBarTrack: {
      flex: 1,
      height: 4,
      backgroundColor: "rgba(255,255,255,0.1)",
      borderRadius: 2,
      overflow: "hidden",
    },
    dayBarFill: {
      position: "absolute",
      top: 0,
      height: 4,
      borderRadius: 2,
    },
    dayTempMax: {
      fontFamily: Font.semiBold,
      fontSize: 13,
      color: "rgba(255,255,255,0.9)",
      width: 30,
    },
    detailsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 16,
      gap: 10,
      marginBottom: 16,
    },
    detailCard: {
      flex: 1,
      minWidth: (W - 42) / 2,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: 16,
      padding: 14,
      gap: 12,
    },
    detailCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    detailCardTitle: {
      fontFamily: Font.medium,
      fontSize: 11,
      color: "rgba(255,255,255,0.5)",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    sunRow: {
      flexDirection: "row",
      justifyContent: "space-around",
    },
    sunItem: {
      alignItems: "center",
      gap: 4,
    },
    sunTime: {
      fontFamily: Font.semiBold,
      fontSize: 15,
      color: "rgba(255,255,255,0.9)",
    },
    sunLabel: {
      fontFamily: Font.regular,
      fontSize: 10,
      color: "rgba(255,255,255,0.4)",
    },
    source: {
      fontFamily: Font.regular,
      fontSize: 11,
      color: "rgba(255,255,255,0.25)",
      textAlign: "center",
      marginTop: 8,
    },
  });
}
