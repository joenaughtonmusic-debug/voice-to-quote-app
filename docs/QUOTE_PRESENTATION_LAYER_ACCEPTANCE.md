# Quote Presentation Layer Acceptance Criteria

## Purpose

This document defines what **done** means for the Universal Quote Presentation Layer before any implementation begins.

Voice-to-Quote often captures strong internal structured data during extraction, calculator, and resolver stages, but the customer-facing quote can still be thin, incomplete, or disconnected from export data. Recent real-world testing exposed this gap:

- **Shirley one-off tidy:** extraction captured scope, labour, and greenwaste, but the customer quote initially rendered only *Greenwaste removal*.
- **Stephanie planting:** extraction captured 14.2m, *Michelia gracipes*, plant count, price, labour, garden mix, and an optional timber border, but the customer quote only showed a plant option name, *Garden mix*, and *Labour Included*.

This acceptance doc is the finish line for a shared presentation model that feeds **customer quote**, **internal review**, **Xero export**, and future **JMS export** from the same structured lines.

It follows the Build Constitution workflow: **acceptance doc first, executable tests second, implementation third**.

---

## Architecture principle

Structured quote data is the source of truth. Customer quote, internal review, JMS export, and Xero export are **views** over the same structured quote lines — not independent pipelines that re-interpret `ProcessedQuote` differently.

The customer view may use friendlier wording and hide internal-only fields (account codes, raw item IDs, resolver match reasons). It must **not** create separate pretty text that loses quantities, prices, metadata, warnings, or line identity.

```text
Transcript / Notes
→ Correction
→ Extraction
→ ProcessedQuote
→ QuoteFacts / PricingFacts / MeasurementFacts / ReviewNotices
→ Trade Calculators
→ MaterialBill
→ Resolver
→ QuoteOptions
→ QuotePresentationModel
→ Customer View
→ Internal Review
→ Xero Export
→ JMS Export
```

**Non-negotiables:**

- Do not make JMS the source of truth.
- Do not make pretty customer text the source of truth.
- Do not invent pricing when resolver or spoken price is absent.
- Do not silently drop priced options, material quantities, or optional works.

Existing customer quote assembly modules may remain during migration. They must eventually consume or be replaced by views over `QuotePresentationModel`, not parallel truth.

---

## Required model behaviour

The presentation layer (`QuotePresentationModel` built from existing structures — no `ProcessedQuote` schema change required for v1) must:

| Requirement | Detail |
|-------------|--------|
| **Preserve line identity** | Every commercial or scope line has a stable `lineId` shared across customer, internal, and export views. |
| **Customer-friendly wording** | Customer view uses readable titles and descriptions; internal/export retain technical labels. |
| **Retain structured quantities and prices** | Quantity, unit, unit price, and subtotal remain on the line even when hidden from customer view. |
| **Retain export metadata** | Item codes, account codes, tax codes, source item IDs, and source system remain on the line for internal/export views when resolver provides them. |
| **Surface warnings and review flags** | Unpriced lines, spacing conflicts, transcript ambiguity, spoken-price mismatch, and missing export codes are visible in internal review; customer view shows review badges or flags where appropriate — never silent polish. |
| **No invented pricing** | Missing price → `reviewRequired` + warning; not a guessed amount. Aligns with Business Rules Strategy priority order (spoken price → manual edit → rules → supplier → JMS → default → unpriced). |
| **No silent option drop** | Every priced `QuoteOption` / `QuoteOptionLineItem` maps to at least one presentation line in internal view; customer view shows it or documents an explicit hide rule. |
| **No silent quantity drop** | Material quantities (e.g. *5 bags garden mix*) appear in customer view with quantity or explicit review flag — not keyword-only collapse. |
| **No silent optional-work drop** | `follow_up_tasks`, `optional_quotes`, and clearly optional transcript notes appear in an Optional Works section or equivalent flagged lines. |

**Conceptual line shape (documentation only — not a schema change):**

