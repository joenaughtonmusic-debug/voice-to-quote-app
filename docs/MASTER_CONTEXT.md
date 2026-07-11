# Talk to Quote Master Context

This document is the master product context for Talk to Quote. It is intended to be read by future AI agents, developers, founders, contractors, investors, product managers, and anyone else who needs to understand what Talk to Quote is, why it exists, how it works, and how it should evolve.

It should be treated as a living product document. When major product decisions, architectural changes, or strategic assumptions change, this file should be updated.

---

## 1. Product Overview

### Product Name

Talk to Quote

### Mission

Talk to Quote helps trade businesses turn voice notes, site visit observations, and customer conversations into structured quote drafts with far less manual admin.

The mission is to make quoting faster, more consistent, and more accurate without forcing tradespeople to change how they naturally work in the field.

### Vision

The long-term vision is for Talk to Quote to become the voice-first quote intelligence layer for trade businesses.

Talk to Quote should sit between real-world site work and job management systems. It should understand spoken job details, business templates, price lists, supplier data, trade-specific terminology, and user preferences, then produce a clean draft quote that can be reviewed and pushed into a user’s existing workflow.

Talk to Quote is not intended to replace job management systems. It is intended to make them easier to use by solving the hardest part of quoting: turning messy real-world notes into structured, commercially useful quote data.

### Core Problem Being Solved

Trade businesses often lose time and accuracy between the site visit and the quote.

Common pain points include:

- Notes are captured in scattered places: voice memos, texts, notebooks, photos, memory, job management systems, and email.
- Quotes are often written hours or days after the site visit, when details are less fresh.
- Customer details, site constraints, exclusions, materials, and optional extras are easy to miss.
- Pricing depends on business-specific templates, supplier price lists, and job management system item codes.
- Admin work happens after hours.
- Repetitive quote wording is rewritten manually.
- Job management systems are powerful but not always quick to use on-site.
- AI tools are often too generic and do not understand trade quoting structure.

Talk to Quote exists to reduce the gap between field work and quote creation.

### Target Users

Initial and planned target users include:

- Gardening and property maintenance businesses
- Landscapers
- Builders
- Electricians
- Plumbers
- Painters
- Cleaners
- Arborists
- Multi-trade service businesses
- Small trade business owners
- Estimators
- Operations/admin staff who prepare quotes from field notes

The product should work particularly well for owner-operators and small teams where one person often sells, scopes, prices, and performs the work.

### Why the Product Exists

Talk to Quote exists because the most valuable quote information is often spoken immediately after a site visit, not typed into a system.

A tradesperson can describe the job naturally:

> "Quote for Sarah at 22 Valley Road. Trim the Griselinia hedge back to fence height, allow for two bags of greenwaste, and include an optional ongoing maintenance visit every two months."

That spoken note contains customer information, site details, plant names, scope, waste allowance, optional quote intent, and recurring service opportunity. But without an intelligent system, that information still needs to be manually translated into a quote.

Talk to Quote turns that raw spoken context into structured quote data while preserving uncertainty and keeping a human in control.

---

## 2. Product Philosophy

Talk to Quote’s product philosophy is built around a few core decisions.

### Voice-First Workflow

The product is designed around the reality that tradespeople often think and work aloud.

Voice is faster than typing after a site visit. It captures context, cautions, measurements, customer requests, and judgement calls in the moment. Talk to Quote should make voice the easiest way to create a first draft, while still supporting typed notes, pasted transcripts, and future conversation-style capture.

Voice-first does not mean voice-only. It means the primary capture workflow should assume that the user is mobile, busy, and still close to the job context.

### Mobile-First

Talk to Quote should be usable on a phone immediately after or during a site visit.

Mobile-first means:

- Controls must be thumb-friendly.
- Recording controls must remain visible.
- Notes must be editable while recording.
- Long forms should be avoided where possible.
- Review screens must be readable and editable on small screens.
- The experience should remain useful even before desktop workflows are polished.

### Designed for Use Immediately After Site Visits

The critical product moment is just after the user has seen the job.

At that point, the user knows:

- What the customer wants
- What is unusual about the site
- What access constraints exist
- What materials or equipment may be required
- What uncertainty or risk should be priced carefully
- What optional upsells or recurring work may be relevant

Talk to Quote should help capture that knowledge before it fades.

### Minimise Admin

The product should reduce repetitive admin, not create another admin surface.

Admin should be minimised by:

- Reusing templates
- Learning from uploaded quote examples
- Matching existing JMS item codes
- Using plant and material libraries
- Preserving customer/site details
- Highlighting only what needs review

### Templates Over Hardcoded Logic

Business-specific quote structure should come from templates, not from source code.

For example, if a business prefers wording like "This is an estimate, not a fixed quote due to variables involved", that should come from an uploaded template or reusable business rule, not a hardcoded prompt rule.

Templates should control:

- Default wording
- Standard inclusions
- Standard exclusions
- Pricing structure
- Estimate wording
- Customer-facing phrasing
- Internal rules

### Knowledge Base Over Business-Specific Prompts

Talk to Quote should avoid hardcoded business logic such as:

