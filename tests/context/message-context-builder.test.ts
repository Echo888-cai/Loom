import { describe, expect, it } from "vitest"
import { buildMessageContextObjects } from "../../src/context/message-context-builder.js"
import type { ModelMessage } from "../../src/model/types.js"

describe("Message context builder", () => {
  it("keeps the original message protocol inside each context object", () => {
    const message: ModelMessage = {
      role: "assistant",
      content: null,
      toolCalls: [{ id: "call-1", name: "read_file", argumentsJson: "{}" }],
    }

    const [object] = buildMessageContextObjects([message])

    expect(object.message).toEqual(message)
    expect(object.kind).toBe("conversation")
  })
})
