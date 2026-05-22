/**
 * expo-local-authentication web shim
 * Biometric authentication is not available in browsers via this API.
 */

export async function hasHardwareAsync() {
  return false;
}

export async function isEnrolledAsync() {
  return false;
}

export async function supportedAuthenticationTypesAsync() {
  return [];
}

export async function authenticateAsync(_options) {
  return { success: false, error: "Not supported on web" };
}

export async function cancelAuthenticate() {}

export async function getEnrolledLevelAsync() {
  return 0;
}

export const AuthenticationType = {
  FINGERPRINT: 1,
  FACIAL_RECOGNITION: 2,
  IRIS: 3,
};

export const SecurityLevel = {
  NONE: 0,
  SECRET: 1,
  BIOMETRIC_WEAK: 2,
  BIOMETRIC_STRONG: 3,
};
