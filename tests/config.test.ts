import { mkdtemp, realpath, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadConfig } from "../src/config.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  const { rm } = await import("node:fs/promises")
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function makeWorkspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "loom-config-"))
  temporaryDirectories.push(directory)
  return directory
}

describe("loadConfig", () => {
  it("loads defaults and normalizes the workspace root", async () => {
    const workspace = await makeWorkspace()
    await writeFile(join(workspace, ".loom-config-parent-marker"), "ok")

    const config = await loadConfig(workspace, { DEEPSEEK_API_KEY: "test-key" })

    expect(config.workspaceRoot).toBe(await realpath(workspace))
    expect(config.deepseekApiKey).toBe("test-key")
    expect(config.verificationCommands).toEqual([])
    expect(config.limits).toEqual({
      maxModelCalls: 40,
      maxToolCalls: 80,
      maxDurationMs: 900_000,
      maxToolOutputChars: 12_000,
    })
  })

  it("loads verification commands from .loom/config.json", async () => {
    const workspace = await makeWorkspace()
    await import("node:fs/promises").then(({ mkdir }) => mkdir(join(workspace, ".loom")))
    await writeFile(
      join(workspace, ".loom", "config.json"),
      JSON.stringify({ verificationCommands: ["pnpm test"], limits: { maxModelCalls: 5 } }),
    )

    const config = await loadConfig(workspace, { DEEPSEEK_API_KEY: "test-key" })

    expect(config.verificationCommands).toEqual(["pnpm test"])
    expect(config.limits.maxModelCalls).toBe(5)
    expect(config.limits.maxToolCalls).toBe(80)
  })

  it("requires a DeepSeek API key", async () => {
    const workspace = await makeWorkspace()

    await expect(loadConfig(workspace, {})).rejects.toThrow("DEEPSEEK_API_KEY")
  })
})