- `lineId`, `sectionId`
- Customer: `customerTitle`, `customerDescription`, `customerVisible`
- Commercial: `quantity`, `unit`, `unitPrice`, `subtotal`, `cadence`
- Semantics: `role` (scope, labour, material, plant, waste, optional_work, price, exclusion, …)
- Review: `optional`, `reviewRequired`, `warnings[]`
- Provenance: `source`, `sourceRef`, `confidence`
- Export/internal: `itemCode`, `sourceItemId`, `accountCode`, `taxCode`, `tradeRole`, resolver warnings

---

## Acceptance Scenario A — Shirley Garden Tidy

**Reference:** `docs/REAL_WORLD_FINDINGS.md` (Shirley — One-Off Garden Tidy); full site transcript in garden-tidy acceptance tests.

### Transcript

```text
Just went to see Shirley at 6 Percival Parade, Freemans Bay. The quote is a one-off tidy, mostly hedge trimming and tree pruning. We need to prune back the Mexican elder trees on the right-hand boundary. That job will take two people one and a quarter days with two trailer loads of green waste. And we also need to trim the side back and then also trim the top back. Form her property on a sharp angle so it's defined. That's probably going to be three quarters of a trailer load for six days green waste, along with the usual blowdown and tidy of things that we want to do.
```

**Known transcript-quality fragment (from real-world finding):**

```text
three quarters of a trailer load for six days green waste
```

**Expected customer wording (human review target):**

```text
Approximately three quarters of a trailer load of green waste
```

### Workflow and template

- Workflow: **One-Off Garden Tidy** / hedge trimming (not maintenance, not planting).
- Manual template: **One-Off Garden Tidy** when selected in review.

### Customer view acceptance

| Section | Must include |
|---------|----------------|
| **Scope of Work** | Prune Mexican elder trees; trim side and top on sharp angle; blowdown and tidy |
| **Labour Allowance** | Two people, one and a quarter days (or equivalent customer-friendly wording) |
| **Green Waste** | Two trailer loads; distinct fractional trailer quantity — deduplicated, not repeated verbatim in three forms |
| **Service Includes** | Greenwaste removal (or spoken/pricing inclusion equivalent) |

**Sendability:** Joe would send with **minor edits** only (constitution definition of done).

**Transcript ambiguity:** The phrase *for six days green waste* must **not** be silently polished into professional wording without review. Minimum acceptance: internal view flags `transcript_ambiguity` or equivalent review notice; customer view may show captured text with review badge, or flagged suggested correction — not undetected garbage.

### Internal view acceptance

- Retains provenance: which lines came from `customer_scope`, `primary_quote.scope`, `primary_quote.notes`, `labour_allowance`, `greenwaste`, and transcript fallback.
- Shows review flags for ambiguous greenwaste phrasing.
- Same `lineId`s as customer view for scope, labour, and greenwaste lines.

### Export view acceptance

- Garden tidy Xero export description can be **derived from the same presentation lines** as customer scope/labour/waste (no third independent scope builder).
- Export line count and descriptions remain consistent with current garden-tidy export MVP behaviour or documented intentional improvements.

### Live-path requirement

Test path must include QuoteReview handoff → `buildQuotePresentationModel` → customer view, matching the constitution live-equivalent QuoteDraft path.

---

## Acceptance Scenario B — Stephanie / Cotswold Michelia Planting

### Transcript

```text
Okay, I went to Stephanie's place yesterday, number 10 Cotswold Lane in Mount Wellington, and she had a few jobs that she wanted done, but one of which was this planting job, and it was a 14.2 metre planting area, and the plant she wanted planting was Michelia gracipes. I'm not sure what we've got in the database, but not the biggest one. Maybe give both sizes as an option, probably with 50 centimetre spacing, so however that works along the length. And then there was an optional note for a 150 by 50 timber board border to do later. I estimate that the labour would be one person, 1.5 days, because there's a few roots that we have to dig through, and she'll also need five bags of garden mix.
```

### Workflow and template

- Workflow selected: **Planting** — not Garden Tidy, not Maintenance, not Decking.
- Template recommendation (if used): **Planting** — not One-Off Garden Tidy.

### Customer view acceptance

