import { useEffect, useState } from 'react'
import { useUi } from '@/store/ui'

/** Applies the chosen theme to <html> and reports the effective mode. Honours the OS setting in 'system' mode and an explicit data-theme set by a host page. */
export function useTheme() {
  const theme = useUi((s) => s.theme)
  const [effective, setEffective] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const host = document.documentElement.getAttribute('data-theme')
      const dark = theme === 'dark' || (theme === 'system' && (host === 'dark' || (host !== 'light' && mq.matches)))
      document.documentElement.classList.toggle('dark', dark)
      setEffective(dark ? 'dark' : 'light')
    }
    apply()
    mq.addEventListener('change', apply)
    const obs = new MutationObserver(apply)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', apply)
      obs.disconnect()
    }
  }, [theme])
  return effective
}
