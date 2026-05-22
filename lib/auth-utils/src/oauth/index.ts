import { GoogleOAuthProvider, useGoogleLogin as useGoogleLoginLib } from "@react-oauth/google";
import { useState } from "react";

export { GoogleOAuthProvider };

export interface OAuthResult {
  token: string;
  provider: "google" | "facebook";
}

export interface OAuthError {
  message: string;
  provider: "google" | "facebook";
}

declare global {
  interface Window {
    FB?: {
      init: (config: Record<string, unknown>) => void;
      login: (
        cb: (response: { authResponse?: { accessToken: string } }) => void,
        opts?: Record<string, unknown>
      ) => void;
      getLoginStatus: (
        cb: (response: { status: string; authResponse?: { accessToken: string } }) => void
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Not in browser environment"));
      return;
    }
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${id} script`));
    document.head.appendChild(script);
  });
}

export function useGoogleLogin(): {
  login: () => void;
  loading: boolean;
  error: string | null;
  result: OAuthResult | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OAuthResult | null>(null);

  const login = useGoogleLoginLib({
    onSuccess: (tokenResponse) => {
      setLoading(false);
      setResult({
        token: tokenResponse.access_token,
        provider: "google",
      });
    },
    onError: (err) => {
      setLoading(false);
      setError(err.error_description || "Google login failed");
    },
    onNonOAuthError: () => {
      setLoading(false);
      setError("Google login popup was closed");
    },
    flow: "implicit",
  });

  const wrappedLogin = () => {
    setLoading(true);
    setError(null);
    setResult(null);
    login();
  };

  return { login: wrappedLogin, loading, error, result };
}

export function loadGoogleGSIToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const gw = window as unknown as {
      google?: {
        accounts: {
          id: {
            initialize: (c: Record<string, unknown>) => void;
            prompt: (
              cb: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void
            ) => void;
          };
        };
      };
    };
    if (!gw.google?.accounts?.id) {
      loadScript("https://accounts.google.com/gsi/client", "google-gsi").then(init).catch(reject);
    } else {
      init();
    }
    function init() {
      const g = (
        window as unknown as {
          google?: {
            accounts: {
              id: {
                initialize: (c: Record<string, unknown>) => void;
                prompt: (
                  cb: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void
                ) => void;
              };
            };
          };
        }
      ).google;
      if (!g?.accounts?.id) {
        reject(new Error("Google SDK not available"));
        return;
      }
      g.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          if (response.credential) resolve(response.credential);
          else reject(new Error("Google sign-in cancelled"));
        },
      });
      g.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          reject(new Error("Google sign-in was dismissed"));
        }
      });
    }
  });
}

export function loadFacebookAccessToken(appId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.FB) {
      window.fbAsyncInit = () => {
        window.FB!.init({ appId, cookie: true, xfbml: false, version: "v19.0" });
        doLogin();
      };
      loadScript("https://connect.facebook.net/en_US/sdk.js", "facebook-jssdk").catch(reject);
    } else {
      doLogin();
    }
    function doLogin() {
      window.FB!.login(
        (response) => {
          if (response.authResponse?.accessToken) resolve(response.authResponse.accessToken);
          else reject(new Error("Facebook sign-in cancelled"));
        },
        { scope: "email,public_profile" }
      );
    }
  });
}

export function decodeGoogleJwtPayload(idToken: string): Record<string, string> {
  const b64url = idToken.split(".")[1]!;
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(
    decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    )
  );
}

let fbInitialized = false;

export function initFacebookSDK(appId: string): Promise<void> {
  if (fbInitialized) return Promise.resolve();

  return new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({
        appId,
        cookie: true,
        xfbml: false,
        version: "v19.0",
      });
      fbInitialized = true;
      resolve();
    };

    loadScript("https://connect.facebook.net/en_US/sdk.js", "facebook-jssdk").catch(reject);
  });
}

export function useFacebookLogin(appId?: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedId =
    appId ||
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as Record<string, Record<string, string>>).env
        ?.VITE_FACEBOOK_APP_ID) ||
    "";

  const login = async (): Promise<OAuthResult | null> => {
    if (!resolvedId) {
      setError("Facebook App ID not configured");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      await initFacebookSDK(resolvedId);

      return new Promise((resolve) => {
        window.FB!.login(
          (response) => {
            setLoading(false);
            if (response.authResponse?.accessToken) {
              resolve({
                token: response.authResponse.accessToken,
                provider: "facebook",
              });
            } else {
              setError("Facebook login cancelled");
              resolve(null);
            }
          },
          { scope: "email,public_profile" }
        );
      });
    } catch (err) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "Facebook login failed";
      setError(msg);
      return null;
    }
  };

  return { login, loading, error };
}
