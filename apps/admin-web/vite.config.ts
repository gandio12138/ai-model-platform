import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_API_BASE || process.env.API_PROXY_TARGET || "http://127.0.0.1:4000";

function manualChunks(id: string) {
  const normalized = id.replace(/\\/g, "/");
  if (!normalized.includes("/node_modules/")) return undefined;
  const packageName = nodeModulePackageName(normalized);
  if (!packageName) return "vendor";
  if (["react", "react-dom", "scheduler", "use-sync-external-store"].includes(packageName)) {
    return "vendor-react";
  }
  if (packageName.startsWith("react-router") || packageName.startsWith("@remix-run/")) {
    return "vendor-router";
  }
  if (packageName === "@ant-design/icons" || packageName === "@ant-design/icons-svg" || packageName === "lucide-react") {
    return "vendor-icons";
  }
  if (packageName === "antd") {
    return "vendor-antd";
  }
  if (packageName.startsWith("rc-") || packageName.startsWith("@rc-component/") || packageName.startsWith("@ant-design/")) {
    return "vendor-rc";
  }
  if (["dayjs", "classnames", "copy-to-clipboard", "throttle-debounce", "async-validator"].includes(packageName)) {
    return "vendor-ui-utils";
  }
  return "vendor";
}

function nodeModulePackageName(id: string) {
  const parts = id.split("/node_modules/");
  const packagePath = parts.at(-1);
  if (!packagePath) return "";
  const segments = packagePath.split("/");
  if (segments[0]?.startsWith("@")) return `${segments[0]}/${segments[1] ?? ""}`;
  return segments[0] ?? "";
}

export default defineConfig({
  base: process.env.VITE_ADMIN_BASE || "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks
      }
    }
  },
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
