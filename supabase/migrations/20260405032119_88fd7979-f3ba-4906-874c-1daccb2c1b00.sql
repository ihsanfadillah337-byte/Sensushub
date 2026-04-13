-- Create asset_reports table
CREATE TABLE IF NOT EXISTS public.asset_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    judul TEXT NOT NULL,
    deskripsi TEXT,
    status TEXT DEFAULT 'Menunggu' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.asset_reports ENABLE ROW LEVEL SECURITY;

-- Public can INSERT reports (no login needed)
CREATE POLICY "Public_Can_Insert_Reports" ON public.asset_reports
FOR INSERT TO anon WITH CHECK (true);

-- Authenticated users can also insert
CREATE POLICY "Authenticated_Can_Insert_Reports" ON public.asset_reports
FOR INSERT TO authenticated WITH CHECK (true);

-- Admin can SELECT own company reports
CREATE POLICY "Admin_Select_Own_Reports" ON public.asset_reports
FOR SELECT TO authenticated USING (
    company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
);

-- Admin can UPDATE own company reports
CREATE POLICY "Admin_Update_Own_Reports" ON public.asset_reports
FOR UPDATE TO authenticated USING (
    company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
) WITH CHECK (
    company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
);