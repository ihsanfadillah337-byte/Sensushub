-- ============================================================
-- PHASE 2.1: Persiapan Database & Storage — Dokumen Pra-Pengajuan
-- Menambahkan kolom lampiran (Surat Pernyataan & Berita Acara) serta
-- daftar Tembusan pada tabel public.document_archives, dan menyiapkan
-- bucket Storage 'dokumen_usulan' (public) agar dapat dibaca Staf BKAD.
-- Skrip aman dijalankan ulang (idempotent).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Kolom lampiran pada tabel document_archives
--    (tembusan sudah ada sebelumnya; IF NOT EXISTS membuatnya aman)
-- ------------------------------------------------------------
ALTER TABLE public.document_archives
  ADD COLUMN IF NOT EXISTS tembusan jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS url_surat_pernyataan text,
  ADD COLUMN IF NOT EXISTS url_berita_acara text;

-- ------------------------------------------------------------
-- 2. Bucket Storage baru: dokumen_usulan (public)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('dokumen_usulan', 'dokumen_usulan', true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Kebijakan akses Storage untuk bucket dokumen_usulan
--    (mengikuti pola bucket 'asset-photos' pada migrasi sebelumnya)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view dokumen usulan" ON storage.objects;
CREATE POLICY "Public can view dokumen usulan"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'dokumen_usulan');

DROP POLICY IF EXISTS "Authenticated users can upload dokumen usulan" ON storage.objects;
CREATE POLICY "Authenticated users can upload dokumen usulan"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dokumen_usulan');

DROP POLICY IF EXISTS "Authenticated users can update dokumen usulan" ON storage.objects;
CREATE POLICY "Authenticated users can update dokumen usulan"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'dokumen_usulan');

DROP POLICY IF EXISTS "Authenticated users can delete dokumen usulan" ON storage.objects;
CREATE POLICY "Authenticated users can delete dokumen usulan"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dokumen_usulan');
