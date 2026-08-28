import { describe, expect, it } from "vitest"
import { contextObjectsToMessages } from "../../src/context/message-adapter.js"
import type { ContextObject } from "../../src/context/types.js"

describe("context object message adapter", () => {
  it("turns a working set into labeled model messages", () => {
    const objects: ContextObject[] = [
      { id: "state-1", kind: "state", content: "CURRENT: run tests", state: "active", importance: 1, relevance: 1, freshness: 1 },
      { id: "test-1", kind: "test", content: "auth failed", state: "active", importance: 1, relevance: 1, freshness: 1 },
    ]

    expect(contextObjectsToMessages(objects)).toEqual([
      { role: "user", content: "[state]\nCURRENT: run tests" },
      { role: "user", content: "[test]\nauth failed" },
    ])
  })
})
