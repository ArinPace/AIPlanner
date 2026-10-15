import { useEffect } from 'react'
import { agentAction } from './agent'

// User interaction extends the idle lease. API polling and an untouched open
// page do not keep a VM running indefinitely.
export function useVmActivity(username: string) {
  useEffect(() => {
    let lastSent = 0
    function report() {
      if (document.visibilityState !== 'visible' || Date.now() - lastSent < 60000) return
      lastSent = Date.now()
      void agentAction('vm/activity').catch(() => {})
    }
    report()
    const events = ['pointerdown','pointermove','keydown','wheel','touchstart'] as const
    for (const event of events) window.addEventListener(event, report, { passive: true })
    document.addEventListener('visibilitychange', report)
    return () => {
      for (const event of events) window.removeEventListener(event, report)
      document.removeEventListener('visibilitychange', report)
    }
  }, [username])
}