- Specific company prices
- Specific user item codes
- Specific user quote wording
- Specific supplier names as defaults
- Specific customer assumptions

Instead, business-specific behaviour should be derived from:

- Quote templates
- Knowledge Base documents
- JMS item library imports
- Plant library imports
- User settings
- Spoken overrides

### JMS Integration Over Standalone Quoting

Talk to Quote should complement existing job management systems rather than compete with them directly.

Most trade businesses already use or may eventually use tools such as Tradify, ServiceM8, Fergus, SimPRO, Jobber, or Xero. Talk to Quote’s strategic value is in making quote creation easier before the quote reaches those systems.

Long term, Talk to Quote should push clean quote data into a JMS, not force users to maintain two disconnected systems.

### Universal Multi-Industry Approach

Talk to Quote is designed for multiple trades.

It should support trade-specific extraction while sharing universal logic for:

- Client extraction
- Address extraction
- Template matching
- Knowledge Base matching
- JMS item matching
- Missing information
- Confidence warnings
- Human review

The product should not become hardcoded around one company, one trade, or one workflow.

### Human Review Before Sending

AI should draft. Humans should approve.

Talk to Quote should not send customer quotes automatically without human review. The AI can accelerate quote creation, but trade quotes often carry commercial, legal, and reputational risk. The user must be able to review, edit, and approve the quote before export or sending.

### Core Principles

#### Do Not Hardcode Business Rules

Do not hardcode rules for a specific business, user, supplier, item code, price, or wording.

#### User Configuration Over Developer Configuration

If behaviour differs by business, it should be configurable by the user or learned from the user’s uploaded data.

#### Spoken Overrides Always Win

If the user says a rate, price, quantity, spacing, frequency, or instruction explicitly, the spoken value should override default templates or imported libraries.

Examples:

- "$95 per hour" overrides a JMS labour rate.
- "At 850mm spacing" overrides plant library default spacing.
- "Do not remove the flax" overrides generic tidy wording.
- "Keep this optional" overrides automatic inclusion in the main total.

#### Preserve Uncertainty Rather Than Guessing

If information is missing or ambiguous, Talk to Quote should flag it.

The system should prefer:

- Missing information
- Confidence warnings
- Needs review flags
- Internal notes

over invented certainty.

---

## 3. Core User Workflow

### Current Workflow

The current core workflow is:

1. Site visit
2. Record quote
3. Transcribe audio
4. Correct transcript
5. Classify trade
6. Match templates
7. Load Knowledge Base
8. Match JMS items
9. Extract quote
10. Review quote
11. Save draft
12. Export or push to JMS in the future

### Site Visit

The user visits a site, speaks to the customer, measures or observes the work, identifies constraints, and decides how the quote should be framed.

The site visit may include:

- Customer requests
- Measurements
- Photos
- Plant/material details
- Access notes
- Optional work
- Exclusions
- Risk factors
- Pricing thoughts

### Record Quote

The user records a spoken summary in Talk to Quote.

The recording flow supports:

- Recording
- Pausing
- Stopping
- Discarding
- Timer
- Notes while recording

The user may also type or paste notes without leaving the app.

### Transcript

The audio is sent to a server-side transcription route. The OpenAI API key remains server-side only.

The raw transcript must be preserved. Later correction layers may improve extracted output, but they should not overwrite the original record of what was said.

### Correction Layer

The transcript correction layer lightly corrects likely trade vocabulary and place-name issues.

Examples:

- "flecks" may mean "flax"
- "Newlin" may mean "New Lynn"
- "Tierra 2 Peninsula" may mean "Te Atatu Peninsula"
- "grislynia" may mean "Griselinia"

Corrections should be recorded in internal notes when useful.

### Trade Classification

The system classifies the transcript into a trade/specialist extractor.

Current and planned categories include:

- Gardening maintenance
- One-off tidy
- Landscaping
- Planting
- Hedge trimming
- Building
- Electrical
- Plumbing
- Painting
- Cleaning
- Arborist
- General fallback

The user’s primary trade setting is a strong signal when the transcript is ambiguous, but clear transcript evidence can override it.

### Template Matching

Templates are loaded from the user’s template library.

Template matching should:

- Use a template when clearly relevant
- Avoid forcing templates when the transcript does not fit
- Avoid using ongoing maintenance templates for one-off hedge trimming unless recurring work is mentioned
- Preserve template variables rather than old customer/job details

### Knowledge Base

The Knowledge Base provides business-specific context:

- Templates
- Rules
- Exclusions
- Price lists
- Plant libraries
- Supplier information
- Historical examples

This context should influence extraction without becoming hardcoded.

### JMS Item Matching

The JMS Item Library provides item codes, names, aliases, units, sell prices, and categories.

The extraction engine should match spoken line items to imported JMS items where possible.

Examples:

- "4 hours labour" -> hourly labour item
- "2 bags greenwaste" -> greenwaste item
- "wood chipper" -> equipment hire item

### Quote Extraction

The quote extraction engine produces a structured `ProcessedQuote`.

It should include:

- Client name
- Site address
- Job type
- Selected template
- Customer-facing scope
- Internal notes
- Labour allowance
- Materials
- Greenwaste
- Exclusions
- Follow-up tasks
- Missing information
- Confidence warnings
- Matched line items

