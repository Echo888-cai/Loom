import { SidebarSimple } from "@phosphor-icons/react"
import { useEffect, useState, type CSSProperties } from "react"
import { IconButton } from "../../components/IconButton.js"
import { MinimumWindow } from "../../components/MinimumWindow.js"
import { PanelDivider } from "../../components/PanelDivider.js"
import { Explorer } from "../explorer/Explorer.js"
import { CodeWorkspace } from "../code/CodeWorkspace.js"
import { EditorTabs } from "../code/EditorTabs.js"
import { WorkspaceHeader } from "./WorkspaceHeader.js"
import { useTaskStore } from "../../state/task-store.js"
import { AgentConsole } from "../agent/AgentConsole.js"

const minimumConsoleWidth = 320
const maximumConsoleWidth = 520
const defaultConsoleWidth = 365

export function AppShell() {
  const [windowIsTooNarrow, setWindowIsTooNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 760)
  const [agentWidth, setAgentWidth] = useState(readSavedWidth)
  const [consoleCollapsed, setConsoleCollapsed] = useState(false)
  const workspace = useTaskStore((state) => state.workspace)
  const tree = useTaskStore((state) => state.tree)
  const openTabs = useTaskStore((state) => state.openTabs)
  const activePath = useTaskStore((state) => state.activePath)
  const diffs = useTaskStore((state) => state.diffs)
  const openFile = useTaskStore((state) => state.openFile)
  const closeFile = useTaskStore((state) => state.closeFile)
  const setWorkspace = useTaskStore((state) => state.setWorkspace)
  const activeTaskId = useTaskStore((state) => state.activeTaskId)
  const eventsByTask = useTaskStore((state) => state.eventsByTask)

  useEffect(() => {
    const onResize = () => setWindowIsTooNarrow(window.innerWidth < 760)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  useEffect(() => { localStorage.setItem("loom.agentPanelWidth", String(agentWidth)) }, [agentWidth])

  if (windowIsTooNarrow) return <MinimumWindow />
  const resize = (width: number) => setAgentWidth(clampWidth(width))

  const restoreConsole = () => setConsoleCollapsed(false)
  const openWorkspace = async () => {
    const selected = await window.loom.chooseWorkspace()
    if (!selected) return
    const nextTree = await window.loom.listWorkspace(selected.root)
    setWorkspace(selected, nextTree)
  }
  return <div className="app-shell"><WorkspaceHeader workspaceName={workspace?.name} onOpenWorkspace={() => { void openWorkspace() }} /><div className="workbench" style={{ "--agent-width": `${agentWidth}px` } as CSSProperties}><Explorer nodes={tree} onOpenFile={openFile} /><main className="code-workspace" aria-label="Code workspace"><EditorTabs paths={openTabs} activePath={activePath} onSelect={openFile} onClose={closeFile} /><CodeWorkspace workspaceRoot={workspace?.root ?? null} activePath={activePath} diff={activePath ? diffs[activePath] : undefined} /></main>{consoleCollapsed ? <div className="restore-console"><IconButton label="Restore Agent Console" onClick={restoreConsole} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") restoreConsole() }}><SidebarSimple size={17} aria-hidden="true" /></IconButton></div> : <><PanelDivider value={agentWidth} onChange={resize} /><aside className="agent-console" aria-label="Agent Console" style={{ width: `${agentWidth}px` }}><div className="console-toolbar"><span className="console-title">Agent Console</span><IconButton label="Collapse Agent Console" onClick={() => setConsoleCollapsed(true)}><SidebarSimple size={17} aria-hidden="true" /></IconButton></div><AgentConsole taskId={activeTaskId ?? undefined} events={activeTaskId ? eventsByTask[activeTaskId] ?? [] : []} /></aside></>}</div></div>
}

function readSavedWidth(): number {
  if (typeof localStorage === "undefined") return defaultConsoleWidth
  const stored = localStorage.getItem("loom.agentPanelWidth")
  if (stored === null) return defaultConsoleWidth
  const saved = Number(stored)
  return Number.isFinite(saved) ? clampWidth(saved) : defaultConsoleWidth
}

function clampWidth(width: number): number { return Math.min(maximumConsoleWidth, Math.max(minimumConsoleWidth, width)) }
