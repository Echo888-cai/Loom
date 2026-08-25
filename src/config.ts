import { readFile } from "node:fs/promises"
import { realpath } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"

const configFileSchema = z.object({
  verificationCommands: z.array(z.string()).optional(),
  limits: z.object({
    maxModelCalls: z.number().int().positive().optional(),
    maxToolCalls: z.number().int().positive().optional(),
    maxDurationMs: z.number().int().positive().optional(),
    maxToolOutputChars: z.number().int().positive().optional(),
  }).optional(),
})

const defaultLimits = {
  maxModelCalls: 40,
  maxToolCalls: 80,
  maxDurationMs: 900_000,
  maxToolOutputChars: 12_000,
}

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
  const workspaceRoot = await realpath(cwd)
  const deepseekApiKey = env.DEEPSEEK_API_KEY?.trim()
  if (!deepseekApiKey) {
    throw new Error("DEEPSEEK_API_KEY is required")
  }

  let fileConfig: z.infer<typeof configFileSchema> = {}
  try {
    const raw = await readFile(join(workspaceRoot, ".loom", "config.json"), "utf8")
    const parsed: unknown = JSON.parse(raw)
    fileConfig = configFileSchema.parse(parsed)
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      fileConfig = {}
    } else {
      throw error
    }
  }

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
