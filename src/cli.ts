import { LoomRuntime } from "./runtime.js"
import type { RunResult } from "./agent/loop.js"
import type { EventRecord } from "./events/types.js"
import { ReadlineApprovalGate } from "./cli/approval.js"
import { formatEvents, formatRunResult } from "./cli/format.js"

export interface CliRuntime {
  run(goal: string, cwd: string): Promise<RunResult>
  resume(taskId: string, cwd: string): Promise<RunResult>
  replay(taskId: string, cwd: string): Promise<EventRecord[]>
}

export type CliOutput = { write(line: string): void }

export async function main(argv = process.argv.slice(2), runtime: CliRuntime = new LoomRuntime({ approvalGate: new ReadlineApprovalGate() }), output: CliOutput = { write: (line) => console.log(line) }): Promise<number> {
  const command = argv[0]
  const cwdIndex = argv.indexOf("--cwd")
  const cwd = cwdIndex >= 0 ? argv[cwdIndex + 1] ?? process.cwd() : process.cwd()
  const positional = argv.filter((value, index) => value !== "--cwd" && !(cwdIndex >= 0 && index === cwdIndex + 1))
  try {
    if (command === "run") {
      const goal = positional.slice(1).join(" ").trim()
      if (!goal) throw new Error("Usage: loom run <goal> [--cwd <workspace>]")
      output.write(formatRunResult(await runtime.run(goal, cwd)))
      return 0
    }
    if (command === "resume") {
      const taskId = positional[1]
      if (!taskId) throw new Error("Usage: loom resume <task-id> [--cwd <workspace>]")
      output.write(formatRunResult(await runtime.resume(taskId, cwd)))
      return 0
    }
    if (command === "replay") {
      const taskId = positional[1]
      if (!taskId) throw new Error("Usage: loom replay <task-id> [--cwd <workspace>]")
      output.write(formatEvents(await runtime.replay(taskId, cwd)))
      return 0
    }
    output.write("Usage: loom <run|resume|replay> ...")
    return 1
  } catch (error: unknown) {
    output.write(`Error: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
