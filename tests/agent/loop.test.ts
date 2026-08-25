import { describe, expect, it } from "vitest"
import type { EventRecord, EventStore } from "../../src/events/types.js"
import { AgentLoop } from "../../src/agent/loop.js"
import type { ModelMessage, ModelProvider, ModelRequest, ModelResponse } from "../../src/model/types.js"
import type { ToolContext, ToolRegistry, ToolResult } from "../../src/tools/types.js"

class MemoryEventStore implements EventStore {
  readonly events: EventRecord[] = []
  async append<T>(taskId: string, type: string, data: T): Promise<EventRecord<T>> {
    const event = { seq: this.events.length + 1, timestamp: new Date(0).toISOString(), taskId, type, data } as EventRecord<T>
    this.events.push(event)
    return event
  }
  async readAll(): Promise<EventRecord[]> { return this.events }
}

class FakeProvider implements ModelProvider {
  readonly requests: ModelRequest[] = []
  private index = 0
  constructor(private readonly responses: ModelResponse[]) {}
  async complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request)
    const response = this.responses[this.index]
    this.index += 1
    if (!response) throw new Error("FakeProvider ran out of responses")
    return response
  }
}

class FakeRegistry implements ToolRegistry {
  readonly calls: Array<{ name: string; input: unknown }> = []
  schemas() { return [{ type: "function" as const, function: { name: "read_file", description: "fake", parameters: { type: "object" } } }, { type: "function" as const, function: { name: "search", description: "fake", parameters: { type: "object" } } }] }
  async execute(name: string, _context: ToolContext, input: unknown): Promise<ToolResult> {
    this.calls.push({ name, input })
    return { ok: true, content: `${name} result` }
  }
}

describe("AgentLoop", () => {
  it("feeds assistant tool calls and tool results into the next model request", async () => {
    const provider = new FakeProvider([
      { content: null, toolCalls: [{ id: "call-1", name: "read_file", argumentsJson: '{"path":"a.ts"}' }], usage: { inputTokens: 1, outputTokens: 2 } },
      { content: null, toolCalls: [{ id: "call-2", name: "search", argumentsJson: '{"query":"token"}' }] },
      { content: "Finished inspecting the repository.", toolCalls: [] },
    ])
    const registry = new FakeRegistry()
    const store = new MemoryEventStore()
    const result = await new AgentLoop(provider, registry, store, { maxModelCalls: 5, maxToolCalls: 5, maxDurationMs: 10_000 }).run({ taskId: "task-1", goal: "inspect repo", workspaceRoot: "/tmp/repo" })

    expect(result).toMatchObject({ status: "candidate_done", modelCalls: 3, toolCalls: 2, steps: 3 })
    expect(provider.requests[1]?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "assistant" }),
      { role: "tool", toolCallId: "call-1", content: "read_file result" },
    ]))
    expect(provider.requests[2]?.messages.at(-1)).toEqual({ role: "tool", toolCallId: "call-2", content: "search result" })
    expect(registry.calls).toEqual([{ name: "read_file", input: { path: "a.ts" } }, { name: "search", input: { query: "token" } }])
    expect(store.events.map((event) => event.type)).toEqual([
      "task.created", "model.requested", "model.responded", "tool.requested", "tool.completed",
      "model.requested", "model.responded", "tool.requested", "tool.completed",
      "model.requested", "model.responded", "task.candidate_done",
    ])
  })

  it("blocks when the model-call limit is reached", async () => {
    const provider = new FakeProvider([{ content: null, toolCalls: [{ id: "call-1", name: "search", argumentsJson: '{"query":"x"}' }] }])
    const store = new MemoryEventStore()
    const result = await new AgentLoop(provider, new FakeRegistry(), store, { maxModelCalls: 1, maxToolCalls: 5, maxDurationMs: 10_000 }).run({ taskId: "task-2", goal: "keep going", workspaceRoot: "/tmp/repo" })

    expect(result).toMatchObject({ status: "blocked", modelCalls: 1 })
    expect(store.events.at(-1)?.type).toBe("task.blocked")
  })
})