### Review

The user reviews editable cards in Quote Review.

The review process is essential because:

- AI can misinterpret details.
- Pricing may need judgement.
- Legal/customer wording matters.
- Missing information may need follow-up.

### Export / Push to JMS

Future workflow should allow the user to push approved quote data into their JMS.

This may include:

- Customer details
- Site address
- Quote title
- Scope
- Line items
- Optional sections
- Notes
- Attachments

### Future Workflow Vision

Long term, Talk to Quote should support:

- Voice conversation mode
- Multi-step quote clarification
- Photo-assisted quote context
- Address autocomplete
- Supplier price refresh
- Direct JMS quote creation
- Team review workflows
- Customer-ready quote exports

---

## 4. Target Industries

Talk to Quote is built as a multi-industry platform with shared universal extraction and trade-specific extractors.

### Gardening Maintenance

Gardening maintenance work is often recurring and cadence-based.

Important concepts:

- Visit frequency
- Visit duration
- Crew size
- Recurring pricing
- Greenwaste allowance
- Sprays and fertiliser
- Seasonal tasks
- Customer priorities
- First visit versus recurring visits

Common quote types:

- Weekly garden maintenance
- Fortnightly garden maintenance
- Monthly or two-monthly maintenance
- Hedge trimming
- Lawn and garden care
- Seasonal tidy-ups

### Landscaping

Landscaping is often material-heavy and measurement-heavy.

Important concepts:

- Measurements
- Construction sequence
- Stages
- Labour duration
- Timber sizes
- Concrete types
- Drainage products
- Aggregates
- Excavation and disposal
- Access and machinery

Common quote types:

- Retaining
- Drainage
- Paving
- Garden beds
- Lawn preparation
- Edging
- Planting
- Mulching

### Building

Building work often involves structural details, staged labour, compliance, and materials.

Important concepts:

- Demolition
- Framing
- Fixings
- Linings
- Cladding
- Waterproofing
- Finishing
- Site protection
- Consent/inspection needs

Common quote types:

- Repairs
- Alterations
- Small builds
- Decking
- Framing
- Cladding
- Interior linings

### Electrical

Electrical work requires strong technical term preservation and compliance awareness.

Important concepts:

- Power points
- Downlights
- Switchboards
- TPS cable
- RCDs
- Conduit
- Certificates of compliance
- Fault finding
- Testing
- Supply/install distinction

Common quote types:

- Install power points
- Replace lighting
- Add downlights
- Switchboard work
- Fault finding
- Certification

### Plumbing

Plumbing work often includes fixtures, pipework, repairs, drainage, and access constraints.

Important concepts:

- Fixture type
- Pipe size/material
- Valves
- Traps
- Drains
- Leaks
- Pumps
- Hot water units
- Excavation and reinstatement
- Testing/compliance

Common quote types:

- Tap/toilet replacement
- Leak repair
- Drainage work
- Hot water system work
- Pump installation
- Gas/water/waste connections

### Painting

Painting work depends on surface preparation, areas, coatings, access, and finish requirements.

Important concepts:

- Interior/exterior
- Surface/substrate
- Preparation level
- Number of coats
- Paint system
- Colour/product selection
- Access/scaffolding

Common quote types:

- Interior repaint
- Exterior repaint
- Fence/deck staining
- Repairs and prep
- Roof or cladding painting

### Cleaning

Cleaning work may be recurring or one-off and depends heavily on service level and area count.

Important concepts:

- Cleaning type
- Rooms/areas
- Surfaces
- Frequency
- Duration
- Consumables
- Chemicals
- Access
- Special treatments

Common quote types:

- Regular clean
- Deep clean
- End-of-tenancy clean
- Builders clean
- Exterior wash

### Arborist

Arborist work involves risk, access, tree size/species, equipment, and disposal.

Important concepts:

- Tree species
- Height/spread
- Power lines
- Neighbouring property risk
- Chipping/disposal
- Stump grinding
- Traffic management
- Permits/consents

Common quote types:

- Tree pruning
- Tree removal
- Crown reduction
- Stump grinding
- Chipping
- Site management

---

## 5. AI Architecture

Talk to Quote’s AI architecture is layered. Each layer has a defined responsibility.

### Transcript

The transcript is the source text from voice recording or pasted test input.

The raw transcript should be preserved and never silently rewritten as the source of record.

### Correction Layer

The correction layer lightly corrects likely transcription errors before quote extraction.

Responsibilities:

- Trade vocabulary correction
- Plant name correction
- Place-name correction
- Uncertain term reporting

The correction layer should not rewrite the quote. It should preserve meaning and identify corrections.

### Trade Classifier

The classifier chooses the appropriate extraction framework.

Responsibilities:

- Determine dominant trade/job type
- Use primary trade as fallback signal
- Route electrical jobs strongly when electrical indicators exist
- Avoid generic classification when clear trade indicators exist

### Template Engine

The template engine provides reusable business structure.

Responsibilities:

- Load user templates
- Match templates by name, category, and content
- Use template wording where relevant
- Avoid forcing unrelated templates
- Preserve template variables