| Requirement | Expected |
|-------------|----------|
| Planting area length | **14.2m** visible in customer-facing planting details |
| Plant name | **Michelia gracipes** visible |
| Plant count | Visible per option or in planting summary |
| Priced options | Each option shows **quantity, unit price, and subtotal** when resolver/pricing populated — not title-only |
| Spacing | Customer view shows **spacing used** for plant count calculation |
| Spoken 50cm spacing | Must **not** be silently overridden by plant-library default spacing |
| Spacing conflict | If library spacing ≠ spoken 50cm → **review warning** in internal view; customer view shows spoken spacing with review badge or explicit note |
| Garden mix | **5 bags** garden mix — quantity visible, not keyword-only *Garden mix* |
| Labour | **One person, 1.5 days** (or customer-friendly equivalent) — not generic *Labour Included* alone |
| Optional timber border | **150 × 50 timber board border** appears under **Optional Works** (or clearly flagged optional section) — *to do later* preserved |

**Sendability:** Without major manual reconstruction of options, quantities, and optional works — **fail** until presentation layer ships for planting.

### Internal view acceptance

- Plant calculator source data retained: length, spacing (spoken vs library), plant count per option.
- Resolver metadata retained per line: source item ID, unit price, subtotal, match warnings, unpriced flags.
- Optional border line marked `optional: true`, `reviewRequired` as appropriate.
- Root-digging caveat available in internal notes or labour line description.

### Export view acceptance

- Xero planting export lines derivable from **same `lineId`s** as customer planting options, labour, and materials.
- Current planting Xero export behaviour (which already uses preview/quote_options) must remain achievable from presentation model — **parity test required**.

---

## Acceptance Scenario C — Amy / Ficus Planting

**Reference:** `docs/PLANTING_MVP_ACCEPTANCE.md` acceptance transcript.

### Transcript

```text
Quote for Amy at 44 Amy Street.

Plant 11.5 metres of Ficus Tuffi hedge.

Provide:
- 1.2m option
- 14L option
- 25L option

Include:
- Garden mix
- Mulch
- Labour

No irrigation.
```

### Customer view acceptance

| Requirement | Expected |
|-------------|----------|
| Title | Planting Quote |
| Planting length | **11.5m** visible |
| Options grouped | Three size options remain **grouped** as planting options |
| Option detail | Each option shows **plant count and price** (qty, unit price, subtotal) — not label-only |
| Materials | Garden mix and mulch with quantities when extracted |
| Labour | Customer-friendly labour note beyond bare *Included* when `labour_allowance` or calculator provides detail |
| Exclusions | Irrigation not included |

**Must not show:** maintenance wording, garden tidy wording, legacy labour total duplication, irrigation included.

### Export view acceptance

- Xero export uses **same option lines** as presentation model (plant base + upgrade notes derivable from same ids).
- Multiple options remain distinguishable in export mapping.

---

## Acceptance Scenario D — Generic trade QuoteOptions

Applies to **decking, retaining, paving, and fencing** when `MaterialBill → Resolver → QuoteOptions` produces priced or unpriced lines.

### Customer view acceptance

| Requirement | Expected |
|-------------|----------|
| Priced options | Appear in customer view with commercial detail appropriate to trade (area, length, material role, subtotal where priced) |
| Unpriced options | Visible with **review-required warning** — not omitted |
| Account codes | **Not required** on customer view |
| Item identity | Customer view must **not** lose item codes, account codes, or tax codes internally |

### Internal view acceptance

- Full `QuoteOptionLineItem` metadata visible: item code, source item ID, account code, tax code, resolver warnings.
- MaterialBill `tradeRole` and `area_label` traceable to presentation line.

### Export view acceptance

- Exportable lines retain item codes, account codes, and tax codes from presentation model.
- Unpriced lines export as blocked or flagged per existing export mapping rules — not silent $0 without warning.

---

## Cross-view parity requirements

For **every line** in `QuotePresentationModel`:

| Rule | Requirement |
|------|-------------|
| **Stable identity** | Same `lineId` in customer, internal, and export views. |
| **Hidden ≠ deleted** | Fields hidden from customer (codes, internal labels) remain on the line in internal and export views. |
| **Export traceability** | Every Xero/JMS export line maps back to exactly one presentation `lineId`. |
| **Priced line visibility** | If a priced line exists internally, customer view **shows it** or applies an **explicit documented hide rule** — accidental omission is a **test failure**. |
| **No orphan exports** | Export lines must not be built from a separate ad-hoc scope builder when presentation model exists for that workflow. |
| **Warning propagation** | `reviewRequired` and warnings on a line appear in internal view; customer view shows badge or flag where user-facing review is needed. |

