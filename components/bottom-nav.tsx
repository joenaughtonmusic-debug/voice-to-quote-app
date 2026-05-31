"use client"

import { Mic, FileText, LayoutTemplate, CloudUpload, Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type Tab = "record" | "drafts" | "templates" | "uploads" | "settings"

const tabs: { id: Tab; label: string; icon: typeof Mic }[] = [
  { id: "record", label: "Record", icon: Mic },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "uploads", label: "Uploads", icon: CloudUpload },
  { id: "settings", label: "Settings", icon: Settings2 },
]

export function BottomNav({
  active,
  onChange,
}: {
  active: Tab
  onChange: (tab: Tab) => void
}) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isActive && (
                <span className="absolute -top-px h-[2px] w-8 rounded-full bg-primary shadow-[0_0_10px] shadow-primary/60" />
              )}
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
                  isActive
                    ? "border-primary/40 bg-accent"
                    : "border-transparent group-hover:border-border group-hover:bg-card",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.4 : 2} />
              </span>
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
