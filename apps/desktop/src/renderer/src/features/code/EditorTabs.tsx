type EditorTabsProps = { paths: string[]; activePath: string | null; onSelect: (path: string) => void; onClose: (path: string) => void }

export function EditorTabs({ paths, activePath, onSelect, onClose }: EditorTabsProps) {
  return <div className="editor-tabs" role="tablist" aria-label="Open files">{paths.map((path) => <div key={path} className="editor-tab"><button type="button" role="tab" aria-selected={path === activePath} onClick={() => onSelect(path)}>{path.split("/").at(-1)}</button><button type="button" aria-label={`Close ${path}`} onClick={() => onClose(path)}>×</button></div>)}</div>
}
