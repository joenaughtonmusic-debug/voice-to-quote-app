import type { CustomerQuoteAssembly, CustomerQuoteAssemblyInput, CustomerQuoteAssemblySection } from "./types"

function cleanLine(value: string) {
  return value
    .replace(/^\s*(?:scope|note|site\s+note)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/g, "")
    .trim()
}

function unique(values: string[]) {
  const seen = new Set<string>()
  return values
    .map(cleanLine)
    .filter((value) => {
      const key = value.toLowerCase()
      if (!value || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function section(title: string, items: string[]): CustomerQuoteAssemblySection | null {
  const cleanedItems = unique(items)
  return cleanedItems.length > 0 ? { title, items: cleanedItems } : null
}

function optionTitle(value: string) {
  return cleanLine(value)
    .replace(/\bhedge\s+plants?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function plantingOptionItems(input: CustomerQuoteAssemblyInput) {
  const quoteOptions = (input.quote.quote_options ?? [])
    .filter((option) => option.category === "planting")
    .map((option) => optionTitle(option.title || option.lineItems[0]?.itemName || ""))
    .filter(Boolean)

  if (quoteOptions.length > 0) {
    return unique(quoteOptions).map((title, index) => `Option ${index + 1}: ${title}`)
  }

  return unique(
    (input.quote.plant_calculator_results ?? []).flatMap((result) =>
      result.option_groups.map((option, index) => {
        const title = optionTitle(
          [option.plant_name || result.plant_name, option.plant_size || option.pot_size].filter(Boolean).join(" "),
        )
        return title ? `Option ${index + 1}: ${title}` : ""
      }),
    ),
  )
}

function materialItems(input: CustomerQuoteAssemblyInput) {
  const sourceItems = [
    ...input.quote.materials,
    ...input.quote.customer_scope,
    ...input.quote.primary_quote.scope,
  ]

  const materials: string[] = []
  for (const item of sourceItems) {
    if (/\bgarden\s+mix\b/i.test(item)) materials.push("Garden mix")
    if (/\bmulch\b/i.test(item)) materials.push("Mulch")
  }

  return unique(materials)
}

function labourItems(input: CustomerQuoteAssemblyInput) {
  const sourceText = [
    input.rawTranscript ?? "",
    input.quote.labour_allowance,
    ...input.quote.customer_scope,
    ...input.quote.primary_quote.scope,
  ].join("\n")

  return /\blabou?r\b/i.test(sourceText) ? ["Included"] : []
}

function exclusionItems(input: CustomerQuoteAssemblyInput) {
  return unique(input.quote.exclusions).map((item) => {
    if (/\bno\s+irrigation\b|\birrigation\b/i.test(item)) return "Irrigation not included"
    return item
  })
}

export function assemblePlantingCustomerQuote(input: CustomerQuoteAssemblyInput): CustomerQuoteAssembly {
  const sections = [
    section("Planting Options", plantingOptionItems(input)),
    section("Materials", materialItems(input)),
    section("Labour", labourItems(input)),
    section("Exclusions", exclusionItems(input)),
  ].filter((item): item is CustomerQuoteAssemblySection => item !== null)

  return {
    title: "Planting Quote",
    customer_name: input.quote.client_name,
    site_address: input.quote.site_address,
    sections,
  }
}
