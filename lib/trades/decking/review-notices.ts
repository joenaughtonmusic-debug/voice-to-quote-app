import type { ReviewNotice, ReviewNoticeInput } from "../../core/review-notices"
import { calculateDecking } from "./calculator"
import { detectDeckingFromText } from "./detector"

function hasDeckingMaterial(text: string) {
  return /\b(pine|kwila|vitex|composite|hardwood|timber)\b/i.test(text)
}

function hasAccessNote(text: string) {
  return /\baccess\b|\bsteep\b|\btight\b|\blimited\b|\bdifficult\b|\beasy\s+access\b/i.test(text)
}

function hasWasteRemovalSignal(text: string) {
  return /\b(waste|rubbish|debris|offcuts|disposal|dispose|removal|cart\s+away|take\s+away)\b|\bremove\s+(?:existing|old)\s+(?:deck|decking|boards?)\b|\bremove\s+old\s+decking\b|\bclient\s+(?:to\s+remove|removing|disposing)\b/i.test(
    text,
  )
}

function deckingNotice(id: string, message: string, metadata: Record<string, string | number | boolean | null> = {}): ReviewNotice {
  return {
    id: `decking.${id}`,
    message,
    severity: "warning",
    source: "trade",
    category: "missing_info",
    metadata: {
      trade: "decking",
      ...metadata,
    },
  }
}

export function deckingReviewNotices(input: ReviewNoticeInput): ReviewNotice[] {
  const text = input.text?.trim()
  if (!text) return []

  const detection = detectDeckingFromText(text)
  if (!detection.is_decking || detection.confidence === "low") return []

  const result = calculateDecking(detection.request)
  const notices: ReviewNotice[] = []

  if (!hasDeckingMaterial(text) && result.areas.every((area) => !area.board_type)) {
    notices.push(deckingNotice("missing-material", "Decking species/material not specified. Confirm board type before pricing.", {
      check: "board_type",
    }))
  }

  if (result.areas.some((area) => area.build_scope === "unknown")) {
    notices.push(deckingNotice("unclear-build-scope", "Decking build scope is unclear. Confirm full build vs decking boards only.", {
      check: "build_scope",
    }))
  }

  const structureRelevant = result.areas.some((area) => area.build_scope === "unknown" || area.build_scope === "decking_boards_only")
  const structureSpecified = result.areas.some((area) => area.existing_posts === "yes" || area.existing_subframe === "yes")
  if (structureRelevant && !structureSpecified) {
    notices.push(deckingNotice("missing-existing-structure", "Existing posts/subframe not specified for decking scope. Confirm retained or new structure.", {
      check: "existing_posts_subframe",
    }))
  }

  if (result.waste_removal_notes.length === 0 && !hasWasteRemovalSignal(text)) {
    notices.push(deckingNotice("missing-waste", "Decking waste/removal not specified. Confirm disposal allowance before pricing.", {
      check: "waste_removal",
    }))
  }

  if (!hasAccessNote(text)) {
    notices.push(deckingNotice("missing-access", "Decking access condition not specified. Confirm site access before pricing.", {
      check: "access",
    }))
  }

  return notices
}
