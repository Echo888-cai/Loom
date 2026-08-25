export {}

declare global {
  interface Window {
    loom: Record<string, never>
  }
}
