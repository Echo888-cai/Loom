import "./styles/global.css"
import "./styles/motion.css"
import { AppShell } from "./features/shell/AppShell.js"
import { useEffect } from "react"
import { useTaskStore } from "./state/task-store.js"
import type { EventRecord } from "../../shared/contracts.js"

export function App() {
  const appendEvent = useTaskStore((state) => state.appendEvent)
  useEffect(() => subscribeToTaskEvents(appendEvent), [appendEvent])
  return <AppShell />
}

/** Renderer 在整个窗口生命周期只订阅一次；EventStore 的顺序与去重由 task-store 保留。 */
export function subscribeToTaskEvents(appendEvent: (event: EventRecord) => void): (() => void) | undefined {
  return window.loom ? window.loom.onTaskEvent((envelope) => appendEvent(envelope.event)) : undefined
}
