import { create } from "zustand"
import type { Dialect } from "@/types/detection.types"
import type { AuthUser } from "@/types/api.types"
import { readToken, writeToken } from "@/api/client"

interface AppState {
  /** Active rewrite dialect, shared between the toggle and the diff view. */
  dialect: Dialect
  setDialect: (dialect: Dialect) => void

  /** Span selected in the report reader, mirrored by the span list. */
  activeSpanId: string | null
  setActiveSpanId: (id: string | null) => void

  /**
   * Auth. The token lives in localStorage so a refresh keeps the session;
   * the store holds it too so components re-render on sign-in and sign-out.
   *
   * Accept/reject decisions are deliberately NOT here — the server owns them,
   * and a local copy would drift from what is actually stored.
   */
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  signIn: (token: string, user: AuthUser) => void
  signOut: () => void
}

export const useAppStore = create<AppState>((set) => ({
  dialect: "british",
  setDialect: (dialect) => set({ dialect }),

  activeSpanId: null,
  setActiveSpanId: (activeSpanId) => set({ activeSpanId }),

  token: readToken(),
  user: null,
  isAuthenticated: readToken() !== null,

  signIn: (token, user) => {
    writeToken(token)
    set({ token, user, isAuthenticated: true })
  },

  signOut: () => {
    writeToken(null)
    set({ token: null, user: null, isAuthenticated: false })
  },
}))
