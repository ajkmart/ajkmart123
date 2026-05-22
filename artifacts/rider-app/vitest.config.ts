import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
  },
  test: {
    globals: true,
    environment: "jsdom",
    testTimeout: 10000,
    include: ["src/tests/**/*.test.{ts,tsx}"],
    reporters: ["verbose"],
    server: {
      deps: {
        inline: ["react", "react-dom", "@testing-library/react", "@testing-library/user-event"],
      },
    },
  },
});
