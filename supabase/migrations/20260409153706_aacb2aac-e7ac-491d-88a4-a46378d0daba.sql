ALTER TABLE public.asset_reports 
ADD COLUMN IF NOT EXISTS nama_pelapor TEXT,
ADD COLUMN IF NOT EXISTS kontak_pelapor VARCHAR(50);