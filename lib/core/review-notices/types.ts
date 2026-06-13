export type ReviewNoticeSeverity = "info" | "warning" | "error"

export type ReviewNoticeSource = "core" | "measurement" | "trade"

export type ReviewNoticeCategory =
  | "measurement"
  | "missing_info"
  | "assumption"
  | "site_condition"
  | "pricing"
  | "export"

export type ReviewNotice = {
  id: string
  message: string
  severity: ReviewNoticeSeverity
  source: ReviewNoticeSource
  category: ReviewNoticeCategory
  metadata?: Record<string, string | number | boolean | null>
}

export type ReviewNoticeInput = {
  text?: string
}

export type ReviewNoticeContributor = {
  id: string
  buildReviewNotices: (input: ReviewNoticeInput) => ReviewNotice[]
}
