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

// 这是 Loom 运行时真正依赖的配置对象。
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
