import type { AgentConsoleView } from "../../state/event-projection.js"

const labels: Partial<Record<AgentConsoleView["status"], string>> = {
  approval_required: "Approval required",
  verifying: "Verifying",
  candidate_done: "Awaiting verification",
  verified: "Verified",
  blocked: "Blocked",
  failed: "Failed",
  cancelled: "Cancelled",
}

/** 只显示会影响下一步判断的任务状态；running 由当前 Thinking / Tool 直接表达。 */
export function TaskStateView({ status, message }: { status: AgentConsoleView["status"]; message: string | null }) {
  const label = labels[status]
  if (!label) return null
  return <section className={`task-state task-state-${status}`} aria-live="polite"><strong>{label}</strong>{status === "candidate_done" ? <span>Completion has not been verified yet.</span> : null}{message ? <p>{message}</p> : null}</section>
}
