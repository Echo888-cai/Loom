import type { EventRecord } from "../events/types.js"
import type { ModelMessage } from "../model/types.js"
import { contextObjectsToMessages } from "./message-adapter.js"
import { buildContextObjects } from "./object-builder.js"
import { ContextObjectCompiler } from "./types.js"

/** Context Engine 的组合入口：事件是事实，消息是最终给模型的传输格式。 */
export class ContextPipeline {
  private readonly compiler: ContextObjectCompiler

  constructor(options: { maxTokens: number }) {
    this.compiler = new ContextObjectCompiler(options)
  }

  compile(events: EventRecord[]): ModelMessage[] {
    const workingSet = this.compiler.compile(buildContextObjects(events))
    return contextObjectsToMessages(workingSet)
  }
}
