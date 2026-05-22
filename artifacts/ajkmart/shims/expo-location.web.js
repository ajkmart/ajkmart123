/**
 * expo-location web shim
 * Uses navigator.geolocation on web — all background / task-based APIs are no-ops.
 */

export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};

export const ActivityType = {
  Other: 1,
  AutomotiveNavigation: 2,
  Fitness: 3,
  OtherNavigation: 4,
  Airborne: 5,
};

export const GeofencingEventType = {
  Enter: 1,
  Exit: 2,
};

export const GeofencingRegionState = {
  Unknown: 0,
  Inside: 1,
  Outside: 2,
};

function geoPositionToExpo(pos) {
  return {
    coords: {
      latitude:         pos.coords.latitude,
      longitude:        pos.coords.longitude,
      altitude:         pos.coords.altitude ?? 0,
      accuracy:         pos.coords.accuracy ?? 0,
      altitudeAccuracy: pos.coords.altitudeAccuracy ?? -1,
      heading:          pos.coords.heading ?? -1,
      speed:            pos.coords.speed ?? -1,
    },
    timestamp: pos.timestamp,
  };
}

export async function requestForegroundPermissionsAsync() {
  if (!navigator.geolocation) {
    return { status: "denied", granted: false };
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve({ status: "granted", granted: true }),
      (err) => {
        if (err.code === 1) {
          resolve({ status: "denied", granted: false });
        } else {
          resolve({ status: "granted", granted: true });
        }
      },
      { timeout: 5000 }
    );
  });
}

export async function requestBackgroundPermissionsAsync() {
  return requestForegroundPermissionsAsync();
}

export async function getForegroundPermissionsAsync() {
  if (!navigator.geolocation) return { status: "denied", granted: false };
  if (typeof navigator.permissions !== "undefined") {
    try {
      const result = await navigator.permissions.query({ name: "geolocation" });
      const granted = result.state === "granted";
      return { status: result.state === "denied" ? "denied" : result.state === "granted" ? "granted" : "undetermined", granted };
    } catch {}
  }
  return { status: "undetermined", granted: false };
}

export async function getBackgroundPermissionsAsync() {
  return getForegroundPermissionsAsync();
}

export async function hasServicesEnabledAsync() {
  return typeof navigator !== "undefined" && !!navigator.geolocation;
}

export async function getCurrentPositionAsync(options = {}) {
  if (!navigator.geolocation) throw new Error("Geolocation not supported");
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(geoPositionToExpo(pos)),
      (err) => reject(new Error(err.message)),
      {
        enableHighAccuracy: options.accuracy >= 4,
        timeout:            options.timeInterval ?? 10000,
        maximumAge:         options.mayShowUserSettingsDialog ? 0 : 60000,
      }
    );
  });
}

export async function getLastKnownPositionAsync(_options) {
  return getCurrentPositionAsync(_options);
}

export async function watchPositionAsync(options, callback) {
  if (!navigator.geolocation) {
    return { remove: () => {} };
  }
  const watchId = navigator.geolocation.watchPosition(
    (pos) => callback(geoPositionToExpo(pos)),
    (_err) => {},
    {
      enableHighAccuracy: (options.accuracy ?? 3) >= 4,
      timeout:            options.timeInterval ?? 10000,
    }
  );
  return { remove: () => navigator.geolocation.clearWatch(watchId) };
}

export async function startLocationUpdatesAsync(_taskName, _options) {}

export async function stopLocationUpdatesAsync(_taskName) {}

export async function hasStartedLocationUpdatesAsync(_taskName) {
  return false;
}

export async function startGeofencingAsync(_taskName, _regions) {}

export async function stopGeofencingAsync(_taskName) {}

export async function hasStartedGeofencingAsync(_taskName) {
  return false;
}

export async function geocodeAsync(address) {
  console.warn("Geocoding not available in expo-location web shim");
  return [];
}

export async function reverseGeocodeAsync(_location) {
  console.warn("Reverse geocoding not available in expo-location web shim");
  return [];
}

export async function enableNetworkProviderAsync() {}
