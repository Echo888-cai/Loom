import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ZodError } from "zod"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerTaskIpcHandlers, registerWorkspaceIpcHandlers, type IpcMainAdapter } from "../../src/backend/ipc.js"
import { WorkspaceService } from "../../src/backend/workspace-service.js"
import { channels } from "../../src/shared/channels.js"

describe("workspace IPC handlers", () => {
  let fixtureRoot: string
  let workspaceRoot: string

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), "loom-ipc-"))
    workspaceRoot = join(fixtureRoot, "workspace")
    await mkdir(workspaceRoot)
    await writeFile(join(workspaceRoot, "readme.txt"), "Loom IPC\n", "utf8")
  })

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it("validates and executes a real workspace file read", async () => {
    const ipc = new FakeIpcMain()
    registerWorkspaceIpcHandlers(ipc, new WorkspaceService())

    await expect(ipc.invoke(channels.readFile, { workspaceRoot, relativePath: "readme.txt" })).resolves.toEqual({
      relativePath: "readme.txt",
      content: "Loom IPC\n",
    })
  })

  it("rejects malformed requests again in the main process", async () => {
    const ipc = new FakeIpcMain()
    registerWorkspaceIpcHandlers(ipc, new WorkspaceService())

    await expect(ipc.invoke(channels.listWorkspace, { workspaceRoot: "relative" })).rejects.toBeInstanceOf(ZodError)
  })

  it("rejects a malformed service response before it reaches the renderer", async () => {
    const ipc = new FakeIpcMain()
    const malformedService = {
      chooseWorkspace: async () => ({ root: "relative", name: "repo" }),
      listTree: async () => [],
      listTasks: async () => [],
      readFile: async () => ({ relativePath: "readme.txt", content: "ok" }),
    }
    registerWorkspaceIpcHandlers(ipc, malformedService)

    await expect(ipc.invoke(channels.chooseWorkspace)).rejects.toBeInstanceOf(ZodError)
  })

  it("removes every registered handler during disposal", () => {
    const ipc = new FakeIpcMain()
    const dispose = registerWorkspaceIpcHandlers(ipc, new WorkspaceService())

    expect([...ipc.handlers.keys()].sort()).toEqual([
      channels.chooseWorkspace,
      channels.listWorkspace,
      channels.listTasks,
      channels.readFile,
    ].sort())
    dispose()
    expect(ipc.handlers.size).toBe(0)
  })
})

describe("task IPC handlers", () => {
  it("validates task input and redacts an API key in service errors", async () => {
    const ipc = new FakeIpcMain()
    const tasks = {
      start: () => { throw new Error("DeepSeek rejected secret-value") },
      resume: () => ({ taskId: "task-1" }),
      replay: async () => [],
      cancel: () => undefined,
      resolveApproval: () => undefined,
    }
    registerTaskIpcHandlers(ipc, tasks, { deepSeekApiKey: "secret-value" })

    await expect(ipc.invoke(channels.startTask, { workspaceRoot: "/repo", goal: "Fix it" })).rejects.toThrow("[redacted]")
    await expect(ipc.invoke(channels.startTask, { workspaceRoot: "relative", goal: "Fix it" })).rejects.toBeInstanceOf(ZodError)
  })

  it("routes every allowlisted task action through validated schemas", async () => {
    const ipc = new FakeIpcMain()
    const calls: string[] = []
    const tasks = {
      start: () => { calls.push("start"); return { taskId: "task-1" } },
      resume: () => { calls.push("resume"); return { taskId: "task-1" } },
      replay: async () => { calls.push("replay"); return [validEvent] },
      cancel: () => { calls.push("cancel") },
      resolveApproval: () => { calls.push("approval") },
    }
    registerTaskIpcHandlers(ipc, tasks)

    await ipc.invoke(channels.startTask, { workspaceRoot: "/repo", goal: "Fix it" })
    await ipc.invoke(channels.resumeTask, { workspaceRoot: "/repo", taskId: "task-1" })
    await ipc.invoke(channels.replayTask, { workspaceRoot: "/repo", taskId: "task-1" })
    await ipc.invoke(channels.cancelTask, { taskId: "task-1" })
    await ipc.invoke(channels.resolveApproval, { taskId: "task-1", decision: "allow" })

    expect(calls).toEqual(["start", "resume", "replay", "cancel", "approval"])
  })

  it("redacts API keys from asynchronous replay failures too", async () => {
    const ipc = new FakeIpcMain()
    const tasks = {
      start: () => ({ taskId: "task-1" }),
      resume: () => ({ taskId: "task-1" }),
      replay: async () => { throw new Error("request included secret-value") },
      cancel: () => undefined,
      resolveApproval: () => undefined,
    }
    registerTaskIpcHandlers(ipc, tasks, { deepSeekApiKey: "secret-value" })

    await expect(ipc.invoke(channels.replayTask, { workspaceRoot: "/repo", taskId: "task-1" })).rejects.toThrow("[redacted]")
  })
})

const validEvent = {
  seq: 1,
  timestamp: "2026-08-25T08:00:00.000Z",
  taskId: "task-1",
  type: "task.created",
  data: { goal: "Fix it" },
}

class FakeIpcMain implements IpcMainAdapter {
  readonly handlers = new Map<string, (event: unknown, input: unknown) => unknown | Promise<unknown>>()

  handle(channel: string, listener: (event: unknown, input: unknown) => unknown | Promise<unknown>): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }

  async invoke(channel: string, input?: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No IPC handler for ${channel}`)
    return handler({}, input)
  }
}