### Knowledge Base

The Knowledge Base provides user-specific rules and reference data.

Responsibilities:

- Supply reusable wording
- Supply exclusions
- Supply pricing rules
- Supply plant/material/supplier knowledge
- Influence extraction without hardcoding

### JMS Item Library

The JMS Item Library provides structured line item data.

Responsibilities:

- Match spoken items to imported item codes
- Provide sell prices
- Provide units
- Provide aliases
- Avoid using cost prices as sell prices

### Trade Extractors

Trade extractors provide structured extraction priorities for each trade.

Responsibilities:

- Identify trade-specific fields
- Preserve trade-specific technical language
- Guide customer scope
- Guide internal notes and calculations
- Trigger missing info and confidence warnings

### Quote Generator

The quote generator produces the `ProcessedQuote` schema.

Responsibilities:

- Return structured quote data
- Preserve uncertainty
- Populate missing information
- Populate confidence warnings
- Produce line items
- Include internal notes

### Post-Processing

Post-processing is deterministic and should correct or enrich output without relying on AI.

Current examples:

- Line item total calculation
- Quantity/rate warning cleanup
- Address review notes
- Greenwaste uncertainty
- Hourly labour item preference
- Planting calculator
- Hedge-template guardrails

---

## 6. Trade Extractor Architecture

### Shared Extraction Layer

The shared extraction layer handles universal quote concepts:

- Client name
- Site address
- Template matching
- JMS item matching
- Spoken pricing overrides
- Missing information
- Customer/internal separation
- Fallback behaviour
- Line item review flags

Trade extractors should not duplicate shared responsibilities unless trade context changes how information should be interpreted.

### Gardening Extractor

Responsible for:

- Recurring maintenance cadence
- Visit duration
- Crew size
- Greenwaste
- Sprays/fertiliser
- Seasonal tasks
- First visit/setup tidy
- Customer priorities

Should separate:

- Every-visit tasks
- Periodic tasks
- Optional extras
- One-off setup work

### Landscaping Extractor

Responsible for:

- Measurements
- Dimensions
- Construction sequence
- Stages
- Labour duration
- Materials
- Drainage
- Aggregates
- Timber sizes
- Concrete types
- Equipment/access

Should avoid collapsing material-heavy jobs into generic summaries.

### Building Extractor

Responsible for:

- Demolition
- Framing
- Linings
- Cladding
- Fixings
- Waterproofing
- Finishing
- Access
- Site protection
- Compliance/inspection notes

Should preserve structural details and avoid inventing consent assumptions.

### Electrical Extractor

Responsible for:

- Electrical scope
- Device/fitting counts
- Locations
- Cable/conduit
- Switchboards
- RCDs
- Testing
- Compliance/certification

Should strongly preserve technical terms and avoid turning uncertain compliance details into fixed claims.

### Plumbing Extractor

Responsible for:

- Fixtures
- Pipe sizes/materials
- Valves/traps
- Drains
- Hot water units
- Pumps
- Leaks/blockages
- Excavation/reinstatement
- Testing/compliance

Should distinguish investigation from fixed repair/installation.

### Painting Extractor

Responsible for:

- Areas/rooms
- Surfaces/substrates
- Preparation
- Coats
- Paint systems
- Colours/products
- Access/scaffolding

Lighter framework for now.

### Cleaning Extractor

Responsible for:

- Cleaning type
- Areas/rooms
- Service level
- Frequency
- Duration
- Consumables
- Equipment
- Special treatments

Lighter framework for now.

### Arborist Extractor

Responsible for:

- Species
- Tree count
- Height/spread
- Hazards
- Power lines
- Access
- Chipping/disposal
- Stump grinding
- Permits/consents

Lighter framework for now.

---

## 7. Templates System

### Purpose of Templates

Templates provide reusable quote structure and business-specific wording.

They help Talk to Quote produce quote drafts that sound like the user’s business and follow the user’s preferred structure.

### What Templates Should Contain

Templates may contain:

- Template name
- Category
- Standard scope
- Standard inclusions
- Standard exclusions
- Pricing rules
- Estimate wording
- Customer wording
- Internal notes
- Materials or line item structure
- Trade vocabulary
- Terms and conditions
- AI prompt rules

### What Templates Should NOT Contain

Reusable templates should not hardcode:

- Old customer names
- Old site addresses
- Old quote numbers
- Old quote dates
- One-off prices
- Job-specific instructions as defaults

Those should become variables or site-specific notes.

### Template Matching Strategy

Template matching should:

- Prefer explicitly named templates
- Consider category and template wording
- Use the primary trade as context
- Avoid forcing unrelated templates
- Avoid maintenance templates for one-off hedge trimming unless recurring terms are present
- Use "none" when no good match exists

### Future Template Learning Ideas

Future learning may include:

- Template performance feedback
- User edits feeding template improvements
- Suggested new templates from repeated quote patterns
- Template similarity scoring
- Template conflict warnings
- Industry template starter packs

---

## 8. Knowledge Base

### Purpose

The Knowledge Base is the user-controlled memory layer for Talk to Quote.

It should hold the information that makes quote drafts specific to a business without hardcoding that business into source code.

