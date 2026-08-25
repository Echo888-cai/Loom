import type { FileNode, TaskSummary } from "../../../../shared/contracts.js"
import { FileTree } from "./FileTree.js"
import { TaskList } from "./TaskList.js"

export function Explorer({ nodes = [], tasks = [], activeTaskId = null, onOpenFile = () => undefined, onSelectTask = () => undefined }: { nodes?: FileNode[]; tasks?: TaskSummary[]; activeTaskId?: string | null; onOpenFile?: (path: string) => void; onSelectTask?: (taskId: string) => void }) {
  return <nav className="explorer" aria-label="Repository Explorer"><div className="panel-heading">Explorer</div><TaskList tasks={tasks} activeTaskId={activeTaskId} onSelect={onSelectTask} />{nodes.length ? <FileTree nodes={nodes} onOpenFile={onOpenFile} /> : <div className="explorer-empty">Open a repository to explore files.</div>}</nav>
}
