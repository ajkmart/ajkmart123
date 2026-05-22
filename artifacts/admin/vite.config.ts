import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

export default defineConfig(async ({ command }) => {
  /* PORT is only required for dev/preview, not for production builds */
  const rawPort = process.env.PORT;
  const isBuild = command === "build";

  if (!rawPort && !isBuild) {
    throw new Error("PORT environment variable is required but was not provided.");
  }

  const port = rawPort ? Number(rawPort) : 3000;

  if (!isBuild && (Number.isNaN(port) || port <= 0)) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const basePath = process.env.BASE_PATH ?? "/admin";

  const devPlugins =
    process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({ root: path.resolve(import.meta.dirname, "..") })
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner()),
        ]
      : [];

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      process.env.ANALYZE === "1" &&
        visualizer({ filename: "dist/bundle-stats.html", open: false, gzipSize: true }),
      ...devPlugins,
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
        react: path.resolve(import.meta.dirname, "node_modules/react"),
        "react-dom": path.resolve(import.meta.dirname, "node_modules/react-dom"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      cssCodeSplit: true,
      minify: "esbuild",
      sourcemap: false,
      target: "es2020",
      /* mapbox-gl is genuinely ~1.7 MB minified — raise limit to suppress noise */
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            /* ── Stable vendor chunks (hash unchanged between feature deploys) ── */
            /* Match react and react-dom exactly, not react-leaflet / react-map-gl */
            if (/\/node_modules\/(react|react-dom)\//.test(id)) return "vendor-react";
            if (id.includes("/node_modules/@tanstack/react-query")) return "vendor-query";
            if (id.includes("/node_modules/wouter")) return "vendor-router";
            if (id.includes("/node_modules/@radix-ui/")) return "vendor-radix";
            if (id.includes("/node_modules/recharts")) return "vendor-charts";
            /* Leaflet (OSM map) — loaded on all map pages */
            if (id.includes("/node_modules/leaflet") || id.includes("/node_modules/react-leaflet"))
              return "vendor-map";
            /* Mapbox GL — only loaded when admin configures Mapbox provider (~1.7 MB, can't split further) */
            if (id.includes("/node_modules/mapbox-gl") || id.includes("/node_modules/react-map-gl"))
              return "vendor-mapbox";
            if (id.includes("/node_modules/lucide-react")) return "vendor-icons";

            /* ── Feature page chunks (group related lazy pages together) ──
               NOTE: analytics.tsx is intentionally excluded — it is a hub page
               that lazily loads sub-analytics pages; including it in the same
               chunk as its dynamic-import children causes a Rollup circular-
               chunk warning. The sub-pages are grouped together instead. */
            if (
              id.includes("/pages/transactions") ||
              id.includes("/pages/Withdrawals") ||
              id.includes("/pages/DepositRequests") ||
              id.includes("/pages/wallet-transfers")
            )
              return "pages-finance";
            if (
              id.includes("/pages/revenue-analytics") ||
              id.includes("/pages/search-analytics") ||
              id.includes("/pages/overview-analytics")
            )
              return "pages-analytics";
            /* Operations pages (orders, rides, pharmacy, parcel, van) are kept
               as individual lazy chunks — they share no code and load
               independently, so grouping them would only hurt cache granularity. */
          },
        },
      },
    },
    server: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
      hmr: process.env.REPL_ID
        ? {
            clientPort: 443,
            protocol: "wss",
            host: process.env.REPLIT_DEV_DOMAIN,
          }
        : undefined,
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
      proxy: {
        "/api": {
          target: `http://localhost:${process.env.API_PORT ?? 5000}`,
          changeOrigin: true,
          ws: false,
        },
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
