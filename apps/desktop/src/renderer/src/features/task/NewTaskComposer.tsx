import { useState } from "react"

export function NewTaskComposer({ workspaceRoot, onStarted }: { workspaceRoot: string; onStarted: (taskId: string) => void }) {
  const [goal, setGoal] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    const trimmedGoal = goal.trim()
    if (!trimmedGoal || submitting) return
    setSubmitting(true)
    setError(null)
    try { const result = await window.loom.startTask({ workspaceRoot, goal: trimmedGoal }); onStarted(result.taskId); setGoal("") } catch { setError("Unable to start task.") } finally { setSubmitting(false) }
  }
  return <form className="task-composer" onSubmit={(event) => { event.preventDefault(); void submit() }}><label className="sr-only" htmlFor="loom-new-task">New task</label><textarea id="loom-new-task" aria-label="New task" value={goal} onChange={(event) => { setGoal(event.target.value); setError(null) }} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit() } }} placeholder="Describe what you want Loom to do" /><button type="submit" disabled={!goal.trim() || submitting}>Run</button>{error ? <p className="task-error" role="alert">{error}</p> : null}</form>
}
