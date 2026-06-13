import type { CustomerQuoteAssembly, CustomerQuoteAssemblyInput } from "./types"
import { assembleMaintenanceCustomerQuote } from "./maintenance"

function isMaintenance(value: string | null | undefined) {
  return /\bmaintenance|garden\s+maintenance\b/i.test(value ?? "")
}

export function assembleCustomerQuote(input: CustomerQuoteAssemblyInput): CustomerQuoteAssembly | null {
  if (isMaintenance(input.quote.job_type) || isMaintenance(input.quote.primary_quote.job_type)) {
    return assembleMaintenanceCustomerQuote(input)
  }

  return null
}
