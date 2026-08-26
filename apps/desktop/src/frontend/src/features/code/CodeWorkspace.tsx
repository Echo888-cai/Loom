import Editor from "@monaco-editor/react"
import { useEffect, useState } from "react"

type CodeWorkspaceProps = { workspaceRoot: string | null; activePath: string | null; diff?: string | undefined }

/** 代码永远通过主进程的受限 readFile IPC 读取；编辑器在 v0.1 一律只读。 */
export function CodeWorkspace({ workspaceRoot, activePath, diff }: CodeWorkspaceProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceRoot || !activePath || diff !== undefined) { setContent(null); setError(null); return }
    let current = true
    setContent(null)
    setError(null)
    void window.loom.readFile({ workspaceRoot, relativePath: activePath })
      .then((result) => { if (current) setContent(result.content) })
      .catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : "Unable to read this file") })
    return () => { current = false }
  }, [workspaceRoot, activePath, diff])

  if (!activePath) return <section className="code-empty"><h1>Your code stays at the center.</h1><p>Open a repository, then select a file.</p></section>
  if (error) return <section className="code-error" role="alert">{error}</section>
  if (diff !== undefined) return <Editor height="100%" value={diff} language="diff" options={editorOptions} />
  if (content === null) return <section className="code-loading">Opening {activePath}…</section>
  return <Editor height="100%" value={content} language={languageForPath(activePath)} options={editorOptions} />
}

const editorOptions = { readOnly: true, minimap: { enabled: false }, scrollBeyondLastLine: false, renderLineHighlight: "none" } as const

function languageForPath(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase()
  return extension === "ts" || extension === "tsx" ? "typescript" : extension === "js" || extension === "jsx" ? "javascript" : extension === "json" ? "json" : extension === "md" ? "markdown" : "plaintext"
}
