# Universal vs Trade-Specific Architecture

This document audits which parts of Quotecord should remain universal across trades and which parts are currently trade-specific. It exists to protect Quotecord from quietly becoming a gardening or landscaping-only product while planting features are being built out.

Quotecord's product direction remains universal: the app should support gardening maintenance, landscaping, building, electrical, plumbing, painting, cleaning, arborist, and multi-trade businesses. Trade-specific intelligence is encouraged, but it must be isolated behind clear modules, renderers, calculators, templates, mappings, or user configuration.

## Current Architecture Summary

The current application has a strong universal core with an increasingly mature planting-specific layer.

The universal workflow is:

```text
Capture notes or audio
↓
Transcribe
↓
Correct transcript
↓
Extract structured quote facts
↓
Run deterministic post-processing
↓
Build customer/internal review views
↓
Save draft
↓
Build export payload
```

The planting workflow adds:

```text
Extract planting facts
↓
Match Plant Library
↓
Run Planting Calculator
↓
Generate quote options
↓
Render planting customer scope
↓
Build planting-aware Xero lines
```

This is acceptable as long as the planting-specific path is clearly isolated and non-planting jobs continue through neutral behaviour.

## Universal App Layers

These layers should remain trade-neutral.

### Transcript Capture

Current surfaces:

- Browser audio recording
- Paste Notes input
- Testing / Debug runner

Universal responsibilities:

- Capture user-provided job context.
- Preserve raw transcript or pasted text.
- Allow added notes without requiring a specific trade.

Should not:

- Assume plant, garden, waste, or landscaping concepts.
- Add trade-specific wording at capture time.

### Transcription

Current route:

- `app/api/transcribe/route.ts`

Universal responsibilities:

- Convert audio into transcript text.
- Keep OpenAI API key server-side.
- Return transcript or useful errors.

Should not:

- Apply trade quote logic.
- Apply trade-specific pricing or scope decisions.

### Correction

Current route:

- `app/api/correct-transcript/route.ts`

Universal responsibilities:

- Lightly correct likely transcription errors.
- Fail non-blockingly and continue with original transcript when correction fails.
- Preserve raw transcript.

Current trade-specific pressure:

- The correction vocabulary currently includes NZ gardening/property maintenance terms.

Recommended boundary:

- Keep the correction route universal.
- Move trade vocabularies into trade-specific vocab packs selected by primary trade, transcript classification, templates, or Knowledge Base.

### Extraction

Current route:

- `app/api/process-quote/route.ts`

Universal responsibilities:

- Classify trade.
- Extract client and site address.
- Extract structured quote facts.
- Preserve missing information and confidence warnings.
- Return the common `ProcessedQuote` schema.

Should not:

- Put all trade-specific rules in one large route forever.
- Let planting assumptions leak into electrical, plumbing, building, or generic jobs.

Recommended boundary:

- Keep a shared extraction orchestrator.
- Move trade-specific extraction instructions and post-processors into trade modules.

### Structured Quote Model

Current files:

- `lib/processed-quote.ts`
- `lib/customer-quote-preview.ts`
- `lib/quote-options.ts`

Universal responsibilities:

- Store common quote fields.
- Store line items.
- Store customer/internal sections.
- Store quote options in a trade-neutral shape.
- Preserve metadata for export and review.

Should not:

- Make plant-specific fields required for all quotes.
- Require calculators or quote options for simple service quotes.

### Customer View

Current files:

- `components/quote-review.tsx`
- `lib/customer-quote-preview.ts`

Universal responsibilities:

- Show customer-facing scope.
- Hide internal notes, formulas, confidence, and debug information.
- Support review and editing.

Should not:

- Always show planting options.
- Use planting scope wording for unrelated trades.

### Internal View

Current files:

- `components/quote-review.tsx`
- `lib/processed-quote.ts`

Universal responsibilities:

- Show extracted facts.
- Show missing information and confidence warnings.
- Show matched line items and metadata.
- Show calculator outputs where present.

Should not:

- Hide trade-specific diagnostic details needed for review.
- Force planting-specific cards for non-planting quotes.

### Template Rendering Framework

Current file:

- `lib/template-renderer.ts`

Universal responsibilities:

- Render customer-facing wording from structured facts.
- Support template-controlled wording.
- Avoid AI-generated final wording where deterministic rendering is possible.

Current trade-specific pressure:

- Current placeholders and default template are planting-oriented:
  - `{{planting_scope}}`
  - `{{materials_scope}}`
  - `{{cleanup_scope}}`

