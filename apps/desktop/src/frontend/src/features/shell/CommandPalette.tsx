import { useEffect, useRef, useState } from "react"

export type Command = { id: string; label: string; run: () => void | Promise<void> }

/** 只收纳当前任务相关的少量动作；键盘是主入口，鼠标仍可完整操作。 */
export function CommandPalette({ open, commands, onClose }: { open: boolean; commands: Command[]; onClose: () => void }) {
  const [selected, setSelected] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) { setSelected(0); dialogRef.current?.focus() } }, [open])
  if (!open) return null

  const execute = (command: Command) => { onClose(); void command.run() }
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); onClose() }
    if (event.key === "ArrowDown") { event.preventDefault(); setSelected((index) => Math.min(index + 1, commands.length - 1)) }
    if (event.key === "ArrowUp") { event.preventDefault(); setSelected((index) => Math.max(index - 1, 0)) }
    if (event.key === "Enter" && commands[selected]) { event.preventDefault(); execute(commands[selected]) }
  }
  return <div className="palette-scrim" role="presentation" onMouseDown={onClose}><div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" aria-activedescendant={commands[selected] ? `command-${commands[selected].id}` : undefined} tabIndex={-1} ref={dialogRef} onKeyDown={onKeyDown} onMouseDown={(event) => event.stopPropagation()}><div className="palette-title">Commands</div><div role="listbox">{commands.map((command, index) => <button key={command.id} id={`command-${command.id}`} type="button" role="option" aria-selected={index === selected} data-selected={index === selected || undefined} onMouseEnter={() => setSelected(index)} onClick={() => execute(command)}>{command.label}</button>)}</div></div></div>
}
