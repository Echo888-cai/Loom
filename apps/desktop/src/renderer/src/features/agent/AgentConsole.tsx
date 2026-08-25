import type { EventRecord } from "../../../../shared/contracts.js"
import { projectAgentConsole } from "../../state/event-projection.js"
import { ApprovalSurface } from "./ApprovalSurface.js"

export function AgentConsole({ events, taskId }: { events: EventRecord[]; taskId?: string | undefined }) {
  const view = projectAgentConsole(events)
  return <div className="agent-content" aria-live="polite">
    {view.current?.label === "Thinking" ? <div className="thinking"><span className="thinking-mark" aria-hidden="true" />Thinking</div> : null}
    {view.reasoning.map((item) => <pre className="reasoning" key={item.seq}>{item.content}</pre>)}
    {view.done.length ? <section className="agent-section"><h2>Completed</h2>{view.done.map((item, index) => <div className="agent-row" key={`${item.label}-${index}`}><strong>{item.label}</strong>{item.detail ? <span>{item.detail}</span> : null}</div>)}</section> : null}
    {view.evidence.length ? <section className="agent-section"><h2>Verification</h2>{view.evidence.map((item) => <div className="agent-row" key={item.label}><strong>{item.label}</strong><span>{item.outcome}: {item.content}</span></div>)}</section> : null}
    {view.pendingApproval && taskId ? <ApprovalSurface taskId={taskId} approval={view.pendingApproval} /> : null}
    {view.status === "empty" ? <p className="console-empty">Run a task to see Loom’s process here.</p> : null}
  </div>
}