Recommended boundary:

- Keep the renderer framework universal.
- Move planting placeholders into a planting renderer.
- Add future renderer modules for maintenance, hedge trimming, electrical, plumbing, building, and generic fallback.

### Knowledge Base Import

Current files:

- `components/jms-item-library.tsx`
- `components/plant-library.tsx`
- `lib/plant-library-import.ts`
- `lib/plant-item-classification.ts`

Universal responsibilities:

- Import CSV/XLSX knowledge.
- Detect columns.
- Let users review and override mappings.
- Preserve `raw_import`.
- Store imported items in `knowledge_items`.

Should not:

- Require every imported item to be a plant or garden material.
- Hardcode one supplier, one JMS, or one trade.

### Item Matching

Current files:

- `app/api/process-quote/route.ts`
- `components/record-screen.tsx`
- `components/quote-test-runner.tsx`

Universal responsibilities:

- Match spoken facts to imported Knowledge Base/JMS items.
- Preserve item codes, account codes, tax metadata, sell prices, and source system.
- Avoid inventing item codes.

Current trade-specific pressure:

- Labour preference logic includes landscaping and maintenance examples.
- Plant-related matching has special safeguards against chemical products.
- Garden mix, greenwaste, hardfill, and spoil removal are handled explicitly.

Recommended boundary:

- Keep matching engine universal.
- Move trade/item-type scoring profiles into trade-specific matcher configuration.

### Xero / Export Payload Framework

Current files:

- `app/api/export-xero-quote/route.ts`
- `lib/xero-quote-payload.ts`

Universal responsibilities:

- Convert a reviewed structured quote into an export payload.
- Enforce contact safety.
- Preserve line item quantities, rates, account codes, tax types, and item codes where valid.
- Omit invalid item codes.
- Keep export adapter-specific logic out of extraction.

Current trade-specific pressure:

- Planting-specific Xero rendering now exists.
- Account code fallbacks are currently hardcoded by category.

Recommended boundary:

- Keep `lib/xero-quote-payload.ts` as the adapter/orchestrator.
- Move trade-specific Xero line rendering into separate renderer modules.
- Replace hardcoded account defaults with user/export configuration.

### Draft Saving

Current files:

- `lib/save-quote-draft.ts`
- `quote_drafts` table

Universal responsibilities:

- Save the processed quote, editable sections, quote options, and line items.
- Preserve raw transcript and edited state.

Should not:

- Require any one trade's calculator output.

## Trade-Specific Layers

These parts are intentionally trade-specific and should remain isolated.

### Plant Library

Current files:

- `components/plant-library.tsx`
- `lib/plants/index.ts`
- `lib/plant-library-import.ts`
- `lib/plant-item-classification.ts`

Purpose:

- Import true plant items from nursery/plant price lists.
- Exclude sprays, fertilisers, plant soap, wetting agents, chemicals, and plant care products from calculator plant options.
- Provide plant names, aliases, sizes, spacing, sell prices, supplier, stock, and raw import metadata.

Boundary:

- This should only be used by planting/landscaping workflows that need plant pricing or spacing.
- Non-planting quotes should not depend on Plant Library.

### Planting Calculator

Current files:

- `lib/calculators/planting/index.ts`
- `lib/plants/index.ts`

Purpose:

- Calculate plant count.
- Use spoken quantity first.
- Use spoken spacing before library spacing.
- Generate option groups from Plant Library items.
- Return warnings for missing plant, spacing, quantity/length, price, or requested size.

Boundary:

- This calculator is planting-specific.
- AI should extract PlantCalculatorRequest inputs only.
- The calculator performs arithmetic.

### Planting Quote Options

Current file:

- `lib/quote-options.ts`

Purpose:

- Convert Planting Calculator option groups into reusable `quoteOptions`.
- Support multiple plant size options and area-specific options.

Boundary:

- `QuoteOption` is universal.
- The conversion from Planting Calculator result to `QuoteOption` is planting-specific.
- Future calculators should create their own option converters.

### Planting Renderer

Current files:

- `lib/template-renderer.ts`
- `lib/xero-quote-payload.ts`

Purpose:

- Render customer-facing planting scope.
- Render planting-aware Xero lines.

Boundary:

- Planting renderer must only run for `job_type` planting/hedge planting.
- It should use facts only:
  - plant names
  - planting areas
  - materials
  - spoil removal
  - cleanup flags
  - quote options
  - template content

