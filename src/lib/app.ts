import { useEffect } from 'react'

// Shown by Layout's error bar.
export const showError = (message: string) => window.dispatchEvent(new CustomEvent('app-error', { detail: message }))

// Tell the open screen to reload, e.g. after Quick Add creates a task.
export const refresh = () => window.dispatchEvent(new Event('app-refresh'))

// Load now, again whenever the app comes back to the foreground (no Realtime; this is how other
// devices' edits arrive), and on refresh().
export function useLoad(load: () => void) {
  useEffect(() => {
    load()
    let last = Date.now()
    const onVisible = () => {
      // focus and visibilitychange often fire together; load once.
      if (document.visibilityState !== 'visible' || Date.now() - last < 1000) return
      last = Date.now()
      load()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('app-refresh', load)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('app-refresh', load)
    }
  }, [load])
}
