import { mkdir, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { EventRecord, EventStore } from "../../src/events/types.js"
import { createFinishTaskTool } from "../../src/tools/finish-task.js"
import type { VerificationResult, Verifier } from "../../src/verification/types.js"
import type { ToolContext } from "../../src/tools/types.js"

class MemoryEventStore implements EventStore {
  readonly events: EventRecord[] = []
  async append<T>(taskId: string, type: string, data: T): Promise<EventRecord<T>> {
    const event = { seq: this.events.length + 1, timestamp: new Date(0).toISOString(), taskId, type, data } as EventRecord<T>
    this.events.push(event)
    return event
  }
  async readAll(): Promise<EventRecord[]> { return this.events }
}

class FakeVerifier implements Verifier {
  constructor(private readonly result: VerificationResult) {}
  async verify() { return this.result }
}

async function context(root: string, verifier: Verifier, eventStore: EventStore): Promise<ToolContext> {
  const rawDir = join(root, "raw")
  await mkdir(rawDir, { recursive: true })
  return { workspaceRoot: root, taskId: "task-finish", signal: new AbortController().signal, maxOutputChars: 200, rawDir, verifier, eventStore }
}

describe("finish_task", () => {
  it("returns verification evidence and does not claim verified on continue", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-finish-"))
    const events = new MemoryEventStore()
    const result = await createFinishTaskTool().execute(await context(root, new FakeVerifier({ status: "continue", checks: [{ name: "pnpm test", passed: false, exitCode: 1, output: "failed" }], evidence: ["pnpm test failed"] }), events), { summary: "Fixed auth", filesChanged: ["src/auth.ts"], verificationClaim: "Tests pass", remainingRisks: [] })

    expect(result.ok).toBe(true)
    expect(result.metadata).toMatchObject({ verificationStatus: "continue" })
    expect(result.content).toContain("pnpm test failed")
    expect(events.events.map((event) => event.type)).toEqual(["task.verification_continue"])
  })

  it("records task.verified only after verifier passes", async () => {
    const root = await mkdtemp(join(tmpdir(), "loom-finish-"))
    const events = new MemoryEventStore()
    const result = await createFinishTaskTool().execute(await context(root, new FakeVerifier({ status: "verified", checks: [{ name: "pnpm test", passed: true, exitCode: 0, output: "ok" }], evidence: ["all checks passed"] }), events), { summary: "Fixed auth", filesChanged: ["src/auth.ts"], verificationClaim: "Tests pass", remainingRisks: [] })

    expect(result.metadata).toMatchObject({ verificationStatus: "verified" })
    expect(events.events.map((event) => event.type)).toEqual(["task.verified"])
  })
})
