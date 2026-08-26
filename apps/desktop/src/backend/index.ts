import { app, BrowserWindow, dialog, ipcMain } from "electron"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { registerTaskIpcHandlers, registerWorkspaceIpcHandlers } from "./ipc.js"
import { TaskService } from "./task-service.js"
import { WorkspaceService } from "./workspace-service.js"
import { createDesktopPaths, createMainWindow } from "./window.js"

const currentDirectory = dirname(fileURLToPath(import.meta.url))
let taskService: TaskService | undefined

function openMainWindow(): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const paths = createDesktopPaths(currentDirectory)

  const window = createMainWindow({
    createWindow: (options) => new BrowserWindow(options),
    ...paths,
    ...(rendererUrl ? { rendererUrl } : {}),
  })
  const service = new TaskService(window as BrowserWindow)
  taskService = service
  ;(window as BrowserWindow).once("closed", () => {
    service.disposeWindow()
    if (taskService === service) taskService = undefined
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
  const disposeTaskIpc = registerTaskIpcHandlers({
    handle: (channel, listener) => ipcMain.handle(channel, (event, input) => listener(event, input)),
    removeHandler: (channel) => ipcMain.removeHandler(channel),
  }, {
    start: (input) => requireTaskService().start(input),
    resume: (input) => requireTaskService().resume(input),
    replay: (input) => requireTaskService().replay(input),
    cancel: (taskId) => requireTaskService().cancel(taskId),
    resolveApproval: (input) => requireTaskService().resolveApproval(input.taskId, input.decision),
  }, { ...(process.env.DEEPSEEK_API_KEY ? { deepSeekApiKey: process.env.DEEPSEEK_API_KEY } : {}) })
  app.once("before-quit", () => {
    taskService?.disposeWindow()
    disposeTaskIpc()
    disposeIpc()
  })

  openMainWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

function requireTaskService(): TaskService {
  if (!taskService) throw new Error("No Loom window is available to run a task")
  return taskService
}
