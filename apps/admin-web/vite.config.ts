import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_API_BASE || process.env.API_PROXY_TARGET || "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.ADMIN_WEB_PORT ?? 5173),
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true
      },
      "/v1": {
        target: apiTarget,
        changeOrigin: true
      }
    }
  }
});
