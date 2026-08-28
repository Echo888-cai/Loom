import { describe, expect, it } from "vitest"
import { buildContextObjects } from "../../src/context/object-builder.js"
import type { EventRecord } from "../../src/events/types.js"

describe("Context object builder", () => {
  it("marks an earlier file read obsolete after that file changes", () => {
    const events: EventRecord[] = [
      { seq: 1, timestamp: "1", taskId: "t", type: "tool.completed", data: { name: "read_file", path: "src/auth.ts", content: "old" } },
      { seq: 2, timestamp: "2", taskId: "t", type: "file.changed", data: { path: "src/auth.ts" } },
    ]

    const result = buildContextObjects(events)

    expect(result.find((object) => object.id === "tool-1")?.state).toBe("obsolete")
    expect(result.find((object) => object.id === "file-2")?.state).toBe("active")
    expect(result.find((object) => object.id === "tool-1")?.sourceKey).toBe("file:src/auth.ts")
    expect(result.find((object) => object.id === "file-2")?.sourceKey).toBe("file:src/auth.ts")
  })
})
