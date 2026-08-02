import type { ThemePreference } from "@/types"

export type ResolvedTheme = "light" | "dark"

const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)"
const SETTINGS_STORAGE_KEY = "dw-settings"

function prefersDarkSystemTheme(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(THEME_MEDIA_QUERY).matches
  )
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark = prefersDarkSystemTheme(),
): ResolvedTheme {
  if (preference === "dark") return "dark"
  if (preference === "light") return "light"
  return prefersDark ? "dark" : "light"
}

export function getThemeMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null
  return window.matchMedia(THEME_MEDIA_QUERY)
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolvedTheme = resolveTheme(preference)
  if (typeof document === "undefined") return resolvedTheme

  const root = document.documentElement
  root.classList.toggle("dark", resolvedTheme === "dark")
  root.dataset.theme = resolvedTheme
  root.style.colorScheme = resolvedTheme
  return resolvedTheme
}

function readStoredTheme(): ThemePreference {
  if (typeof localStorage === "undefined") return "system"

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return "system"
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const state =
      parsed.state && typeof parsed.state === "object"
        ? (parsed.state as Record<string, unknown>)
        : parsed
    return state.theme === "light" || state.theme === "dark" || state.theme === "system"
      ? state.theme
      : "system"
  } catch {
    return "system"
  }
}

/** 在 React 挂载前恢复主题，避免已保存的深色主题出现一帧浅色闪烁。 */
export function applyStoredTheme(): ResolvedTheme {
  return applyTheme(readStoredTheme())
}
