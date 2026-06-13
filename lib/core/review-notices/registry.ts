import { deckingReviewNotices } from "../../trades/decking/review-notices"
import { retainingReviewNotices } from "../../trades/retaining/review-notices"
import { measurementReviewNotices } from "./measurement-notices"
import type { ReviewNotice, ReviewNoticeContributor, ReviewNoticeInput } from "./types"

export const reviewNoticeContributors: ReviewNoticeContributor[] = [
  {
    id: "measurement",
    buildReviewNotices: measurementReviewNotices,
  },
  {
    id: "decking",
    buildReviewNotices: deckingReviewNotices,
  },
  {
    id: "retaining",
    buildReviewNotices: retainingReviewNotices,
  },
]

export function buildReviewNotices(input: ReviewNoticeInput): ReviewNotice[] {
  return dedupeReviewNotices(
    reviewNoticeContributors.flatMap((contributor) => contributor.buildReviewNotices(input)),
  )
}

function dedupeReviewNotices(notices: ReviewNotice[]) {
  const seen = new Set<string>()

  return notices.filter((notice) => {
    const key = `${notice.source}:${notice.category}:${notice.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
