import { createLogger } from "@/lib/logger";
const log = createLogger("[WebRTC]");

let _warned = false;

export function getTurnIceServers(): RTCIceServer[] {
  const url = import.meta.env.VITE_TURN_SERVER_URL as string | undefined;
  const username = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  if (url && username && credential) {
    return [{ urls: url, username, credential }];
  }

  if (!_warned) {
    _warned = true;
    log.warn(
      "TURN relay not configured — calls may fail on restricted networks.\n" +
        "Set VITE_TURN_SERVER_URL, VITE_TURN_USERNAME, and VITE_TURN_CREDENTIAL in your environment to enable TURN support."
    );
  }

  return [];
}