### Supported Knowledge Types

#### Templates

Reusable quote structures and wording.

#### Rules

Business rules such as:

- Use estimate wording for variable tidy work.
- Keep optional extras outside totals unless included.
- Separate greenwaste from hardfill.

#### Exclusions

Reusable exclusions and assumptions.

#### Price Lists

Imported prices, rates, and supplier references.

#### Plant Libraries

Plant names, sizes, spacing, supplier, stock status, and sell prices.

#### Supplier Information

Supplier names, categories, stock status, product notes, and price references.

#### Historical Examples

Past quotes that reveal tone, layout, exclusions, line item patterns, and reusable wording.

### How Knowledge Base Should Influence AI

Knowledge Base should:

- Provide context to extraction
- Guide wording
- Suggest templates
- Provide aliases
- Provide item matching
- Provide rates and options
- Improve trade vocabulary correction

Knowledge Base should not:

- Override explicit spoken instructions
- Invent missing details
- Force irrelevant templates
- Replace human review

---

## 9. JMS Item Library

### Purpose

The JMS Item Library connects Talk to Quote’s extracted line items to the user’s existing job management system item structure.

It allows Talk to Quote to produce quote data that is compatible with systems the business already uses.

### Supported Systems

Current or planned import support includes:

- Tradify
- Fergus
- SimPRO
- ServiceM8
- Jobber
- Xero
- Generic CSV

### Item Codes

Item codes should come from imported libraries.

Talk to Quote should not invent item codes. If no confident match exists, the item code should remain empty and the line item should be flagged for review.

### Aliases

Aliases help match spoken terms to JMS items.

Examples:

- "LabourHrs" -> "labour hours", "hourly labour"
- "A - Greenwaste" -> "greenwaste", "green waste", "waste removal"
- "Chipper" -> "wood chipper", "chipper hire"

Aliases may come from:

- Imported item names
- Item codes
- Descriptions
- Generated rules
- User edits
- Future AI-assisted alias suggestions

### Pricing

Talk to Quote should use sell/customer prices only.

It must not use cost/buy prices as sell prices.

Spoken overrides win over imported prices.

Examples:

- "$85 per hour" overrides imported labour sell price.
- "$26.50 per bag" overrides imported greenwaste sell price.
- If no sell price exists, line item should be flagged with "Rate missing".

### Matching

Matching should consider:

- Item code
- Item name
- Aliases
- Item type
- Unit
- Sell price presence
- Transcript wording
- Quantity/rate language

The system should prefer specific pricing items over broad service items when the transcript includes quantity or rate language.

### Strategic Advantage

JMS integration is a strategic advantage because it makes Talk to Quote complementary rather than competitive.

Trade businesses do not need a new system of record. They need a faster way to create structured quote data that can fit into the systems they already use.

---

## 10. Plant Library & Calculator

### Plant Import System

The Plant Library supports imported plant price spreadsheets with columns such as:

- SKU
- Supplier
- Plant Name
- Category
- Plant Type
- Default Spacing
- Nursery Price
- Markup %
- Sell Price
- Stock Status
- Quote App Notes

Current storage uses `knowledge_items` with `item_type = "plant"` and plant-specific metadata in `raw_import`.

### Plant Data Supported

Plant entries should support:

- Plant name
- Aliases
- Plant size
- Pot size
- Default spacing
- Spacing in millimetres
- Cost price
- Sell price
- Supplier
- Stock status
- Notes
- Raw import data

### Spacing Logic

Spacing priority:

1. Spoken spacing
2. Plant library default spacing
3. Missing spacing warning

Examples:

- "Plant 24 Griselinia at 850mm spacing" uses 850mm.
- "11 metres of Ficus Tuffi hedge" uses library spacing if available.

### Plant Count Calculation

Formula:

```text
plant_count = ceil(length_m / spacing_m) + 1
```

For multiple rows or areas, each row should be calculated separately and then totalled.

Example:

```text
11m hedge at 0.8m spacing
ceil(11 / 0.8) + 1 = 15 plants
```

### Pricing Options

If the user asks for options, Talk to Quote should return separate option totals.

Example:

> "Price options for Ficus Tuffi 1.2m, 25L and 45L"

Should produce:

- Option 1: Ficus Tuffi 1.2m
- Option 2: Ficus Tuffi 25L
- Option 3: Ficus Tuffi 45L

Each option should show:

- Plant count
- Unit sell price
- Plant total

### Future Landscaping Calculators

Future calculators may include:

- Mulch volume
- Soil volume
- Gravel/scoria volume
- Paving area
- Retaining timber quantities
- Concrete volume
- Drainage coil length
- Labour staging
- Greenwaste volume estimates

---

## 11. Quote Extraction Rules

### Spoken Overrides

Spoken overrides always win.

Examples:

- Spoken hourly rate overrides imported labour rate.
- Spoken plant spacing overrides library spacing.
- Spoken lump sum overrides item price.
- Spoken optional/excluded status overrides template assumptions.

### Missing Information Handling

Missing information should be explicit.

Examples:

