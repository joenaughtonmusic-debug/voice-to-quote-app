import {
  accountCodeFromLineItem,
  labourLineItem,
  numberFromMoney,
  taxTypeFromLineItem,
  xeroItemCode,
} from "./helpers"
import type { XeroExportLineItem, XeroPayloadQuote, XeroRendererPreview } from "./types"

export function buildGenericXeroExportLineItems(
  quote: XeroPayloadQuote,
  preview: XeroRendererPreview,
) {
  const exportLineItems: XeroExportLineItem[] = []
  const labourAmount = numberFromMoney(preview.labourLine?.amount)

  if (preview.labourLine && labourAmount !== null) {
    const labourItem = labourLineItem(quote)
    const code = xeroItemCode(labourItem?.item_code, labourItem?.source_system, labourItem?.item_name, labourItem?.description)
    exportLineItems.push({
      category: "labour",
      description: "Labour",
      quantity: 1,
      unitAmount: labourAmount,
      itemCode: code.itemCode,
      omittedItemCode: code.omittedItemCode,
      itemCodeSource: labourItem?.source_system,
      xeroAccountCode: accountCodeFromLineItem(labourItem),
      xeroTaxType: taxTypeFromLineItem(labourItem),
      gstRate: labourItem?.gst_rate ?? null,
    })
  }

  return exportLineItems
}
