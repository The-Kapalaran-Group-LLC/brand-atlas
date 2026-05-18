-- Normalize quoted PascalCase table identifiers to unquoted/lowercase names.
ALTER TABLE IF EXISTS public."BrandExcavator" RENAME TO brandexcavator;
ALTER TABLE IF EXISTS public."CulturalArchaeologist" RENAME TO culturalarchaeologist;