---

## Required tests

Planned executable tests (to be implemented after this doc, before or with presentation layer code):

| Test suite | Purpose |
|------------|---------|
| **Presentation model golden tests** | Fixed `ProcessedQuote` + `QuoteOptions` + facts → snapshot of `QuotePresentationModel` structure and line counts |
| **Shirley live-path test** | Full Shirley transcript → review handoff → presentation model → customer view sections (Scope, Labour, Green Waste, Service Includes) |
| **Stephanie live-path test** | Stephanie transcript → planting workflow → all Scenario B customer fields present |
| **Amy planting MVP test** | Amy acceptance transcript → three priced options with qty/subtotal → materials/exclusions |
| **Customer view test** | `customerView(model)` sendability assertions per scenario |
| **Internal view test** | Provenance, codes, warnings, spacing conflict visible |
| **Xero export parity test** | `exportView(model)` equivalent to current `buildXeroQuotePayload` line items per workflow (planting, garden tidy, maintenance first) |
| **Future JMS parity test** | Placeholder: export view maps same `lineId`s to JMS-shaped output when JMS export exists |
| **Spacing conflict test** | Spoken 500mm + library 600mm → warning; customer shows spoken; internal shows both |
| **Optional works test** | `follow_up_tasks` / optional transcript → Optional Works section with stable line id |
| **No silent data loss test** | Count of priced `QuoteOptionLineItem` ≤ presentation lines in internal view; customer view accounts for every priced line |

**Live-path rule (Build Constitution):** All acceptance tests use:

```text
ProcessedQuote / editedQuoteForReview
→ buildCustomerPreviewQuoteInput (where applicable)
→ buildQuotePresentationModel
→ customerView | internalView | exportView
```

Handoff tests must prove QuoteReview visible state reaches the same presentation model as QuoteDraft.

---

## Definition of done

The Quote Presentation Layer is **not done** until all of the following are true:

1. **Customer quote is sendable** — Shirley (minor edits), Stephanie (major gaps closed), Amy (MVP bar met) on live-equivalent path.
2. **Internal review retains source and warnings** — provenance, resolver metadata, spacing conflicts, transcript ambiguity flags visible.
3. **Xero export still works** — parity tests pass against current export payloads for planting, garden tidy, and maintenance at minimum.
4. **Future JMS export can map from same lines** — presentation model includes fields JMS will need; no second truth path required.
5. **No workflow loses priced options when assembly activates** — assembly or its replacement must not discard `QuoteOption` detail (Stephanie regression permanently fixed).
6. **Tests use the same live-equivalent path as QuoteDraft** — constitution § Test-Path Rules satisfied.
7. **Existing assembly not removed** until workflow-by-workflow parity is proven — migration, not big-bang replacement.

---

## Out of scope for this acceptance doc

- Business Rules engine implementation (`docs/BUSINESS_RULES_STRATEGY.md` — post-pilot).
- `ProcessedQuote` schema changes.
- JMS push integration (export view shape only).
- Removing existing `assembleCustomerQuote` modules.
- Wiring presentation model into QuoteDraft UI (separate implementation milestone after tests).

---

## Related documents

- `docs/CURSOR_PROJECT_CONTEXT.md` — pipeline and launch-readiness context
- `docs/VOICE_TO_QUOTE_BUILD_CONSTITUTION.md` — live-path and definition-of-done rules
- `docs/BUSINESS_RULES_STRATEGY.md` — pricing priority; rules integrate at Resolver, not presentation
- `docs/REAL_WORLD_FINDINGS.md` — Shirley transcript-quality finding
- `docs/PLANTING_MVP_ACCEPTANCE.md` — Amy planting baseline
- `docs/GARDEN_TIDY_MVP_ACCEPTANCE.md` — Sarah/Shirley garden tidy baseline
