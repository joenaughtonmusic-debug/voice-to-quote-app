"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

type AuthState = {
  user: User | null
  loading: boolean
  displayName: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

function getDisplayName(user: User | null) {
  if (!user) return null

  const fullName = user.user_metadata?.full_name
  if (typeof fullName === "string" && fullName.trim()) return fullName

  return user.email ?? null
}

function normalizePublicUrl(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withProtocol.replace(/\/+$/g, "")
}

function authRedirectUrl() {
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000"
  }

  return (
    normalizePublicUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizePublicUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizePublicUrl(process.env.NEXT_PUBLIC_VERCEL_URL) ??
    (typeof window !== "undefined" ? window.location.origin : undefined)
  )
}

async function upsertProfile(user: User) {
  const fullName = getDisplayName(user) ?? user.id

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      full_name: fullName,
      company_name: null,
    },
    { onConflict: "id" },
  )

  if (error) {
    console.error("Unable to upsert Supabase profile", error)
  }
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) return
    void upsertProfile(user)
  }, [user])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirectUrl(),
      },
    })

    if (error) {
      console.error("Unable to sign in with Google", error)
    }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error("Unable to sign out", error)
    }
  }, [])

  const displayName = useMemo(() => getDisplayName(user), [user])

  return {
    user,
    loading,
    displayName,
    signInWithGoogle,
    signOut,
  }
}
