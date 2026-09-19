import { MoonIcon, SunIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "halisicheck-theme"

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark)
}

export function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored === "dark"
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  })

  useEffect(() => {
    applyTheme(dark)
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light")
  }, [dark])

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setDark((d) => !d)}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
    </Button>
  )
}
