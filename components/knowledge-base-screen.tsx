"use client"

import { useCallback, useEffect, useState } from "react"
import { BookOpen, Layers3, Leaf, Loader2, Package, ScrollText, Tags } from "lucide-react"
import { TemplatesScreen } from "@/components/templates-screen"
import { UploadsScreen } from "@/components/uploads-screen"
import { JmsItemLibrary } from "@/components/jms-item-library"
import { useAuth } from "@/hooks/use-auth"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type KnowledgeSection = "templates" | "materials" | "plants" | "price-lists" | "terms" | "exclusions"

type KnowledgeCounts = Record<KnowledgeSection, number>

const sections: {
  id: KnowledgeSection
  label: string
  icon: typeof BookOpen
  description: string
}[] = [
  {
    id: "templates",
    label: "Templates",
    icon: BookOpen,
    description: "Quote templates and uploaded quote analysis",
  },
  {
    id: "materials",
    label: "JMS Item Library",
    icon: Package,
    description: "Imported materials, products, services, and pricing from job management systems",
  },
  {
    id: "plants",
    label: "Plants",
    icon: Leaf,
    description: "Plant names, hedging, trees, and garden vocabulary",
  },
  {
    id: "price-lists",
    label: "Price Lists",
    icon: Tags,
    description: "Rates, allowances, and standard pricing references",
  },
  {
    id: "terms",
    label: "Terms & Conditions",
    icon: ScrollText,
    description: "Default quote terms and customer-facing conditions",
  },
  {
    id: "exclusions",
    label: "Common Exclusions",
    icon: Layers3,
    description: "Reusable exclusions and assumptions",
  },
]

const emptyCounts: KnowledgeCounts = {
  templates: 0,
  materials: 0,
  plants: 0,
  "price-lists": 0,
  terms: 0,
  exclusions: 0,
}

export function KnowledgeBaseScreen() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth()
  const [activeSection, setActiveSection] = useState<KnowledgeSection>("templates")
  const [counts, setCounts] = useState<KnowledgeCounts>(emptyCounts)
  const [loadingCounts, setLoadingCounts] = useState(false)
  const [error, setError] = useState("")

  const loadCounts = useCallback(async () => {
    if (!user) {
      setCounts(emptyCounts)
      return
    }

    setLoadingCounts(true)
    setError("")

    const { count: templateCount, error: templateError } = await supabase
      .from("quote_templates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)

    const { data: uploads, error: uploadError } = await supabase
      .from("uploaded_quote_examples")
      .select("document_type")
      .eq("user_id", user.id)

    const { count: itemCount, error: itemError } = await supabase
      .from("knowledge_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)

    setLoadingCounts(false)

    if (templateError || uploadError || itemError) {
      setError(`Could not load knowledge base counts: ${templateError?.message ?? uploadError?.message ?? itemError?.message}`)
      return
    }

    const documentTypes = (uploads ?? []).map((upload) => upload.document_type)
    setCounts({
      ...emptyCounts,
      templates: templateCount ?? 0,
      materials: itemCount ?? 0,
      plants: documentTypes.filter((type) => type === "plant_list").length,
      "price-lists": documentTypes.filter((type) => type === "materials_price_list").length,
      terms: documentTypes.filter((type) => type === "terms_conditions").length,
      exclusions: documentTypes.filter((type) => type === "common_exclusions").length,
    })
  }, [user])

  useEffect(() => {
    void loadCounts()
  }, [loadCounts])

  if (authLoading) {
    return (
      <div className="flex min-h-full flex-col px-5 pt-6">
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          Checking sign-in...
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-full flex-col px-5 pt-6">
        <div className="rounded-2xl border border-border bg-card p-5 text-center shadow-sm">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent text-primary">
            <BookOpen className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">Sign in to use Knowledge Base</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Templates and quote knowledge are linked to your Supabase user account.
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="mt-5 w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground active:scale-[0.99]"
          >
            Continue with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col px-5 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground">Templates, terms, pricing knowledge and trade vocabulary</p>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="-mx-5 mb-5 overflow-x-auto px-5">
        <div className="flex min-w-max gap-2">
          {sections.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
                  isActive
                    ? "border-primary/40 bg-accent text-primary"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                <span className="rounded-full bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {loadingCounts && id === "templates" ? <Loader2 className="h-3 w-3 animate-spin" /> : counts[id]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {activeSection === "templates" ? (
        <div className="grid gap-6 pb-4">
          <section>
            <div className="mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Templates</h2>
              <p className="text-xs text-muted-foreground">Saved quote templates created from your knowledge base</p>
            </div>
            <TemplatesScreen embedded />
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Knowledge Base Uploads
              </h2>
              <p className="text-xs text-muted-foreground">Upload source documents and extract reusable business knowledge</p>
            </div>
            <UploadsScreen embedded onTemplateCreated={() => void loadCounts()} />
          </section>
        </div>
      ) : activeSection === "materials" ? (
        <JmsItemLibrary onCountChange={() => void loadCounts()} />
      ) : (
        <PlaceholderSection section={sections.find((section) => section.id === activeSection)!} count={counts[activeSection]} />
      )}
    </div>
  )
}

function PlaceholderSection({
  section,
  count,
}: {
  section: (typeof sections)[number]
  count: number
}) {
  const Icon = section.icon

  return (
    <div className="pb-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-foreground">{section.label}</h2>
              <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground">
                {count} items
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{section.description}</p>
            <p className="mt-3 text-sm text-muted-foreground">Placeholder section. Add/manage functionality later.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
