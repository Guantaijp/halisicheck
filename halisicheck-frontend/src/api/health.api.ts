import { api } from "./client"

export interface HealthResponse {
  status: "ok" | "degraded"
  env: string
  checks: Record<string, { ok: boolean; detail: string }>
}

export async function getHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>("/health")
  return data
}
