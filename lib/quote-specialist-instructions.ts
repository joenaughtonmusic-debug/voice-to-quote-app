export type QuoteSpecialist =
  | "maintenance"
  | "one_off_tidy"
  | "landscaping"
  | "decking"
  | "planting"
  | "hedge_trimming"
  | "electrical"
  | "building"
  | "plumbing"
  | "painting"
  | "cleaning"
  | "arborist"
  | "general"

export function getSharedUniversalExtractionInstructions() {
  return `Shared universal extraction:
- Client name, site address, template matching, JMS item matching, spoken rate overrides, missing quantity/rate rules, customer/internal separation, and fallback behaviour are handled by universal rules.
- Trade-specific extractors should only prioritise details from their own trade and must still return the universal ProcessedQuote schema.
- Do not blend unrelated trade assumptions into the selected extractor. Preserve cross-trade details only when clearly spoken.`
}

export function getLandscapingExtractorInstructions() {
  return `Landscaping specialist extractor:
- Key fields to extract: site area, measurements/dimensions, levels/falls, access, excavation depth, stages, construction sequence, labour/crew durations, materials, disposal, machinery/equipment, drainage, finish level, and optional extras.
- Common line item types: labour stages, excavation/site preparation, aggregate/basecourse, soil/mulch, timber/edging/retaining materials, concrete, pavers/stone, drainage products, membranes/geotextile, machine/equipment hire, delivery, greenwaste/general waste, and reinstatement/cleanup.
- Important technical terms: retaining, H4/H5 timber, posts, rails, sleepers, concrete grade/type, drainage coil, scoria, GAP/basecourse, geotextile, compacting, excavation, set-out, falls, haunching, backfill, topsoil, mulch, edging, paving, and reinstatement.
- Customer-facing scope priorities: describe the finished outcome, major stages, included preparation/installation/cleanup, visible materials, and any options or assumptions in plain NZ trade wording.
- Internal calculation priorities: preserve every measurement and dimension exactly as spoken, including units; preserve labour stages, stage durations, material lists, construction sequence, timber sizes, concrete types, fasteners, aggregates, membranes, drainage products, and product names exactly as spoken.
- Do not summarise labour-heavy or material-heavy work. Create separate detailed scope entries and line_items for distinct stages/material groups.
- Preserve each distinct material as its own line item, even when no price is found. Do not collapse materials into one generic "Materials" line.
- Confidence warning triggers: missing measurements, unclear material quantities, unclear disposal, unclear access/machine needs, unclear drainage/falls, uncertain structural details, consent/engineering uncertainty, unknown finish specification, or rate/quantity gaps.
- Put missing quantities, dimensions, specifications, and pricing into missing_information rather than inventing them.`
}

export function getDeckingExtractorInstructions() {
  return `Decking specialist extractor:
- Preserve every deck measurement, dimension, level, span, timber size, board type, framing member, pile/post detail, concrete type, fastener, fixing, and finish exactly as spoken.
- Preserve demolition, excavation, foundations, framing, decking, stairs, balustrade, finishing, and cleanup as separate stages in construction order.
- Preserve labour stages and stage durations. Do not compress material-heavy or labour-heavy details.
- Put unclear structural details, quantities, consent requirements, and pricing into missing_information or confidence_warnings.`
}

export function getPlantingExtractorInstructions() {
  return `Planting specialist extractor:
- Preserve plant names, cultivars, quantities, pot sizes, grades, spacing, locations, soil preparation, compost, fertiliser, mulch, staking, irrigation, and aftercare exactly as spoken.
- Separate plants, soil products, amendments, mulch, labour, delivery, and greenwaste into useful materials/line items.
- Preserve planting sequence and site-specific plant cautions. Do not invent quantities, spacing, or plant substitutions.`
}

export function getHedgeTrimmingExtractorInstructions() {
  return `Hedge trimming specialist extractor:
- Preserve hedge species, locations, lengths, heights, target heights, widths, access constraints, trimming sides/tops, reduction instructions, and greenwaste details exactly as spoken.
- Distinguish routine trimming from major reduction or restoration work.
- Preserve frequency, visit duration, equipment/access needs, and disposal allowances.
- Keep plant-name uncertainty in confidence_warnings rather than silently changing it.`
}

