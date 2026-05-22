import { createLogger } from "@/lib/logger";
import { registerErrorHandler } from "@workspace/logger";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { checkApiHealth } from "./lib/checkApiHealth";
import { initErrorReporter, reportError } from "./lib/error-reporter";
import { loadPlatformConfig } from "./lib/platformConfig";
const log = createLogger("[main]");

initErrorReporter();
registerErrorHandler(reportError);

if (import.meta.env.DEV) {
  const apiTarget = import.meta.env.VITE_API_PROXY_TARGET || import.meta.env.VITE_API_BASE_URL;
  if (!apiTarget) {
    log.warn(
      "VITE_API_PROXY_TARGET is not set — API proxy may point to wrong host. Fix: add VITE_API_PROXY_TARGET as a Replit Secret or in your .env file, then restart."
    );
  }

  window.addEventListener("unhandledrejection", (event) => {
    const msg = event.reason?.message ?? String(event.reason ?? "");
    if (msg.includes("WebSocket closed without opened")) {
      event.preventDefault();
    }
  });
}

void loadPlatformConfig();

// Core Web Vitals — only in production so dev noise doesn't pollute analytics
if (import.meta.env.PROD) {
  void import("web-vitals").then(({ onCLS, onFCP, onLCP, onTTFB, onINP }) => {
    void import("./lib/analytics").then(({ trackEvent }) => {
      const report = ({
        name,
        value,
        rating,
      }: {
        name: string;
        value: number;
        rating?: string;
      }) => {
        trackEvent("web_vital", { name, value, rating });
      };
      onCLS(report);
      onFCP(report);
      onLCP(report);
      onTTFB(report);
      onINP(report);
    });
  });
}

void (async () => {
  const container = document.getElementById("root")!;
  const root = createRoot(container);

  const { reachable, url } = await checkApiHealth();
  if (reachable) {
    root.render(<App />);
    return;
  }

  function ApiUnreachable() {
    const [retrying, setRetrying] = useState(false);

    const handleRetry = async () => {
      setRetrying(true);
      const result = await checkApiHealth();
      if (result.reachable) {
        root.render(<App />);
      } else {
        setRetrying(false);
      }
    };

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 16,
            padding: "40px 36px",
            maxWidth: 420,
            width: "100%",
            textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 700, margin: "0 0 10px" }}>
            Cannot Reach Server
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, margin: "0 0 8px" }}>
            The admin panel could not connect to the API server.
          </p>
          <p
            style={{
              color: "#64748b",
              fontSize: 12,
              fontFamily: "monospace",
              margin: "0 0 28px",
              background: "#0f172a",
              borderRadius: 8,
              padding: "6px 12px",
              wordBreak: "break-all",
            }}
          >
            {url}
          </p>
          <button
            onClick={handleRetry}
            disabled={retrying}
            style={{
              background: retrying ? "#3b82f688" : "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 28px",
              fontSize: 15,
              fontWeight: 600,
              cursor: retrying ? "not-allowed" : "pointer",
              width: "100%",
              transition: "background 0.2s",
            }}
          >
            {retrying ? "Retrying…" : "Retry Connection"}
          </button>
        </div>
      </div>
    );
  }

  root.render(<ApiUnreachable />);
})();
