import type { AuditContext, AuditIssue } from "../types"

// Narrow: "<number> <StreetName> <StreetType> in <Suburb>". Only fires on an
// explicit "street … in Suburb" phrase so it does not over-generalise address
// parsing. The suburb group must start with a capital letter (excludes "in the").
const STREET_TYPE =
  "Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Crescent|Cres|Place|Pl|Way|Close|Court|Ct|Terrace|Tce|Parade|Highway|Hwy|Grove|Rise|Quay"

const ADDRESS_IN_SUBURB_PATTERN = new RegExp(
  String.raw`\b(\d+[A-Za-z]?\s+(?:[A-Z][A-Za-zāēīōūĀĒĪŌŪ'’-]+\s+){1,4}(?:${STREET_TYPE}))\s+in\s+([A-Z][A-Za-zāēīōūĀĒĪŌŪ'’-]+(?:\s+[A-Z][A-Za-zāēīōūĀĒĪŌŪ'’-]+)?)\b`,
)

/**
 * V08 — Address / suburb (detection only).
 *
 * Flags when the transcript says "<street> in <Suburb>" but the extracted
 * site address does not contain that suburb (the Adam/Titirangi failure:
 * "20 Lemnos Street in Titirangi" → captured only "20 Lemnos Street").
 */
export function v08Address(ctx: AuditContext): AuditIssue[] {
  const issues: AuditIssue[] = []
  const transcript = ctx.rawTranscript ?? ""

  const match = transcript.match(ADDRESS_IN_SUBURB_PATTERN)
  if (!match) return issues

  const streetPart = match[1]?.replace(/\s+/g, " ").trim() ?? ""
  const suburb = match[2]?.replace(/\s+/g, " ").trim() ?? ""
  if (!suburb) return issues

  const siteAddress = ctx.processedQuote.site_address ?? ""
  const internalAddressNotes = (ctx.processedQuote.internal_notes ?? [])
    .filter((note) => /address\s+extraction/i.test(note))
    .join("\n")

  const suburbLower = suburb.toLowerCase()
  const capturedSomewhere =
    siteAddress.toLowerCase().includes(suburbLower) || internalAddressNotes.toLowerCase().includes(suburbLower)

  if (capturedSomewhere) return issues

  issues.push({
    id: "V08-suburb-missing",
    severity: "warning",
    category: "address",
    message: `Transcript states the suburb "${suburb}" but it is missing from the extracted site address.`,
    evidence: `${streetPart} in ${suburb}`,
    expected: suburb,
    actual: `site_address: "${siteAddress || "Not captured"}" (suburb missing)`,
    suggested_fix: "Extend address extraction to capture the suburb after '<street> in <Suburb>'.",
    can_auto_correct: false,
  })

  return issues
}
