import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path"
import { EventRecordSchema, type FileNode, type ReadFileInput, type ReadFileResult, type TaskSummary, type WorkspaceInfo } from "../shared/contracts.js"

const maximumTextFileBytes = 2 * 1024 * 1024
const ignoredDirectoryNames = new Set([".git", "node_modules", "dist"])

export type WorkspaceServiceErrorCode =
  | "PATH_OUTSIDE_WORKSPACE"
  | "BINARY_FILE"
  | "FILE_TOO_LARGE"
  | "NOT_A_FILE"
  | "TREE_LIMIT_EXCEEDED"
  | "PICKER_UNAVAILABLE"

export type DirectoryPicker = {
  chooseDirectory(): Promise<string | null>
}

export type WorkspaceServiceOptions = {
  maxTreeNodes?: number
}

export class WorkspaceServiceError extends Error {
  constructor(
    public readonly code: WorkspaceServiceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "WorkspaceServiceError"
  }
}

export class WorkspaceService {
  constructor(
    private readonly picker?: DirectoryPicker,
    private readonly options: WorkspaceServiceOptions = {},
  ) {}

  async chooseWorkspace(): Promise<WorkspaceInfo | null> {
    if (!this.picker) {
      throw new WorkspaceServiceError("PICKER_UNAVAILABLE", "Native directory picker is unavailable")
    }
    const selectedPath = await this.picker.chooseDirectory()
    if (!selectedPath) return null
    const root = await realpath(selectedPath)
    return { root, name: basename(root) }
  }

  async listTree(workspaceRoot: string): Promise<FileNode[]> {
    const workspaceRealPath = await realpath(workspaceRoot)
    const maxTreeNodes = this.options.maxTreeNodes ?? 10_000
    const visitedDirectories = new Set<string>([workspaceRealPath])
    let nodeCount = 0

    const walk = async (directoryPath: string, directoryRelativePath: string): Promise<FileNode[]> => {
      const entries = await readdir(directoryPath, { withFileTypes: true })
      entries.sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1
        return left.name.localeCompare(right.name)
      })

      const nodes: FileNode[] = []
      for (const entry of entries) {
        const relativePath = directoryRelativePath ? join(directoryRelativePath, entry.name) : entry.name
        if (this.shouldIgnore(entry.name, relativePath) || entry.isSymbolicLink()) continue

        nodeCount += 1
        if (nodeCount > maxTreeNodes) {
          throw new WorkspaceServiceError("TREE_LIMIT_EXCEEDED", `Workspace tree exceeds ${maxTreeNodes} nodes`)
        }

        const absolutePath = join(directoryPath, entry.name)
        if (entry.isDirectory()) {
          const directoryRealPath = await realpath(absolutePath)
          this.assertInsideWorkspace(workspaceRealPath, directoryRealPath)
          if (visitedDirectories.has(directoryRealPath)) continue
          visitedDirectories.add(directoryRealPath)
          nodes.push({
            name: entry.name,
            relativePath,
            kind: "directory",
            children: await walk(directoryRealPath, relativePath),
          })
        } else if (entry.isFile()) {
          nodes.push({ name: entry.name, relativePath, kind: "file" })
        }
      }
      return nodes
    }

    return walk(workspaceRealPath, "")
  }

  async readFile(input: ReadFileInput): Promise<ReadFileResult> {
    const workspaceRealPath = await realpath(input.workspaceRoot)
    const candidatePath = resolve(workspaceRealPath, input.relativePath)
    this.assertInsideWorkspace(workspaceRealPath, candidatePath)

    const targetRealPath = await realpath(candidatePath)
    this.assertInsideWorkspace(workspaceRealPath, targetRealPath)

    const targetStats = await stat(targetRealPath)
    if (!targetStats.isFile()) {
      throw new WorkspaceServiceError("NOT_A_FILE", "Workspace path is not a file")
    }
    if (targetStats.size > maximumTextFileBytes) {
      throw new WorkspaceServiceError("FILE_TOO_LARGE", "File is larger than the 2 MiB desktop preview limit")
    }

    const bytes = await readFile(targetRealPath)
    if (bytes.includes(0)) {
      throw new WorkspaceServiceError("BINARY_FILE", "Binary files cannot be displayed as text")
    }

    let content: string
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
      throw new WorkspaceServiceError("BINARY_FILE", "File is not valid UTF-8 text")
    }

    return {
      relativePath: input.relativePath,
      content,
    }
  }

  /** 历史列表只读 append-only 事件；状态由最新事件推导，绝不另建一份可漂移的任务数据库。 */
  async listTasks(workspaceRoot: string): Promise<TaskSummary[]> {
    const workspaceRealPath = await realpath(workspaceRoot)
    const runsRoot = join(workspaceRealPath, ".loom", "runs")
    let entries
    try { entries = await readdir(runsRoot, { withFileTypes: true }) } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return []
      throw error
    }
    const summaries = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const taskId = entry.name
      try {
        const content = await readFile(join(runsRoot, taskId, "events.jsonl"), "utf8")
        const events = content.split("\n").filter(Boolean).map((line) => EventRecordSchema.parse(JSON.parse(line))).sort((left, right) => left.seq - right.seq)
        const created = events.find((event) => event.type === "task.created")
        const goal = typeof created?.data === "object" && created.data !== null && !Array.isArray(created.data) && typeof created.data.goal === "string" ? created.data.goal : null
        const latest = events.at(-1)
        if (!goal || !latest || latest.taskId !== taskId) return null
        return { taskId, goal, status: statusFromEvent(latest.type), timestamp: latest.timestamp } satisfies TaskSummary
      } catch { return null }
    }))
    return summaries.filter((summary): summary is TaskSummary => summary !== null).sort((left, right) => right.timestamp.localeCompare(left.timestamp))
  }

  private assertInsideWorkspace(workspaceRoot: string, targetPath: string): void {
    const pathFromRoot = relative(workspaceRoot, targetPath)
    if (pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))) return
    throw new WorkspaceServiceError("PATH_OUTSIDE_WORKSPACE", "File path resolves outside the workspace")
  }

  private shouldIgnore(name: string, relativePath: string): boolean {
    return ignoredDirectoryNames.has(name) || relativePath === join(".loom", "runs")
  }
}

function statusFromEvent(type: string): TaskSummary["status"] {
  if (type === "task.verified") return "verified"
  if (type === "task.blocked") return "blocked"
  if (type === "task.failed") return "failed"
  if (type === "task.cancelled") return "cancelled"
  if (type === "task.candidate_done") return "candidate_done"
  return "running"
}
