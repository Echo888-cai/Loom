export {}

import type { LoomDesktopApi } from "../shared/contracts.js"

declare global {
  interface Window {
    loom: LoomDesktopApi
  }
}
