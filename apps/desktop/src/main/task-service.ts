import { randomUUID } from "node:crypto"
import {
  FileEventStore,
  LoomRuntime,
  StreamingEventStore,
  type ApprovalDecision,
  type ApprovalGate,
  type EventRecord,
  type RunResult,
  type RuntimeReplayOptions,
  type RuntimeResumeOptions,
  type RuntimeRunOptions,
} from "loom"
import { EventEnvelopeSchema, type ReplayTaskInput, type ResumeTaskInput, type StartTaskInput } from "../shared/contracts.js"
import { channels } from "../shared/channels.js"
import { DesktopApprovalGate } from "./approval-gate.js"

/** Electron 窗口在此处只需要一个向 renderer 推送事件的窄接口，便于独立测试。 */
export interface TaskWindow {
  webContents: { send(channel: string, payload: unknown): void }
}

/** 为 TaskService 保留的 Runtime 最小表面；测试可以注入本地 fake 而非调用 DeepSeek。 */
export interface TaskRuntime {
  run(goal: string, cwd: string, options?: RuntimeRunOptions): Promise<RunResult>
  resume(taskId: string, cwd: string, options?: RuntimeResumeOptions): Promise<RunResult>
  replay(taskId: string, cwd: string, options?: RuntimeReplayOptions): Promise<EventRecord[]>
}

export type RuntimeFactory = (approvalGate: ApprovalGate) => TaskRuntime

type ActiveTask = {
  controller: AbortController
  gate: DesktopApprovalGate
  unsubscribe: () => void
  completion: Promise<RunResult>
}

/**
 * 桌面端的任务拥有者。
 *
 * Runtime 仍负责 Agent Loop 和持久化事实；本服务只管理 Desktop 生命周期：
 * 先生成任务 ID、把持久化事件转发给窗口、保存取消控制器与审批 gate。
 */
export class TaskService {
  private readonly activeTasks = new Map<string, ActiveTask>()

  constructor(
    private readonly window: TaskWindow,
    private readonly runtimeFactory: RuntimeFactory = (approvalGate) => new LoomRuntime({ approvalGate }),
  ) {}

  start(input: StartTaskInput): { taskId: string } {
    const taskId = randomUUID()
    this.launch(taskId, input.workspaceRoot, (runtime, options) => runtime.run(input.goal, input.workspaceRoot, options))
    return { taskId }
  }

  resume(input: ResumeTaskInput): { taskId: string } {
    this.ensureNotActive(input.taskId)
    this.launch(input.taskId, input.workspaceRoot, (runtime, options) => runtime.resume(input.taskId, input.workspaceRoot, options))
    return { taskId: input.taskId }
  }

  cancel(taskId: string): void {
    const active = this.requireActive(taskId)
    active.controller.abort()
  }

  resolveApproval(taskId: string, decision: ApprovalDecision): void {
    this.requireActive(taskId).gate.resolve(decision)
  }

  async replay(input: ReplayTaskInput): Promise<EventRecord[]> {
    // replay 只读 JSONL；它从不创建 active task，也不会触发模型调用。
    return this.runtimeFactory(new DesktopApprovalGate(input.taskId)).replay(input.taskId, input.workspaceRoot)
  }

  /** 窗口关闭时撤销事件订阅、拒绝待审批命令并要求每个运行中的 Agent 尽快停止。 */
  disposeWindow(): void {
    for (const active of this.activeTasks.values()) {
      active.unsubscribe()
      active.gate.dispose()
      active.controller.abort()
    }
    this.activeTasks.clear()
  }

  private launch(
    taskId: string,
    workspaceRoot: string,
    invoke: (runtime: TaskRuntime, options: RuntimeRunOptions) => Promise<RunResult>,
  ): void {
    this.ensureNotActive(taskId)
    const controller = new AbortController()
    const gate = new DesktopApprovalGate(taskId)
    const store = new StreamingEventStore(new FileEventStore(workspaceRoot))
    const unsubscribe = store.subscribe((event) => this.sendEvent(taskId, event))
    const runtime = this.runtimeFactory(gate)
    const options: RuntimeRunOptions = { taskId, signal: controller.signal, eventStore: store }
    const completion = Promise.resolve()
      .then(() => invoke(runtime, options))
      .finally(() => {
        const active = this.activeTasks.get(taskId)
        if (active?.completion === completion) {
          active.unsubscribe()
          active.gate.dispose()
          this.activeTasks.delete(taskId)
        }
      })

    this.activeTasks.set(taskId, { controller, gate, unsubscribe, completion })
    // LoomRuntime normalizes runtime failures into RunResult. The catch also protects Electron from
    // an injected implementation unexpectedly rejecting after the IPC response has returned.
    void completion.catch(() => undefined)
  }

  private sendEvent(taskId: string, event: EventRecord): void {
    this.window.webContents.send(channels.taskEvent, EventEnvelopeSchema.parse({ taskId, event }))
  }

  private ensureNotActive(taskId: string): void {
    if (this.activeTasks.has(taskId)) throw new Error(`Task ${taskId} is already active`)
  }

  private requireActive(taskId: string): ActiveTask {
    const active = this.activeTasks.get(taskId)
    if (!active) throw new Error(`No active Loom task with ID ${taskId}`)
    return active
  }
}
