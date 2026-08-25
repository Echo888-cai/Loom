import { create } from "zustand"
import type { EventRecord, FileNode, WorkspaceInfo } from "../../../shared/contracts.js"

type RendererState = {
  workspace: WorkspaceInfo | null
  tree: FileNode[]
  eventsByTask: Record<string, EventRecord[]>
  activeTaskId: string | null
  openTabs: string[]
  activePath: string | null
  fileCache: Record<string, string>
  diffs: Record<string, string>
  setWorkspace: (workspace: WorkspaceInfo | null, tree?: FileNode[]) => void
  openFile: (path: string) => void
  closeFile: (path: string) => void
  cacheFile: (path: string, content: string) => void
  beginTask: (taskId: string) => void
  appendEvent: (event: EventRecord) => void
}

/** Renderer 只保存可重建的 UI 选择与缓存；任务是否完成始终由持久化事件推导。 */
export const useTaskStore = create<RendererState>((set) => ({
  workspace: null,
  tree: [],
  eventsByTask: {},
  activeTaskId: null,
  openTabs: [],
  activePath: null,
  fileCache: {},
  diffs: {},
  setWorkspace: (workspace, tree = []) => set({ workspace, tree, openTabs: [], activePath: null, fileCache: {}, diffs: {} }),
  openFile: (path) => set((state) => ({ openTabs: state.openTabs.includes(path) ? state.openTabs : [...state.openTabs, path], activePath: path })),
  closeFile: (path) => set((state) => {
    const index = state.openTabs.indexOf(path)
    const openTabs = state.openTabs.filter((tab) => tab !== path)
    const activePath = state.activePath !== path ? state.activePath : (openTabs[index] ?? openTabs[index - 1] ?? null)
    return { openTabs, activePath }
  }),
  cacheFile: (path, content) => set((state) => ({ fileCache: { ...state.fileCache, [path]: content } })),
  beginTask: (taskId) => set({ activeTaskId: taskId }),
  appendEvent: (event) => set((state) => {
    const history = state.eventsByTask[event.taskId] ?? []
    if (history.some((item) => item.seq === event.seq)) return state
    const eventsByTask = { ...state.eventsByTask, [event.taskId]: [...history, event].sort((left, right) => left.seq - right.seq) }
    const data = typeof event.data === "object" && event.data !== null && !Array.isArray(event.data) ? event.data as Record<string, unknown> : {}
    if (event.type === "file.changed" && typeof data.relativePath === "string" && typeof data.diff === "string") {
      const path = data.relativePath
      return { eventsByTask, activeTaskId: event.taskId, openTabs: state.openTabs.includes(path) ? state.openTabs : [...state.openTabs, path], activePath: path, diffs: { ...state.diffs, [path]: data.diff } }
    }
    return { eventsByTask, activeTaskId: event.taskId }
  }),
}))
