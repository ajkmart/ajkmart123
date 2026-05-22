// Web shim for expo-glass-effect (iOS-only module)
// On web, Liquid Glass is never available
export function isLiquidGlassAvailable() {
  return false;
}
