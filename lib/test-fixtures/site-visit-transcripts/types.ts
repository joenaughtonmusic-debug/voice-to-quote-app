import type { ReviewNotice } from "../../core/review-notices"
import type { Measurement } from "../../core/measurement-extraction"

export type ExpectedMeasurement = {
  value: number
  unit?: Measurement["unit"]
  dimension?: Measurement["dimension"]
  approximate?: boolean
  uncertain?: boolean
  unit_inferred?: boolean
}

export type ExpectedReviewNotice = {
  id?: string
  messageIncludes?: string
  trade?: string
  category?: ReviewNotice["category"]
  severity?: ReviewNotice["severity"]
}

export type ExpectedNonEvent = {
  id?: string
  messageIncludes?: string
  trade?: string
  fact?: string
  measurementValue?: number
  category?: string
}

export type SiteVisitTranscriptFixture = {
  id: string
  name: string
  transcript: string
  expected: {
    tradeCategory: string
    measurements?: ExpectedMeasurement[]
    reviewNotices?: ExpectedReviewNotice[]
    exclusionsOrNotes?: string[]
    facts?: string[]
    nonEvents?: ExpectedNonEvent[]
  }
}
