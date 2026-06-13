import type { ReviewNotice, ReviewNoticeInput } from "../../core/review-notices"
import { calculateRetaining } from "./calculator"
import { detectRetainingFromText } from "./detector"

function hasWallMaterial(text: string) {
  return /\b(timber|sleeper|concrete|block|stone|keystone|steel|gabion)\b/i.test(text)
}

function hasAccessNote(text: string) {
  return /\baccess\b|\bsteep\b|\btight\b|\blimited\b|\bdifficult\b|\beasy\s+access\b/i.test(text)
}

function retainingNotice(id: string, message: string, metadata: Record<string, string | number | boolean | null> = {}): ReviewNotice {
  return {
    id: `retaining.${id}`,
    message,
    severity: "warning",
    source: "trade",
    category: "missing_info",
    metadata: {
      trade: "retaining",
      ...metadata,
    },
  }
}

export function retainingReviewNotices(input: ReviewNoticeInput): ReviewNotice[] {
  const text = input.text?.trim()
  if (!text) return []

  const detection = detectRetainingFromText(text)
  if (!detection.is_retaining || detection.confidence === "low") return []

  const result = calculateRetaining(detection.request)
  const notices: ReviewNotice[] = []

  if (!result.drainage_mentioned) {
    notices.push(retainingNotice("missing-drainage", "Retaining drainage not specified. Confirm drainage requirement before pricing.", {
      check: "drainage",
    }))
  }

  if (!result.timber_retaining && !hasWallMaterial(text)) {
    notices.push(retainingNotice("missing-material", "Retaining wall material not specified. Confirm timber, block, concrete, or other wall type.", {
      check: "wall_material",
    }))
  }

  if (!result.posts_mentioned) {
    notices.push(retainingNotice("missing-posts", "Retaining posts/post holes not specified. Confirm structural post allowance before pricing.", {
      check: "posts",
    }))
  }

  if (result.waste_removal_notes.length === 0) {
    notices.push(retainingNotice("missing-waste", "Retaining waste/removal not specified. Confirm disposal allowance before pricing.", {
      check: "waste_removal",
    }))
  }

  if (!result.access_difficulty && !hasAccessNote(text)) {
    notices.push(retainingNotice("missing-access", "Retaining access condition not specified. Confirm site access before pricing.", {
      check: "access",
    }))
  }

  return notices
}
