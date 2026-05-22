import { useCallback, useState } from "react";
import type { OAuthResult } from "./index";

interface AuthSessionConfig {
  clientId: string;
  redirectUri: string;
  scopes?: string[];
}

export function useGoogleLoginNative(config: AuthSessionConfig) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (): Promise<OAuthResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const AuthSession = await import("expo-auth-session");
      const WebBrowser = await import("expo-web-browser");

      WebBrowser.maybeCompleteAuthSession();

      const discovery = {
        authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
      };

      const request = new AuthSession.AuthRequest({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        scopes: config.scopes || ["openid", "profile", "email"],
        responseType: AuthSession.ResponseType.IdToken,
        usePKCE: false,
      });

      const result = await request.promptAsync(discovery);

      if (result.type === "success" && result.params.id_token) {
        setLoading(false);
        return { token: result.params.id_token, provider: "google" };
      }

      setLoading(false);
      if (result.type === "cancel") {
        setError("Google login cancelled");
      }
      return null;
    } catch (err) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "Google login failed";
      setError(msg);
      return null;
    }
  }, [config.clientId, config.redirectUri, config.scopes]);

  return { login, loading, error };
}

export function useFacebookLoginNative(config: AuthSessionConfig) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (): Promise<OAuthResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const AuthSession = await import("expo-auth-session");
      const WebBrowser = await import("expo-web-browser");

      WebBrowser.maybeCompleteAuthSession();

      const discovery = {
        authorizationEndpoint: "https://www.facebook.com/v19.0/dialog/oauth",
        tokenEndpoint: "https://graph.facebook.com/v19.0/oauth/access_token",
      };

      const request = new AuthSession.AuthRequest({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        scopes: config.scopes || ["email", "public_profile"],
        responseType: AuthSession.ResponseType.Token,
      });

      const result = await request.promptAsync(discovery);

      if (result.type === "success" && result.params.access_token) {
        setLoading(false);
        return { token: result.params.access_token, provider: "facebook" };
      }

      setLoading(false);
      if (result.type === "cancel") {
        setError("Facebook login cancelled");
      }
      return null;
    } catch (err) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "Facebook login failed";
      setError(msg);
      return null;
    }
  }, [config.clientId, config.redirectUri, config.scopes]);

  return { login, loading, error };
}
