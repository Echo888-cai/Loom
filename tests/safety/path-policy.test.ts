import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { assertWorkspacePath, PathPolicyError } from "../../src/safety/path-policy.js"

describe("assertWorkspacePath", () => {
  it("allows an existing file inside the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-path-"))
    await mkdir(join(root, "src"))
    await writeFile(join(root, "src", "a.ts"), "export {}")

    await expect(assertWorkspacePath(root, "src/a.ts")).resolves.toBe(await realpath(root, "src/a.ts"))
  })

  it("rejects paths outside the workspace and protected directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-path-"))
    const outside = await mkdtemp(join(tmpdir(), "loom-outside-"))
    await writeFile(join(outside, "secret.txt"), "secret")
    await mkdir(join(root, ".git"))
    await mkdir(join(root, ".loom"))

    await expect(assertWorkspacePath(root, join(outside, "secret.txt"))).rejects.toBeInstanceOf(PathPolicyError)
    await expect(assertWorkspacePath(root, ".git/config")).rejects.toBeInstanceOf(PathPolicyError)
    await expect(assertWorkspacePath(root, ".loom/config.json")).rejects.toBeInstanceOf(PathPolicyError)
  })

  it("rejects a symlink that resolves outside the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-path-"))
    const outside = await mkdtemp(join(tmpdir(), "loom-outside-"))
    await writeFile(join(outside, "secret.txt"), "secret")
    await symlink(join(outside, "secret.txt"), join(root, "link.txt"))

    await expect(assertWorkspacePath(root, "link.txt")).rejects.toBeInstanceOf(PathPolicyError)
  })
})

async function realpath(root: string, ...parts: string[]): Promise<string> {
  const { realpath: resolveRealpath } = await import("node:fs/promises")
  return resolveRealpath(join(root, ...parts))
}
