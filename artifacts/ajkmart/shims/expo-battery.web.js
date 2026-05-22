/**
 * expo-battery web shim
 * Uses the Battery Status API if available.
 */

async function getBattery() {
  if (typeof navigator !== "undefined" && "getBattery" in navigator) {
    try {
      return await navigator.getBattery();
    } catch {}
  }
  return null;
}

export async function getBatteryLevelAsync() {
  const battery = await getBattery();
  return battery ? battery.level : -1;
}

export async function getBatteryStateAsync() {
  const battery = await getBattery();
  if (!battery) return BatteryState.UNKNOWN;
  if (battery.charging) return BatteryState.CHARGING;
  if (battery.level === 1) return BatteryState.FULL;
  return BatteryState.UNPLUGGED;
}

export async function isLowPowerModeEnabledAsync() {
  return false;
}

export async function getPowerStateAsync() {
  const level = await getBatteryLevelAsync();
  const state = await getBatteryStateAsync();
  return { batteryLevel: level, batteryState: state, lowPowerMode: false };
}

export function addBatteryLevelListener(_callback) {
  return { remove: () => {} };
}

export function addBatteryStateListener(_callback) {
  return { remove: () => {} };
}

export function addLowPowerModeListener(_callback) {
  return { remove: () => {} };
}

export const BatteryState = {
  UNKNOWN: 0,
  UNPLUGGED: 1,
  CHARGING: 2,
  FULL: 3,
};
