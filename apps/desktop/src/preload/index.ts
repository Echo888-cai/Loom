import { contextBridge } from "electron"

contextBridge.exposeInMainWorld("loom", Object.freeze({}))
