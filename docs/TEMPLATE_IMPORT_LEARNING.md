# Template Import Learning

Last Updated: June 2026

This document defines the first Template Import Learning design for Quotecord.

Template Import Learning lets users upload existing quote templates or past quotes so Quotecord can learn customer-facing structure, section order, and wording patterns without hardcoding one business, one trade, or one export system.

This is a design document only. Phase 1 does not change application behaviour.

## Purpose

Template Import Learning is the process of turning uploaded quote examples into reviewed, reusable template configuration.

It should help Quotecord learn:

- how a business structures quotes
- what section names it uses
- what order sections appear in
- what customer-facing wording is preferred
- which inclusions, exclusions, optional works, terms, and notes are standard
- which renderer placeholders should fill each section
- how sections relate to universal categories such as labour, materials, waste, optional works, exclusions, and terms

It should not make unreviewed commercial decisions.

It must not become the primary source of:

- item codes
- account codes
- tax codes
- supplier prices
- Xero inventory data
- JMS inventory data
- supplier catalogue data
- calculator formulas

Templates control presentation and wording.

Price lists, inventory imports, Plant Library, and JMS item libraries control item identity, item codes, rates, supplier metadata, tax metadata, and source-system metadata.

Export mappings control account and tax fallbacks by category, item type, source system, trade, and user settings.

## Template Responsibilities

Templates may define:

- section names
- section order
- customer wording
- standard inclusions
- standard exclusions
- optional works wording
- quote notes
- terms and conditions
- estimate/fixed-price language
- preferred display structure
- which sections are customer-facing
- which sections are internal-only
- which placeholders should be rendered into each section

Templates may suggest that a section belongs to a category, such as:

- labour
- plants
- materials
- waste
- optional works
- exclusions
- terms

Templates must not be the primary source of:

- Xero item codes
- JMS item codes
- Xero account codes
- Xero tax codes
- GST/tax rules
- supplier prices
- inventory sell prices
- plant spacing defaults
- material quantity defaults
- customer contact identity

If a past quote includes item codes or account codes, Quotecord may display them as evidence during review. They should not silently become authoritative template rules.

## First MVP Workflow

The first MVP should be conservative and review-first.

1. User uploads a quote template or past quote.
2. App extracts likely quote sections.
3. App proposes section categories.
4. App proposes renderer placeholders.
5. App proposes export category mapping links.
6. User reviews and confirms mappings.
7. App stores a reusable template record.
8. Future quote rendering may use the approved template.

### Supported Upload Sources

Initial upload sources may include:

- PDF quote
- DOCX quote
- plain text template
- copied/pasted quote text
- exported quote from a JMS or accounting system

Spreadsheet price lists are not quote templates. They should continue through Knowledge Base, JMS item library, Plant Library, or future inventory import workflows.

### Section Extraction

The MVP extractor should look for sections such as:

- Labour
- Plants
- Materials
- Waste
- Optional works
- Exclusions
- Terms
- Scope
- Notes
- Acceptance
- Payment terms

The extractor should preserve original wording and order.

Example extracted sections:

```json
[
  {
    "source_heading": "Scope of Works",
    "proposed_category": "job_scope",
    "display_order": 10,
    "customer_facing": true
  },
  {
    "source_heading": "Optional Extras",
    "proposed_category": "optional_works",
    "display_order": 60,
    "customer_facing": true
  },
  {
    "source_heading": "Exclusions",
    "proposed_category": "exclusions",
    "display_order": 80,
    "customer_facing": true
  }
]
```

### Proposed Mappings

The app should propose mappings that the user can confirm or edit:

- section -> category
- category -> renderer placeholder
- category -> export mapping fallback

Example:

```text
Template section: Materials
Proposed category: materials
Renderer placeholder: {{materials_scope}}
Export mapping category: materials
```

This does not mean the template owns the account code. It means the section can be linked to the `materials` category, and export settings may later map `materials` to an account code such as `10011`.

## Template Model

The stored template schema should separate template structure from inventory and export metadata.

Suggested table name:

```text
quote_templates
```

Suggested shape:

```ts
type QuoteTemplate = {
  id: string
  user_id: string
  name: string
  description?: string | null
  trade?: string | null
  industry?: string | null
  job_type?: string | null
  source_file_id?: string | null
  source_file_name?: string | null
  source_mime_type?: string | null
  source_text?: string | null
  status: "draft" | "reviewed" | "active" | "archived"
  confidence?: "low" | "medium" | "high" | null
  sections: QuoteTemplateSection[]
  created_at: string
  updated_at: string
}
```

