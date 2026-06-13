# Maintenance Quote MVP Acceptance

This document defines the finish line for the maintenance quote flow. Future fixes should be judged against this acceptance scenario.

## Acceptance Transcript

```text
Monthly maintenance for Stella at 6 Tarawera Terrace, St Heliers.
Allow 4.5 hours labour per visit.
Price per visit $405 including greenwaste removal, herbicide spraying, and standard maintenance materials.
Main focus of visits will be weeding, pruning, and removal of self-seeded plants.
Each visit may include weeding, pruning, spraying, plant health checks, removal of greenwaste, and general garden maintenance as required.
There is a greenwaste bin on site which can be filled up to approximately two-thirds full each visit.
```

## Required Extraction

- Customer: Stella
- Address: 6 Tarawera Terrace, St Heliers
- Job type: maintenance
- Cadence: monthly
- Labour: 4.5 hours per visit
- Price: $405 per visit
- Inclusions: greenwaste removal, herbicide spraying, standard maintenance materials
- Main focus: weeding, pruning, removal of self-seeded plants
- Site note: greenwaste bin can be filled up to approximately two-thirds

## Required Template Behavior

- Ongoing Garden Maintenance is recommended or selected.
- Planting must not be suggested when the maintenance template is selected.
- No Planting labour labels appear for this maintenance quote.

## Required Internal Review

- Pricing Facts card shows $405 per visit.
- Pricing mismatch notice appears if JMS/labour total differs from the spoken price.
- Address confidence is high.
- No unnecessary customer/address warning appears.

## Required Customer Preview

The customer preview should be sendable and include:

- Stella
- 6 Tarawera Terrace, St Heliers
- Monthly Maintenance
- Main focus items
- General maintenance wording
- Price: $405 per visit
- Includes greenwaste removal, herbicide spraying, standard maintenance materials
- No Planting labour
- No irrelevant planting template language

## Required Export Behavior

For now, export may still use the existing mapping and review flow, but it must not silently override the spoken price without an internal warning.

## Definition Of Done

The flow is done when Joe would be comfortable sending the generated customer preview without rewriting most of it manually.
