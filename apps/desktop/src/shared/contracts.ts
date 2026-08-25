import { z } from "zod"

export const WorkspaceRootSchema = z.string().min(1).refine((value) => value.startsWith("/"), {
  message: "Workspace path must be absolute",
})

export const TaskIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/)

export const RelativePathSchema = z.string().min(1).max(4096)
  .refine((value) => !value.startsWith("/") && !value.startsWith("\\") && !/^[A-Za-z]:/.test(value), {
    message: "File path must be relative to the workspace",
  })
  .refine((value) => !value.split(/[\\/]/).includes(".."), {
    message: "File path cannot traverse outside the workspace",
  })

export const StartTaskInputSchema = z.object({
  workspaceRoot: WorkspaceRootSchema,
  goal: z.string().trim().min(1).max(20_000),
}).strict()

export const ApprovalDecisionInputSchema = z.object({
  taskId: TaskIdSchema,
  decision: z.enum(["allow", "deny"]),
}).strict()

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number().finite(),
  z.string(),
  z.array(JsonValueSchema),
  z.record(JsonValueSchema),
]))

export const EventRecordSchema = z.object({
  seq: z.number().int().positive(),
  timestamp: z.string().datetime({ offset: true }),
  taskId: TaskIdSchema,
  type: z.string().min(1).max(128),
  data: JsonValueSchema,
}).strict()

export const EventEnvelopeSchema = z.object({
  taskId: TaskIdSchema,
  event: EventRecordSchema,
}).strict().superRefine((value, context) => {
  if (value.taskId !== value.event.taskId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Envelope task ID must match event task ID" })
  }
})

export const ResumeTaskInputSchema = z.object({
  workspaceRoot: WorkspaceRootSchema,
  taskId: TaskIdSchema,
}).strict()

export const ReplayTaskInputSchema = ResumeTaskInputSchema

export const ReadFileInputSchema = z.object({
  workspaceRoot: WorkspaceRootSchema,
  relativePath: RelativePathSchema,
}).strict()

export const WorkspaceInfoSchema = z.object({
  root: WorkspaceRootSchema,
  name: z.string().min(1),
}).strict()

export const NullableWorkspaceInfoSchema = WorkspaceInfoSchema.nullable()

export type FileNode =
  | { name: string; relativePath: string; kind: "file" }
  | { name: string; relativePath: string; kind: "directory"; children: FileNode[] }

export const FileNodeSchema: z.ZodType<FileNode> = z.lazy(() => z.union([
  z.object({
    name: z.string().min(1),
    relativePath: RelativePathSchema,
    kind: z.literal("file"),
  }).strict(),
  z.object({
    name: z.string().min(1),
    relativePath: RelativePathSchema,
    kind: z.literal("directory"),
    children: z.array(FileNodeSchema),
  }).strict(),
]))

export const FileTreeSchema = z.array(FileNodeSchema)

export const ReadFileResultSchema = z.object({
  relativePath: RelativePathSchema,
  content: z.string(),
}).strict()

export const TaskCommandResultSchema = z.object({ taskId: TaskIdSchema }).strict()
export const TaskStatusSchema = z.enum(["running", "candidate_done", "verified", "blocked", "failed", "cancelled"])
export const TaskSummarySchema = z.object({
  taskId: TaskIdSchema,
  goal: z.string().min(1),
  status: TaskStatusSchema,
  timestamp: z.string().datetime({ offset: true }),
}).strict()
export const TaskSummaryListSchema = z.array(TaskSummarySchema)
export const EventRecordListSchema = z.array(EventRecordSchema)
export const CancelTaskInputSchema = z.object({ taskId: TaskIdSchema }).strict()
export const WorkspaceRootInputSchema = z.object({ workspaceRoot: WorkspaceRootSchema }).strict()
export const VoidResponseSchema = z.undefined()

export type StartTaskInput = z.infer<typeof StartTaskInputSchema>
export type ResumeTaskInput = z.infer<typeof ResumeTaskInputSchema>
export type ReplayTaskInput = z.infer<typeof ReplayTaskInputSchema>
export type ReadFileInput = z.infer<typeof ReadFileInputSchema>
export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionInputSchema>
export type EventRecord = z.infer<typeof EventRecordSchema>
export type TaskEventEnvelope = z.infer<typeof EventEnvelopeSchema>
export type WorkspaceInfo = z.infer<typeof WorkspaceInfoSchema>
export type ReadFileResult = z.infer<typeof ReadFileResultSchema>
export type TaskCommandResult = z.infer<typeof TaskCommandResultSchema>
export type TaskSummary = z.infer<typeof TaskSummarySchema>

export interface LoomDesktopApi {
  chooseWorkspace(): Promise<WorkspaceInfo | null>
  listWorkspace(root: string): Promise<FileNode[]>
  listTasks(root: string): Promise<TaskSummary[]>
  readFile(input: ReadFileInput): Promise<ReadFileResult>
  startTask(input: StartTaskInput): Promise<TaskCommandResult>
  resumeTask(input: ResumeTaskInput): Promise<TaskCommandResult>
  replayTask(input: ReplayTaskInput): Promise<EventRecord[]>
  cancelTask(taskId: string): Promise<void>
  resolveApproval(input: ApprovalDecisionInput): Promise<void>
  onTaskEvent(listener: (envelope: TaskEventEnvelope) => void): () => void
}
