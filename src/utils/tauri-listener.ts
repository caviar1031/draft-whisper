import type { UnlistenFn } from "@tauri-apps/api/event"

function releaseListener(unlisten: UnlistenFn) {
  window.setTimeout(() => {
    void Promise.resolve()
      .then(() => unlisten())
      .catch(() => undefined)
  }, 0)
}

export function registerTauriListener(register: () => Promise<UnlistenFn>): () => void {
  let disposed = false
  let unlisten: UnlistenFn | undefined

  // React StrictMode immediately replays effects in development. Deferring registration
  // prevents Tauri from being asked to unlisten before its WebView registry is populated.
  const registrationTimer = window.setTimeout(() => {
    if (disposed) return

    void register()
      .then((registeredUnlisten) => {
        if (disposed) {
          releaseListener(registeredUnlisten)
          return
        }
        unlisten = registeredUnlisten
      })
      .catch(() => undefined)
  }, 0)

  return () => {
    disposed = true
    window.clearTimeout(registrationTimer)
    if (!unlisten) return

    releaseListener(unlisten)
    unlisten = undefined
  }
}
