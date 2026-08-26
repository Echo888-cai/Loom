import { Command } from "@phosphor-icons/react"
import { IconButton } from "../../components/IconButton.js"
import { LoomLogo } from "../../components/LoomLogo.js"

export function WorkspaceHeader({ workspaceName, onOpenWorkspace }: { workspaceName?: string | undefined; onOpenWorkspace: () => void }) {
  return <header className="workspace-header"><div className="brand"><LoomLogo /> <span>Loom</span></div><div className="workspace-title">{workspaceName ?? "No repository open"}</div><IconButton label="Open repository" onClick={onOpenWorkspace}><Command size={17} aria-hidden="true" /></IconButton></header>
}
