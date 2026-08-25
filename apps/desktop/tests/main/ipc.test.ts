import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ZodError } from "zod"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerWorkspaceIpcHandlers, type IpcMainAdapter } from "../../src/main/ipc.js"
import { WorkspaceService } from "../../src/main/workspace-service.js"
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
      channels.readFile,
    ].sort())
    dispose()
    expect(ipc.handlers.size).toBe(0)
  })
})

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
