// 应用图标 — 五条波形竖线，取自设计稿 NavBar 中的内联 SVG
interface AppIconProps {
  className?: string
}

export function AppIcon({ className }: AppIconProps) {
  return (
    <svg
      className={className ?? "dw-app-icon"}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="8" width="2.5" height="4" rx="1" fill="currentColor" />
      <rect x="5" y="5" width="2.5" height="10" rx="1" fill="currentColor" />
      <rect x="9" y="3" width="2.5" height="14" rx="1" fill="currentColor" />
      <rect x="13" y="6" width="2.5" height="8" rx="1" fill="currentColor" />
      <rect x="17" y="7.5" width="2.5" height="5" rx="1" fill="currentColor" />
    </svg>
  )
}
