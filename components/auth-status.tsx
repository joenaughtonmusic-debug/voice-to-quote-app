"use client"

import { LogIn, LogOut, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"

export function AuthStatus({
  displayName,
  email,
  loading,
  onSignIn,
  onSignOut,
}: {
  displayName: string | null
  email: string | null
  loading: boolean
  onSignIn: () => void
  onSignOut: () => void
}) {
  const signedIn = Boolean(email)

  return (
    <div className="border-b border-border bg-background/90 px-5 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
              signedIn ? "border-primary/30 bg-accent text-primary" : "border-border bg-card text-muted-foreground",
            )}
          >
            <UserRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {loading ? "Checking session..." : signedIn ? displayName || email : "Signed out"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {signedIn ? email : "Sign in to create and manage quotes"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={signedIn ? onSignOut : onSignIn}
          disabled={loading}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
        >
          {signedIn ? <LogOut className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}
          {signedIn ? "Sign out" : "Google"}
        </button>
      </div>
    </div>
  )
}
