import Editor from "@monaco-editor/react"

export function DiffView({ patch }: { patch: string }) {
  return <Editor height="100%" value={patch} language="diff" options={{ readOnly: true, minimap: { enabled: false }, scrollBeyondLastLine: false }} />
}
