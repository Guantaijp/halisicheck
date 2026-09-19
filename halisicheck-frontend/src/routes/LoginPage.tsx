import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ErrorState } from "@/components/common/ErrorState"
import { useAuth } from "@/hooks/useAuth"

/** Minimum the API enforces — stated up front rather than after a failure. */
const MIN_PASSWORD = 12

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")

  const { loginMutation, registerMutation } = useAuth()
  const active = mode === "login" ? loginMutation : registerMutation

  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/dashboard"

  const tooShort = mode === "register" && password.length > 0 && password.length < MIN_PASSWORD
  const canSubmit = email.includes("@") && password.length > 0 && !tooShort

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit || active.isPending) return

    active.mutate(
      { email, password, displayName: displayName || undefined },
      { onSuccess: () => navigate(redirectTo, { replace: true }) },
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{mode === "login" ? "Sign in" : "Create an account"}</CardTitle>
          <CardDescription>
            An account keeps your check history. You can run checks without one —
            they just will not be saved to a profile.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as "login" | "register")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="register" className="flex-1">
                Register
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            {mode === "register" ? (
              <div className="space-y-1.5">
                <Label htmlFor="displayName">Name (optional)</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="A. Reviewer"
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {mode === "register" ? (
                <p
                  className={
                    tooShort ? "text-xs text-destructive" : "text-xs text-muted-foreground"
                  }
                >
                  At least {MIN_PASSWORD} characters.
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit || active.isPending}>
              {active.isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          {active.isError ? <ErrorState error={active.error} /> : null}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        <Link to="/" className="underline underline-offset-4">
          Run a check without signing in
        </Link>
      </p>
    </div>
  )
}
