import { describe, expect, it } from "vitest"
import { ContextObjectCompiler, filterContextObjects, type ContextObject } from "../../src/context/types.js"

describe("Context lifecycle", () => {
  it("keeps active objects and hides obsolete objects", () => {
    const objects: ContextObject[] = [
      { id: "active", kind: "test", content: "failed", state: "active", importance: 1, relevance: 1, freshness: 1 },
      { id: "resolved", kind: "test", content: "passed", state: "resolved", importance: 0.5, relevance: 0.5, freshness: 0.5 },
      { id: "obsolete", kind: "code", content: "old code", state: "obsolete", importance: 1, relevance: 1, freshness: 0 },
    ]

    expect(filterContextObjects(objects)).toEqual([
      objects[0],
      { ...objects[1], content: "[resolved] passed" },
    ])
  })

  it("filters lifecycle first, then applies a token budget", () => {
    const objects: ContextObject[] = [
      { id: "active", kind: "test", content: "important failure", state: "active", importance: 1, relevance: 1, freshness: 1 },
      { id: "resolved", kind: "test", content: "old success", state: "resolved", importance: 0.2, relevance: 0.2, freshness: 0.2 },
      { id: "obsolete", kind: "code", content: "obsolete code", state: "obsolete", importance: 1, relevance: 1, freshness: 0 },
    ]

    const result = new ContextObjectCompiler({ maxTokens: 5 }).compile(objects)

    expect(result.map((object) => object.id)).toEqual(["active"])
  })
})
