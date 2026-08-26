type PanelDividerProps = { value: number; onChange: (value: number) => void }

export function PanelDivider({ value, onChange }: PanelDividerProps) {
  return (
    <button
      className="panel-divider"
      type="button"
      role="separator"
      aria-label="Resize Agent Console"
      aria-orientation="vertical"
      aria-valuemin={320}
      aria-valuemax={520}
      aria-valuenow={value}
      onPointerDown={(event) => {
        const startX = event.clientX
        const startValue = value
        const onMove = (moveEvent: PointerEvent) => onChange(Math.min(520, Math.max(320, startValue + startX - moveEvent.clientX)))
        const onEnd = () => {
          window.removeEventListener("pointermove", onMove)
          window.removeEventListener("pointerup", onEnd)
        }
        window.addEventListener("pointermove", onMove)
        window.addEventListener("pointerup", onEnd, { once: true })
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); onChange(Math.min(520, value + 20)) }
        if (event.key === "ArrowRight") { event.preventDefault(); onChange(Math.max(320, value - 20)) }
      }}
    />
  )
}
