import type { TaskSummary } from "../../../../shared/contracts.js"

/** 任务列表故意只显示人写的 goal；状态和证据应在右侧按事件细看。 */
export function TaskList({ tasks, activeTaskId, onSelect }: { tasks: TaskSummary[]; activeTaskId: string | null; onSelect: (taskId: string) => void }) {
  if (!tasks.length) return null
  return <section className="task-list" aria-label="Tasks"><h2>Tasks</h2>{tasks.map((task) => <button key={task.taskId} type="button" aria-current={task.taskId === activeTaskId ? "true" : undefined} onClick={() => onSelect(task.taskId)}>{task.goal}</button>)}</section>
}
