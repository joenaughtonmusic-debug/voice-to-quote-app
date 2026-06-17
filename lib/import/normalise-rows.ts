// ---------------------------------------------------------------------------
// Supplier price list spreadsheet normalisation.
//
// Human-maintained price lists (Bunnings, Placemakers, etc.) contain section
// heading rows, blank rows, and working columns (Qty, Total, URL links) that
// confuse the generic column-mapping detector.
//
// This module runs BEFORE detectColumnMapping and produces clean rows/headers.
// It is deterministic — no AI, no async, no side effects.
// ---------------------------------------------------------------------------

export type ParsedRow = Record<string, unknown>

export type NormalisationResult = {
  /** Data rows after headings and blank rows are removed. */
  cleanRows: ParsedRow[]
  /** Headers after working columns are removed — pass these to detectColumnMapping. */
  cleanHeaders: string[]
  /** Column names excluded from mapping (Qty, Total, Link, __EMPTY, etc.). */
  excludedColumns: string[]
  /** Total number of rows dropped (blanks + section headings). */
  droppedRowCount: number
  /** Labels of section heading rows that were dropped (for UI notice). */
  sectionHeadingsFound: string[]
}

// ---------------------------------------------------------------------------
// Working column detection
// ---------------------------------------------------------------------------

// XLSX.js generates __EMPTY, __EMPTY_1, … for empty or merged header cells.
const EMPTY_HEADER_RE = /^__EMPTY(_\d+)?$/i

const WORKING_COLUMN_RES: RegExp[] = [
  // Quantity / order count columns
  /^(qty|quantity|order qty|order quantity|units ordered|no\.?|count)$/i,
  // Totals / extended price columns — computed from qty × unit price
  /^(total|sub.?total|total price|total cost|total price\/cost|total price.cost|line total|amount|ext\.? price|extended price)$/i,
  // Link / URL columns
  /^(link|url|product link|web link|image|ref|bunnings link|supplier link|online link|product url)$/i,
]

function isWorkingColumnByName(header: string): boolean {
  if (EMPTY_HEADER_RE.test(header)) return true
  return WORKING_COLUMN_RES.some((re) => re.test(header.trim()))
}

function isUrlHeavyColumn(header: string, rows: ParsedRow[]): boolean {
  const values = rows
    .map((r) => r[header])
    .filter((v) => v != null && String(v).trim() !== "")
  if (values.length === 0) return false
  const urlCount = values.filter((v) => /^https?:\/\//i.test(String(v).trim())).length
  return urlCount / values.length >= 0.4
}

// ---------------------------------------------------------------------------
// Row-level classification
// ---------------------------------------------------------------------------

/**
 * A row is blank when every clean (non-working) column is empty.
 * Working columns (Qty, Total, etc.) may contain 0 or formula results
 * even on visually empty rows, so they are excluded from the check.
 */
function isBlankRow(row: ParsedRow, cleanColumns: string[]): boolean {
  return cleanColumns.every((col) => {
    const v = row[col]
    return v == null || String(v).trim() === ""
  })
}

/**
 * A section heading row has exactly one non-empty cell among the clean
 * (non-working) columns, that cell is in one of the first three clean
 * columns, and the value contains no digits.
 *
 * Working columns (Qty, Total, etc.) are intentionally ignored here — they
 * often contain 0 or formula results on heading rows, which would otherwise
 * cause the "exactly one non-empty cell" check to fail.
 *
 * Examples that match:  "Posts", "RAILS", "Retaining Timber", "DECKING BOARDS"
 * Examples that do NOT: "90x90x2.4m H4" (has digits), rows with multiple
 * populated clean cells (real item rows).
 */
function isSectionHeadingRow(row: ParsedRow, cleanColumns: string[]): boolean {
  // Only inspect the columns that carry meaningful item data.
  const relevantEntries = cleanColumns.map((col) => [col, row[col]] as [string, unknown])
  const nonEmpty = relevantEntries.filter(([, v]) => v != null && String(v).trim() !== "")

  if (nonEmpty.length !== 1) return false

  const [nonEmptyKey, nonEmptyVal] = nonEmpty[0]
  const columnIndex = cleanColumns.indexOf(nonEmptyKey)
  if (columnIndex > 2) return false

  const cellText = String(nonEmptyVal).trim()
  if (/\d/.test(cellText)) return false
  if (cellText.length > 80) return false

  return true
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clean a raw XLSX-parsed row set before column mapping.
 *
 * @param rows    Full output of XLSX.utils.sheet_to_json (with defval: "")
 * @param headers Unique header list derived from the same output
 */
export function normaliseSupplierRows(rows: ParsedRow[], headers: string[]): NormalisationResult {
  // Step 1 — identify working columns by name
  const workingByName = headers.filter(isWorkingColumnByName)

  // Step 2 — identify URL-heavy columns by content (catches unlabelled link columns)
  const workingByContent = headers.filter(
    (h) => !workingByName.includes(h) && isUrlHeavyColumn(h, rows),
  )

  const excludedColumns = [...new Set([...workingByName, ...workingByContent])]
  const cleanHeaders = headers.filter((h) => !excludedColumns.includes(h))

  // Step 3 — filter rows
  const sectionHeadingsFound: string[] = []
  let droppedRowCount = 0
  const cleanRows: ParsedRow[] = []

  for (const row of rows) {
    if (isBlankRow(row, cleanHeaders)) {
      droppedRowCount++
      continue
    }
    if (isSectionHeadingRow(row, cleanHeaders)) {
      // Use the clean-column value as the heading label for the UI notice.
      const headingValue = cleanHeaders
        .map((col) => row[col])
        .find((v) => v != null && String(v).trim() !== "")
      sectionHeadingsFound.push(String(headingValue).trim())
      droppedRowCount++
      continue
    }
    cleanRows.push(row)
  }

  return { cleanRows, cleanHeaders, excludedColumns, droppedRowCount, sectionHeadingsFound }
}
