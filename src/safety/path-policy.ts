import { access, realpath } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

export class PathPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PathPolicyError"
  }
}

export async function assertWorkspacePath(root: string, requested: string, options: { allowMissing?: boolean } = {}): Promise<string> {
  const workspace = await realpath(root)
  const candidate = resolve(workspace, requested)
  const relRequested = relative(workspace, candidate)
  if (relRequested === ".git" || relRequested.startsWith(".git/") || relRequested === ".loom" || relRequested.startsWith(".loom/")) {
    throw new PathPolicyError("Access to protected Loom metadata is not allowed")
  }
  if (relRequested.startsWith("..") || isAbsolute(relRequested)) throw new PathPolicyError("Path is outside workspace")
  try {
    const resolved = await realpath(candidate)
    const rel = relative(workspace, resolved)
    if (rel.startsWith("..") || isAbsolute(rel)) throw new PathPolicyError("Path resolves outside workspace")
    return resolved
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && options.allowMissing) return candidate
    if (error instanceof PathPolicyError) throw error
    await access(candidate).catch(() => undefined)
    throw new PathPolicyError(`Path does not exist: ${requested}`)
  }
}
