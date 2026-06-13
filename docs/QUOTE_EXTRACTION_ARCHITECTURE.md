# Quotecord AI Extraction

## Purpose

AI extraction turns transcripts and added notes into a structured `ProcessedQuote` draft while preserving uncertainty and missing information.

## Processing Pipeline

1. Record or paste transcript.
2. Transcribe audio if needed.
3. Correct trade vocabulary and place names.
4. Extract deterministic lead and address details.
5. Load user templates and knowledge items.
6. Classify trade/specialist extractor.
7. Run AI quote extraction.
8. Apply post-processing:
   - Line item totals
   - Missing quantity/rate warnings
   - Address review warnings
   - Planting calculator
   - Template guardrails

## Shared Universal Extraction

- Client details
- Site address
- Template matching
- JMS item matching
- Spoken pricing overrides
- Missing information
- Customer/internal separation
- Fallback quote behaviour

## Trade-Specific Extractors

- Gardening / Maintenance
- Landscaping
- Building
- Electrical
- Plumbing
- Painting
- Cleaning
- Arborist
- General fallback

## Knowledge Inputs

- Quote templates
- Uploaded document analysis
- JMS item libraries
- Plant libraries
- User primary trade setting
- Spoken overrides

## Confidence and Safety

The system should not invent missing details. Missing, uncertain, or low-confidence information should appear in:

- `missing_information`
- `confidence_warnings`
- internal notes
- line item review warnings

## Future Work

- More deterministic calculators
- Trade-specific test suites
- Address validation
- Template selection scoring
- Better structured extraction diagnostics
