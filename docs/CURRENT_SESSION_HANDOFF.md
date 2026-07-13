# Current Session Handoff

Re-orientation for a fresh session. Branch: `wip/export-mapping-refactor-from-cursor`
(pushed to origin, **do not merge to main**). North star: **`docs/PRODUCTION_DIRECTION.md`**.
Answer keys: **`docs/reference_quotes/ANSWER_KEYS.md`** (real sent quotes as PDFs alongside).

---

## 1. DONE & send-ready — GARDENING auto-quoter

Two trades are finished, reliable, and leave-as-is:

- **One-off tidy (T1–T7).** Deterministic pricing-facts parsed from the raw transcript;
  labour day-rate rule (full day = 7.5h, rate per person); greenwaste rule ($26.50/bag,
  6 bags = 1 trailer); priced extras; **GST-inclusive** per-line totals; merged
  "Labour – main scope" line; Xero extras-line parity. Graded on Xavier (QU-0572) and
  Dave (QU-0570).
- **Ongoing maintenance (M-series, incl. the fixed scope template + price line).**
  Per-visit price anchor (spoken total wins → else computed hours × rate); greenwaste
  fold-vs-itemise (own line + range note, or "included" per Brett); priced extras
  (sprays / tool servicing / petrol); GST-inclusive TOTAL; Xero parity. Graded on
  Nadia (QU-0521) and Brett (QU-0569), plus real dictations — **Finn passed** ($400/visit
  shows on the customer copy).

Shared guarantees across both: **deterministic** (same transcript → same figures,
run-to-run), **spoken overrides win**, **GST-inclusive totals**, **no internal/team-note
leaks** to the customer copy, **Xero total == customer-draft total**.

Committed + pushed this session: maintenance **M1–M5** (`4b89420` … `8965828`).
Key files — assemblers: `lib/customer-quote-assembly/{garden-tidy,maintenance}.ts`;
pricing facts/resolvers: `lib/export/{tidy-pricing-facts,maintenance-pricing-facts,
maintenance-visit-price,maintenance-greenwaste,maintenance-extras}.ts`;
Xero renderers: `lib/export/xero/{garden-tidy,maintenance}-renderer.ts`.

---

## 2. NEXT — Landscaping Quote Builder

New **"build it fast, my judgement stays in"** mode. **Read `docs/LANDSCAPING_BUILDER_SPEC.md` first.**

**Two modes, one app:**
- **Gardening** — the existing auto-quoter above. Untouched.
- **Landscaping** — new builder: **talk → split into confirmable chunks → suggest
  lines + prices from my uploaded lists → I approve/edit → clean quote.** The app never
  auto-finalises; it removes the friction, not the judgement. Split mixed work *visibly*
  (the paver lesson done right); suggest-and-flag prices, never silently invent.

**Reuse the existing pieces BUT harden them — they are on the OLD un-hardened planting path:**
- Importer `lib/plant-library-import.ts`, JMS/supplier importer `components/jms-item-library.tsx`
  (+ `SOURCE_PROFILES`, "Supplier Price List Import" mode), supplier normaliser
  `lib/import/normalise-rows.ts` (already strips section headings + working columns).
- Planting calculator `lib/calculators/planting/index.ts` (deterministic count/spacing, flags
  missing spacing/price) and plant matcher `lib/plants` (`matchPlantRowsFromLibrary`).
- Gaps to close (verified): **no P-series hardening**; planting customer path does **not**
  use the tidy/maintenance no-leak guard (`internal-scope-signals`), and Optional-Works greps
  the raw transcript unfiltered (leak vector); **no material speech→list-row matcher**
  (`material-price-association.ts` only matches a price spoken *near* the item, not a list row);
  **no cost×markup→sell computation**; a plant with an odd name can be silently dropped.

**Import mapping is required — my real lists DON'T match the schema:**
- **Botanic (plants):** `Product Label | Price | Availability` — no spacing column, pot size
  embedded in the name ("Ficus tuffi 14L"); `Price`→sell_price ✓, `Availability`→stock_status ✓,
  but `Product Label`→plant_name needs an alias. Spacing always **suggested**, never looked up.
- **Bunnings (materials):** `Material | Price`, grouped under headings — headings already handled
  by the normaliser; `Material`→item_name needs an alias; belongs in the material/supplier path.
- **Auckland Landscape Supplies (bulk):** `Material | Their price | Mark up | Quantity | Total` —
  Qty/Total stripped as working columns; `Their price`→cost_price and `Mark up`→markup_percent
  need aliases; **and there is no cost×markup→sell math yet** (the real blocker).

**L-series (agreed) — start at L1:**
- **L1** — mode switch + landscaping shell (empty builder, one manual chunk).
- **L2** — the chunker: talk → split into confirmable sections (biggest new piece; AI-backed).
- **L3** — wire price-list matching into lines (list price / suggest+flag). Needs the missing
  material list-row matcher + the import-mapping aliases + cost×markup→sell (an L0 prerequisite
  if kept separate).
- **L4** — spacing/counts: reuse the calculator, add "suggest spacing → I approve."
- **L5** — assemble to internal/team/customer + GST + Xero parity (reuse gardening). Note the
  **team-instructions output is still not built** — L5 inherits that gap.

Each step narrow, separately committable, graded on a real dictated landscaping job
(weed mat + bark + planting + edging along a driveway), on "correct, editable, nothing hidden."

---

## 3. PAUSED / pointers

- **PAUSED — paver / mixed-trade batches (AI-0c, AI-1).** Do not restart under this work.
- North star: `docs/PRODUCTION_DIRECTION.md`. Answer keys: `docs/reference_quotes/ANSWER_KEYS.md`.
- Full batch history: `docs/QUOTE_ENGINE_BATCH_PLAN.md`.
