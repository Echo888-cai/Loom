import { createInterface } from "node:readline/promises"
import { stdin, stdout } from "node:process"
import type { ApprovalGate, ApprovalRequest, ApprovalDecision } from "../safety/approval.js"

export class ReadlineApprovalGate implements ApprovalGate {
  async request(input: ApprovalRequest): Promise<ApprovalDecision> {
    const readline = createInterface({ input: stdin, output: stdout })
    try {
      const answer = await readline.question(`\nShell command requested:\n  ${input.command}\n  cwd: ${input.cwd}\n  reason: ${input.reason}\nAllow? [y/N] `)
      return answer.trim().toLowerCase() === "y" ? "allow" : "deny"
    } finally {
      readline.close()
    }
  }
}
