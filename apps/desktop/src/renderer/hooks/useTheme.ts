import { useCallback, useEffect, useState } from 'react'

let storedPreference: 'light' | 'dark' | null = null

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getCurrentTheme(): 'light' | 'dark' {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return storedPreference ?? getSystemTheme()
}

export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>(getCurrentTheme())

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (storedPreference === null) {
        const system = getSystemTheme()
        document.documentElement.setAttribute('data-theme', system)
        setThemeState(system)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const setTheme = useCallback((next: 'light' | 'dark') => {
    storedPreference = next
    document.documentElement.setAttribute('data-theme', next)
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }, [theme, setTheme])

  return { theme, toggleTheme, setTheme }
}
