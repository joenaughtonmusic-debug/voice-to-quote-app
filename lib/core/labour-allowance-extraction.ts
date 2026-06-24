/**
 * Parses per-task labour allowance phrases of the form:
 *   "Allow N hours to <task description>"
 *   "Allow N hrs to <task description>"
 *
 * These are a distinct pattern from the days×people allowances handled by
 * applyDeterministicLabourAllowances in the API route. Each phrase represents
 * a single task with an explicit hour count. The results are summed to give
 * a total labour quantity for internal review and JMS line items.
 *
 * This module is intentionally separate from pricing extraction — hours are
 * quantities, never currency amounts.
 */

export type PerTaskHourAllowance = {
  /** Human-readable task label, e.g. "remove the keystone edging" */
  label: string
  /** Number of hours stated for this task */
  hours: number
}

export type PerTaskHourExtractionResult = {
  allowances: PerTaskHourAllowance[]
  /** Sum of all task hours */
  totalHours: number
  /** Human-readable breakdown string for internal review */
  breakdownText: string
}

/**
 * Extracts per-task hour allowances from a transcript.
 * Matches: "Allow 7 hours to remove the keystone edging"
 * Does not match: "Allow $700 for materials" (dollar sign present)
 * Does not match: "labour for X: 2 days, 3 people" (handled elsewhere)
 */
export function extractPerTaskHourAllowances(transcript: string): PerTaskHourAllowance[] {
  const allowances: PerTaskHourAllowance[] = []
  const pattern = /\ballow\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s+to\s+([^.\n]+)/gi

  for (const match of transcript.matchAll(pattern)) {
    const hours = Number(match[1])
    if (!Number.isFinite(hours) || hours <= 0) continue

    const label = (match[2] ?? "")
      .replace(/\s+/g, " ")
      .replace(/[.:;\s]+$/g, "")
      .trim()

    allowances.push({ label: label || "task", hours })
  }

  return allowances
}

export function summarisePerTaskHourAllowances(allowances: PerTaskHourAllowance[]): PerTaskHourExtractionResult {
  const totalHours = allowances.reduce((sum, a) => sum + a.hours, 0)
  const lines = allowances.map((a) => `${a.label}: ${a.hours}h`)
  const breakdownText = [...lines, `Total: ${totalHours}h`].join("\n")
  return { allowances, totalHours, breakdownText }
}
