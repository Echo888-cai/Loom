import { describe, expect, it } from "vitest"
import { createDesktopPaths, createMainWindow, createWindowOptions, type WindowAdapter } from "../../src/main/window.js"

describe("createWindowOptions", () => {
  it("keeps privileged Node APIs outside the renderer", () => {
    const options = createWindowOptions("/absolute/preload.js")

    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: "/absolute/preload.js",
    })
  })

  it("keeps Loom inside its supported desktop viewport", () => {
    const options = createWindowOptions("/absolute/preload.js")

    expect(options).toMatchObject({
      width: 1440,
      height: 900,
      minWidth: 760,
      minHeight: 620,
    })
  })
})

describe("createDesktopPaths", () => {
  it("points a sandboxed window at the CommonJS preload bundle", () => {
    expect(createDesktopPaths("/app/out/main")).toEqual({
      preloadPath: "/app/out/preload/index.cjs",
      rendererHtmlPath: "/app/out/renderer/index.html",
    })
  })
})

describe("createMainWindow", () => {
  it("waits for the renderer before showing the window", () => {
    const fake = createFakeWindow()

    createMainWindow({
      createWindow: () => fake.window,
      preloadPath: "/app/preload.js",
      rendererHtmlPath: "/app/renderer/index.html",
      rendererUrl: "http://localhost:5173/",
    })

    expect(fake.shown).toBe(false)
    fake.readyToShow?.()
    expect(fake.shown).toBe(true)
    expect(fake.loadedUrl).toBe("http://localhost:5173/")
    expect(fake.loadedFile).toBeNull()
  })

  it("denies new windows and navigation outside the renderer origin", () => {
    const fake = createFakeWindow()
    createMainWindow({
      createWindow: () => fake.window,
      preloadPath: "/app/preload.js",
      rendererHtmlPath: "/app/renderer/index.html",
      rendererUrl: "http://localhost:5173/",
    })
    const externalNavigation = { prevented: false, preventDefault() { this.prevented = true } }
    const internalNavigation = { prevented: false, preventDefault() { this.prevented = true } }

    fake.navigate?.(externalNavigation, "https://example.com/")
    fake.navigate?.(internalNavigation, "http://localhost:5173/settings")

    expect(fake.openWindow?.()).toEqual({ action: "deny" })
    expect(externalNavigation.prevented).toBe(true)
    expect(internalNavigation.prevented).toBe(false)
  })

  it("loads the bundled renderer when no development URL exists", () => {
    const fake = createFakeWindow()

    createMainWindow({
      createWindow: () => fake.window,
      preloadPath: "/app/preload.js",
      rendererHtmlPath: "/app/renderer/index.html",
    })

    expect(fake.loadedFile).toBe("/app/renderer/index.html")
    expect(fake.loadedUrl).toBeNull()
  })
})

function createFakeWindow() {
  const state: {
    shown: boolean
    loadedUrl: string | null
    loadedFile: string | null
    readyToShow: (() => void) | null
    navigate: ((event: { preventDefault(): void }, url: string) => void) | null
    openWindow: (() => { action: "deny" }) | null
    window: WindowAdapter
  } = {
    shown: false,
    loadedUrl: null,
    loadedFile: null,
    readyToShow: null,
    navigate: null,
    openWindow: null,
    window: undefined as unknown as WindowAdapter,
  }

  state.window = {
    show: () => { state.shown = true },
    once: (_event, listener) => { state.readyToShow = listener },
    loadURL: (url) => { state.loadedUrl = url },
    loadFile: (path) => { state.loadedFile = path },
    webContents: {
      on: (_event, listener) => { state.navigate = listener },
      setWindowOpenHandler: (handler) => { state.openWindow = handler },
    },
  }

  return state
}