Should not:

- Hardcode actions like mark out holes, dig holes, backfill, blow down, or tidy unless those are present in facts, templates, or renderer context.

### Garden / Landscape Material Logic

Current examples:

- Garden mix
- Mulch
- Hardfill
- Old soil removal
- Greenwaste
- Spoil removal

Current files:

- `app/api/process-quote/route.ts`
- `lib/template-renderer.ts`
- `lib/xero-quote-payload.ts`
- `lib/customer-quote-preview.ts`

Boundary:

- Garden/landscape material interpretation should not be global.
- Future building/electrical/plumbing quotes should not inherit garden material assumptions.

### Greenwaste / Spoil / Removal Logic

Current status:

- Greenwaste uncertainty and totals are handled in quote post-processing.
- Spoil/hardfill/old soil removal is used in rendering and Xero export.

Boundary:

- Greenwaste is gardening/landscaping-specific.
- Spoil/removal can exist in multiple trades, but meaning differs by trade.
- These concepts should be modeled as trade/category-specific material or waste line items.

## Current Hardcoded Assumptions To Isolate

### Planting Wording

Current examples:

- `Plant multiple {plantName} along {area}.`
- `Supply garden mix required for planting works.`
- `Remove spoil generated during planting.`
- `Tidy the work area on completion.`

Risk:

- These phrases are currently useful for Sarah/Amy planting tests, but they should not become global customer scope defaults.

Recommended isolation:

- Move to `lib/renderers/planting`.
- Treat as default planting renderer output only when facts support it.
- Prefer templates once user templates are available.

### Labour Categories

Current examples:

- Maintenance labour
- Landscaping labour
- Generic labour
- Trade-aware labour preference

Risk:

- Labour matching can become biased toward landscaping if not isolated.

Recommended isolation:

- Shared labour calculator/matcher core.
- Trade-specific labour scoring profiles:
  - gardening maintenance
  - landscaping
  - building
  - electrical
  - plumbing
  - painting
  - cleaning
  - arborist

### Account Code Fallbacks

Current hardcoded fallbacks:

- labour -> `10010`
- plants -> `10115`
- materials/chemical/waste -> `10011`

Risk:

- These may match one accounting setup but are not universal.

Recommended isolation:

- Move to user-configurable export settings.
- Use imported Xero inventory/account metadata first.
- Use category fallback only as user-configured defaults, not permanent code assumptions.

### Plant Spacing Defaults

Current source:

- Plant Library spacing.
- Spoken spacing override.

Risk:

- Hardcoded spacing would be unsafe.

Current state:

- Plant spacing is mostly well-isolated in Plant Library and Planting Calculator.

Guardrail:

- Do not hardcode spacing by plant species in source code.
- Use Plant Library or spoken values only.

### Garden Material Handling

Current examples:

- Garden mix
- Mulch
- Greenwaste
- Hardfill

Risk:

- These concepts are currently scattered across extraction, rendering, customer preview, and Xero export.

Recommended isolation:

- Move garden/landscape material rules into a landscaping/planting material module.
- Keep generic material line item handling separate.

### Xero Account Defaults

Current examples:

- Account fallback by category in `lib/xero-quote-payload.ts`.

Risk:

- Account defaults differ by Xero chart of accounts.

Recommended isolation:

- Add user-configured export mapping:
  - category -> account code
  - item type -> account code
  - tax type defaults
  - source system rules

## Recommended Architecture

### 1. Universal Core

Universal core should contain:

- capture
- transcription
- transcript correction orchestration
- client/address extraction
- trade classification
- structured quote schema
- draft saving
- review UI shell
- Knowledge Base storage
- import framework
- item matching engine
- export adapter orchestration

Suggested future structure:

```text
lib/core/
  quote-schema.ts
  lead-extraction.ts
  address-extraction.ts
  item-matching.ts
  export-types.ts
  warnings.ts
```

### 2. Trade Plugin / Renderer Layer

Each trade should provide optional modules:

```text
lib/trades/
  planting/
    extractor.ts
    calculator.ts
    renderer.ts
    xero-renderer.ts
    item-profile.ts
  maintenance/
    extractor.ts
    renderer.ts
    xero-renderer.ts
    item-profile.ts
  electrical/
    extractor.ts
    renderer.ts
    xero-renderer.ts
    item-profile.ts
  plumbing/
  building/
  painting/
  cleaning/
  arborist/
```

