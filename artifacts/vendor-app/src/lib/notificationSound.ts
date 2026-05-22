import { createLogger } from "@/lib/logger";
const log = createLogger("[audio]");

let audioCtx: AudioContext | null = null;
let unlocked = false;
const activeNodes: Array<{ osc: OscillatorNode; gain: GainNode }> = [];

/* ─── Order-alert deduplication ──────────────────────────────────────────────
 * Tracks recently-seen order IDs so both the Socket.IO handler and the
 * foreground FCM handler don't double-alert for the same order.
 * TTL: 5 seconds — short enough to re-alert if the same orderId genuinely
 * arrives twice after the window, long enough to cover FCM→Socket.IO lag.
 * ────────────────────────────────────────────────────────────────────────── */
const _recentOrderTs = new Map<string, number>();
const DEDUP_TTL_MS = 5_000;

export function markOrderSeen(orderId: string): void {
  _recentOrderTs.set(orderId, Date.now());
  /* Lazy cleanup of expired entries so the map never grows unbounded */
  if (_recentOrderTs.size > 200) {
    const cutoff = Date.now() - DEDUP_TTL_MS;
    for (const [id, ts] of _recentOrderTs) {
      if (ts < cutoff) _recentOrderTs.delete(id);
    }
  }
}

export function wasOrderSeenRecently(orderId: string): boolean {
  const ts = _recentOrderTs.get(orderId);
  if (ts === undefined) return false;
  if (Date.now() - ts > DEDUP_TTL_MS) {
    _recentOrderTs.delete(orderId);
    return false;
  }
  return true;
}
interface WindowWithWebkit extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

function getCtx(): AudioContext | null {
  if (!audioCtx) {
    try {
      const win = window as WindowWithWebkit;
      const AudioCtx = win.AudioContext || win.webkitAudioContext;
      if (!AudioCtx) return null;
      audioCtx = new AudioCtx();
    } catch (err) {
      console.warn("[artifacts/vendor-app/src/lib/notificationSound.ts]", err);
    } // eslint-disable-line no-console
  }
  return audioCtx;
}

export function unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.001);
  try {
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (err) {
        console.warn("[artifacts/vendor-app/src/lib/notificationSound.ts]", err);
      }
    };
  } catch (err) {
    console.warn("[artifacts/vendor-app/src/lib/notificationSound.ts]", err);
  } // eslint-disable-line no-console
  unlocked = true;
}

export function isAudioLocked(): boolean {
  if (unlocked) return false;
  const ctx = getCtx();
  if (!ctx) return false;
  return ctx.state === "suspended";
}

export function playOrderSound() {
  try {
    const ctx = getCtx();
    if (!ctx) {
      vibrateFallback();
      return;
    }
    if (ctx.state === "suspended") {
      log.warn(
        "Playback blocked — AudioContext still suspended. The vendor must interact with the page first to unlock audio."
      );
      vibrateFallback();
      return;
    }

    const now = ctx.currentTime;

    const playTone = (
      freq: number,
      start: number,
      dur: number,
      vol: number,
      type: OscillatorType = "sine"
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      activeNodes.push({ osc, gain });
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(vol, now + start + 0.015);
      gain.gain.setValueAtTime(vol, now + start + dur * 0.7);
      gain.gain.linearRampToValueAtTime(0, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
      osc.onended = () => {
        const idx = activeNodes.findIndex((n) => n.osc === osc);
        if (idx >= 0) activeNodes.splice(idx, 1);
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (err) {
          console.warn("[artifacts/vendor-app/src/lib/notificationSound.ts]", err);
        } // eslint-disable-line no-console
      };
    };

    playTone(660, 0, 0.12, 0.4, "square");
    playTone(880, 0.14, 0.12, 0.4, "square");
    playTone(1100, 0.28, 0.18, 0.35, "sine");
    playTone(660, 0.55, 0.12, 0.4, "square");
    playTone(880, 0.69, 0.12, 0.4, "square");
    playTone(1100, 0.83, 0.2, 0.3, "sine");
  } catch (err) {
    console.warn("[artifacts/vendor-app/src/lib/notificationSound.ts]", err);
  } // eslint-disable-line no-console
}

function vibrateFallback() {
  try {
    navigator?.vibrate?.([200, 100, 200]);
  } catch (err) {
    console.warn("[artifacts/vendor-app/src/lib/notificationSound.ts]", err);
  } // eslint-disable-line no-console
}

export function stopOrderSound() {
  while (activeNodes.length > 0) {
    const node = activeNodes.pop();
    if (!node) continue;
    try {
      node.osc.stop();
    } catch (err) {
      console.warn("[artifacts/vendor-app/src/lib/notificationSound.ts]", err);
    } // eslint-disable-line no-console
    try {
      node.osc.disconnect();
    } catch (err) {
      console.warn("[artifacts/vendor-app/src/lib/notificationSound.ts]", err);
    } // eslint-disable-line no-console
    try {
      node.gain.disconnect();
    } catch (err) {
      console.warn("[artifacts/vendor-app/src/lib/notificationSound.ts]", err);
    } // eslint-disable-line no-console
  }
}
