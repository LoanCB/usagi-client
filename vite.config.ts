/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: {
    globals: true,
    // happy-dom: jsdom@29 has ESM compat issue with @exodus/bytes via html-encoding-sniffer
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    passWithNoTests: true,
  },
});
