# Loom Desktop Workbench Override

This page override replaces the generated dark palette and landing-page pattern in `../MASTER.md`.

## Approved Direction

- Product surface: native desktop coding-agent workbench.
- Visual reference: Cursor efficiency, Apple-level restraint, Claude Code process clarity.
- Layout: code-first three-panel workspace with a stronger Agent Console on the right.
- Theme: light only for v0.1; dark mode is out of scope until the light system is verified.
- Density: 8/10; motion: 4/10; variance: 3/10.

## Semantic Color Tokens

| Token | Value | Purpose |
|---|---:|---|
| `--surface-app` | `#F7F7F8` | Window background |
| `--surface-primary` | `#FFFFFF` | Editor and Agent Console |
| `--surface-subtle` | `#FCFCFC` | Explorer rail |
| `--text-primary` | `#111827` | Primary text |
| `--text-secondary` | `#4B5563` | Secondary text |
| `--text-muted` | `#6B7280` | Supporting information; must still meet contrast target |
| `--border-subtle` | `#E5E7EB` | Panel boundaries |
| `--accent-primary` | `#2563EB` | Focus, selected state, primary action |
| `--accent-soft` | `#EFF6FF` | Selected background and thinking state |
| `--success` | `#15805E` | Verified evidence |
| `--success-soft` | `#EDF9F4` | Evidence background |
| `--attention` | `#9A5B17` | Approval required |
| `--attention-soft` | `#FFF8EC` | Approval surface |
| `--danger` | `#B42318` | Failed and destructive states |

## Layout

```text
Header: 58px, repository and current task only
Explorer: 205px, collapsible
Code workspace: flexible, minimum 520px
Agent Console: 365px, resizable 320–520px
```

Do not show a generic connection badge, encoding, language mode, cursor position, or decorative status bar. Surface information only when it affects the current decision.

## Agent Console

- Preserve full provider reasoning when `reasoningContent` exists.
- Never fabricate reasoning for providers that do not expose it.
- Use a compact thinking animation while a model call is active.
- Show a chronological execution frontier: done, current, next, verification evidence.
- Keep approvals anchored at the bottom without obscuring keyboard focus.
- Tool details use progressive disclosure; essential result stays visible, raw output expands on demand.

## Motion

- Hover/focus: 160ms ease-out.
- Panel open/close: 220ms cubic-bezier(0.2, 0.8, 0.2, 1).
- Thinking indicator: quiet rotation/pulse; no decorative bouncing or large spatial movement.
- Respect `prefers-reduced-motion`; replace continuous motion with a static state label.

## Typography and Icons

- UI: system font stack led by SF Pro on macOS; no remote font request.
- Code: system monospace stack led by SF Mono; JetBrains Mono is optional, not downloaded at runtime.
- Icons: Phosphor outline family, 1.5px visual weight, SVG only, accessible names on icon-only controls.
- Logo: original interlocking-thread mark; geometric, monochrome, no gradient and no borrowed brand silhouette.
