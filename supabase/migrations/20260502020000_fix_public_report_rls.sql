-- ============================================================================
-- Fix RLS untuk Lapor Kendala Publik (Anonymous Users)
-- 
-- Masalah:
-- 1. Storage bucket 'asset-photos' hanya mengizinkan upload ke folder auth.uid()
--    → user anon tidak punya auth.uid() → upload gagal
-- 2. Perlu bucket khusus 'report-evidence' untuk foto bukti laporan publik
-- ============================================================================

-- =============================================
-- 1. CREATE STORAGE BUCKET: report-evidence
-- =============================================
-- Catatan: Bucket harus dibuat via Supabase Dashboard atau API.
-- SQL di bawah ini hanya untuk policy-nya.
-- Pastikan bucket 'report-evidence' sudah dibuat dan diset PUBLIC di Dashboard.

-- =============================================
-- 2. STORAGE RLS: Izinkan anon & authenticated upload ke report-evidence
-- =============================================

-- Anon can upload evidence photos
CREATE POLICY "Anon can upload report evidence"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'report-evidence'
  );

-- Authenticated can also upload evidence photos
CREATE POLICY "Auth can upload report evidence"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'report-evidence'
  );

-- Anyone can view report evidence (public bucket)
CREATE POLICY "Public can view report evidence"
  ON storage.objects FOR SELECT TO anon
  USING (
    bucket_id = 'report-evidence'
  );

CREATE POLICY "Auth can view report evidence"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'report-evidence'
  );

-- =============================================
-- 3. ASSET_REPORTS: Ensure anon SELECT for open ticket check
-- =============================================
-- ScanAsset.tsx queries open tickets on a public page (no auth)
-- Need SELECT policy for anon to allow this query

CREATE POLICY "Anon can read reports for ticket check"
  ON public.asset_reports FOR SELECT TO anon
  USING (true);
