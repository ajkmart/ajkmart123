import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getRide as getRideApi } from "@workspace/api-client-react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type RideStatusHookResult = {
  ride: any;
  setRide: React.Dispatch<React.SetStateAction<any>>;
  connectionType: "sse" | "polling" | "connecting";
  reconnect: () => void;
};

const SSE_RETRY_DELAY = 3000;
const POLL_INTERVAL = 5000;

export function useRideStatus(rideId: string): RideStatusHookResult {
  const [ride, setRide] = useState<any>(null);
  const [connectionType, setConnectionType] =
    useState<"sse" | "polling" | "connecting">("connecting");
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const sseFailCountRef = useRef(0);

  const apiBase = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setConnectionType("polling");

    const poll = async () => {
      try {
        const d = await getRideApi(rideId);
        if (mountedRef.current) {
          setRide(d as any);
          const status = (d as any)?.status;
          if (status === "completed" || status === "cancelled") {
            stopPolling();
          }
        }
      } catch {}
    };
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
  }, [rideId]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const closeSse = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const connectSse = useCallback(async () => {
    closeSse();
    clearRetryTimer();
    setConnectionType("connecting");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let token: string | null = null;
      try {
        const SS = await import("expo-secure-store");
        token = await SS.getItemAsync("ajkmart_token");
      } catch {}
      if (!token) token = await AsyncStorage.getItem("@ajkmart_token");
      const sseUrl = `${apiBase}/rides/${rideId}/stream`;

      const response = await fetch(sseUrl, {
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("SSE connection failed");
      }

      if (!mountedRef.current) return;
      sseFailCountRef.current = 0;
      stopPolling();
      setConnectionType("sse");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let streamDone = false;
      while (mountedRef.current) {
        const { done, value } = await reader.read();
        if (done) { streamDone = true; break; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const data = JSON.parse(line.slice(5).trim());
            if (!mountedRef.current) return;
            setRide(data);
            if (data?.status === "completed" || data?.status === "cancelled") {
              reader.releaseLock();
              return;
            }
          } catch {}
        }
      }

      if (streamDone && mountedRef.current) {
        retryTimerRef.current = setTimeout(() => {
          if (mountedRef.current) connectSse();
        }, SSE_RETRY_DELAY);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!mountedRef.current) return;

      sseFailCountRef.current += 1;
      if (sseFailCountRef.current >= 3) {
        startPolling();
      } else {
        retryTimerRef.current = setTimeout(() => {
          if (mountedRef.current) connectSse();
        }, SSE_RETRY_DELAY * sseFailCountRef.current);
      }
    }
  }, [rideId, apiBase, closeSse, clearRetryTimer, startPolling, stopPolling]);

  const reconnect = useCallback(() => {
    sseFailCountRef.current = 0;
    stopPolling();
    closeSse();
    connectSse();
  }, [connectSse, stopPolling, closeSse]);

  useEffect(() => {
    mountedRef.current = true;
    connectSse();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active" && mountedRef.current) {
        reconnect();
      }
    });

    return () => {
      mountedRef.current = false;
      clearRetryTimer();
      closeSse();
      stopPolling();
      appStateSub.remove();
    };
  }, [rideId]);

  return { ride, setRide, connectionType, reconnect };
}
