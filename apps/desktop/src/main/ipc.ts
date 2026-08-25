import type {
  ApprovalDecisionInput,
  FileNode,
  ReadFileInput,
  ReadFileResult,
  ReplayTaskInput,
  ResumeTaskInput,
  StartTaskInput,
  WorkspaceInfo,
  TaskSummary,
} from "../shared/contracts.js"
import { channels } from "../shared/channels.js"
import {
  FileTreeSchema,
  ApprovalDecisionInputSchema,
  CancelTaskInputSchema,
  EventRecordListSchema,
  NullableWorkspaceInfoSchema,
  ReadFileInputSchema,
  ReadFileResultSchema,
  WorkspaceRootInputSchema,
  TaskSummaryListSchema,
  ReplayTaskInputSchema,
  ResumeTaskInputSchema,
  StartTaskInputSchema,
  TaskCommandResultSchema,
  VoidResponseSchema,
} from "../shared/contracts.js"

export interface IpcMainAdapter {
  handle(channel: string, listener: (event: unknown, input: unknown) => unknown | Promise<unknown>): void
  removeHandler(channel: string): void
}

export interface WorkspaceOperations {
  chooseWorkspace(): Promise<WorkspaceInfo | null>
  listTree(root: string): Promise<FileNode[]>
  listTasks(root: string): Promise<TaskSummary[]>
  readFile(input: ReadFileInput): Promise<ReadFileResult>
}

export interface TaskOperations {
  start(input: StartTaskInput): { taskId: string }
  resume(input: ResumeTaskInput): { taskId: string }
  replay(input: ReplayTaskInput): Promise<unknown[]>
  cancel(taskId: string): void
  resolveApproval(input: ApprovalDecisionInput): void
}

export type TaskIpcOptions = { deepSeekApiKey?: string }

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

  ipc.handle(channels.listTasks, async (_event, rawInput) => {
    const input = WorkspaceRootInputSchema.parse(rawInput)
    return TaskSummaryListSchema.parse(await workspace.listTasks(input.workspaceRoot))
  })

  ipc.handle(channels.readFile, async (_event, rawInput) => {
    const input = ReadFileInputSchema.parse(rawInput)
    return ReadFileResultSchema.parse(await workspace.readFile(input))
  })

  const registeredChannels = [channels.chooseWorkspace, channels.listWorkspace, channels.listTasks, channels.readFile]
  return () => {
    for (const channel of registeredChannels) ipc.removeHandler(channel)
  }
}

/**
 * 将所有 task 相关 IPC 集中在同一个、可审计的白名单中。
 * 输入在主进程再次验证；服务异常会被统一清洗，确保 API key 绝不回流 renderer。
 */
export function registerTaskIpcHandlers(
  ipc: IpcMainAdapter,
  tasks: TaskOperations,
  options: TaskIpcOptions = {},
): () => void {
  ipc.handle(channels.startTask, async (_event, rawInput) => {
    const input = StartTaskInputSchema.parse(rawInput)
    return TaskCommandResultSchema.parse(runSafely(() => tasks.start(input), options.deepSeekApiKey))
  })

  ipc.handle(channels.resumeTask, async (_event, rawInput) => {
    const input = ResumeTaskInputSchema.parse(rawInput)
    return TaskCommandResultSchema.parse(runSafely(() => tasks.resume(input), options.deepSeekApiKey))
  })

  ipc.handle(channels.replayTask, async (_event, rawInput) => {
    const input = ReplayTaskInputSchema.parse(rawInput)
    return EventRecordListSchema.parse(await runSafelyAsync(() => tasks.replay(input), options.deepSeekApiKey))
  })

  ipc.handle(channels.cancelTask, async (_event, rawInput) => {
    const input = CancelTaskInputSchema.parse(rawInput)
    runSafely(() => tasks.cancel(input.taskId), options.deepSeekApiKey)
    return VoidResponseSchema.parse(undefined)
  })

  ipc.handle(channels.resolveApproval, async (_event, rawInput) => {
    const input = ApprovalDecisionInputSchema.parse(rawInput)
    runSafely(() => tasks.resolveApproval(input), options.deepSeekApiKey)
    return VoidResponseSchema.parse(undefined)
  })

  const registeredChannels = [
    channels.startTask,
    channels.resumeTask,
    channels.replayTask,
    channels.cancelTask,
    channels.resolveApproval,
  ]
  return () => {
    for (const channel of registeredChannels) ipc.removeHandler(channel)
  }
}

function runSafely<T>(operation: () => T, deepSeekApiKey?: string): T {
  try {
    return operation()
  } catch (error: unknown) {
    throw new Error(redactError(error, deepSeekApiKey))
  }
}

async function runSafelyAsync<T>(operation: () => Promise<T>, deepSeekApiKey?: string): Promise<T> {
  try {
    return await operation()
  } catch (error: unknown) {
    throw new Error(redactError(error, deepSeekApiKey))
  }
}

export function redactError(error: unknown, deepSeekApiKey?: string): string {
  const message = error instanceof Error ? error.message : String(error)
  if (!deepSeekApiKey) return message
  return message.split(deepSeekApiKey).join("[redacted]")
}
