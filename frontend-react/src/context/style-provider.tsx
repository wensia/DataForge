import { createContext, useContext, useEffect, useState } from 'react'
import { styles, DEFAULT_STYLE, styleConfig, type Style } from '@/config/styles'
import { getCookie, setCookie, removeCookie } from '@/lib/cookies'

const STYLE_COOKIE_NAME = 'visual-style'
const STYLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

type StyleContextType = {
  style: Style
  setStyle: (style: Style) => void
  resetStyle: () => void
  currentConfig: (typeof styleConfig)[Style]
}

const StyleContext = createContext<StyleContextType | null>(null)

export function StyleProvider({ children }: { children: React.ReactNode }) {
  const [style, _setStyle] = useState<Style>(() => {
    const savedStyle = getCookie(STYLE_COOKIE_NAME)
    return styles.includes(savedStyle as Style)
      ? (savedStyle as Style)
      : DEFAULT_STYLE
  })

  useEffect(() => {
    const root = document.documentElement

    // Remove all existing style classes
    styles.forEach((s) => {
      root.classList.remove(`style-${s}`)
    })

    // Add current style class
    root.classList.add(`style-${style}`)

    // Update CSS custom property for radius
    const config = styleConfig[style]
    root.style.setProperty('--radius', config.radius)
  }, [style])

  const setStyle = (newStyle: Style) => {
    setCookie(STYLE_COOKIE_NAME, newStyle, STYLE_COOKIE_MAX_AGE)
    _setStyle(newStyle)
  }

  const resetStyle = () => {
    removeCookie(STYLE_COOKIE_NAME)
    _setStyle(DEFAULT_STYLE)
  }

  const currentConfig = styleConfig[style]

  return (
    <StyleContext value={{ style, setStyle, resetStyle, currentConfig }}>
      {children}
    </StyleContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStyle() {
  const context = useContext(StyleContext)
  if (!context) {
    throw new Error('useStyle must be used within a StyleProvider')
  }
  return context
}
