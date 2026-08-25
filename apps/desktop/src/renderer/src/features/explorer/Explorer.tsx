import type { FileNode } from "../../../../shared/contracts.js"
import { FileTree } from "./FileTree.js"

export function Explorer({ nodes = [], onOpenFile = () => undefined }: { nodes?: FileNode[]; onOpenFile?: (path: string) => void }) {
  return <nav className="explorer" aria-label="Repository Explorer"><div className="panel-heading">Explorer</div>{nodes.length ? <FileTree nodes={nodes} onOpenFile={onOpenFile} /> : <div className="explorer-empty">Open a repository to explore files.</div>}</nav>
}
