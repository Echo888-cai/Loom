import { defineConfig } from "electron-vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: "src/backend/index.ts" },
      externalizeDeps: { exclude: ["loom"] },
    },
  },
  preload: {
    build: {
      rollupOptions: { input: "src/bridge/index.ts", output: { format: "cjs" } },
      externalizeDeps: false,
    },
  },
  renderer: {
    root: "src/frontend",
    build: { rollupOptions: { input: resolve(__dirname, "src/frontend/index.html") } },
    plugins: [react()],
  },
})
