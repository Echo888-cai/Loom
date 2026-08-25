import { app, BrowserWindow } from "electron"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createDesktopPaths, createMainWindow } from "./window.js"

const currentDirectory = dirname(fileURLToPath(import.meta.url))

function openMainWindow(): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const paths = createDesktopPaths(currentDirectory)

  createMainWindow({
    createWindow: (options) => new BrowserWindow(options),
    ...paths,
    ...(rendererUrl ? { rendererUrl } : {}),
  })
}

void app.whenReady().then(() => {
  openMainWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
