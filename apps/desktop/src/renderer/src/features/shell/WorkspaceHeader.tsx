import { Command } from "@phosphor-icons/react"
import { IconButton } from "../../components/IconButton.js"
import { LoomLogo } from "../../components/LoomLogo.js"

export function WorkspaceHeader() {
  return <header className="workspace-header"><div className="brand"><LoomLogo /> <span>Loom</span></div><div className="workspace-title">No repository open</div><IconButton label="Open command palette"><Command size={17} aria-hidden="true" /></IconButton></header>
}