- Client name not captured
- Site address not captured
- Labour quantity/hours
- Greenwaste quantity
- Fertiliser quantity/rate
- Spray quantity/rate
- Plant spacing
- Rate missing
- Quantity missing

### Confidence Warnings

Confidence warnings should be used when something is uncertain but not necessarily missing.

Examples:

- Possible plant name mishearing
- Address needs confirmation
- Greenwaste quantity uncertain
- Template match low confidence
- Multiple quote options detected

### Address Extraction

Address extraction is now a dedicated architecture.

It should return:

- Raw address candidate
- Cleaned address
- Street number
- Street name
- Suburb
- City/region
- Confidence
- Address warnings
- Needs address confirmation

Future Google Maps / Places validation should plug into the address validation function without rewriting quote extraction.

### Client Extraction

Client extraction should be lightweight and deterministic where possible.

It should not block quote generation if missing.

If client is missing:

- Set "Not captured"
- Add missing information
- Continue quote extraction

### Labour Calculations

Universal labour rules:

- Half day = 4 hours for 1 person
- Full day = 8 hours for 1 person
- Labour hours = people x days x 8
- Explicit total hours override calculated hours
- Do not collapse multi-person labour into single-person hours

Examples:

- 2 people x 1 day = 16 hours
- 2 people x 4 days = 64 hours
- 2 people x 5 days = 80 hours

### Equipment Hire Logic

Equipment hire should use knowledge item sell prices when confidently matched.

Examples:

- Wood chipper
- Stump grinder
- Ladder hire
- Equipment hire
- Tool hire

If the transcript says a single item is needed and the library has a sell price, quantity may default to 1.

### Lump Sum Logic

If transcript says:

- "at a cost of $X"
- "costing $X"
- "$X total"
- "for $X"

and no quantity is stated, treat as:

- Quantity = 1
- Rate = X
- Total = X

### Review Flags

Line items should be flagged when:

- Quantity missing
- Rate missing
- Quantity and rate missing
- Match confidence low
- Item code missing
- Price source unclear
- Plant spacing missing

---

## 12. Database Architecture

This section is high-level and should be updated as schema evolves.

### Current Entities

#### profiles

Stores user profile data.

Current/planned fields:

- id
- full_name
- company_name
- primary_trade
- future settings fields

#### quote_drafts

Stores saved quote drafts.

Fields include:

- user_id
- client_name
- site_address
- quote_title
- job_type
- raw_transcript
- quote_sections
- line_items
- status
- created_at
- updated_at

#### quote_templates

Stores reusable templates.

Fields include:

- user_id
- template_name
- category
- default_scope
- default_exclusions
- default_pricing_structure
- template_content
- source_uploaded_quote_example_id

#### knowledge_items

Stores imported item/material/service/plant data.

Fields include:

- user_id
- source_system
- item_type
- item_code
- item_name
- description
- unit
- cost_price
- sell_price
- gst_rate
- aliases
- category
- source_category
- external_item_id
- raw_import
- import_batch_id
- updated_from_import_at

#### uploaded_quote_examples

Stores uploaded documents for Knowledge Base analysis.

Fields include:

- user_id
- file_name
- storage_path
- document_type
- ai_analysis_status
- extracted_text
- analysis_summary
- tone_analysis
- extracted_exclusions
- suggested_rules

### Planned Entities

#### plant_library

A dedicated plant table may eventually replace or supplement `knowledge_items` for plant-specific data.

Potential fields:

- user_id
- sku
- supplier
- plant_name
- botanical_name
- common_name
- category
- plant_type
- pot_size
- height_size
- spacing_mm
- cost_price
- sell_price
- stock_status
- aliases
- notes
- raw_import

#### settings

A dedicated user/business settings table may eventually store:

- Primary trade
- Business defaults
- GST settings
- Currency
- Region
- JMS connection preferences
- Quote numbering
- Default terms

#### future tables

Possible future entities:

- customers
- sites
- quote_exports
- quote_versions
- template_versions
- import_batches
- supplier_catalogues
- address_validations
- team_members
- business_accounts

---

## 13. User Journey

### New User Onboarding

The ideal onboarding flow:

1. Sign in
2. Select primary trade
3. Upload templates or quote examples
4. Import JMS item library
5. Import plant/material price lists if relevant
6. Run a test quote
7. Review and save first quote draft

### Template Uploads

Users should be able to upload existing quotes, templates, terms, and exclusions.

Talk to Quote should extract:

- Reusable wording
- Scope patterns
- Exclusions
- Pricing rules
- Template suggestions
- Future prompt rules

### JMS Imports

Users import item libraries from Tradify, Fergus, SimPRO, ServiceM8, Jobber, Xero, or CSV.

The system detects columns, previews rows, warns about missing sell prices, and saves structured items.

### First Quote

The first quote should prove the core value quickly:

- Record a job
- Process quote
- Review structured draft
- See matched line items
- See missing info clearly
- Save draft

### Review Process

The review process should allow:

- Editing each quote section
- Saving edits
- Canceling edits
- Seeing unsaved changes
- Saving drafts
- Opening existing drafts

### Power-User Workflow

Power users may:

- Maintain large template libraries
- Import multiple JMS item sources
- Import plant and supplier catalogues
- Run debug test suites
- Refine templates over time
- Use Talk to Quote as a quote drafting layer before JMS export

