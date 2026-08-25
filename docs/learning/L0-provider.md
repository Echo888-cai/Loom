# L0：Model Provider 与 Tool Call

## 这一层学什么

DeepSeek 是模型提供商，Loom 是 Harness。Provider 的工作不是执行工具，而是把两套消息格式互相转换：

```text
Loom ModelRequest
        ↓
DeepSeek Chat Completion
        ↓
Loom ModelResponse
```

模型返回 read_file 的请求时，模型只生成工具名称和 JSON 参数；真正读取文件的代码属于 Loom。

## 为什么要有 Adapter

如果 Agent Loop 直接依赖 OpenAI SDK，未来换模型时，循环逻辑也会被 API 格式绑住。DeepSeekProvider 把外部格式限制在一层，AgentLoop 只看 ModelMessage、ToolCall 和 ModelResponse。

## Tool Call 的关键字段

- id：用于把后续 Tool Result 对回这一次调用。
- name：工具注册表中的名称。
- arguments：模型生成的 JSON 字符串，必须在执行前解析和校验。

即使模型返回了非法 JSON，Loom 也不能把它直接传给工具；当前 Provider 会在边界处拒绝它。

## 可替换 Transport

测试使用内存 Transport，不触发真实 API；生产使用 OpenAI JavaScript SDK，但 baseURL 指向 DeepSeek。这样可以独立测试消息转换、错误和取消行为。

## 故意失败实验

把测试中的 tool call arguments 改成 not-json。测试必须失败，并且失败发生在工具执行之前。这说明模型输出不是可信输入，Harness 必须先做边界校验。
