import type { FileNode, ReadFileInput, ReadFileResult, WorkspaceInfo } from "../shared/contracts.js"
import { channels } from "../shared/channels.js"
import {
  FileTreeSchema,
  NullableWorkspaceInfoSchema,
  ReadFileInputSchema,
  ReadFileResultSchema,
  WorkspaceRootInputSchema,
} from "../shared/contracts.js"

export interface IpcMainAdapter {
  handle(channel: string, listener: (event: unknown, input: unknown) => unknown | Promise<unknown>): void
  removeHandler(channel: string): void
}

export interface WorkspaceOperations {
  chooseWorkspace(): Promise<WorkspaceInfo | null>
  listTree(root: string): Promise<FileNode[]>
  readFile(input: ReadFileInput): Promise<ReadFileResult>
}

export function registerWorkspaceIpcHandlers(
  ipc: IpcMainAdapter,
  workspace: WorkspaceOperations,
): () => void {
  ipc.handle(channels.chooseWorkspace, async () => {
    return NullableWorkspaceInfoSchema.parse(await workspace.chooseWorkspace())
  })

  ipc.handle(channels.listWorkspace, async (_event, rawInput) => {
    const input = WorkspaceRootInputSchema.parse(rawInput)
    return FileTreeSchema.parse(await workspace.listTree(input.workspaceRoot))
  })

  ipc.handle(channels.readFile, async (_event, rawInput) => {
    const input = ReadFileInputSchema.parse(rawInput)
    return ReadFileResultSchema.parse(await workspace.readFile(input))
  })

  const registeredChannels = [channels.chooseWorkspace, channels.listWorkspace, channels.readFile]
  return () => {
    for (const channel of registeredChannels) ipc.removeHandler(channel)
  }
}
