import { api } from "./client"
import type { AuthResponse, AuthUser } from "@/types/api.types"

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/register", {
    email,
    password,
    ...(displayName ? { displayName } : {}),
  })
  return data
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/login", { email, password })
  return data
}

export async function me(): Promise<Pick<AuthUser, "id" | "email">> {
  const { data } = await api.get<Pick<AuthUser, "id" | "email">>("/auth/me")
  return data
}
