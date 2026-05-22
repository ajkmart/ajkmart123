import { registerErrorHandler } from "@workspace/logger";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { checkApiHealth } from "./lib/checkApiHealth";
import { auditRiderEnv } from "./lib/envValidation";
import { initErrorReporter, reportError } from "./lib/error-reporter";
import { patchLeafletDefaultIcon } from "./lib/leafletIconFix";

// Run env audit once at module load — warnings appear in dev only.
auditRiderEnv();

initErrorReporter();
registerErrorHandler(reportError);

/* Apply the Leaflet default-marker patch once at app boot so every map
   instance (Active trip, MiniMap, dashboard) renders proper marker icons
   instead of broken-image placeholders. */
patchLeafletDefaultIcon();

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
          background: "linear-gradient(135deg, #064e3b 0%, #065f46 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            background: "#065f46",
            border: "1px solid #047857",
            borderRadius: 16,
            padding: "40px 36px",
            maxWidth: 420,
            width: "100%",
            textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ color: "#f0fdf4", fontSize: 22, fontWeight: 700, margin: "0 0 10px" }}>
            Cannot Reach Server
          </h1>
          <p style={{ color: "#a7f3d0", fontSize: 14, lineHeight: 1.6, margin: "0 0 8px" }}>
            The rider app could not connect to the API server.
          </p>
          <p
            style={{
              color: "#6ee7b7",
              fontSize: 12,
              fontFamily: "monospace",
              margin: "0 0 28px",
              background: "#064e3b",
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
              background: retrying ? "#ffffff88" : "#ffffff",
              color: "#065f46",
              border: "none",
              borderRadius: 10,
              padding: "12px 28px",
              fontSize: 15,
              fontWeight: 700,
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
