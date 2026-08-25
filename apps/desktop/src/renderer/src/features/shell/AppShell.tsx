import { SidebarSimple } from "@phosphor-icons/react"
import { useEffect, useState, type CSSProperties } from "react"
import { IconButton } from "../../components/IconButton.js"
import { MinimumWindow } from "../../components/MinimumWindow.js"
import { PanelDivider } from "../../components/PanelDivider.js"
import { Explorer } from "../explorer/Explorer.js"
import { WorkspaceHeader } from "./WorkspaceHeader.js"

const minimumConsoleWidth = 320
const maximumConsoleWidth = 520
const defaultConsoleWidth = 365

export function AppShell() {
  const [windowIsTooNarrow, setWindowIsTooNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 760)
  const [agentWidth, setAgentWidth] = useState(readSavedWidth)
  const [consoleCollapsed, setConsoleCollapsed] = useState(false)

  useEffect(() => {
    const onResize = () => setWindowIsTooNarrow(window.innerWidth < 760)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  useEffect(() => { localStorage.setItem("loom.agentPanelWidth", String(agentWidth)) }, [agentWidth])

  if (windowIsTooNarrow) return <MinimumWindow />
  const resize = (width: number) => setAgentWidth(clampWidth(width))

  const restoreConsole = () => setConsoleCollapsed(false)
  return <div className="app-shell"><WorkspaceHeader /><div className="workbench" style={{ "--agent-width": `${agentWidth}px` } as CSSProperties}><Explorer /><main className="code-workspace" aria-label="Code workspace"><section className="code-empty"><h1>Your code stays at the center.</h1><p>Open a repository, then give Loom a task when you are ready.</p></section></main>{consoleCollapsed ? <div className="restore-console"><IconButton label="Restore Agent Console" onClick={restoreConsole} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") restoreConsole() }}><SidebarSimple size={17} aria-hidden="true" /></IconButton></div> : <><PanelDivider value={agentWidth} onChange={resize} /><aside className="agent-console" aria-label="Agent Console" style={{ width: `${agentWidth}px` }}><div className="console-toolbar"><span className="console-title">Agent Console</span><IconButton label="Collapse Agent Console" onClick={() => setConsoleCollapsed(true)}><SidebarSimple size={17} aria-hidden="true" /></IconButton></div><div className="console-empty"><p>Run a task to see Loom’s process here.</p></div></aside></>}</div></div>
}

function readSavedWidth(): number {
  if (typeof localStorage === "undefined") return defaultConsoleWidth
  const stored = localStorage.getItem("loom.agentPanelWidth")
  if (stored === null) return defaultConsoleWidth
  const saved = Number(stored)
  return Number.isFinite(saved) ? clampWidth(saved) : defaultConsoleWidth
}

function clampWidth(width: number): number { return Math.min(maximumConsoleWidth, Math.max(minimumConsoleWidth, width)) }
