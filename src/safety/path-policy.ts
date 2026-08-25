// realpath 用来识别 symlink 最终指向哪里；不能只检查字符串路径。
import { access, realpath } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

/**
 * 工具遇到安全违规时使用的领域错误。
 * 四问：输入是错误消息；构造本身无副作用；调用方可以捕获它；路径测试验证其类型。
 */
// 工具遇到安全违规时使用专门错误类型，调用方可以和普通 I/O 错误区分。
export class PathPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PathPolicyError"
  }
}

/**
 * 将用户/模型提供的路径解析成允许访问的真实路径。
 *
 * 四问：
 * - 输入：workspace root、请求路径、可选 allowMissing。
 * - 外部副作用：只读 realpath/access；不会写文件或执行命令。
 * - 失败方式：workspace 外、保护目录、symlink 越界或路径不存在时 reject PathPolicyError。
 * - 测试位置：`tests/safety/path-policy.test.ts` 覆盖合法路径、越界路径、保护目录和 symlink。
 */
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
