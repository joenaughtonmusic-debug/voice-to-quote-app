# Business Rules Strategy

## Status

Strategy document only. No implementation, no schema changes, no code.

This document defines the intent, scope, and future shape of the Business Rules system
("Teach the App"). It is a planning reference, not a build spec.

---

## 1. What Business Rules Are For

Business Rules let the operator teach the app how their business works, without
needing a developer.

Specifically, rules handle the gap between what the calculator produces and what
the operator actually charges or uses. Examples:

- "When I price paving, I always use 100mm base course."
- "My default paving labour rate is $85/hr."
- "I prefer to use Product X from Supplier Y for retaining timber."
- "On quotes, always say 'All prices exclude GST' in the exclusions."
- "I use account code 310 for all materials."

Rules are about the business, not about individual jobs. They apply systematically
across quotes unless overridden at the job level.

---

## 2. What Business Rules Are Not For

Rules are not a substitute for:

- **Spoken job-level overrides.** If a customer price is stated in the transcript,
  it wins. That is a job fact, not a business rule.
- **Per-quote editing.** The user can always edit a quote draft before sending.
  Rules pre-fill sensible defaults; they do not lock anything.
- **AI extraction.** Rules are deterministic. They are not extracted from
  transcripts. They are stored by the operator.
- **Pricing engine logic.** Markup, margin, GST, and tax rules belong in the
  export/profile layer, not in the calculator or MaterialBill.
- **Template wording.** Quote templates already handle reusable wording. Rules
  should not duplicate template functionality.
- **Supplier price list management.** Supplier price lists are already a separate
  system. Rules reference them; rules do not replace them.

---

## 3. Rule Types (Future)

These are the categories of rules the system should eventually support.
None of these should be implemented until pilot testing identifies which ones
are actually blocking quoting speed or accuracy.

### 3.1 Calculator Defaults

Override the built-in calculator assumptions for a specific trade.

Examples:
- Base course depth: 100mm (default) → 120mm
- Bedding sand depth: 30mm (default) → 25mm
- Labour hours per m² for paving: 1.5 (default) → 1.2
- Waste factor for pavers: 10% (default) → 12%

These slot in before the calculator runs, replacing system defaults with
operator-specific values.

### 3.2 Material Preferences

Nominate a preferred material or supplier item for a given trade role.

Examples:
- For `paving_paver`: prefer "450x450 Concrete Paver" from Supplier X
- For `retaining_timber`: prefer "H4 Treated Pine 125x75" from JMS
- For `decking_board`: prefer "Kwila 140x19" from JMS

When the resolver encounters a bill item with a matching trade role, it can
use the preferred item as a starting point before falling back to fuzzy matching.

Material preferences are advisory. The resolver still checks whether the item
is available and priced. If it is not, it falls back normally.

### 3.3 Labour Assumptions

Set trade-specific labour rates or rate sources.

Examples:
- Paving labour rate: $85/hr
- Decking installation rate: $90/hr
- Retaining labour: quoted as lump sum, not hours

Labour assumptions are used when:
- The transcript does not state a rate
- The supplier price list does not have a labour item
- The JMS item library does not have a matching labour item

These are the last fallback before "unpriced / needs review."

### 3.4 Pricing and Export Preferences

Control how quotes are formatted for Xero or JMS export.

Examples:
- Always group materials under account code 310
- Default tax type: OUTPUT
- GST rate: 15%
- Export format: grouped vs itemised

For the pilot, these are mostly handled by the existing Xero export mappings.
Rules in this category become relevant when different account types or
export profiles are needed per trade or per customer type.

### 3.5 Wording Preferences

Inject standard phrases into customer-facing quote sections.

Examples:
- Always include "Prices exclude GST unless stated" in exclusions
- Default payment terms wording
- Standard site access note

Wording preferences are low priority. Templates already cover most of this.
Only build wording rules if templates prove insufficient during pilot testing.

---

## 4. Rule Priority and Conflict Order

When multiple sources could determine a value, the following order applies.
Higher wins. Lower is only used when the higher source is absent or unknown.

```
1. Spoken customer price (from transcript)
      ↓ if absent
2. Manual user edit (from quote review session)
      ↓ if absent
3. Account / business rules (from stored operator settings)
      ↓ if absent
4. Supplier price list match (from imported price lists)
      ↓ if absent
5. JMS / Xero item match (from item library)
      ↓ if absent
6. Calculator default (from system or operator-configured defaults)
      ↓ if absent
7. Unpriced — flag for review
```

This order means:

- The operator is never surprised by an AI-invented price.
- A spoken price on a job always beats a stored rule.
- A stored rule beats a generic system default.
- Genuinely missing data is flagged, not silently filled.

This order is already partially implemented via the Resolver (steps 4–7).
Business Rules formalise steps 3 and 6.

---

## 5. How Missing Pricing Should Be Handled

The current correct behaviour is:

- If pricing cannot be resolved, the `QuoteOption` subtotal is $0.00.
- A warning is shown in the UI: "Pricing not configured — review required."
- The operator sees which line items could not be matched.
- The quote is not blocked — it can still be sent — but the operator knows
  it needs attention before sending.

