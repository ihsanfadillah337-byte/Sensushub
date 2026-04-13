
-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Companies: public can read, authenticated can do all
CREATE POLICY "Public can view companies" ON public.companies FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert companies" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update companies" ON public.companies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete companies" ON public.companies FOR DELETE TO authenticated USING (true);

-- Create assets table
CREATE TABLE public.assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kode_aset TEXT NOT NULL UNIQUE,
  nama_aset TEXT NOT NULL,
  kategori TEXT NOT NULL,
  lokasi_ruangan TEXT NOT NULL,
  image_url TEXT,
  qr_url TEXT,
  custom_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on assets
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- Assets: public/anonymous can READ, authenticated can do ALL
CREATE POLICY "Public can view assets" ON public.assets FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert assets" ON public.assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update assets" ON public.assets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete assets" ON public.assets FOR DELETE TO authenticated USING (true);

-- Create index for faster lookups
CREATE INDEX idx_assets_company_id ON public.assets(company_id);
CREATE INDEX idx_assets_kode_aset ON public.assets(kode_aset);
CREATE INDEX idx_assets_kategori ON public.assets(kategori);

-- Storage bucket for asset photos
INSERT INTO storage.buckets (id, name, public) VALUES ('asset-photos', 'asset-photos', true);

-- Storage policies
CREATE POLICY "Public can view asset photos" ON storage.objects FOR SELECT USING (bucket_id = 'asset-photos');
CREATE POLICY "Authenticated users can upload asset photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'asset-photos');
CREATE POLICY "Authenticated users can update asset photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'asset-photos');
CREATE POLICY "Authenticated users can delete asset photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'asset-photos');
