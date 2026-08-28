import type { EventRecord } from "../events/types.js"
import type { ModelMessage } from "../model/types.js"
import { contextObjectsToMessages } from "./message-adapter.js"
import { buildContextObjects } from "./object-builder.js"
import { ContextObjectCompiler } from "./types.js"
import { buildMessageContextObjects } from "./message-context-builder.js"
import type { ContextCompiler } from "./compiler.js"

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

  compileMessages(messages: ModelMessage[]): ModelMessage[] {
    const workingSet = this.compiler.compile(buildMessageContextObjects(messages))
    return contextObjectsToMessages(workingSet)
  }
}

/** 适配 AgentLoop 现有接口，让每次模型请求自动经过完整 Pipeline。 */
export class PipelineContextCompiler implements ContextCompiler {
  private readonly pipeline: ContextPipeline

  constructor(maxTokens = 12_000) {
    this.pipeline = new ContextPipeline({ maxTokens })
  }

  compile(input: { goal: string; messages: ModelMessage[] }): ModelMessage[] {
    return this.pipeline.compileMessages(input.messages)
  }
}