Business Rules should reduce the frequency of this state, not hide it.

A rule should only fill in a price if the operator has explicitly configured it.
Rules must never silently invent a price.

When a rule fills in a missing price, it should be distinguishable from a
matched supplier price or JMS item. The operator should be able to see that
"this came from a business rule" in the quote review UI.

This is a future concern. For the pilot, the existing "review required" warning
is sufficient.

---

## 6. How the Pricing Stack Fits Together

These four systems work together. None of them overlaps or replaces another.

```
MaterialBill
│
│  Source-agnostic. Produces quantities and trade roles.
│  Does not know about prices, suppliers, codes, or rules.
│
└── Resolver
     │
     │  Matches MaterialBill items to priced sources.
     │  Priority: JMS/Xero → Supplier Price List → Category Default → Unpriced.
     │  Does not know about calculator assumptions or wording.
     │
     ├── Supplier Price Lists
     │     Operator-imported. Used for estimating unit prices.
     │     Managed separately from Business Rules.
     │
     ├── JMS / Xero Item Library
     │     Business-specific. Used for item codes, account codes, tax codes.
     │     Higher priority than supplier price lists for export.
     │
     └── Business Rules (future)
           Operator-configured defaults and preferences.
           Fill gaps the Resolver could not match from external sources.
           Never override spoken prices or manual edits.
```

MaterialBill must stay source-agnostic. It does not read rules.

The Resolver is the right place for Business Rules to integrate, because the
Resolver already owns the "what is this item worth and where does it come from"
question. Rules extend the Resolver's fallback chain; they do not bypass it.

---

## 7. MVP, Later, and Not Now

### MVP (pilot period)

These are acceptable as manual workarounds during the pilot. They do not require
a rules system to be built.

- **Calculator defaults**: System defaults are reasonable for most NZ landscaping
  jobs. The operator can adjust quantities in the quote review if needed.
- **Labour rates**: If the operator knows their rates, they can be added to the
  supplier price list as a "labour" item. The resolver already handles this.
- **Unpriced items**: The "Pricing not configured" warning in the UI is the MVP
  behaviour. Flag it, don't hide it.
- **Export preferences**: The existing Xero export mappings cover the pilot.

### Later (post-pilot, when patterns emerge)

Build only what pilots actually need and request. Do not build speculatively.

- **Calculator defaults as stored settings**: When operators consistently override
  the same calculator values (base course depth, labour rate, etc.), make those
  configurable per account.
- **Material preferences**: When operators consistently need a specific SKU or
  supplier item for a trade role, add a preference lookup before the fuzzy match.
- **Wording preferences**: When the standard exclusions wording is inadequate for
  the operator's business, add injectable phrases.

### Explicitly Not Now

- No rules engine. No rule tables. No rule evaluation pipeline.
- No UI for creating or editing rules.
- No database schema for rules.
- No per-trade rule namespacing or versioning.
- No conflict resolution algorithm beyond the priority order above.
- No rules that touch ProcessedQuote schema.
- No rules that change the MaterialBill.
- No rules applied at extraction time (before the Resolver).

---

## 8. Pilot Testing Without Scope Creep

The purpose of the pilot is to generate real quotes with real operators and
identify where the app helps and where it fails.

Business Rules do not need to exist for the pilot to succeed. The pilot will
generate the evidence needed to prioritise which rules matter.

To support piloting without building rules prematurely:

1. **Log unpriced items.** Every "Pricing not configured" warning that surfaces
   in a pilot quote is a data point for which rule would have helped.

2. **Treat manual edits as proxy rules.** If the operator consistently edits the
   same value on every quote, that is a candidate for a rule. Collect these
   patterns before building anything.

3. **Use supplier price lists for now.** Most pricing gaps can be closed by
   populating the operator's supplier price list correctly. This is lower risk
   than a rules system and already built.

4. **Do not promise "Teach the App" as a feature.** During the pilot, it is an
   internal concept. The operator experience is "add your prices to the price
   list." The rules infrastructure can be built later once the patterns are clear.

5. **One rule type at a time.** If pilot feedback clearly requires a specific rule
   type (e.g. labour rate defaults), build only that one type, end to end, with
   an acceptance test. Do not build a general rules engine first.

---

## Key Decisions

| Decision | Position |
|----------|----------|
| Rules engine complexity | None for pilot. Simple config values when needed post-pilot. |
| Where rules integrate | Resolver fallback chain only. Not MaterialBill, not extraction. |
| Spoken price vs rule | Spoken price always wins. Rules are never silent overrides. |
| Missing price behaviour | Flag it. Never guess. Rules reduce frequency, not visibility. |
| Pilot approach | Use supplier price lists. Collect patterns. Build rules later. |
| Wording rules | Low priority. Templates cover this. Build only if templates fail. |
| Export rules | Already handled by Xero mappings. Revisit post-pilot. |

---

## What This Document Does Not Define

- Implementation approach for any rule type
- Database schema for rule storage
- UI design for rule creation or editing
- API shape for rule retrieval
- How rules interact with multi-user or multi-account scenarios
- Rule versioning or history

These are post-pilot concerns. They should be designed once real operator needs
are known.
