import { channels } from "../shared/channels.js"
import {
  ApprovalDecisionInputSchema,
  CancelTaskInputSchema,
  EventEnvelopeSchema,
  EventRecordListSchema,
  FileTreeSchema,
  NullableWorkspaceInfoSchema,
  ReadFileInputSchema,
  ReadFileResultSchema,
  ReplayTaskInputSchema,
  ResumeTaskInputSchema,
  StartTaskInputSchema,
  TaskCommandResultSchema,
  TaskSummaryListSchema,
  VoidResponseSchema,
  WorkspaceRootInputSchema,
  type LoomDesktopApi,
} from "../shared/contracts.js"

export interface IpcClient {
  invoke(channel: string, input?: unknown): Promise<unknown>
  subscribe(channel: string, listener: (payload: unknown) => void): () => void
}

export function createDesktopApi(ipc: IpcClient): LoomDesktopApi {
  const api: LoomDesktopApi = {
    async chooseWorkspace() {
      return NullableWorkspaceInfoSchema.parse(await ipc.invoke(channels.chooseWorkspace))
    },

    async listWorkspace(root) {
      const input = WorkspaceRootInputSchema.parse({ workspaceRoot: root })
      return FileTreeSchema.parse(await ipc.invoke(channels.listWorkspace, input))
    },

    async listTasks(root) {
      const input = WorkspaceRootInputSchema.parse({ workspaceRoot: root })
      return TaskSummaryListSchema.parse(await ipc.invoke(channels.listTasks, input))
    },

    async readFile(input) {
      const validatedInput = ReadFileInputSchema.parse(input)
      return ReadFileResultSchema.parse(await ipc.invoke(channels.readFile, validatedInput))
    },

    async startTask(input) {
      const validatedInput = StartTaskInputSchema.parse(input)
      return TaskCommandResultSchema.parse(await ipc.invoke(channels.startTask, validatedInput))
    },

    async resumeTask(input) {
      const validatedInput = ResumeTaskInputSchema.parse(input)
      return TaskCommandResultSchema.parse(await ipc.invoke(channels.resumeTask, validatedInput))
    },

    async replayTask(input) {
      const validatedInput = ReplayTaskInputSchema.parse(input)
      return EventRecordListSchema.parse(await ipc.invoke(channels.replayTask, validatedInput))
    },

    async cancelTask(taskId) {
      const input = CancelTaskInputSchema.parse({ taskId })
      VoidResponseSchema.parse(await ipc.invoke(channels.cancelTask, input))
    },

    async resolveApproval(input) {
      const validatedInput = ApprovalDecisionInputSchema.parse(input)
      VoidResponseSchema.parse(await ipc.invoke(channels.resolveApproval, validatedInput))
    },

    onTaskEvent(listener) {
      return ipc.subscribe(channels.taskEvent, (payload) => {
        const envelope = EventEnvelopeSchema.safeParse(payload)
        if (envelope.success) listener(envelope.data)
      })
    },
  }
  return Object.freeze(api)
}