---

## 14. Competitor Analysis

### Tradify

Tradify is a job management system for trades. It supports quoting, scheduling, invoicing, job tracking, and customer management.

Talk to Quote does not replace Tradify. It can complement Tradify by generating structured quote data from voice notes before pushing the result into Tradify.

### ServiceM8

ServiceM8 is strong for mobile job management, scheduling, and field service workflows.

Talk to Quote complements ServiceM8 by focusing on AI-assisted quote drafting from spoken job context.

### Fergus

Fergus supports job tracking, quoting, scheduling, and business management for trades.

Talk to Quote can become a quote intelligence layer that helps users prepare better quote drafts before sending data into Fergus.

### SimPRO

SimPRO is a more comprehensive field service management platform often used by larger trade/service businesses.

Talk to Quote can complement SimPRO by improving quote intake and field note structuring, especially before formal estimation.

### Jobber

Jobber is popular for small service businesses and provides quoting, scheduling, CRM, and invoicing.

Talk to Quote can complement Jobber by making quote creation faster and more voice-first.

### Why Talk to Quote Is Different

Talk to Quote is different because it focuses on the moment before structured quoting:

- Site visit notes
- Voice capture
- Trade vocabulary
- Template intelligence
- Knowledge Base context
- JMS item matching
- Human review

Most JMS platforms assume the user is ready to enter structured data. Talk to Quote helps create that structured data from messy field context.

### Why Talk to Quote Complements JMS Platforms

Talk to Quote should not try to become a full JMS.

Instead, it should:

- Capture and structure quote context
- Match line items
- Produce draft quotes
- Push approved data to the JMS
- Reduce admin friction inside existing workflows

---

## 15. Roadmap

## Current Maturity By Trade

Purpose: track how reliable each trade extractor currently is based on structured testing, not theory.

| Trade | Current maturity | Evidence | Main gaps | Next action |
|---|---:|---|---|---|
| Gardening / Maintenance | 90% | 10-test batch mostly passed. Template selection, labour, greenwaste and missing info are working well. | Address extraction edge cases; occasional labour item preference. | Run regression tests after address fix. |
| Landscaping | 60% | Basic landscaping, labour calculations and technical detail preservation are working. | Needs 10-test landscaping suite; plant/material pricing still developing. | Run landscaping test suite next. |
| Building / Decking | 25% | Decking extraction works on simple examples but still needs broader testing. | Materials, stages, rates, template coverage. | Create 10 building/decking tests. |
| Electrical | 25% | Electrical classification now works on basic downlight/power point example. | No electrical templates/items; needs more technical tests. | Create 10 electrical tests. |
| Plumbing | 25% | Basic plumbing scope extraction worked once. | No plumbing templates/items; needs proper test suite. | Create 10 plumbing tests. |
| Painting | 10% | Framework exists only. | Untested. | Create initial painting test pack later. |
| Cleaning | 10% | Framework exists only. | Untested; integration target unclear. | Create initial cleaning test pack later. |
| Arborist | 15% | Tree removal overlaps with landscaping and equipment hire tests. | Needs arborist-specific wording, risk, access, waste tests. | Create arborist test pack later. |

These percentages are working estimates only. They should be updated after each structured test batch. Maturity should be based on:

- Successful quote generation
- Correct client/address extraction
- Correct trade classification
- Correct template use
- Correct labour/material extraction
- Correct JMS item matching
- Correct missing information flags
- Low failure rate

Do not treat these as final product-readiness scores.

### Near Term

- Strengthen trade extractors
- Improve Gardening/Maintenance test suite
- Improve Landscaping and Planting extraction
- Improve address validation architecture
- Improve Plant Library editing
- Improve JMS item matching
- Add more deterministic calculators
- Expand Testing / Debug saved test cases

### Medium Term

- Google Maps / Places validation
- Template learning from user edits
- Better quote preview/export
- JMS push/export prototypes
- Supplier catalogue imports
- Team/business settings
- More structured Knowledge Base management
- Trade-specific starter templates

### Long Term

- Voice conversation mode
- Self-improving extraction systems
- Cross-JMS compatibility
- Quote versioning
- Approval workflows
- Profitability analysis
- Supplier price refresh
- Photo-assisted quote context
- Scheduling/invoicing opportunities without replacing JMS platforms

---

## 16. Current Product Decisions

Major product decisions already made:

- Talk to Quote is a universal multi-industry product.
- Do not hardcode Pristine Gardens-specific logic.
- Templates are the primary structure mechanism.
- Knowledge Base controls business-specific behaviour.
- JMS Item Library controls item codes and pricing.
- Plant Library controls plant pricing and spacing.
- Spoken overrides always win.
- Trade extractors are separated by industry.
- Human review is required before export.
- Raw transcript should be preserved.
- Missing information should be surfaced clearly.
- Confidence warnings are better than silent guesses.
- Service role keys must not be used in the client app.
- RLS must remain intact.
- OpenAI API keys stay server-side.
- Talk to Quote complements JMS platforms rather than replacing them.

---

## 17. Known Issues

### Current Limitations

