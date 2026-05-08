-- ============================================================
-- Milestone 6: Tabel document_archives (Multi-Tenant)
-- Menyimpan arsip surat pengajuan perubahan kondisi BMD.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.document_archives (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nomor_surat   text NOT NULL,
  tanggal_surat date NOT NULL DEFAULT CURRENT_DATE,
  tanggal_penelusuran date,
  jenis_kib     text,
  total_aset    integer NOT NULL DEFAULT 0,
  total_nilai   bigint NOT NULL DEFAULT 0,
  kode_barang_list jsonb DEFAULT '[]'::jsonb,
  tembusan      jsonb DEFAULT '[]'::jsonb,
  data_otorisasi jsonb DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'Selesai',
  created_at    timestamptz DEFAULT now()
);

-- Index for fast company-scoped queries
CREATE INDEX IF NOT EXISTS idx_document_archives_company
  ON public.document_archives(company_id);

-- ============================================================
-- Row Level Security (Multi-Tenant Isolation)
-- ============================================================
ALTER TABLE public.document_archives ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT archives belonging to their company
CREATE POLICY "Users can view own company document archives"
  ON public.document_archives
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Policy: Users can INSERT archives for their own company
CREATE POLICY "Users can insert own company document archives"
  ON public.document_archives
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Policy: Users can UPDATE archives for their own company
CREATE POLICY "Users can update own company document archives"
  ON public.document_archives
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );
