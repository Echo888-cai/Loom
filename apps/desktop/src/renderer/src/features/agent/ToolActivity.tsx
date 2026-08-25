import { useState } from "react"
import type { FrontierItem } from "../../state/event-projection.js"

/** 工具原始输出通常很长；默认只留结果首行，用户需要时再展开完整持久化内容。 */
export function ToolActivity({ items }: { items: FrontierItem[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const toggle = (index: number) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    return next
  })
  return <section className="agent-section"><h2>Completed</h2>{items.map((item, index) => <div className="agent-row" key={`${item.label}-${index}`}><strong>{item.label}</strong>{item.summary ? <span>{item.summary}</span> : null}{item.detail && item.detail !== item.summary ? <><button className="tool-output-toggle" type="button" aria-label={`${expanded.has(index) ? "Hide" : "Show"} output for ${item.label}`} aria-expanded={expanded.has(index)} onClick={() => toggle(index)}>{expanded.has(index) ? "Hide output" : "Show output"}</button>{expanded.has(index) ? <pre className="tool-output">{item.detail}</pre> : null}</> : null}</div>)}</section>
}
