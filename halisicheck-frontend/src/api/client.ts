import axios, { AxiosError, type AxiosInstance } from "axios"

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

const TOKEN_KEY = "halisicheck-token"

/** Reading a token can throw in a private window, so it never goes unguarded. */
export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // A viewer with storage blocked simply stays signed out for the session.
  }
}

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 120_000,
})

api.interceptors.request.use((config) => {
  const token = readToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** The shape the API's exception filter returns for every failure. */
interface ApiErrorBody {
  statusCode: number
  error: string
  message: string | string[]
  path: string
  timestamp: string
}

export class ApiError extends Error {
  readonly status: number
  /** class-validator returns an array; both shapes are flattened here. */
  readonly details: string[]

  constructor(status: number, message: string, details: string[] = []) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
  }
}

/** Fires when a request is rejected for a missing or expired token. */
type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler = () => {}

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    // Network failure or timeout: there is no response to read.
    if (!error.response) {
      return Promise.reject(
        new ApiError(
          0,
          error.code === "ECONNABORTED"
            ? "The request timed out. Long documents and video can take a while — try again."
            : "Could not reach the API. Is it running on " + BASE_URL + "?",
        ),
      )
    }

    const { status, data } = error.response
    const raw = data?.message
    const details = Array.isArray(raw) ? raw : raw ? [raw] : []
    const message = details[0] ?? data?.error ?? `Request failed (${status}).`

    // A stale token should log the user out rather than leaving the UI in a
    // state where every request quietly fails.
    if (status === 401 && readToken() !== null) {
      writeToken(null)
      onUnauthorized()
    }

    if (status === 429) {
      return Promise.reject(
        new ApiError(429, "Too many requests — wait a moment and try again."),
      )
    }

    return Promise.reject(new ApiError(status, message, details))
  },
)
