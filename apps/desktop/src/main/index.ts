import { app, BrowserWindow, dialog, ipcMain } from "electron"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { registerWorkspaceIpcHandlers } from "./ipc.js"
import { WorkspaceService } from "./workspace-service.js"
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
  const workspaceService = new WorkspaceService({
    chooseDirectory: async () => {
      const selection = await dialog.showOpenDialog({
        title: "Open Repository",
        properties: ["openDirectory"],
      })
      return selection.canceled ? null : selection.filePaths[0] ?? null
    },
  })
  const disposeIpc = registerWorkspaceIpcHandlers({
    handle: (channel, listener) => ipcMain.handle(channel, (event, input) => listener(event, input)),
    removeHandler: (channel) => ipcMain.removeHandler(channel),
  }, workspaceService)
  app.once("before-quit", disposeIpc)

  openMainWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
