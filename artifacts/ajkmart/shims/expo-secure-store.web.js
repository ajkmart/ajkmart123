/**
 * expo-secure-store web shim
 * Falls back to localStorage on web (no keychain available in browsers).
 */

export async function getItemAsync(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItemAsync(key, value, _options) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export async function deleteItemAsync(key, _options) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function getItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setItem(key, value, _options) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function deleteItem(key, _options) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const ALWAYS = 2;
export const ALWAYS_THIS_DEVICE_ONLY = 3;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 4;
export const WHEN_UNLOCKED = 5;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6;
