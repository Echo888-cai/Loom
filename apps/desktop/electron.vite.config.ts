import { defineConfig } from "electron-vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: ["loom"] },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        output: { format: "cjs" },
      },
    },
  },
  renderer: {
    plugins: [react()],
  },
})