Suggested section shape:

```ts
type QuoteTemplateSection = {
  id: string
  source_heading?: string | null
  display_name: string
  category:
    | "job_scope"
    | "labour"
    | "plants"
    | "materials"
    | "waste"
    | "optional_works"
    | "exclusions"
    | "terms"
    | "notes"
    | "custom"
  wording?: string | null
  placeholder?: TemplatePlaceholder | null
  display_order: number
  customer_facing: boolean
  internal_visible: boolean
  exports_to_xero: boolean
  exports_to_jms: boolean
  linked_category_mapping_id?: string | null
  review_status: "proposed" | "confirmed" | "ignored"
}
```

Suggested placeholder type:

```ts
type TemplatePlaceholder =
  | "{{customer_name}}"
  | "{{site_address}}"
  | "{{job_scope}}"
  | "{{labour_scope}}"
  | "{{materials_scope}}"
  | "{{plant_options}}"
  | "{{exclusions}}"
  | "{{terms}}"
```

### Stored Evidence

The model should preserve extraction evidence for review:

```ts
type TemplateExtractionEvidence = {
  source_text: string
  source_start?: number
  source_end?: number
  proposed_category: string
  confidence: "low" | "medium" | "high"
  warnings: string[]
}
```

Evidence helps users understand why a mapping was suggested. It should not be treated as final configuration until reviewed.

## Placeholder Design

Initial placeholders should be limited and explicit.

Allowed MVP placeholders:

- `{{customer_name}}`
- `{{site_address}}`
- `{{job_scope}}`
- `{{labour_scope}}`
- `{{materials_scope}}`
- `{{plant_options}}`
- `{{exclusions}}`
- `{{terms}}`

Do not build arbitrary unbounded placeholder logic in the MVP.

Avoid placeholders such as:

- `{{anything}}`
- `{{custom_ai_text}}`
- `{{xero_account_code}}`
- `{{tax_code}}`
- `{{item_code}}`
- `{{supplier_price}}`

The first placeholder framework should be deterministic:

```text
ProcessedQuote facts
↓
Trade renderer or generic renderer
↓
Allowed placeholders
↓
Customer-facing template sections
```

If a template contains unsupported placeholders, the app should flag them for review rather than rendering guessed text.

## Universal vs Trade-Specific Handling

### Universal

Universal template import should handle:

- file upload
- text extraction
- section detection
- section ordering
- section category proposals
- placeholder proposal
- review UI
- template storage
- active/draft/archived status
- customer-facing vs internal section flags
- export intent flags
- links to export mapping categories

Universal core should understand broad categories:

- job scope
- labour
- materials
- waste
- optional works
- exclusions
- terms
- notes
- custom

Universal core should not know how to phrase planting, electrical, plumbing, building, painting, cleaning, or arborist work in detail.

### Planting-Specific

Planting renderers may provide placeholders or renderer output for:

- planting scope
- plant options
- plant supply and install wording
- garden material wording
- spoil/removal wording
- planting cleanup wording

Planting-specific template support should live under planting modules, for example:

```text
lib/trades/planting/
  customer-renderer.ts
  xero-renderer.ts
  quote-options.ts
  template-placeholders.ts
```

Planting-specific wording must not be added to universal template import logic.

### Future Trades

Future trades should add their own placeholder support without polluting the core.

Examples:

Electrical:

- `{{electrical_scope}}`
- `{{fittings_scope}}`
- `{{compliance_notes}}`

Plumbing:

- `{{plumbing_scope}}`
- `{{fixtures_scope}}`
- `{{access_notes}}`

Building:

- `{{building_scope}}`
- `{{materials_scope}}`
- `{{provisional_sums}}`

The core template importer should only register and validate placeholders. Trade modules should define what their trade-specific placeholders mean.

## Relationship To Export Mappings

Templates may classify a section as `materials`.

Export settings may map category `materials` to account code `10011`.

The template itself should not hardcode `10011` unless the user explicitly creates or confirms a mapping that belongs to export settings.

Correct layering:

```text
Template section "Materials"
↓
Category "materials"
↓
Export mapping settings
↓
Xero AccountCode 10011
```

Incorrect layering:

```text
Template section "Materials"
↓
Hardcoded AccountCode 10011 inside template
```

If an uploaded past quote contains account code `10011`, the app may show:

