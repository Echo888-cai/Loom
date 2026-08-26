import { useState } from "react"
import type { AgentConsoleView } from "../../state/event-projection.js"

type CancellableStatus = Extract<AgentConsoleView["status"], "running" | "approval_required" | "verifying">

/**
 * 取消不改变任务真相：它只请求 main process 中的 AbortController 停止执行，
 * 最终的 task.cancelled 仍然必须由 Runtime 写入事件流，再投影回界面。
 */
export function TaskControls({ taskId, status }: { taskId: string | null; status: AgentConsoleView["status"] }) {
  const [cancelling, setCancelling] = useState(false)
  if (!taskId || !isCancellable(status)) return null

  const cancel = async () => {
    if (cancelling) return
    setCancelling(true)
    try { await window.loom.cancelTask(taskId) } finally { setCancelling(false) }
  }

  return <div className="task-controls"><button type="button" aria-label="Cancel current task" disabled={cancelling} onClick={() => { void cancel() }}>{cancelling ? "Cancelling" : "Cancel"}</button></div>
}

function isCancellable(status: AgentConsoleView["status"]): status is CancellableStatus {
  return status === "running" || status === "approval_required" || status === "verifying"
}
