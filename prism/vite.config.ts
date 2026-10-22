import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Everything outside /prism/ (the API, the 2D pages "/" and "/study/*")
// goes to the existing constellation server.
const upstream = process.env.PRISM_UPSTREAM || "http://127.0.0.1:18765";

export default defineConfig({
  base: "/prism/",
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "^/(?!prism(?:/|$)).*": {
        target: upstream,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