```text
Evidence found: Materials section previously used account code 10011.
Suggested action: map category materials to account code 10011 in export settings.
```

The user should confirm that as export configuration, not as template wording.

## Implementation Phases

### Phase 1 - Design Document Only

Current phase.

Deliverables:

- `docs/TEMPLATE_IMPORT_LEARNING.md`
- no app code changes
- no database changes
- no renderer changes
- no export changes

### Phase 2 - Database Schema Proposal And UI Skeleton

Deliverables:

- migration proposal for `quote_templates`
- migration proposal for template sections, if stored separately
- import UI skeleton
- uploaded file metadata capture
- draft template list
- review status fields

Phase 2 should not render templates into live customer quotes yet.

### Phase 3 - Section Extraction And Review

Deliverables:

- text extraction from uploaded quote files
- section detection
- proposed section categories
- proposed placeholder mappings
- review and edit UI
- ignored/confirmed/proposed state handling
- confidence warnings

Phase 3 should preserve source text and never silently apply low-confidence mappings.

### Phase 4 - Renderer Integration

Deliverables:

- universal template renderer reads confirmed template sections
- renderer fills only allowed placeholders
- planting renderer can supply planting-specific placeholder content
- customer preview can show template-rendered sections
- unsupported placeholders show review warnings

Phase 4 must preserve existing Amy, Sarah, and Simon regression baselines.

### Phase 5 - Export Mapping Integration

Deliverables:

- section categories can link to export mapping settings
- export adapters use category mappings, imported item metadata, and user configuration
- templates remain presentation config
- Xero/JMS adapters remain export config

Phase 5 should allow:

```text
Template section -> category -> export mapping fallback
```

It should not allow:

```text
Template wording -> hardcoded Xero account
```

## Risks And Guardrails

### Risk: Hardcoding One Business

Do not hardcode Pristine, gardening, landscaping, or any one user's quote style into the template importer.

Guardrail:

- Store template wording as user-owned configuration.
- Keep source-code defaults sparse.
- Require review for learned template behaviour.

### Risk: Templates Override Accounting Metadata

Templates may contain historical item codes or account codes, but they should not silently override inventory or export settings.

Guardrail:

- Treat codes in uploaded templates as evidence only.
- Confirm account/tax mappings through export settings.
- Prefer imported item metadata over template evidence.

### Risk: AI-Generated Final Wording Without Review

Template import may use AI to propose sections and categories, but final reusable templates must be user-reviewed.

Guardrail:

- Mark imported templates as `draft` until reviewed.
- Store confidence and source evidence.
- Show unsupported or ambiguous placeholders before activation.

### Risk: Trade-Specific Leakage

Planting wording should not leak into building, electrical, plumbing, painting, cleaning, or arborist templates.

Guardrail:

- Keep trade-specific placeholders in trade modules.
- Keep universal placeholders generic.
- Select renderer by job type, template trade, user primary trade, or explicit user selection.

### Risk: Regression Breakage

Template import must not break current stable baselines:

- Amy Hedge Quote
- Sarah Multi-Area Planting
- Simon Material Price Association

Guardrail:

- Add tests before enabling template rendering in live quote flow.
- Keep existing renderer output unchanged until template integration is explicitly enabled.
- Run TypeScript and production build before merging implementation phases.

## MVP Acceptance Criteria

The first implementation should be considered successful when:

- users can upload a quote template or past quote
- sections are extracted and shown for review
- mappings are proposed but not silently trusted
- user can confirm section categories and placeholders
- active template records are stored
- template wording is separated from inventory metadata
- export mappings remain separate from templates
- existing stable baselines remain unchanged

## Recommended First Implementation Prompt

Use this prompt for the next implementation step:

```text
Read docs/TEMPLATE_IMPORT_LEARNING.md.
Read docs/UNIVERSAL_VS_TRADE_SPECIFIC.md.
Read docs/CURRENT_WORKFLOW.md.
Read docs/REGRESSION_SUITE.md.

Goal:
Implement Phase 2 of Template Import Learning.

Task:
Create a database schema proposal and UI skeleton for template import.

Rules:
- No live quote rendering changes.
- No export payload changes.
- No accounting metadata stored as template authority.
- Templates may store section structure and wording only.
- Preserve Amy, Sarah, and Simon regression baselines.

Deliver:
- migration proposal for quote_templates and template sections
- import UI skeleton
- template review draft state
- no activation in production quote flow yet
- TypeScript build passes
```
