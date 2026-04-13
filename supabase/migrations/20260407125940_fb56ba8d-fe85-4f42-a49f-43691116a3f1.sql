ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS master_divisi JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS master_kib JSONB DEFAULT '[]'::jsonb;