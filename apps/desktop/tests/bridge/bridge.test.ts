import { ZodError } from "zod"
import { describe, expect, it } from "vitest"
import { channels } from "../../src/shared/channels.js"
import { createDesktopApi, type IpcClient } from "../../src/bridge/bridge.js"

describe("Loom preload bridge", () => {
  it("exposes only the allowlisted product API", () => {
    const api = createDesktopApi(new FakeIpcClient())

    expect(Object.keys(api).sort()).toEqual([
      "cancelTask",
      "chooseWorkspace",
      "listTasks",
      "listWorkspace",
      "onTaskEvent",
      "readFile",
      "replayTask",
      "resolveApproval",
      "resumeTask",
      "startTask",
    ])
    expect(api).not.toHaveProperty("send")
    expect(api).not.toHaveProperty("invoke")
    expect(api).not.toHaveProperty("on")
    expect(api).not.toHaveProperty("ipcRenderer")
    expect(api).not.toHaveProperty("env")
  })

  it("rejects malformed input before crossing IPC", async () => {
    const ipc = new FakeIpcClient()
    const api = createDesktopApi(ipc)

    await expect(api.startTask({ workspaceRoot: "relative", goal: "Fix it" })).rejects.toBeInstanceOf(ZodError)
    expect(ipc.requests).toHaveLength(0)
  })

  it("validates successful responses before returning them", async () => {
    const ipc = new FakeIpcClient()
    ipc.responses.set(channels.chooseWorkspace, { root: "/repo", name: "repo" })
    const api = createDesktopApi(ipc)

    await expect(api.chooseWorkspace()).resolves.toEqual({ root: "/repo", name: "repo" })
    expect(ipc.requests).toEqual([{ channel: channels.chooseWorkspace, input: undefined }])
  })

  it("rejects a malformed main-process response", async () => {
    const ipc = new FakeIpcClient()
    ipc.responses.set(channels.readFile, { relativePath: "src/index.ts", content: 42 })
    const api = createDesktopApi(ipc)

    await expect(api.readFile({ workspaceRoot: "/repo", relativePath: "src/index.ts" })).rejects.toBeInstanceOf(ZodError)
  })

  it("delivers only valid task events and unsubscribes cleanly", () => {
    const ipc = new FakeIpcClient()
    const api = createDesktopApi(ipc)
    const received: string[] = []
    const unsubscribe = api.onTaskEvent((envelope) => received.push(envelope.event.type))

    ipc.emit(channels.taskEvent, { taskId: "wrong/id" })
    ipc.emit(channels.taskEvent, validEventEnvelope)
    unsubscribe()
    ipc.emit(channels.taskEvent, validEventEnvelope)

    expect(received).toEqual(["task.created"])
  })
})

const validEventEnvelope = {
  taskId: "task-1",
  event: {
    seq: 1,
    timestamp: "2026-08-25T08:00:00.000Z",
    taskId: "task-1",
    type: "task.created",
    data: { goal: "Fix authentication" },
  },
}

class FakeIpcClient implements IpcClient {
  readonly requests: Array<{ channel: string; input: unknown }> = []
  readonly responses = new Map<string, unknown>()
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>()

  async invoke(channel: string, input?: unknown): Promise<unknown> {
    this.requests.push({ channel, input })
    return this.responses.get(channel)
  }

  subscribe(channel: string, listener: (payload: unknown) => void): () => void {
    const channelListeners = this.listeners.get(channel) ?? new Set()
    channelListeners.add(listener)
    this.listeners.set(channel, channelListeners)
    return () => channelListeners.delete(listener)
  }

  emit(channel: string, payload: unknown): void {
    for (const listener of this.listeners.get(channel) ?? []) listener(payload)
  }
}
