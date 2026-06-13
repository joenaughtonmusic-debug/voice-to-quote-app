# Import Architecture

This document defines Quotecord's universal import architecture for Plant Library imports, JMS item libraries, price lists, supplier catalogues, templates, terms, exclusions, and future business knowledge imports.

## Guiding Principles

### Universal

Imports should work across suppliers, trades, and job management systems. Avoid one-off parsing that only works for a single business or supplier.

### No Hardcoded Suppliers

Supplier-specific examples may be used in tests, but production behaviour should rely on column detection, mapping profiles, manual review, and user configuration rather than hardcoded supplier names.

### No Hardcoded Column Names As The Only Path

Known column names should improve detection confidence, but users should not need to rename spreadsheets manually. Manual mapping must remain available where detection is uncertain.

### User-Reviewable

Imports should show what will be imported before saving:

- detected columns
- mapping confidence
- sample rows
- warnings
- missing fields
- possible price/cost confusion

### Preserve Raw Import Data

Imported rows should preserve `raw_import` so future parser improvements can reprocess the original row shape without requiring the user to upload again.

## Universal Import Flow

```text
Upload
↓
Column detection
↓
Confidence scoring
↓
Manual mapping
↓
Preview
↓
Import
```

## Current State

### Implemented

- CSV/XLSX import support for JMS item/material/product libraries.
- Plant price list import into `knowledge_items` using `item_type = plant` for true plants.
- Column detection for common price, cost, sell price, size, spacing, supplier, stock, aliases, category, and item fields.
- Import preview with sample rows and warnings.
- Manual mapping support for ambiguous price list fields.
- Raw row preservation in `raw_import`.
- Basic batch deletion / clear imported items workflow for incorrect imports.
- Plant-care product classification to prevent sprays, fertiliser, plant soap, wetting agents, and chemicals from becoming Plant Calculator options.

### In Progress

- Better supplier spreadsheet tolerance for inconsistent headers.
- Better confidence scoring and diagnostics for plant import mapping.
- More robust distinction between cost price, nursery price, markup, retail price, sell price, and customer price.
- Better visible import history and re-import audit trail.

### Planned

- Full import history table with batch metadata.
- Re-import support that updates existing items safely.
- Batch rollback and batch comparison.
- Supplier catalogue import profiles.
- User-saved mapping profiles per source system and supplier.
- Document import support for terms, exclusions, and reusable business rules.

## Plant Imports

Plant imports currently use `knowledge_items` with `item_type = plant` for true plant records.

Important fields:

- `item_code` or SKU
- `item_name`
- `aliases`
- `category`
- `source_category`
- `sell_price`
- `raw_import`

Plant-specific values are commonly stored inside `raw_import`:

- `plant_name`
- `botanical_name`
- `common_name`
- `plant_size`
- `pot_size`
- `spacing_mm`
- `supplier`
- `stock_status`
- `quote_app_notes`

Current safeguards:

- Non-plant products should not be classified as `item_type = plant`.
- Plant Calculator should only use true plant items.
- If structured size fields are absent, the calculator can use `item_name`, aliases, and raw import fields for size matching.

## Price List Imports

Price list imports should map:

- item code
- item name
- description
- unit
- cost price
- sell price
- GST
- category
- supplier
- aliases

Rules:

- Cost/buy price must not silently become sell price.
- If no reliable sell price column exists, sell price should be null and a warning should be shown.
- Markup columns should only create sell price when the data clearly represents customer price or a mapped user override confirms it.

## JMS Imports

Supported source systems:

- Tradify
- Fergus
- SimPRO
- ServiceM8
- Jobber
- Xero
- Other CSV

Current JMS import behaviour:

- Source-specific mapping profiles exist or are being introduced.
- Tradify `Buy Price` maps to cost price.
- Tradify `Standard Markup` can map to sell price when values appear to be final customer rates.
- Imported items are classified into labour, material, plant, waste, equipment, service, chemical, vehicle, or other.
- Aliases are generated from item names, item codes, dimensions, and common spoken forms.

Future JMS import work:

- Stronger saved user mappings per source system.
- Import batch review.
- Duplicate detection.
- Better inactive/archived item handling.
- JMS export support.

## Supplier Catalogues

Supplier catalogues are planned as a broader form of price list import.

Expected future fields:

- supplier
- SKU
- item name
- category
- description
- unit
- cost price
- retail/sell price
- stock status
- dimensions
- notes

Supplier catalogue imports should feed Knowledge Base and calculators, but should not automatically affect quote totals without review.

## Future CSV/XLSX Support

CSV/XLSX should remain the main import surface in the near term.

Future improvements:

- Better sheet selection for multi-sheet XLSX files.
- Header row detection.
- Preview of skipped rows.
- Data type diagnostics.
- Mapping templates by supplier/source system.

## Future Import History

Planned import history should track:

- import batch id
- source system
- supplier
- uploaded filename
- user id
- row count
- created/updated/skipped counts
- warnings
- mapping used
- timestamp

## Future Batch Deletion

Batch deletion should allow users to safely remove an incorrect import.

Rules:

- Delete only records owned by the authenticated user.
- Prefer deleting by `import_batch_id`.
- Confirm before deletion.
- Preserve audit metadata where needed.

## Future Re-Import Support

Re-import should support:

- matching by external item id, SKU, item code, or stable supplier key
- updating prices and stock status
- preserving user edits where appropriate
- showing a diff preview before applying changes