export function getGardeningMaintenanceExtractorInstructions() {
  return `Maintenance specialist extractor:
- Key fields to extract: frequency/cadence, visit duration, crew size, seasonality, site areas, access, recurring tasks, periodic tasks, greenwaste allowance, sprays/fertiliser, customer priorities, and first-visit/setup tidy scope.
- Common line item types: recurring labour per visit, greenwaste, sprays/chemicals, fertiliser/soil products, mulch/top-up materials, hedge/lawn/garden maintenance tasks, equipment allowances, travel/vehicle fees, and optional one-off tidy/setup work.
- Important technical terms: mowing, edges, weeding, pruning, trimming, deadheading, hedges, greenwaste, spraying, fertiliser, mulch, seasonal pruning, irrigation check, plant health, and visit frequency terms such as weekly/fortnightly/monthly/two-monthly/quarterly.
- Customer-facing scope priorities: clearly separate what is included every visit from periodic/as-required work, state frequency/visit allowance where captured, and describe customer-visible outcomes without overpromising.
- Internal calculation priorities: recurring cadence, hours per visit, people per visit, greenwaste allowance, chemical/fertiliser assumptions, seasonal extras, and whether pricing is per visit/month/period.
- Preserve what happens every visit versus periodically or only when required.
- Keep recurring work in primary_quote and separate one-off setup/tidy work as an optional quote when appropriate.
- Confidence warning triggers: missing frequency, missing visit duration, unclear property size/areas, unclear greenwaste inclusion, unclear spray/fertiliser products, uncertain recurring price basis, or first-visit effort not scoped.
- Do not invent frequency, visit duration, chemical/product names, or recurring prices.`
}

export function getOneOffTidyExtractorInstructions() {
  return `One-off tidy specialist extractor:
- Focus on overgrowth, tidy/clearance scope, estimate wording, greenwaste allowance, access constraints, site conditions, uncertainty, and risk factors.
- Preserve cautions about plants or areas that must not be removed or disturbed.
- Use estimate/range wording when the transcript describes variable or uncertain effort.
- Keep optional extras and ongoing maintenance separate from the immediate one-off tidy.
- Do not turn uncertain site conditions into fixed quantities or fixed-price claims.`
}

export function getElectricalExtractorInstructions() {
  return `Electrical specialist extractor:
- Key fields to extract: electrical task type, locations/rooms, quantities, fitting/device types, cable/conduit details, switchboard/RCD work, access, testing, certification, supply/install responsibility, make/model/product names, and outage/access constraints.
- Common line item types: labour/call-out, power points/sockets, switches, downlights/LED fittings, cable/TPS, conduit/trunking, switchboard/RCD components, testing/fault finding, certificate of compliance/CoC, travel, and consumables.
- Important technical terms: power point, powerpoint, socket, switch, downlight, LED, TPS, conduit, cable, RCD, MCB, switchboard, circuit, isolation, testing, fault finding, certificate of compliance, CoC, supply and install, and replacement.
- Customer-facing scope priorities: describe what will be installed/replaced/tested, where, and whether certification/testing is included when stated.
- Internal calculation priorities: count of fittings/devices, cable/conduit runs or lengths, labour/call-out allowance, switchboard/compliance requirements, access constraints, and whether materials are supplied by customer or contractor.
- Preserve electrical scope, locations, quantities, and product names exactly as spoken.
- Confidence warning triggers: unclear device quantities, unclear circuit/switchboard details, uncertain certification requirement, access limitations, missing product specs, customer-supplied materials uncertainty, or missing rates/quantities.
- Put missing circuit details, access constraints, compliance requirements, quantities, rates, and certificate requirements into missing_information rather than inventing them.
- Use plain trade wording and do not turn uncertain electrical details into fixed claims.`
}

export function getBuildingExtractorInstructions() {
  return `Building specialist extractor:
- Key fields to extract: scope area, demolition/removal, repairs/alterations, framing, linings, cladding, fixings, waterproofing, insulation, finishing, measurements, product specs, access, site protection, sequencing, inspections, and consent/compliance notes.
- Common line item types: labour stages, demolition, framing timber, sheet/lining materials, cladding/weatherboards, fixings/fasteners, waterproofing/flashing, insulation, subcontractors, access/scaffold, disposal, delivery, cleanup, and compliance/inspection allowances.
- Important technical terms: framing, nogs, studs, joists, rafters, lintel, cladding, flashing, gib/plasterboard, ply, fixings, waterproofing, bracing, insulation, consent, inspection, PS/producer statement, and site protection.
- Customer-facing scope priorities: explain the building outcome, included preparation/removal/installation/finishing, exclusions/assumptions, and any known compliance or access requirements.
- Internal calculation priorities: preserve measurements, quantities, product names, timber sizes, sheet sizes, staged labour, inspection/consent notes, access equipment, and construction sequence.
- Separate labour, materials, disposal, subcontractor, access equipment, and compliance items where stated.
- Confidence warning triggers: missing dimensions, unclear structural specification, uncertain consent/inspection need, missing product/finish spec, hidden damage risk, access constraints, unclear disposal, or missing rates/quantities.
- Put unclear dimensions, consent requirements, structural details, rates, and exclusions into missing_information rather than inventing them.`
}

