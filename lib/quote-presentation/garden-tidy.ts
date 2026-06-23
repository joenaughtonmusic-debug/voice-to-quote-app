import { assembleGardenTidyCustomerQuote } from "../customer-quote-assembly/garden-tidy"
import type { CustomerQuoteAssemblyInput } from "../customer-quote-assembly/types"
import type { ProcessedQuote } from "../processed-quote"
import type {
  QuotePresentationLine,
  QuotePresentationLineRole,
  QuotePresentationModel,
  QuotePresentationSection,
} from "./types"

export type GardenTidyPresentationInput = {
  quote: ProcessedQuote
  rawTranscript?: string | null
}

const GARDEN_TIDY_SECTIONS: QuotePresentationSection[] = [
  { sectionId: "scope", title: "Scope of Work", kind: "scope" },
  { sectionId: "labour_allowance", title: "Labour Allowance", kind: "labour_allowance" },
  { sectionId: "green_waste", title: "Green Waste", kind: "green_waste" },
  { sectionId: "service_includes", title: "Service Includes", kind: "service_includes" },
  { sectionId: "labour", title: "Labour", kind: "labour" },
  { sectionId: "exclusions", title: "Exclusions", kind: "exclusions" },
  { sectionId: "review", title: "Review", kind: "review" },
]

function isGardenTidy(value: string | null | undefined) {
  return /\bgarden[_\s-]?tidy|one[_\s-]?off[_\s-]?tidy|property[_\s-]?tidy\b/i.test(value ?? "")
}

function isGardenTidySubtype(value: string | null | undefined) {
  return /\bhedge[_\s-]?trimming|tree[_\s-]?pruning|hedge[_\s-]?reduction|pruning\b/i.test(value ?? "")
}

function assemblyInput(quote: ProcessedQuote, rawTranscript?: string | null): CustomerQuoteAssemblyInput {
  return {
    quote,
    rawTranscript,
  }
}

function sectionRole(title: string): QuotePresentationLineRole {
  switch (title) {
    case "Labour Allowance":
      return "labour"
    case "Green Waste":
      return "waste"
    case "Exclusions":
      return "exclusion"
    case "Price":
      return "fixed_price"
    default:
      return "scope_line"
  }
}

function sectionIdForTitle(title: string): string {
  switch (title) {
    case "Scope of Work":
      return "scope"
    case "Labour Allowance":
      return "labour_allowance"
    case "Green Waste":
      return "green_waste"
    case "Service Includes":
      return "service_includes"
    case "Price":
      return "review"
    case "Exclusions":
      return "exclusions"
    case "Site Notes":
      return "scope"
    default:
      return "scope"
  }
}

function assemblyLines(assembly: ReturnType<typeof assembleGardenTidyCustomerQuote>): QuotePresentationLine[] {
  const lines: QuotePresentationLine[] = []

  for (const section of assembly.sections) {
    const sectionId = sectionIdForTitle(section.title)
    const role = sectionRole(section.title)
    const exportable = role === "labour" || role === "waste"

    for (const [index, item] of section.items.entries()) {
      lines.push({
        lineId: `garden-tidy-${sectionId}-${index}`,
        sectionId,
        role,
        customerTitle: item,
        customerVisible: section.title !== "Site Notes",
        reviewRequired: role === "fixed_price" ? false : exportable,
        source: "customer_assembly",
        sourceRef: `${section.title}[${index}]`,
        exportable,
      })
    }
  }

  if (lines.some((line) => line.role === "labour" && line.sectionId === "labour_allowance")) {
    lines.push({
      lineId: "garden-tidy-export-labour",
      sectionId: "labour",
      role: "labour",
      customerTitle: assembly.title,
      customerVisible: false,
      source: "customer_assembly",
      sourceRef: "export-labour",
      exportable: true,
    })
  }

  if (lines.some((line) => line.role === "waste")) {
    lines.push({
      lineId: "garden-tidy-export-greenwaste",
      sectionId: "green_waste",
      role: "waste",
      customerTitle: "Greenwaste",
      customerVisible: false,
      source: "customer_assembly",
      sourceRef: "export-greenwaste",
      exportable: true,
    })
  }

  return lines
}

function activeSections(lines: QuotePresentationLine[]): QuotePresentationSection[] {
  const sectionIds = new Set(lines.map((line) => line.sectionId))
  return GARDEN_TIDY_SECTIONS.filter((section) => sectionIds.has(section.sectionId))
}

export function isGardenTidyWorkflow(quote: ProcessedQuote) {
  const templateText = quote.selected_template_name ?? ""

  if (isGardenTidy(templateText)) return true
  if (isGardenTidy(quote.job_type) || isGardenTidy(quote.primary_quote.job_type)) return true
  if (isGardenTidySubtype(quote.job_type) || isGardenTidySubtype(quote.primary_quote.job_type)) return true

  return false
}

export function buildGardenTidyPresentationModel(input: GardenTidyPresentationInput): QuotePresentationModel | null {
  if (!isGardenTidyWorkflow(input.quote)) return null

  const assembly = assembleGardenTidyCustomerQuote(assemblyInput(input.quote, input.rawTranscript))
  if (assembly.title !== "One-Off Garden Tidy") return null

  const reviewNotices = [...(input.quote.confidence_warnings ?? []), ...(input.quote.missing_information ?? [])]
  const lines = assemblyLines(assembly)

  return {
    workflow: "garden_tidy",
    title: assembly.title,
    clientName: assembly.customer_name,
    siteAddress: assembly.site_address,
    sections: activeSections(lines),
    lines,
    reviewNotices,
  }
}
