import type { ButtonHTMLAttributes, ReactNode } from "react"

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 32 | 36; children: ReactNode }

export function IconButton({ label, size = 32, children, ...props }: IconButtonProps) {
  return <button {...props} type={props.type ?? "button"} className="icon-button" data-size={size} aria-label={label}>{children}</button>
}
