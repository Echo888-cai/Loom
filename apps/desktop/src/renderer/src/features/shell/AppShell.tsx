import { SidebarSimple } from "@phosphor-icons/react"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { IconButton } from "../../components/IconButton.js"
import { MinimumWindow } from "../../components/MinimumWindow.js"
import { PanelDivider } from "../../components/PanelDivider.js"
import { Explorer } from "../explorer/Explorer.js"
import { CodeWorkspace } from "../code/CodeWorkspace.js"
import { EditorTabs } from "../code/EditorTabs.js"
import { WorkspaceHeader } from "./WorkspaceHeader.js"
import { useTaskStore } from "../../state/task-store.js"
import { AgentConsole } from "../agent/AgentConsole.js"
import { NewTaskComposer } from "../task/NewTaskComposer.js"
import { TaskControls } from "../task/TaskControls.js"
import { projectAgentConsole } from "../../state/event-projection.js"
import { CommandPalette, type Command } from "./CommandPalette.js"

const minimumConsoleWidth = 320
const maximumConsoleWidth = 520
const defaultConsoleWidth = 365

export function AppShell() {
  const [windowIsTooNarrow, setWindowIsTooNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 760)
  const [agentWidth, setAgentWidth] = useState(readSavedWidth)
  const [consoleCollapsed, setConsoleCollapsed] = useState(false)
  const [explorerCollapsed, setExplorerCollapsed] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteInvoker = useRef<HTMLElement | null>(null)
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
  const beginTask = useTaskStore((state) => state.beginTask)
  const appendEvent = useTaskStore((state) => state.appendEvent)

  useEffect(() => {
    const onResize = () => setWindowIsTooNarrow(window.innerWidth < 760)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  useEffect(() => { localStorage.setItem("loom.agentPanelWidth", String(agentWidth)) }, [agentWidth])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        paletteInvoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setPaletteOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  if (windowIsTooNarrow) return <MinimumWindow />
  const resize = (width: number) => setAgentWidth(clampWidth(width))

  const restoreConsole = () => setConsoleCollapsed(false)
  const closePalette = () => {
    setPaletteOpen(false)
    queueMicrotask(() => paletteInvoker.current?.focus())
  }
  const openWorkspace = async () => {
    const selected = await window.loom.chooseWorkspace()
    if (!selected) return
    const nextTree = await window.loom.listWorkspace(selected.root)
    setWorkspace(selected, nextTree)
  }
  const activeEvents = activeTaskId ? eventsByTask[activeTaskId] ?? [] : []
  const activeTaskView = projectAgentConsole(activeEvents)
  const commands: Command[] = [
    { id: "open-repository", label: "Open Repository", run: openWorkspace },
    ...(workspace ? [{ id: "new-task", label: "New Task", run: () => document.getElementById("loom-new-task")?.focus() }] : []),
    { id: "toggle-explorer", label: explorerCollapsed ? "Show Explorer" : "Hide Explorer", run: () => setExplorerCollapsed((value) => !value) },
    { id: "toggle-console", label: consoleCollapsed ? "Show Agent Console" : "Hide Agent Console", run: () => setConsoleCollapsed((value) => !value) },
    ...(activeTaskId && (activeTaskView.status === "running" || activeTaskView.status === "approval_required" || activeTaskView.status === "verifying") ? [{ id: "cancel-task", label: "Cancel Current Task", run: () => window.loom.cancelTask(activeTaskId) }] : []),
    ...(activeTaskId && workspace ? [{ id: "replay-task", label: "Replay Current Task", run: async () => { for (const event of await window.loom.replayTask({ workspaceRoot: workspace.root, taskId: activeTaskId })) appendEvent(event) } }] : []),
    ...(activeTaskId && workspace && (activeTaskView.status === "blocked" || activeTaskView.status === "failed" || activeTaskView.status === "cancelled") ? [{ id: "resume-task", label: "Resume Current Task", run: async () => beginTask((await window.loom.resumeTask({ workspaceRoot: workspace.root, taskId: activeTaskId })).taskId) }] : []),
  ]
  return <div className="app-shell"><WorkspaceHeader workspaceName={workspace?.name} onOpenWorkspace={() => { void openWorkspace() }} /><div className={`workbench${explorerCollapsed ? " explorer-collapsed" : ""}`} style={{ "--agent-width": `${agentWidth}px` } as CSSProperties}>{explorerCollapsed ? null : <Explorer nodes={tree} onOpenFile={openFile} />}<main className="code-workspace" aria-label="Code workspace"><EditorTabs paths={openTabs} activePath={activePath} onSelect={openFile} onClose={closeFile} /><CodeWorkspace workspaceRoot={workspace?.root ?? null} activePath={activePath} diff={activePath ? diffs[activePath] : undefined} /></main>{consoleCollapsed ? <div className="restore-console"><IconButton label="Restore Agent Console" onClick={restoreConsole} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") restoreConsole() }}><SidebarSimple size={17} aria-hidden="true" /></IconButton></div> : <><PanelDivider value={agentWidth} onChange={resize} /><aside className="agent-console" aria-label="Agent Console" style={{ width: `${agentWidth}px` }}><div className="console-toolbar"><span className="console-title">Agent Console</span><IconButton label="Collapse Agent Console" onClick={() => setConsoleCollapsed(true)}><SidebarSimple size={17} aria-hidden="true" /></IconButton></div><AgentConsole taskId={activeTaskId ?? undefined} events={activeEvents} /><TaskControls taskId={activeTaskId} status={activeTaskView.status} />{workspace ? <NewTaskComposer workspaceRoot={workspace.root} onStarted={beginTask} /> : null}</aside></>}</div><CommandPalette open={paletteOpen} onClose={closePalette} commands={commands} /></div>
}

function readSavedWidth(): number {
  if (typeof localStorage === "undefined") return defaultConsoleWidth
  const stored = localStorage.getItem("loom.agentPanelWidth")
  if (stored === null) return defaultConsoleWidth
  const saved = Number(stored)
  return Number.isFinite(saved) ? clampWidth(saved) : defaultConsoleWidth
}

function clampWidth(width: number): number { return Math.min(maximumConsoleWidth, Math.max(minimumConsoleWidth, width)) }
