# Voice-to-Quote Build Constitution

## Purpose

This constitution defines app-specific architecture rules for every future feature, workflow, and trade module.

Its main job is to prevent a familiar failure mode: a feature passes isolated tests with clean fake objects, but fails in the real Quote Review / QuoteDraft UI path because the live pipeline uses edited quote state, selected template state, pricing facts, or customer assembly differently.

## Pipeline Stages

Every feature must identify where it enters and exits this pipeline:

1. Transcript / Paste Notes
2. Correction
3. Extraction
4. `ProcessedQuote`
5. QuoteFacts / PricingFacts / MeasurementFacts / ReviewNotices
6. Template recommendation / selection
7. Customer Quote Assembly
8. Customer Preview / QuoteDraft
9. Xero / JMS export

No feature should assume that passing an early stage proves the customer-ready draft or export path works.

## Feature Declaration Rule

Every new feature must declare:

- Where it enters the pipeline
- What activates it
- What facts it creates
- What outputs it affects
- What regressions it must not change
- What manual override wins
- What tests prove the live path works

If a feature changes customer-facing output, the declaration must include the QuoteDraft-equivalent rendered text that proves the result is sendable.

## Activation Rules

Activation priority:

1. Explicit user instruction / spoken job type
2. Deterministic extracted `job_type`
3. Module detector / structured facts
4. Selected template metadata
5. Fallback only when safe

Examples:

- Maintenance activates from `job_type = maintenance` or a clearly maintenance selected template.
- Garden tidy activates from `garden_tidy`, `one_off_tidy`, or selected `One-Off Garden Tidy` template metadata.
- Decking activates only on clear decking intent.
- Retaining activates only on clear retaining intent.
- Planting activates only on real planting intent, not generic plant-health, pruning, weeding, or self-seeded plant removal wording.

Selected template metadata may support activation, but it must not turn unrelated templates into trade modules.

## Source-Of-Truth Rules

- `ProcessedQuote` should remain stable and generic.
- QuoteFacts carry structured extracted facts.
- PricingFacts carry spoken, inferred, or calculated pricing facts.
- MeasurementFacts carry measurements and unit assumptions.
- ReviewNotices carry guidance and missing-info warnings.
- Customer Quote Assembly decides customer-facing structure.
- Xero / JMS export uses approved structured facts and export mappings.
- Templates support wording and structure, but do not replace facts.

Templates can help assemble a customer quote, but they should not be the only source of truth for price, scope, measurements, or export data.

## Test-Path Rules

- Unit tests may test isolated helpers.
- MVP acceptance tests must test the same path the UI uses.
- Acceptance tests must render final customer draft text.
- Tests must not rely only on clean fake objects if the live UI uses `editedQuoteForReview`, selected template state, or QuoteDraft props.
- If live UI uses selected template, tests must include selected template behavior.
- If QuoteDraft is the customer-ready output, tests must go through the QuoteDraft-equivalent render path.
- If live UI can use manual template selection, tests must prove that manual selection reaches QuoteDraft.
- If a bug appears only in the live UI, add a live-equivalent test before or alongside the fix.

The minimum live-equivalent customer draft path is:

```text
ProcessedQuote / editedQuoteForReview
-> buildCustomerPreviewQuoteInput
-> buildCustomerQuotePreview
-> buildCustomerDraftPreviewModel
-> renderCustomerDraftPreviewText
```

## Safety Rules

- Do not modify `ProcessedQuote` schema unless absolutely necessary.
- Do not add trade-specific logic to universal core.
- Do not let AI maths override calculator maths.
- Do not silently override spoken user prices.
- Missing info must be flagged, not guessed.
- Manual user selection overrides recommendation.
- Non-target trade regressions must pass.
- Customer preview and Xero/JMS export must not change unless the task explicitly targets them.
- External AI must not be called from deterministic regression tests.

## Manual Override Rules

- Manual template selection wins.
- Spoken override wins over inferred/default values.
- User-entered price wins over calculated price, with a mismatch warning when totals differ.
- User-approved quote data wins over stale AI-selected template values.
- Manual no-template selection must not be overwritten by recommendation during the same review session.

## MVP Workflow

For each workflow:

1. Create acceptance doc first.
2. Create executable acceptance test second.
3. Implement smallest behavior third.
4. Test live-equivalent rendered draft output.
5. Manual UI smoke test last.
6. Commit once usable, not perfect.

Acceptance docs define the finish line. Acceptance tests turn that finish line into a repeatable regression. Implementation should then be scoped to the smallest behavior needed to satisfy the acceptance criteria without disturbing unrelated modules.

## Definition Of Done

A workflow is done when:

- Acceptance test passes.
- Live QuoteDraft output matches the expected customer-ready result.
- Unrelated regression suites pass.
- Manual template selection, if relevant, is respected.
- Joe would send the generated quote with only minor edits.

If tests pass but the live UI output is not sendable, the workflow is not done.
