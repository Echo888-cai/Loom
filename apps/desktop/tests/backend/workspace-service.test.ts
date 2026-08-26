import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { WorkspaceService } from "../../src/backend/workspace-service.js"

describe("WorkspaceService.readFile", () => {
  let fixtureRoot: string
  let workspaceRoot: string

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), "loom-workspace-service-"))
    workspaceRoot = join(fixtureRoot, "workspace")
    await mkdir(workspaceRoot)
    await writeFile(join(workspaceRoot, "inside.txt"), "inside Loom\n", "utf8")
    await writeFile(join(fixtureRoot, "outside.txt"), "outside Loom\n", "utf8")
    await symlink(join(fixtureRoot, "outside.txt"), join(workspaceRoot, "escape.txt"))
  })

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it("reads a UTF-8 text file inside the workspace", async () => {
    const service = new WorkspaceService()

    await expect(service.readFile({ workspaceRoot, relativePath: "inside.txt" })).resolves.toEqual({
      relativePath: "inside.txt",
      content: "inside Loom\n",
    })
  })

  it("rejects parent traversal before reading outside data", async () => {
    const service = new WorkspaceService()

    await expect(service.readFile({ workspaceRoot, relativePath: "../outside.txt" })).rejects.toMatchObject({
      code: "PATH_OUTSIDE_WORKSPACE",
    })
  })

  it("rejects a symlink whose real target escapes the workspace", async () => {
    const service = new WorkspaceService()

    await expect(service.readFile({ workspaceRoot, relativePath: "escape.txt" })).rejects.toMatchObject({
      code: "PATH_OUTSIDE_WORKSPACE",
    })
  })

  it("allows an internal filename that merely begins with two dots", async () => {
    await writeFile(join(workspaceRoot, "..notes.txt"), "notes\n", "utf8")
    const service = new WorkspaceService()

    await expect(service.readFile({ workspaceRoot, relativePath: "..notes.txt" })).resolves.toMatchObject({
      content: "notes\n",
    })
  })

  it("rejects binary files", async () => {
    await writeFile(join(workspaceRoot, "image.bin"), Buffer.from([1, 0, 2, 3]))
    const service = new WorkspaceService()

    await expect(service.readFile({ workspaceRoot, relativePath: "image.bin" })).rejects.toMatchObject({
      code: "BINARY_FILE",
    })
  })

  it("rejects files larger than two MiB", async () => {
    await writeFile(join(workspaceRoot, "large.txt"), Buffer.alloc((2 * 1024 * 1024) + 1, 65))
    const service = new WorkspaceService()

    await expect(service.readFile({ workspaceRoot, relativePath: "large.txt" })).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    })
  })
})

describe("WorkspaceService workspace discovery", () => {
  let fixtureRoot: string
  let workspaceRoot: string

  beforeEach(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), "loom-workspace-tree-"))
    workspaceRoot = join(fixtureRoot, "sample-repo")
    await mkdir(join(workspaceRoot, "src"), { recursive: true })
    await mkdir(join(workspaceRoot, ".git"), { recursive: true })
    await mkdir(join(workspaceRoot, "node_modules", "package"), { recursive: true })
    await mkdir(join(workspaceRoot, "dist"), { recursive: true })
    await mkdir(join(workspaceRoot, ".loom", "runs", "task-1"), { recursive: true })
    await writeFile(join(workspaceRoot, "src", "index.ts"), "export {}\n", "utf8")
    await writeFile(join(workspaceRoot, ".git", "config"), "git\n", "utf8")
    await writeFile(join(workspaceRoot, "node_modules", "package", "index.js"), "module\n", "utf8")
    await writeFile(join(workspaceRoot, "dist", "index.js"), "dist\n", "utf8")
    await writeFile(join(workspaceRoot, ".loom", "config.json"), "{}\n", "utf8")
    await writeFile(join(workspaceRoot, ".loom", "runs", "task-1", "events.jsonl"), "{}\n", "utf8")
  })

  afterEach(async () => {
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it("returns the chosen workspace using its real path and basename", async () => {
    const service = new WorkspaceService({ chooseDirectory: async () => workspaceRoot })
    const expectedRoot = await realpath(workspaceRoot)

    await expect(service.chooseWorkspace()).resolves.toEqual({ root: expectedRoot, name: "sample-repo" })
  })

  it("returns null when the native picker is cancelled", async () => {
    const service = new WorkspaceService({ chooseDirectory: async () => null })

    await expect(service.chooseWorkspace()).resolves.toBeNull()
  })

  it("omits dependency, build, Git, and run-log directories from the tree", async () => {
    const service = new WorkspaceService()
    const tree = await service.listTree(workspaceRoot)
    const paths = flattenPaths(tree)

    expect(paths).toContain("src/index.ts")
    expect(paths).toContain(".loom/config.json")
    expect(paths).not.toContain(".git/config")
    expect(paths).not.toContain("node_modules/package/index.js")
    expect(paths).not.toContain("dist/index.js")
    expect(paths).not.toContain(".loom/runs/task-1/events.jsonl")
  })

  it("stops traversal when the configured node budget is exceeded", async () => {
    const service = new WorkspaceService(undefined, { maxTreeNodes: 2 })

    await expect(service.listTree(workspaceRoot)).rejects.toMatchObject({ code: "TREE_LIMIT_EXCEEDED" })
  })

  it("lists durable tasks newest first using their original goal and terminal state", async () => {
    await mkdir(join(workspaceRoot, ".loom", "runs", "task-2"), { recursive: true })
    await writeFile(join(workspaceRoot, ".loom", "runs", "task-1", "events.jsonl"), `${JSON.stringify({ seq: 1, timestamp: "2026-08-25T08:00:00.000Z", taskId: "task-1", type: "task.created", data: { goal: "Fix login" } })}\n${JSON.stringify({ seq: 2, timestamp: "2026-08-25T08:01:00.000Z", taskId: "task-1", type: "task.verified", data: {} })}\n`, "utf8")
    await writeFile(join(workspaceRoot, ".loom", "runs", "task-2", "events.jsonl"), `${JSON.stringify({ seq: 1, timestamp: "2026-08-25T09:00:00.000Z", taskId: "task-2", type: "task.created", data: { goal: "Add a command palette" } })}\n${JSON.stringify({ seq: 2, timestamp: "2026-08-25T09:01:00.000Z", taskId: "task-2", type: "task.blocked", data: {} })}\n`, "utf8")

    await expect(new WorkspaceService().listTasks(workspaceRoot)).resolves.toEqual([
      { taskId: "task-2", goal: "Add a command palette", status: "blocked", timestamp: "2026-08-25T09:01:00.000Z" },
      { taskId: "task-1", goal: "Fix login", status: "verified", timestamp: "2026-08-25T08:01:00.000Z" },
    ])
  })
})

function flattenPaths(nodes: Array<{ relativePath: string; children?: unknown }>): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    paths.push(node.relativePath)
    if (Array.isArray(node.children)) {
      paths.push(...flattenPaths(node.children as Array<{ relativePath: string; children?: unknown }>))
    }
  }
  return paths
}
