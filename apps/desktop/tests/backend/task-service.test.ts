import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { ApprovalGate, EventStore, RunResult, RuntimeRunOptions } from "loom"
import { TaskService, type TaskRuntime } from "../../src/backend/task-service.js"
import { channels } from "../../src/shared/channels.js"

class FakeWindow {
  readonly sent: Array<{ channel: string; payload: unknown }> = []
  readonly webContents = { send: (channel: string, payload: unknown) => this.sent.push({ channel, payload }) }
}

describe("TaskService", () => {
  it("returns a task ID immediately and streams persisted events to its window", async () => {
    const root = await workspace()
    const window = new FakeWindow()
    const service = new TaskService(window, () => immediateRuntime())

    const result = service.start({ workspaceRoot: root, goal: "Inspect the repository" })
    await waitFor(() => window.sent.length === 2)

    expect(result.taskId).toMatch(/^[A-Za-z0-9._-]+$/)
    expect(window.sent.map((message) => message.channel)).toEqual([channels.taskEvent, channels.taskEvent])
    expect(window.sent.map((message) => (message.payload as { event: { type: string } }).event.type)).toEqual([
      "task.created",
      "task.candidate_done",
    ])
  })

  it("aborts the active task and streams its durable cancellation event", async () => {
    const root = await workspace()
    const window = new FakeWindow()
    let receivedSignal: AbortSignal | undefined
    const service = new TaskService(window, () => ({
      async run(_goal, _root, options) {
        receivedSignal = options?.signal
        await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => resolve(), { once: true }))
        await options?.eventStore?.append(options.taskId ?? "missing", "task.cancelled", { reason: "cancelled" })
        return cancelledResult(options?.taskId ?? "missing")
      },
      async resume() { throw new Error("not used") },
      async replay() { return [] },
    }))

    const { taskId } = service.start({ workspaceRoot: root, goal: "Wait for cancellation" })
    await waitFor(() => receivedSignal !== undefined)
    service.cancel(taskId)
    await waitFor(() => window.sent.some((message) => (message.payload as { event: { type: string } }).event.type === "task.cancelled"))

    expect(receivedSignal?.aborted).toBe(true)
  })

  it("replays the existing event log without starting a task", async () => {
    const root = await workspace()
    let replayCalls = 0
    const service = new TaskService(new FakeWindow(), () => ({
      async run() { throw new Error("run must not be called") },
      async resume() { throw new Error("resume must not be called") },
      async replay(taskId) {
        replayCalls += 1
        return [{ seq: 1, timestamp: "2026-08-25T08:00:00.000Z", taskId, type: "task.created", data: { goal: "Replay" } }]
      },
    }))

    const events = await service.replay({ workspaceRoot: root, taskId: "task-replay" })

    expect(replayCalls).toBe(1)
    expect(events.map((event) => event.seq)).toEqual([1])
  })

  it("resumes with the same task ID and resolves its desktop approval gate", async () => {
    const root = await workspace()
    const window = new FakeWindow()
    let gate: ApprovalGate | undefined
    const service = new TaskService(window, (approvalGate) => {
      gate = approvalGate
      return {
        async run() { throw new Error("not used") },
        async resume(taskId, _root, options) {
          await requiredStore(options).append(taskId, "model.requested", { call: 2 })
          await new Promise<void>((resolve) => setTimeout(resolve, 20))
          return { taskId, status: "candidate_done", steps: 2, modelCalls: 2, toolCalls: 0 }
        },
        async replay() { return [] },
      }
    })

    const result = service.resume({ workspaceRoot: root, taskId: "task-resume" })
    await waitFor(() => gate !== undefined)
    const pendingApproval = gate?.request({ command: "pnpm test", cwd: root, timeoutMs: 120_000, reason: "Verify" })
    service.resolveApproval(result.taskId, "allow")

    expect(result).toEqual({ taskId: "task-resume" })
    await expect(pendingApproval).resolves.toBe("allow")
    await waitFor(() => window.sent.some((message) => (message.payload as { event: { type: string } }).event.type === "model.requested"))
  })

  it("denies an outstanding approval and aborts work when its window closes", async () => {
    const root = await workspace()
    let decision: string | undefined
    let approvalRequested = false
    const service = new TaskService(new FakeWindow(), (gate) => ({
      async run(_goal, _root, options) {
        approvalRequested = true
        decision = await gate.request({ command: "pnpm test", cwd: root, timeoutMs: 120_000, reason: "Verify" })
        return cancelledResult(options?.taskId ?? "missing")
      },
      async resume() { throw new Error("not used") },
      async replay() { return [] },
    }))

    service.start({ workspaceRoot: root, goal: "Wait for approval" })
    await waitFor(() => approvalRequested)
    service.disposeWindow()
    await waitFor(() => decision !== undefined)

    expect(decision).toBe("deny")
  })
})

function immediateRuntime(): TaskRuntime {
  return {
    async run(goal: string, root: string, options?: RuntimeRunOptions) {
      const store = requiredStore(options)
      const taskId = options?.taskId ?? "missing"
      await store.append(taskId, "task.created", { goal, workspaceRoot: root })
      await store.append(taskId, "task.candidate_done", { content: "Finished" })
      return { taskId, status: "candidate_done", steps: 1, modelCalls: 1, toolCalls: 0 }
    },
    async resume() { throw new Error("not used") },
    async replay() { return [] },
  }
}

function requiredStore(options?: RuntimeRunOptions): EventStore {
  if (!options?.eventStore) throw new Error("TaskService must supply an event store")
  return options.eventStore
}

function cancelledResult(taskId: string): RunResult {
  return { taskId, status: "cancelled", steps: 0, modelCalls: 0, toolCalls: 0 }
}

async function workspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "loom-task-service-"))
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error("Timed out waiting for task service")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