- Address validation is offline only; Google Maps / Places is not connected yet.
- Plant Library currently stores plant-specific data inside `knowledge_items.raw_import`.
- JMS export is not built yet.
- Quote output layout is still evolving.
- Template matching is useful but still needs scoring improvements.
- AI extraction can still fail or produce incomplete output in edge cases.
- Uploaded document analysis depends on readable text extraction.
- DOC/DOCX analysis support may be limited.
- Multi-trade behaviour needs broader test coverage.

### Technical Debt

- Some feature-specific logic still lives in large route/component files.
- More shared libraries should be extracted over time.
- Knowledge Base types should become more formal.
- Plant Library may need a dedicated table.
- Settings may need a dedicated table.
- Test cases are currently local/debug-oriented rather than full automated regression suites.

### Areas Under Development

- Trade extractor refinement
- Quote Test Runner
- Address extraction architecture
- Plant Library and calculators
- JMS item matching
- Template learning

---

## 18. Future AI Vision

### Job Intelligence Layer

Talk to Quote should become the job intelligence layer that understands:

- What the user saw
- What the customer asked for
- What the business usually quotes
- What items and prices exist in the user’s systems
- What is missing or risky
- What should be reviewed before sending

### Voice-First Quoting

The future experience should feel conversational.

The user might say:

> "Quote this as a one-off tidy, but include a two-monthly maintenance option. Use the standard estimate wording and price greenwaste separately."

Talk to Quote should understand this instruction and structure the quote accordingly.

### Self-Improving Extraction

The system should learn from:

- Uploaded templates
- User edits
- Saved drafts
- Accepted/rejected template matches
- Corrected line item matches
- Imported price lists

Learning must remain user-controlled and transparent.

### Cross-JMS Compatibility

Talk to Quote should support multiple JMS systems by mapping to their item libraries and export formats.

The goal is to make Talk to Quote valuable regardless of which operational system the business uses.

### AI-Assisted Quote Building

Future AI should help with:

- Suggested optional extras
- Missing info questions
- Risk/exclusion suggestions
- Template recommendations
- Line item alternatives
- Price option comparisons

### Scheduling and Invoicing Opportunities

Talk to Quote may eventually support adjacent workflows such as scheduling and invoicing assistance, but it should avoid becoming a full JMS replacement.

The strategic posture is:

> Be the best voice-to-quote intelligence layer, and integrate with systems of record.

---

## 19. Feature Backlog

### High Priority

- Improve extraction reliability across target trades
- Build robust automated test cases
- Improve template matching confidence
- Add address validation integration
- Improve quote review/edit UX
- Build JMS export prototype
- Improve Plant Library editing and matching
- Add more deterministic calculators for landscaping

### Medium Priority

- Better Knowledge Base item management
- Template versioning
- User feedback loops
- Supplier catalogue import
- Team/business profiles
- Quote export formats
- Customer-ready PDF/document generation
- Photo/context attachments

### Low Priority

- Analytics dashboards
- Quote profitability summaries
- Advanced styling/themes
- CRM-style customer records
- Advanced role permissions

### Future Research

- Voice conversation mode
- Multi-modal quote extraction from photos
- Automatic supplier price refresh
- AI-generated clarifying questions
- Quote win/loss learning
- Cross-business anonymised trade intelligence

---

## 20. Development Rules

These rules should guide future engineering work.

### Do Not Hardcode Customer-Specific Logic

Do not hardcode:

- One business’s item codes
- One business’s prices
- One business’s wording
- One business’s supplier rules
- One business’s template assumptions

### Prefer User-Controlled Data Sources

Prefer these over code changes:

1. Templates
2. Knowledge Base
3. JMS Item Library
4. Plant Library
5. User Settings
6. Spoken overrides

### Preserve Compatibility

Changes should preserve compatibility with:

- Quote extraction
- Templates
- Drafts
- Review screens
- JMS matching
- Knowledge Base imports
- Plant Library
- Testing / Debug runner

### Keep Schema Stability in Mind

The `ProcessedQuote` schema should remain stable unless a deliberate migration is planned.

When adding new internal features, prefer:

- Internal notes
- Quote sections
- JSONB content
- Knowledge item metadata

before adding new top-level quote fields.

### Maintain RLS and Key Safety

- Do not bypass RLS.
- Do not use service role keys in client code.
- Keep OpenAI API keys server-side only.
- Use authenticated user IDs for user-owned data.

### Preserve Raw Transcript

Raw transcript is the source of record.

Corrections and cleaned output should be stored separately or noted internally.

### Human Review Remains Mandatory

Do not build flows that silently send quotes without review.

### Test Important Extraction Changes

Use the Testing / Debug runner for:

- Gardening tests
- Landscaping tests
- Electrical tests
- Address tests
- JMS matching tests
- Plant calculator tests

Over time, these should become repeatable regression suites.

---

## Closing Note

Talk to Quote is not just a transcription app and not just a quote builder.

It is a structured intelligence layer between real-world trade conversations and operational systems.

The product should continue moving toward this core idea:

> Capture the job naturally, structure it intelligently, price it from the user’s own knowledge, preserve uncertainty, and let the human approve.
