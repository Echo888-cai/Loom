type LoomLogoProps = { size?: number }

/** 原创的双线交织 Loom 标记：不是任何现有 Coding Agent 的变形或引用。 */
export function LoomLogo({ size = 20 }: LoomLogoProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 7.5C5 5.57 6.57 4 8.5 4h2.25c1.93 0 3.5 1.57 3.5 3.5v9c0 1.93-1.57 3.5-3.5 3.5H8.5A3.5 3.5 0 0 1 5 16.5v-9Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10 7.5C10 5.57 11.57 4 13.5 4h2A3.5 3.5 0 0 1 19 7.5v9c0 1.93-1.57 3.5-3.5 3.5h-2A3.5 3.5 0 0 1 10 16.5v-9Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
