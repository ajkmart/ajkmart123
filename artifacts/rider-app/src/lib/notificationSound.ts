let audioCtx: AudioContext | null = null;
let unlocked = false;
let silencedUntil: number = 0;
let silenceMode = false;
const activeNodes: Array<{ osc: OscillatorNode; gain: GainNode }> = [];

const SILENCE_KEY = "ajkmart_rider_silence_mode";

export function getSilenceMode(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(SILENCE_KEY);
  if (stored != null) silenceMode = stored === "on";
  return silenceMode;
}

export function setSilenceMode(enabled: boolean) {
  silenceMode = enabled;
  localStorage.setItem(SILENCE_KEY, enabled ? "on" : "off");
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
      console.warn("[artifacts/rider-app/src/lib/notificationSound.ts]", err);
    } // eslint-disable-line no-console
  }
  return audioCtx;
}

/* ── Audio unlock / lock state ───────────────────────────────────────────────
   After a user gesture we attempt to resume the AudioContext and mark it as
   unlocked.  Components can query isAudioLocked() to decide whether to show
   the "Tap to enable sounds" prompt. */

export function unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(ctx.destination);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.001);
  try {
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (err) {
        console.warn("[artifacts/rider-app/src/lib/notificationSound.ts]", err);
      }
    };
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/notificationSound.ts]", err);
  } // eslint-disable-line no-console
  unlocked = true;
}

/** Returns true when the browser autoplay policy has blocked audio playback */
export function isAudioLocked(): boolean {
  if (unlocked) return false;
  const ctx = getCtx();
  if (!ctx) return false;
  return ctx.state === "suspended";
}

export function isSilenced(): boolean {
  const stored = localStorage.getItem("sound_silenced_until");
  if (stored) {
    silencedUntil = parseInt(stored, 10);
  }
  return Date.now() < silencedUntil;
}

export function silenceFor(minutes: number) {
  silencedUntil = Date.now() + minutes * 60 * 1000;
  localStorage.setItem("sound_silenced_until", String(silencedUntil));
}

export function unsilence() {
  silencedUntil = 0;
  localStorage.removeItem("sound_silenced_until");
}

export function getSilenceRemaining(): number {
  if (!isSilenced()) return 0;
  return Math.max(0, Math.ceil((silencedUntil - Date.now()) / 60000));
}

export function playRequestSound() {
  if (isSilenced() || getSilenceMode()) return;

  try {
    const ctx = getCtx();
    if (!ctx) {
      vibrateFallback();
      return;
    }
    if (ctx.state === "suspended") {
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
          console.warn("[artifacts/rider-app/src/lib/notificationSound.ts]", err);
        } // eslint-disable-line no-console
      };
    };

    playTone(880, 0, 0.1, 0.35, "square");
    playTone(1100, 0.12, 0.1, 0.35, "square");
    playTone(1320, 0.24, 0.15, 0.3, "sine");

    playTone(880, 0.5, 0.1, 0.35, "square");
    playTone(1100, 0.62, 0.1, 0.35, "square");
    playTone(1320, 0.74, 0.15, 0.3, "sine");

    playTone(1400, 0.95, 0.2, 0.25, "sine");
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/notificationSound.ts]", err);
  } // eslint-disable-line no-console
}

function vibrateFallback() {
  try {
    navigator?.vibrate?.([200, 100, 200]);
  } catch (err) {
    console.warn("[artifacts/rider-app/src/lib/notificationSound.ts]", err);
  } // eslint-disable-line no-console
}

/* C7, PWA7: Stop notification sound (no-op for synthesized tones,  used for cleanup) */
export function stopSound() {
  while (activeNodes.length > 0) {
    const node = activeNodes.pop();
    if (!node) continue;
    try {
      node.osc.stop();
    } catch (err) {
      console.warn("[artifacts/rider-app/src/lib/notificationSound.ts]", err);
    } // eslint-disable-line no-console
    try {
      node.osc.disconnect();
    } catch (err) {
      console.warn("[artifacts/rider-app/src/lib/notificationSound.ts]", err);
    } // eslint-disable-line no-console
    try {
      node.gain.disconnect();
    } catch (err) {
      console.warn("[artifacts/rider-app/src/lib/notificationSound.ts]", err);
    } // eslint-disable-line no-console
  }
}
