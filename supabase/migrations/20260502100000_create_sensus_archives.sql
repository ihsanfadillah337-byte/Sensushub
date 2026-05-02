-- ============================================================================
-- Sensus Archives: Historical archiving before census reset
-- Stores summary + full audit snapshot per census period
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sensus_archives (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    period_name TEXT NOT NULL,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    total_assets INT NOT NULL DEFAULT 0,
    total_audited INT NOT NULL DEFAULT 0,
    total_baik INT NOT NULL DEFAULT 0,
    total_rusak_ringan INT NOT NULL DEFAULT 0,
    total_rusak_berat INT NOT NULL DEFAULT 0,
    -- Full snapshot of all audit rows at archive time
    audit_snapshot JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.sensus_archives ENABLE ROW LEVEL SECURITY;

-- Only company owner can read their archives
CREATE POLICY "Owner can select own archives"
  ON public.sensus_archives FOR SELECT TO authenticated
  USING (public.is_company_owner(company_id));

-- Only company owner can insert archives
CREATE POLICY "Owner can insert own archives"
  ON public.sensus_archives FOR INSERT TO authenticated
  WITH CHECK (public.is_company_owner(company_id));

-- Only company owner can delete archives
CREATE POLICY "Owner can delete own archives"
  ON public.sensus_archives FOR DELETE TO authenticated
  USING (public.is_company_owner(company_id));

COMMENT ON TABLE public.sensus_archives IS 'Historical census period archives. Created when admin closes a census cycle via "Tutup & Arsipkan Sensus". Contains summary statistics and a full JSONB snapshot of all audit rows.';
COMMENT ON COLUMN public.sensus_archives.audit_snapshot IS 'Full array of asset_audits rows at archive time, preserving the complete audit trail for each census period.';