The orchestrator should select a trade module based on:

- user primary trade
- transcript classification
- selected template
- explicit user instruction

### 3. Industry Templates

Templates should provide business-specific wording and rules.

Templates should control:

- customer wording
- standard inclusions
- exclusions
- optional works
- estimate/fixed-price language
- line item presentation
- trade-specific phrasing

Templates should not be replaced by hardcoded renderer language.

### 4. User-Configurable Mappings

User settings should eventually control:

- Xero account code defaults
- tax type defaults
- item category mapping
- source-system item code trust rules
- export behaviour by trade
- quote option presentation

### 5. Export Adapters

Export adapters should be separate from trade renderers.

Recommended layering:

```text
ProcessedQuote
↓
Trade renderer builds export-intent lines
↓
Export adapter maps to Xero / JMS / PDF / email shape
```

For Xero:

- Xero adapter should know Xero field names.
- Trade renderer should know trade-specific line grouping.
- User config should supply account/tax fallbacks.

## Files With Trade-Specific Logic

These files currently contain trade-specific logic and should be clearly marked or moved later.

### `app/api/process-quote/route.ts`

Contains:

- trade classification
- extractor instructions
- planting request extraction/post-processing
- greenwaste logic
- landscaping material preservation
- labour calculation rules
- line item matching refinements

Risk:

- This route is too large and mixes universal orchestration with trade-specific post-processing.

Recommended future move:

- Extract trade modules under `lib/trades/*`.
- Keep route as orchestration only.

### `lib/template-renderer.ts`

Contains:

- planting placeholder names
- planting scope generation
- garden mix wording
- spoil removal wording
- tidy wording

Risk:

- Template renderer appears universal but currently defaults to planting wording.

Recommended future move:

- Move planting default rendering to `lib/trades/planting/renderer.ts`.
- Keep universal renderer as placeholder orchestration.

### `lib/xero-quote-payload.ts`

Contains:

- Xero adapter logic
- Planting Xero Renderer
- Generic Renderer fallback
- account code fallbacks
- plant line rendering
- garden mix and hardfill line detection

Risk:

- Export adapter and trade renderer are mixed.

Recommended future move:

- `lib/export/xero/adapter.ts`
- `lib/trades/planting/xero-renderer.ts`
- `lib/trades/generic/xero-renderer.ts`
- user-configured account mapping service

### `lib/customer-quote-preview.ts`

Contains:

- combined plant options
- planting labour display
- garden mix and hardfill material lines

Risk:

- Customer preview is universal UI support but includes planting/landscape presentation assumptions.

Recommended future move:

- Generic preview shell.
- Trade-specific preview sections registered by trade module.

### `lib/quote-options.ts`

Contains:

- universal `QuoteOption` type
- Planting Calculator result to quote option conversion

Risk:

- Type is universal, converter is planting-specific.

Recommended future move:

- Keep `QuoteOption` in universal core.
- Move `quoteOptionsFromPlantCalculatorResults` to planting module.

### `lib/calculators/planting/index.ts`

Contains:

- Planting Calculator
- plant count formulas
- requested size matching
- plant option group generation

Status:

- Correctly trade-specific.

Recommended future action:

- Keep isolated.
- Avoid importing it into generic modules except via selected planting workflow.

### `lib/plants/index.ts`

Contains:

- Plant Library matching
- plant alias matching
- spacing lookup
- size option matching

Status:

- Correctly planting/landscaping-specific.

Recommended future action:

- Keep isolated as Plant Library service.

### `components/plant-library.tsx`

Contains:

- Plant Library import UI.

Status:

- Trade-specific Knowledge Base section.

Recommended future action:

- Keep under Knowledge Base but label as Plant Library.
- Do not reuse for generic material imports.

### `components/jms-item-library.tsx`

Contains:

- universal JMS/price list import
- item classification including plant/chemical/garden terms

Risk:

- Some plant/garden classification logic is embedded in universal import UI.

Recommended future move:

- Keep universal import shell.
- Move classification profiles into configurable item-type classifiers.

### `components/record-screen.tsx`

Contains:

- universal capture and processing
- client-side Knowledge Base context loading
- item scoring context
- plant/trade-specific matching helpers

Risk:

- Record screen should ideally orchestrate, not classify/match by trade.

Recommended future move:

- Move context shaping/matching helpers into shared services.

### `components/quote-test-runner.tsx`

Contains:

- duplicate matching/correction/test logic.

Risk:

