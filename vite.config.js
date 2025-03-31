import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "url";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [vue()],
  server:
    command === "serve"
      ? {
          proxy: {
            "/api": "http://localhost:3000",
            "/socket.io": {
              target: "http://localhost:3000",
              ws: true,
            },
          },
        }
      : {},
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
}));
