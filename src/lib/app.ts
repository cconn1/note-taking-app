import { useEffect } from 'react'

// Shown by Layout's error bar.
export const showError = (message: string) => window.dispatchEvent(new CustomEvent('app-error', { detail: message }))

// Load now, and again whenever the app comes back to the foreground (no Realtime; this is how other devices' edits arrive).
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
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [load])
}
