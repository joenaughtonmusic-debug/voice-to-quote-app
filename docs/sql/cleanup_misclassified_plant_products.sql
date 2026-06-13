-- Cleanup misclassified nursery products that were imported as live plants.
--
-- Usage:
-- 1. Replace 00000000-0000-0000-0000-000000000000 with the target profiles.id/user_id.
-- 2. Run the SELECT preview first.
-- 3. If the preview is correct, run the UPDATE inside a transaction.
--
-- This only touches knowledge_items for one user and keeps products available
-- for quote line-item matching as chemical/material knowledge items.

-- Preview rows that look like plant-care products rather than live plants.
select
  id,
  item_code,
  item_name,
  item_type,
  category,
  raw_import
from public.knowledge_items
where user_id = '00000000-0000-0000-0000-000000000000'
  and item_type = 'plant'
  and (
    concat_ws(
      ' ',
      item_code,
      item_name,
      description,
      category,
      source_category,
      raw_import::text
    ) ~* '\m(plant soap|soap|spray|sprays|spray oil|wetting agent|wetting agents|surfactant|fertiliser|fertilizer|plant food|tonic|conditioner|booster|weedkiller|weed killer|herbicide|pesticide|fungicide|insecticide|mavrik|copper|hydrocotyl|roundup|glyphosate|chemical|treatment|root powder|rooting hormone)\M'
  )
order by item_name;

begin;

update public.knowledge_items
set
  item_type = case
    when concat_ws(' ', item_code, item_name, description, category, source_category, raw_import::text) ~* '\m(fertiliser|fertilizer|plant food|tonic|booster)\M'
      then 'chemical'
    when concat_ws(' ', item_code, item_name, description, category, source_category, raw_import::text) ~* '\m(plant soap|soap|wetting agent|wetting agents|surfactant|conditioner|treatment|root powder|rooting hormone)\M'
      then 'material'
    else 'chemical'
  end,
  category = case
    when concat_ws(' ', item_code, item_name, description, category, source_category, raw_import::text) ~* '\m(fertiliser|fertilizer|plant food|tonic|booster)\M'
      then 'fertiliser'
    when concat_ws(' ', item_code, item_name, description, category, source_category, raw_import::text) ~* '\m(plant soap|soap|wetting agent|wetting agents|surfactant|conditioner|treatment|root powder|rooting hormone)\M'
      then 'plant_care'
    else 'chemical'
  end,
  raw_import = coalesce(raw_import, '{}'::jsonb) || jsonb_build_object(
    'plant_product_cleanup_applied', true,
    'previous_item_type', 'plant',
    'cleanup_reason', 'Plant-care/spray/fertiliser product should not be used as a Plant Calculator option.'
  ),
  updated_from_import_at = now()
where user_id = '00000000-0000-0000-0000-000000000000'
  and item_type = 'plant'
  and (
    concat_ws(
      ' ',
      item_code,
      item_name,
      description,
      category,
      source_category,
      raw_import::text
    ) ~* '\m(plant soap|soap|spray|sprays|spray oil|wetting agent|wetting agents|surfactant|fertiliser|fertilizer|plant food|tonic|conditioner|booster|weedkiller|weed killer|herbicide|pesticide|fungicide|insecticide|mavrik|copper|hydrocotyl|roundup|glyphosate|chemical|treatment|root powder|rooting hormone)\M'
  );

-- Review changed rows before committing.
select
  id,
  item_code,
  item_name,
  item_type,
  category,
  raw_import ->> 'cleanup_reason' as cleanup_reason
from public.knowledge_items
where user_id = '00000000-0000-0000-0000-000000000000'
  and raw_import ->> 'plant_product_cleanup_applied' = 'true'
order by item_name;

-- commit;
-- rollback;
