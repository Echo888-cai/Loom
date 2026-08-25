// Verifier 使用底层 CommandRunner，但不经过模型审批；这些命令来自本地配置。
import type { EventStore } from "../events/types.js"
import type { CommandRunner } from "../process/runner.js"
import { ExecaCommandRunner } from "../process/runner.js"
import type { VerificationResult, Verifier } from "./types.js"

type Check = VerificationResult["checks"][number]

function environmentWithoutSecrets(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "DEEPSEEK_API_KEY"))
}

function outputOf(stdout: string, stderr: string, max: number): string {
  const combined = [stdout, stderr].filter(Boolean).join("\n")
  return combined.length <= max ? combined : `${combined.slice(0, max)}\n...[truncated]...`
}

/**
 * 基于命令的验证器。
 * 四问：输入是配置命令和任务信息；副作用是运行 git diff/test/build 并追加事件；失败返回 continue/blocked；由 verifier 测试覆盖。
 */
export class CommandVerifier implements Verifier {
  constructor(
    private readonly verificationCommands: string[],
    private readonly runner: CommandRunner = new ExecaCommandRunner(),
    private readonly events?: EventStore,
    private readonly timeoutMs = 120_000,
    private readonly maxOutputChars = 12_000,
  ) {}

  /**
   * 先检查 diff，再运行配置命令。
   * 没有配置命令时不冒充 verified，因为仅有 git diff --check 不能证明功能正确。
   */
  async verify(input: { taskId: string; workspaceRoot: string; filesChanged: string[]; constraints: string[] }): Promise<VerificationResult> {
    const checks: Check[] = []
    const diffCheck = await this.runCheck(input, "git diff --check", "git diff --check")
    checks.push(diffCheck)
    if (!diffCheck.passed) return { status: "continue", checks, evidence: evidenceFor(checks) }
    if (this.verificationCommands.length === 0) return { status: "blocked", checks, evidence: ["No verification commands configured; objective evidence is insufficient."] }

    for (const command of this.verificationCommands) {
      const check = await this.runCheck(input, command, command)
      checks.push(check)
      if (!check.passed) return { status: "continue", checks, evidence: evidenceFor(checks) }
    }
    return { status: "verified", checks, evidence: evidenceFor(checks) }
  }

  /** 单项检查的统一执行、截断和事件记录边界。 */
  private async runCheck(input: { taskId: string; workspaceRoot: string }, name: string, command: string): Promise<Check> {
    await this.events?.append(input.taskId, "verification.started", { name, command })
    try {
      const result = await this.runner.run({ command, cwd: input.workspaceRoot, timeoutMs: this.timeoutMs, signal: new AbortController().signal, env: environmentWithoutSecrets() })
      const output = outputOf(result.stdout, result.stderr, this.maxOutputChars)
      const diagnostic = result.timedOut ? ["Command timed out", output].filter(Boolean).join("\n") : output
      const check: Check = { name, passed: result.exitCode === 0 && !result.timedOut, ...(result.exitCode === null ? {} : { exitCode: result.exitCode }), ...(diagnostic ? { output: diagnostic } : {}) }
      await this.events?.append(input.taskId, "verification.completed", { ...check, timedOut: result.timedOut, durationMs: result.durationMs })
      return check
    } catch (error: unknown) {
      const output = error instanceof Error ? error.message : String(error)
      const check: Check = { name, passed: false, output }
      await this.events?.append(input.taskId, "verification.completed", check)
      return check
    }
  }
}

// 把结构化检查转换成模型和用户都能阅读的证据文本。
function evidenceFor(checks: Check[]): string[] {
  return checks.map((check) => `${check.name}: ${check.passed ? "passed" : "failed"}${check.output ? `\n${check.output}` : ""}`)
}