export function getPlumbingExtractorInstructions() {
  return `Plumbing specialist extractor:
- Key fields to extract: fixture/appliance, location, pipe size/material, fittings/valves/traps, water/waste/gas/drainage scope, leak/blockage details, hot water unit details, pump details, excavation/reinstatement, testing, compliance/certification, and access constraints.
- Common line item types: call-out/labour, fixtures/taps/toilets/mixers, pipe/fittings/valves, traps, drains, hot water components, pumps, gas/water/waste materials, excavation, reinstatement, disposal, testing, compliance/certification, and travel.
- Important technical terms: copper, PEX, PVC, waste pipe, drain, trap, valve, mixer, tapware, toilet, cistern, hot water cylinder, califont, pump, pressure, leak, blockage, backflow, gas fitting, testing, and certification.
- Customer-facing scope priorities: describe the repair/install/investigation outcome, included fixtures/materials, reinstatement assumptions, and whether testing/compliance is included when stated.
- Internal calculation priorities: preserve pipe sizes/materials, fixture counts, labour/call-out allowance, excavation depth/length, reinstatement needs, testing/compliance requirements, and supplied-by-customer assumptions.
- Distinguish investigation, repair, replacement, installation, testing, drainage, and compliance/certification work.
- Confidence warning triggers: unclear fixture specification, unknown pipe size/material, unclear leak/blockage cause, hidden access risk, uncertain reinstatement, missing compliance requirements, missing quantities, or missing rates.
- Put missing fixture specifications, pipe sizes, pressure/drainage details, access constraints, rates, and compliance requirements into missing_information.`
}

export function getPaintingExtractorInstructions() {
  return `Painting specialist extractor:
- Key fields to extract: interior/exterior, areas/rooms, surface/substrate, preparation level, number of coats, paint system/product, colours, access, repairs, protection/masking, and cleanup.
- Common line item types: labour, paint/materials, preparation/repairs, primer/undercoat/topcoat, access/scaffold, masking/protection, cleanup, and optional extras.
- Important technical terms: sanding, scraping, filling, spot prime, undercoat, topcoat, enamel, stain, sealer, plaster, weatherboard, substrate, masking, cutting in, and coats.
- Customer-facing scope priorities: surfaces included, preparation included, number of coats/product assumptions when known, and exclusions.
- Internal calculation priorities: surface areas, coat count, preparation intensity, access/scaffold, product/colour selections, and rates.
- Confidence warning triggers: missing areas, unclear surface condition, missing colours/product, unknown coat count, access uncertainty, weather constraints, or missing rates.`
}

export function getCleaningExtractorInstructions() {
  return `Cleaning specialist extractor:
- Key fields to extract: cleaning type, property/room count, surfaces, frequency, duration, access, equipment, chemicals/consumables, waste, special treatments, and client priorities.
- Common line item types: labour, consumables, equipment, travel, waste, special treatments, exterior wash, and optional extras.
- Important technical terms: deep clean, regular clean, builders clean, end-of-tenancy, sanitise, degrease, pressure wash, windows, carpets, oven, bathrooms, kitchens, and consumables.
- Customer-facing scope priorities: areas included, service level, visible outcomes, add-ons, and exclusions.
- Internal calculation priorities: visit duration, room/area counts, access, equipment/chemical needs, frequency, and rates.
- Confidence warning triggers: missing room/area count, unclear service level, unclear frequency, access limitations, special product needs, or missing rates.`
}

export function getArboristExtractorInstructions() {
  return `Arborist specialist extractor:
- Key fields to extract: species, tree count, height/spread, location, access, hazards, power lines, neighbouring/property risks, pruning/removal/reduction scope, stump details, waste/chipping, equipment, and permits/consents.
- Common line item types: crew/labour, climbing/rigging, chipper, stump grinder, disposal/chipping, traffic/site management, equipment hire, permits, and cleanup.
- Important technical terms: crown lift, crown reduction, deadwood, fell/remove, sectional dismantle, rigging, chipper, stump grind, canopy, limb/branch, drop zone, power lines, and protected tree.
- Customer-facing scope priorities: tree work outcome, included waste/chipping/cleanup, access assumptions, and exclusions.
- Internal calculation priorities: tree dimensions, crew/equipment, hazard/access complexity, disposal volume, stump details, permits/traffic management, and rates.
- Confidence warning triggers: unknown species/size, unclear access/hazards, power line/property risk, consent/protected tree uncertainty, disposal assumptions, or missing rates.`
}

export function getGeneralFallbackExtractorInstructions() {
  return `General specialist extractor:
- Preserve all specific scope, materials, labour, durations, measurements, cautions, pricing, and sequence stated in the transcript.
- Do not invent or over-summarise details.`
}

export function getSpecialistInstructions(specialist: QuoteSpecialist) {
  switch (specialist) {
    case "landscaping":
      return getLandscapingExtractorInstructions()
    case "decking":
      return getDeckingExtractorInstructions()
    case "planting":
      return getPlantingExtractorInstructions()
    case "hedge_trimming":
      return getHedgeTrimmingExtractorInstructions()
    case "maintenance":
      return getGardeningMaintenanceExtractorInstructions()
    case "one_off_tidy":
      return getOneOffTidyExtractorInstructions()
    case "electrical":
      return getElectricalExtractorInstructions()
    case "building":
      return getBuildingExtractorInstructions()
    case "plumbing":
      return getPlumbingExtractorInstructions()
    case "painting":
      return getPaintingExtractorInstructions()
    case "cleaning":
      return getCleaningExtractorInstructions()
    case "arborist":
      return getArboristExtractorInstructions()
    case "general":
      return getGeneralFallbackExtractorInstructions()
  }
}
