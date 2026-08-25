// execa 负责启动并管理子进程；审批不放在这里，避免底层执行器绕过策略层。
import { execa } from "execa"

/**
 * 底层命令执行器。
 * 四问：输入是命令、workspace cwd、超时、取消信号和净化环境；会产生子进程副作用；超时返回结果、取消 reject；runner 测试覆盖这些分支。
 */
export interface CommandRunner {
  run(input: {
    command: string
    cwd: string
    timeoutMs: number
    signal: AbortSignal
    env: NodeJS.ProcessEnv
  }): Promise<{
    stdout: string
    stderr: string
    exitCode: number | null
    timedOut: boolean
    durationMs: number
  }>
}

/**
 * v0.0 的 macOS zsh 执行器；审批由上层 Shell Tool 负责。
 * 这层只负责“怎么运行”，不负责“允不允许运行”。
 */
export class ExecaCommandRunner implements CommandRunner {
  /**
   * 在固定 cwd 中运行命令。
   * 四问：输入是 CommandRunner 参数；副作用是启动 /bin/zsh 子进程；非零/超时归一化为结果，取消抛 AbortError；由 runner 测试验证。
   */
  async run(input: Parameters<CommandRunner["run"]>[0]): Promise<Awaited<ReturnType<CommandRunner["run"]>>> {
    input.signal.throwIfAborted()
    const startedAt = Date.now()
    const result = await execa("/bin/zsh", ["-lc", input.command], {
      cwd: input.cwd,
      env: input.env,
      extendEnv: false,
      reject: false,
      cancelSignal: input.signal,
      timeout: input.timeoutMs,
      killSignal: "SIGTERM",
      forceKillAfterDelay: 250,
      maxBuffer: 10 * 1024 * 1024,
    })
    if (input.signal.aborted) {
      const error = new Error("The operation was aborted")
      error.name = "AbortError"
      throw error
    }
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? null,
      timedOut: result.timedOut ?? false,
      durationMs: Date.now() - startedAt,
    }
  }
}
