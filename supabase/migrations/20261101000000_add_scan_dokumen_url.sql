-- ============================================================
-- FITUR: Unggah Scan Dokumen & Pengajuan ke BKAD
-- Menambahkan kolom `dokumen_url` pada public.document_archives untuk
-- menyimpan tautan file scan (Surat Pernyataan bertanda tangan basah)
-- yang diunggah operator sebelum diajukan ke BKAD.
-- Skrip aman dijalankan ulang (idempotent).
-- ============================================================

ALTER TABLE public.document_archives
  ADD COLUMN IF NOT EXISTS dokumen_url text;
