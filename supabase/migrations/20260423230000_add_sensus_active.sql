-- Menambahkan kolom sensus_active ke tabel companies
-- untuk mengontrol akses Form Audit berdasarkan status kegiatan sensus

ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS sensus_active BOOLEAN DEFAULT false;
