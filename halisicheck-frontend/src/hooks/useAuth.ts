import { useMutation } from "@tanstack/react-query"
import { login, register } from "@/api/auth.api"
import { useAppStore } from "@/store/useAppStore"
import type { AuthResponse } from "@/types/api.types"

interface Credentials {
  email: string
  password: string
  displayName?: string
}

export function useAuth() {
  const signIn = useAppStore((s) => s.signIn)

  const onSuccess = (data: AuthResponse) => signIn(data.accessToken, data.user)

  const loginMutation = useMutation<AuthResponse, Error, Credentials>({
    mutationFn: ({ email, password }) => login(email, password),
    onSuccess,
  })

  const registerMutation = useMutation<AuthResponse, Error, Credentials>({
    mutationFn: ({ email, password, displayName }) =>
      register(email, password, displayName),
    onSuccess,
  })

  return { loginMutation, registerMutation }
}
