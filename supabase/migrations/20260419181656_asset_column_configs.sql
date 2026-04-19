-- Migrasi untuk membuat tabel asset_column_configs

CREATE TABLE IF NOT EXISTS public.asset_column_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    kategori_kib TEXT NOT NULL,
    column_name TEXT NOT NULL,
    column_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Memastikan satu company tidak memiliki nama kolom yang dobel di dalam KIB yang sama
    UNIQUE(company_id, kategori_kib, column_name)
);

-- Mengaktifkan Row-Level Security
ALTER TABLE public.asset_column_configs ENABLE ROW LEVEL SECURITY;

-- 1. Mengizinkan semua user terotentikasi membaca konfigurasi kolom di company mereka
CREATE POLICY "Users can view column configs for their company" 
ON public.asset_column_configs
FOR SELECT
TO authenticated
USING (
    company_id IN (
        SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
);

-- 2. Mengizinkan SUPER ADMIN membuat konfigurasi kolom di company mereka
CREATE POLICY "Super admins can insert column configs for their company" 
ON public.asset_column_configs
FOR INSERT
TO authenticated
WITH CHECK (
    company_id IN (
        SELECT company_id 
        FROM public.user_profiles 
        WHERE id = auth.uid() AND role = 'super_admin'
    )
    AND 
    company_id = company_id
);

-- 3. Mengizinkan SUPER ADMIN menghapus konfigurasi kolom di company mereka
CREATE POLICY "Super admins can delete column configs for their company" 
ON public.asset_column_configs
FOR DELETE
TO authenticated
USING (
    company_id IN (
        SELECT company_id 
        FROM public.user_profiles 
        WHERE id = auth.uid() AND role = 'super_admin'
    )
);

-- Trigger untuk update (opsional, tabel ini statis tapi berjaga-jaga)
CREATE POLICY "Super admins can update column configs for their company" 
ON public.asset_column_configs
FOR UPDATE
TO authenticated
USING (
    company_id IN (
        SELECT company_id 
        FROM public.user_profiles 
        WHERE id = auth.uid() AND role = 'super_admin'
    )
)
WITH CHECK (
    company_id IN (
        SELECT company_id 
        FROM public.user_profiles 
        WHERE id = auth.uid() AND role = 'super_admin'
    )
);
