import { randomUUID } from "node:crypto"
import { loadConfig, type RuntimeConfig } from "./config.js"
import { AgentLoop, type RunResult } from "./agent/loop.js"
import { FileEventStore } from "./events/store.js"
import type { EventStore } from "./events/types.js"
import type { ModelProvider } from "./model/types.js"
import { createDeepSeekTransport, DeepSeekProvider } from "./model/deepseek.js"
import type { ApprovalGate } from "./safety/approval.js"
import type { CommandRunner } from "./process/runner.js"
import { ExecaCommandRunner } from "./process/runner.js"
import { DefaultToolRegistry } from "./tools/registry.js"
import { CommandVerifier } from "./verification/verifier.js"
import type { Verifier } from "./verification/types.js"
import { projectRun, type ResumeState } from "./state/projection.js"

export type RuntimeDependencies = {
  provider?: ModelProvider
  approvalGate?: ApprovalGate
  commandRunner?: CommandRunner
  verifier?: Verifier
  env?: NodeJS.ProcessEnv
}

/**
 * 一次 Runtime 会话的可选宿主控制项。
 *
 * CLI 不传这些项时，Runtime 继续使用随机 ID 和本地文件事件日志；
 * Desktop 传入后，则能在开始运行前先登记任务、订阅事件，并随时取消。
 */
export type RuntimeRunOptions = {
  taskId?: string
  signal?: AbortSignal
  eventStore?: EventStore
}

export type RuntimeResumeOptions = Omit<RuntimeRunOptions, "taskId">
export type RuntimeReplayOptions = Pick<RuntimeRunOptions, "eventStore">

export class LoomRuntime {
  constructor(private readonly dependencies: RuntimeDependencies = {}) {}

  async run(goal: string, cwd: string, options: RuntimeRunOptions = {}): Promise<RunResult> {
    const config = await loadConfig(cwd, this.dependencies.env ?? process.env)
    const taskId = options.taskId ?? randomUUID()
    const store = options.eventStore ?? new FileEventStore(config.workspaceRoot)
    const runner = this.dependencies.commandRunner ?? new ExecaCommandRunner()
    const verifier = this.dependencies.verifier ?? new CommandVerifier(config.verificationCommands, runner, store, config.limits.maxDurationMs, config.limits.maxToolOutputChars)
    const loop = this.createLoop(config, store, runner, verifier)
    return loop.run({ taskId, goal, workspaceRoot: config.workspaceRoot, ...(options.signal ? { signal: options.signal } : {}) })
  }

  async replay(taskId: string, cwd: string, options: RuntimeReplayOptions = {}) {
    const config = await loadConfig(cwd, this.dependencies.env ?? process.env)
    return (options.eventStore ?? new FileEventStore(config.workspaceRoot)).readAll(taskId)
  }

  async resume(taskId: string, cwd: string, options: RuntimeResumeOptions = {}): Promise<RunResult> {
    const config = await loadConfig(cwd, this.dependencies.env ?? process.env)
    const store = options.eventStore ?? new FileEventStore(config.workspaceRoot)
    const state = projectRun(await store.readAll(taskId))
    if (state.status !== "running" && state.status !== "continue") return summarizeState(state)
    const runner = this.dependencies.commandRunner ?? new ExecaCommandRunner()
    const verifier = this.dependencies.verifier ?? new CommandVerifier(config.verificationCommands, runner, store, config.limits.maxDurationMs, config.limits.maxToolOutputChars)
    const loop = this.createLoop(config, store, runner, verifier)
    return loop.resume({ taskId, goal: state.goal, workspaceRoot: config.workspaceRoot, ...(options.signal ? { signal: options.signal } : {}) }, state)
  }

  private createLoop(config: RuntimeConfig, store: EventStore, runner: CommandRunner, verifier?: Verifier) {
    const provider = this.dependencies.provider ?? new DeepSeekProvider(createDeepSeekTransport(config.deepseekApiKey))
    return new AgentLoop(provider, new DefaultToolRegistry(), store, config.limits, undefined, verifier, this.dependencies.approvalGate, runner)
  }
}

function summarizeState(state: ResumeState): RunResult {
  const status = state.status === "continue" ? "blocked" : state.status
  return { taskId: state.taskId, status: status as RunResult["status"], steps: state.modelCalls, modelCalls: state.modelCalls, toolCalls: state.toolCalls }
}
