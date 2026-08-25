import type { BrowserWindowConstructorOptions } from "electron"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

type NavigationEvent = { preventDefault(): void }

export type WindowAdapter = {
  show(): void
  once(event: "ready-to-show", listener: () => void): void
  loadURL(url: string): void | Promise<void>
  loadFile(path: string): void | Promise<void>
  webContents: {
    on(event: "will-navigate", listener: (event: NavigationEvent, url: string) => void): void
    setWindowOpenHandler(handler: () => { action: "deny" }): void
  }
}

export type CreateMainWindowInput = {
  createWindow(options: BrowserWindowConstructorOptions): WindowAdapter
  preloadPath: string
  rendererHtmlPath: string
  rendererUrl?: string
}

export function createDesktopPaths(mainOutputDirectory: string) {
  return {
    preloadPath: join(mainOutputDirectory, "../preload/index.cjs"),
    rendererHtmlPath: join(mainOutputDirectory, "../renderer/index.html"),
  }
}

export function createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 620,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#F7F7F5",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  }
}

export function createMainWindow(input: CreateMainWindowInput): WindowAdapter {
  const window = input.createWindow(createWindowOptions(input.preloadPath))
  const allowedTarget = input.rendererUrl ?? pathToFileURL(input.rendererHtmlPath).href

  window.once("ready-to-show", () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url, allowedTarget, input.rendererUrl !== undefined)) {
      event.preventDefault()
    }
  })

  if (input.rendererUrl) {
    void window.loadURL(input.rendererUrl)
  } else {
    void window.loadFile(input.rendererHtmlPath)
  }

  return window
}

function isAllowedNavigation(candidate: string, allowedTarget: string, allowSameOrigin: boolean): boolean {
  try {
    if (!allowSameOrigin) return candidate === allowedTarget
    return new URL(candidate).origin === new URL(allowedTarget).origin
  } catch {
    return false
  }
}