- Test runner may drift from production logic.

Recommended future move:

- Reuse production services for correction, item context, and quote processing.

## Guardrails For Future Development

### New Planting Logic

All new planting logic should live in planting-specific modules.

Allowed locations:

- `lib/calculators/planting`
- `lib/plants`
- future `lib/trades/planting/*`
- planting-specific Knowledge Base UI

Avoid adding new planting rules directly to:

- generic quote schema
- generic customer view
- generic Xero adapter
- generic extraction prompt

### Generic Quote Flow

Generic flow must remain trade-neutral.

Generic quote flow should not assume:

- plants
- greenwaste
- garden mix
- hedge rows
- planting labour
- landscape account codes

### Building / Electrical / Plumbing Isolation

Building, electrical, plumbing, HVAC, painting, cleaning, arborist, and generic jobs must not inherit:

- planting customer wording
- planting calculator requirements
- plant option groups
- garden material lines
- plant account code defaults
- greenwaste assumptions

### Export Mapping

Export mapping should use:

- imported item metadata
- source system confirmation
- user-configured account code mappings
- trade/category mapping profiles
- template/export settings

Export mapping should not rely permanently on:

- hardcoded account codes
- internal Plant Library item codes as Xero item codes
- trade-specific defaults in a universal adapter

### Calculators

Calculators must remain deterministic.

Rules:

- AI extracts.
- Calculators calculate.
- Price lists provide rates.
- Users review results.

Future calculators should follow the same pattern as Planting Calculator, but must live in their own modules.

### Templates

Templates should gradually replace hardcoded customer wording.

Renderer defaults are acceptable as MVP fallback, but long-term wording should come from:

- uploaded quote templates
- Knowledge Base rules
- user-edited templates
- trade renderer placeholders

## Risks Found

### Risk 1: Planting Renderer Hidden In Universal Template Renderer

`lib/template-renderer.ts` currently looks universal but produces planting-specific defaults. This is the most important boundary to clean up before adding more trades.

### Risk 2: Xero Adapter Contains Trade Renderer Logic

`lib/xero-quote-payload.ts` now has a Planting Renderer and Generic Renderer, which is an improvement, but they still live in the adapter file.

### Risk 3: Account Code Defaults Are Hardcoded

Hardcoded fallbacks are useful for MVP but not universal.

### Risk 4: Process Route Is Too Large

`app/api/process-quote/route.ts` contains universal orchestration, extraction prompts, item matching, labour rules, material handling, greenwaste, planting, and fallback logic.

### Risk 5: Customer Preview Contains Planting Presentation

Plant option grouping and material line presentation are currently inside universal customer preview code.

## Recommended Module Boundaries

Recommended near-term structure:

```text
lib/
  core/
    quote-types.ts
    lead-details.ts
    item-matching.ts
    export-lines.ts

  renderers/
    template-renderer.ts
    generic-renderer.ts

  trades/
    planting/
      calculator.ts
      plant-library.ts
      quote-options.ts
      customer-renderer.ts
      xero-renderer.ts
      material-rules.ts

    maintenance/
      extractor-profile.ts
      renderer.ts
      xero-renderer.ts

    electrical/
      extractor-profile.ts
      renderer.ts
      xero-renderer.ts

  export/
    xero/
      payload-builder.ts
      account-mapping.ts
      tax-mapping.ts
      item-code-policy.ts
```

## Next Implementation Recommendation

The next architecture cleanup should be:

1. Create `lib/trades/planting/xero-renderer.ts`.
2. Move planting-specific Xero line generation out of `lib/xero-quote-payload.ts`.
3. Keep `lib/xero-quote-payload.ts` as the Xero adapter/orchestrator.
4. Create `lib/trades/generic/xero-renderer.ts` for fallback behaviour.
5. Add tests proving:
   - planting quotes use planting renderer
   - electrical quotes use generic renderer
   - no planting wording appears in non-planting Xero payloads

After that:

1. Move planting customer scope generation out of `lib/template-renderer.ts`.
2. Move Planting Calculator quote option conversion out of `lib/quote-options.ts`.
3. Create user-configurable export account mappings to replace hardcoded defaults.

## Current Decision

Planting-specific logic may continue to mature because Plant Library MVP is a current stable baseline. However, every new planting feature must be added behind a planting-specific boundary or be clearly marked for later extraction.

The universal product direction remains unchanged:

```text
Universal core + trade-specific modules + user configuration + export adapters
```

