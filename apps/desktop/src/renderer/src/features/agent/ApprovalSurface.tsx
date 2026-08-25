import { useState } from "react"
import type { ApprovalView } from "../../state/event-projection.js"

export function ApprovalSurface({ taskId, approval }: { taskId: string; approval: ApprovalView }) {
  const [expanded, setExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const decide = async (decision: "allow" | "deny") => {
    if (submitting) return
    setSubmitting(true)
    try { await window.loom.resolveApproval({ taskId, decision }) } finally { setSubmitting(false) }
  }
  return <section className="approval-surface" role="region" aria-label="Command approval" tabIndex={0} onKeyDown={(event) => {
    if (event.key === "Enter") { event.preventDefault(); void decide("allow") }
    if (event.key === "Escape") { event.preventDefault(); void decide("deny") }
  }}><strong>{approval.command}</strong><span>{approval.reason}</span>{expanded ? <small>{approval.cwd} · {approval.timeoutMs / 1000}s</small> : null}<div><button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Hide details" : "Inspect"}</button>{expanded ? <button type="button" disabled={submitting} onClick={() => { void decide("deny") }}>Deny</button> : null}<button type="button" disabled={submitting} onClick={() => { void decide("allow") }}>Allow once</button></div></section>
}
