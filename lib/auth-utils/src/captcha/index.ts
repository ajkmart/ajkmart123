declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

let scriptLoaded = false;

function loadRecaptchaScript(siteKey: string): Promise<void> {
  if (scriptLoaded) return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("reCAPTCHA can only be loaded in a browser environment"));
      return;
    }

    const existing = document.querySelector('script[src*="recaptcha/api.js"]');
    if (existing) {
      scriptLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load reCAPTCHA script"));
    document.head.appendChild(script);
  });
}

export async function executeCaptcha(action: string, siteKey?: string): Promise<string> {
  const key =
    siteKey ||
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as Record<string, Record<string, string>>).env
        ?.VITE_RECAPTCHA_SITE_KEY) ||
    "";

  if (!key) {
    throw new Error("reCAPTCHA site key is required. Set VITE_RECAPTCHA_SITE_KEY or pass siteKey.");
  }

  await loadRecaptchaScript(key);

  return new Promise((resolve, reject) => {
    if (!window.grecaptcha) {
      reject(new Error("reCAPTCHA not available"));
      return;
    }

    window.grecaptcha.ready(() => {
      window.grecaptcha!.execute(key, { action }).then(resolve).catch(reject);
    });
  });
}

export function isRecaptchaLoaded(): boolean {
  return scriptLoaded && !!window.grecaptcha;
}
