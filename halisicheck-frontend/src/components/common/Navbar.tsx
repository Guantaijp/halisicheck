import { NavLink, Link, useNavigate } from "react-router-dom"
import { LogOutIcon, ScanTextIcon, UserIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { useAppStore } from "@/store/useAppStore"
import { ThemeToggle } from "./ThemeToggle"
import { ApiStatusBadge } from "./ApiStatusBadge"

const LINKS = [
  { to: "/", label: "New check", end: true },
  { to: "/dashboard", label: "History", end: false },
]

export function Navbar() {
  const navigate = useNavigate()
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const user = useAppStore((s) => s.user)
  const signOut = useAppStore((s) => s.signOut)

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <ScanTextIcon className="size-4" aria-hidden />
          </span>
          HalisiCheck
        </Link>

        <nav className="flex items-center gap-1" aria-label="Main">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ApiStatusBadge />
          <ThemeToggle />

          {isAuthenticated ? (
            <>
              <span className="hidden max-w-[14rem] truncate text-xs text-muted-foreground md:inline">
                {user?.email ?? "Signed in"}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Sign out"
                onClick={() => {
                  signOut()
                  navigate("/")
                }}
              >
                <LogOutIcon aria-hidden />
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/login" />}
            >
              <UserIcon aria-hidden />
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
