/**
 * Loom 的运行配置加载器。
 *
 * 这层的职责是把两个外部输入转换成一个可信的 RuntimeConfig：
 * 1. 环境变量（尤其是 API Key）；
 * 2. workspace 下可选的 `.loom/config.json`。
 *
 * 注意：TypeScript 类型只在编译期存在，无法阻止错误 JSON 在运行时进入程序，
 * 所以这里还需要 zod 做一次运行时校验。
 */
// Node.js 的文件系统 API。`/promises` 版本会返回 Promise，适合 async/await。
import { readFile, realpath } from "node:fs/promises"
// join 用来以跨平台方式拼接路径，而不是手工写 `/`。
import { join } from "node:path"
// Zod 用来在运行时校验 JSON；TypeScript 类型只在编译期存在，无法校验外部输入。
import { z } from "zod"

// `.loom/config.json` 是不可信输入：文件可能被手工修改，所以先定义允许的形状。
const configFileSchema = z.object({
  verificationCommands: z.array(z.string()).optional(),
  limits: z.object({
    maxModelCalls: z.number().int().positive().optional(),
    maxToolCalls: z.number().int().positive().optional(),
    maxDurationMs: z.number().int().positive().optional(),
    maxToolOutputChars: z.number().int().positive().optional(),
  }).optional(),
})

// 如果用户没有配置，就使用安全的默认上限，避免 Agent 无限调用模型或工具。
const defaultLimits = {
  maxModelCalls: 40,
  maxToolCalls: 80,
  maxDurationMs: 900_000,
  maxToolOutputChars: 12_000,
}

/**
 * 已经完成校验、可以交给运行时使用的配置。
 *
 * 四问：
 * - 输入：`workspaceRoot`、DeepSeek API Key、可选 JSON 配置。
 * - 外部副作用：读取 workspace 和配置文件；不会写文件、不会调用网络。
 * - 失败方式：workspace 不存在、API Key 缺失、JSON 无效或配置类型错误时抛错。
 * - 测试位置：`tests/config.test.ts` 覆盖默认值、配置文件和缺少 API Key。
 */
export type RuntimeConfig = {
  workspaceRoot: string
  deepseekApiKey: string
  verificationCommands: string[]
  limits: {
    maxModelCalls: number
    maxToolCalls: number
    maxDurationMs: number
    maxToolOutputChars: number
  }
}

/**
 * 从当前目录加载 Loom 配置。
 *
 * 四问：
 * - 输入：`cwd` 是候选 workspace；`env` 是环境变量集合，通常传 `process.env`。
 * - 外部副作用：只读本地文件系统；不会修改环境变量，也不会产生网络请求。
 * - 失败方式：抛出 Error；调用 CLI 的上层应捕获并转成用户可读错误。
 * - 测试位置：`tests/config.test.ts`。
 */
export async function loadConfig(cwd: string, env: NodeJS.ProcessEnv): Promise<RuntimeConfig> {
  // realpath 会把相对路径和 symlink 解析为真实路径，后续安全判断有统一基准。
  const workspaceRoot = await realpath(cwd)
  // API Key 只从环境变量读取，不写进仓库配置文件，避免意外提交密钥。
  const deepseekApiKey = env.DEEPSEEK_API_KEY?.trim()
  if (!deepseekApiKey) {
    throw new Error("DEEPSEEK_API_KEY is required")
  }

  let fileConfig: z.infer<typeof configFileSchema> = {}
  try {
    // 配置文件是可选的；不存在时使用上面的默认值。
    const raw = await readFile(join(workspaceRoot, ".loom", "config.json"), "utf8")
    // JSON.parse 返回 unknown 语义上更安全，必须经过 Zod parse 才能使用。
    const parsed: unknown = JSON.parse(raw)
    fileConfig = configFileSchema.parse(parsed)
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      fileConfig = {}
    } else {
      throw error
    }
  }

  // `??` 表示“有用户配置就用用户配置，否则回退默认值”。
  return {
    workspaceRoot,
    deepseekApiKey,
    verificationCommands: fileConfig.verificationCommands ?? [],
    limits: {
      maxModelCalls: fileConfig.limits?.maxModelCalls ?? defaultLimits.maxModelCalls,
      maxToolCalls: fileConfig.limits?.maxToolCalls ?? defaultLimits.maxToolCalls,
      maxDurationMs: fileConfig.limits?.maxDurationMs ?? defaultLimits.maxDurationMs,
      maxToolOutputChars: fileConfig.limits?.maxToolOutputChars ?? defaultLimits.maxToolOutputChars,
    },
  }
}
