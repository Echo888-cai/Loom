import type { EventRecord } from "../../../shared/contracts.js"

export type FrontierItem = { label: string; summary?: string; detail?: string }
export type EvidenceItem = { label: string; outcome: "passed" | "failed" | "blocked"; content: string }
export type ApprovalView = { command: string; cwd: string; timeoutMs: number; reason: string }
export type AgentConsoleView = {
  status: "empty" | "running" | "approval_required" | "verifying" | "candidate_done" | "verified" | "blocked" | "failed" | "cancelled"
  reasoning: Array<{ seq: number; content: string }>
  done: FrontierItem[]
  current: FrontierItem | null
  next: FrontierItem[]
  evidence: EvidenceItem[]
  pendingApproval: ApprovalView | null
  statusMessage: string | null
}

/** 将 append-only Runtime 事件投影为 UI；未知事件故意跳过，而不是破坏历史回放。 */
export function projectAgentConsole(events: EventRecord[]): AgentConsoleView {
  const ordered = [...events].sort((left, right) => left.seq - right.seq)
  const reasoning: AgentConsoleView["reasoning"] = []
  const done: FrontierItem[] = []
  const evidence: EvidenceItem[] = []
  let pendingApproval: ApprovalView | null = null
  let status: AgentConsoleView["status"] = ordered.length ? "running" : "empty"
  let current: FrontierItem | null = null
  let statusMessage: string | null = null

  for (const event of ordered) {
    const data = record(event.data)
    if (event.type === "model.requested") {
      current = { label: "Thinking" }
      if (status === "verifying") status = "running"
    }
    if (event.type === "model.responded") {
      if (typeof data.reasoningContent === "string" && data.reasoningContent) reasoning.push({ seq: event.seq, content: data.reasoningContent })
      current = null
    }
    if (event.type === "tool.requested" && typeof data.name === "string") current = { label: data.name }
    if ((event.type === "tool.completed" || event.type === "tool.started") && typeof data.name === "string") {
      const detail = text(data.content)
      done.push({ label: data.name, ...(detail ? { summary: detail.split("\n")[0], detail } : {}) })
      if (current?.label === data.name) current = null
    }
    const approval = approvalFrom(data)
    if (event.type === "approval.requested" && approval) {
      pendingApproval = approval
      status = "approval_required"
    }
    if (event.type === "approval.resolved") pendingApproval = null
    if (event.type === "verification.completed") {
      const label = typeof data.command === "string" ? data.command : typeof data.name === "string" ? data.name : "Verification"
      const ok = data.ok === true || data.passed === true
      evidence.push({ label, outcome: ok ? "passed" : data.blocked === true ? "blocked" : "failed", content: text(data.content) ?? text(data.output) ?? "" })
      status = "verifying"
    }
    if (event.type === "task.candidate_done") { status = "candidate_done"; statusMessage = text(data.content) }
    if (event.type === "task.verification_continue") { status = "running"; statusMessage = null }
    if (event.type === "task.verified") { status = "verified"; statusMessage = text(data.summary) ?? text(data.content) }
    if (event.type === "task.blocked") { status = "blocked"; statusMessage = text(data.reason) ?? text(data.summary) }
    if (event.type === "task.failed") { status = "failed"; statusMessage = text(data.error) ?? text(data.reason) }
    if (event.type === "task.cancelled") { status = "cancelled"; statusMessage = text(data.reason) }
  }
  if (pendingApproval) status = "approval_required"
  return { status, reasoning, done, current, next: [], evidence, pendingApproval, statusMessage }
}

function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function approvalFrom(value: Record<string, unknown>): ApprovalView | null {
  return typeof value.command === "string" && typeof value.cwd === "string" && typeof value.timeoutMs === "number" && typeof value.reason === "string"
    ? { command: value.command, cwd: value.cwd, timeoutMs: value.timeoutMs, reason: value.reason }
    : null
}
function text(value: unknown): string | null { return typeof value === "string" && value ? value : null }
