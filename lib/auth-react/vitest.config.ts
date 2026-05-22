import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    server: {
      deps: {
        inline: ["react", "react-dom", "@testing-library/react", "@testing-library/user-event"],
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "html"],
    },
  },
});
