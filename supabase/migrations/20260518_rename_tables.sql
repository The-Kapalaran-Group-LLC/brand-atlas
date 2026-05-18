-- Rename Supabase tables for updated product naming.
ALTER TABLE IF EXISTS public.brand_deep_dives RENAME TO "BrandExcavator";
ALTER TABLE IF EXISTS public.searches RENAME TO "CulturalArchaeologist";
