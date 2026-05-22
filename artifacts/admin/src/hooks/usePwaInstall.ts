import { createLogger } from "@/lib/logger";
import { useEffect, useState } from "react";
const log = createLogger("[usePwaInstall]");

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "admin_pwa_install_dismissed";

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "1";
    } catch (err) {
      log.debug(
        { err: err instanceof Error ? err.message : String(err) },
        "[usePwaInstall] localStorage unavailable — defaulting dismissed=false"
      );
      return false;
    }
  });

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  interface NavigatorWithStandalone extends Navigator {
    standalone?: boolean;
  }
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as NavigatorWithStandalone).standalone === true;

  useEffect(() => {
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Hide the banner automatically if beforeinstallprompt never fires
    // (e.g. sandboxed Replit preview iframe, already-installed, or unsupported browser).
    const timeout = setTimeout(() => {
      setDeferredPrompt((prev) => {
        if (!prev) setIsInstallable(false);
        return prev;
      });
    }, 5000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(timeout);
    };
  }, [isStandalone]);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setIsInstalled(true);
    } catch (err) {
      log.debug(
        { err: err instanceof Error ? err.message : String(err) },
        "[usePwaInstall] promptInstall failed — sandboxed or event already consumed"
      );
    }
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  const dismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch (err) {
      log.debug(
        { err: err instanceof Error ? err.message : String(err) },
        "[usePwaInstall] localStorage unavailable — skipping persistence"
      );
    }
  };

  return { isInstallable, isInstalled, isIOS, isStandalone, isDismissed, promptInstall, dismiss };
}
