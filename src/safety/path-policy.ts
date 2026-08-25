// realpath 用来识别 symlink 最终指向哪里；不能只检查字符串路径。
import { access, realpath } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

// 工具遇到安全违规时使用专门错误类型，调用方可以和普通 I/O 错误区分。
export class PathPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PathPolicyError"
  }
}

export async function assertWorkspacePath(root: string, requested: string, options: { allowMissing?: boolean } = {}): Promise<string> {
  // 统一把 workspace root 解析为真实路径。
  const workspace = await realpath(root)
  // resolve 既支持相对路径，也支持模型传来的绝对路径。
  const candidate = resolve(workspace, requested)
  const relRequested = relative(workspace, candidate)
  // Loom 的事件和配置目录不能被普通工具读写，避免 Agent 修改自己的审计记录。
  if (relRequested === ".git" || relRequested.startsWith(".git/") || relRequested === ".loom" || relRequested.startsWith(".loom/")) {
    throw new PathPolicyError("Access to protected Loom metadata is not allowed")
  }
  // relative 以 `..` 开头，说明 candidate 在 workspace 外。
  if (relRequested.startsWith("..") || isAbsolute(relRequested)) throw new PathPolicyError("Path is outside workspace")
  try {
    // 第二次 realpath 是关键：workspace 内的 symlink 可能跳到 workspace 外。
    const resolved = await realpath(candidate)
    const rel = relative(workspace, resolved)
    if (rel.startsWith("..") || isAbsolute(rel)) throw new PathPolicyError("Path resolves outside workspace")
    return resolved
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && options.allowMissing) return candidate
    if (error instanceof PathPolicyError) throw error
    // 将底层 ENOENT 等细节统一成稳定的领域错误，避免模型看到难懂的系统栈。
    await access(candidate).catch(() => undefined)
    throw new PathPolicyError(`Path does not exist: ${requested}`)
  }
}
