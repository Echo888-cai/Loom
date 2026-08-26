import { contextBridge, ipcRenderer } from "electron"
import { createDesktopApi, type IpcClient } from "./bridge.js"

const ipcClient: IpcClient = {
  invoke: (channel, input) => ipcRenderer.invoke(channel, input),
  subscribe: (channel, listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on(channel, wrappedListener)
    return () => ipcRenderer.removeListener(channel, wrappedListener)
  },
}

contextBridge.exposeInMainWorld("loom", createDesktopApi(ipcClient))
