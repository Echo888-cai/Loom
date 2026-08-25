import { CaretRight, File, Folder } from "@phosphor-icons/react"
import { useState, type Dispatch, type SetStateAction } from "react"
import type { FileNode } from "../../../../shared/contracts.js"

type FileTreeProps = { nodes: FileNode[]; onOpenFile: (relativePath: string) => void }

/** 可键盘访问的原生 tree；选择文件的实际读取仍由上层 CodeWorkspace 通过安全 IPC 完成。 */
export function FileTree({ nodes, onOpenFile }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  return <div role="tree" aria-label="Files" className="file-tree">{nodes.map((node) => <TreeNode key={node.relativePath} node={node} expanded={expanded} setExpanded={setExpanded} onOpenFile={onOpenFile} />)}</div>
}

function TreeNode({ node, expanded, setExpanded, onOpenFile }: { node: FileNode; expanded: Set<string>; setExpanded: Dispatch<SetStateAction<Set<string>>>; onOpenFile: (relativePath: string) => void }) {
  const isDirectory = node.kind === "directory"
  const isExpanded = isDirectory && expanded.has(node.relativePath)
  const toggle = () => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(node.relativePath)) next.delete(node.relativePath)
    else next.add(node.relativePath)
    return next
  })
  return <div className="tree-node"><button type="button" role="treeitem" className="tree-row" aria-expanded={isDirectory ? isExpanded : undefined} onClick={() => isDirectory ? toggle() : onOpenFile(node.relativePath)} onKeyDown={(event) => {
    if (event.key === "Enter") { event.preventDefault(); isDirectory ? toggle() : onOpenFile(node.relativePath) }
    if (isDirectory && event.key === "ArrowRight" && !isExpanded) { event.preventDefault(); toggle() }
    if (isDirectory && event.key === "ArrowLeft" && isExpanded) { event.preventDefault(); toggle() }
  }}>{isDirectory ? <CaretRight className={isExpanded ? "tree-caret tree-caret-open" : "tree-caret"} size={13} aria-hidden="true" /> : <span className="tree-caret-spacer" />}{isDirectory ? <Folder size={15} aria-hidden="true" /> : <File size={15} aria-hidden="true" />}<span>{node.name}</span></button>{isDirectory && isExpanded ? <div role="group">{node.children.map((child) => <TreeNode key={child.relativePath} node={child} expanded={expanded} setExpanded={setExpanded} onOpenFile={onOpenFile} />)}</div> : null}</div>
}
