-- ============================================================================
-- Milestone 1: Restrukturisasi Arsitektur Data - Asset Reports Enhancement
-- Adds new columns to support the ticketing/evidence-collection paradigm.
-- The asset_reports table now holds its OWN condition assessment (actual_condition)
-- separate from the master asset's "Kondisi Tercatat (Data SIMDA)".
-- ============================================================================

-- Add structured reporting fields
ALTER TABLE public.asset_reports
  ADD COLUMN IF NOT EXISTS reporter_name TEXT,
  ADD COLUMN IF NOT EXISTS reporter_contact VARCHAR(50),
  ADD COLUMN IF NOT EXISTS origin_department TEXT,
  ADD COLUMN IF NOT EXISTS current_location TEXT,
  ADD COLUMN IF NOT EXISTS issue_category TEXT DEFAULT 'Lainnya',
  ADD COLUMN IF NOT EXISTS actual_condition TEXT DEFAULT 'Baik',
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Migrate existing data: copy nama_pelapor → reporter_name, kontak_pelapor → reporter_contact
UPDATE public.asset_reports
SET reporter_name = nama_pelapor
WHERE nama_pelapor IS NOT NULL AND reporter_name IS NULL;

UPDATE public.asset_reports
SET reporter_contact = kontak_pelapor
WHERE kontak_pelapor IS NOT NULL AND reporter_contact IS NULL;

-- Update default status values to match new enum: 'Menunggu Validasi', 'Tervalidasi', 'Ditolak'
-- Note: We keep 'Menunggu' as the existing value; new inserts will use 'Menunggu Validasi'

-- Add constraint comment for documentation
COMMENT ON TABLE public.asset_reports IS 'Ticketing system for field-reported asset issues. Contains its own actual_condition assessment independent of master asset data (SIMDA). Master condition is only updated through admin reconciliation.';
COMMENT ON COLUMN public.asset_reports.actual_condition IS 'Kondisi aktual di lapangan: Baik, Rusak Ringan, Rusak Berat — independent of master asset condition';
COMMENT ON COLUMN public.asset_reports.issue_category IS 'Kategori masalah: Rusak Fisik, Kendala Sistem, Hilang/Tidak Ditemukan, Lainnya';
COMMENT ON COLUMN public.asset_reports.image_url IS 'Foto bukti laporan (wajib dari UI, nullable di DB untuk backward compat)';
