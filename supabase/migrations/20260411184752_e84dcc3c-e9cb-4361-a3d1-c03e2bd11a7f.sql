
-- =============================================
-- 1. FIX COMPANIES TABLE POLICIES
-- =============================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Public can view companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can delete companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can update companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can insert companies" ON public.companies;
DROP POLICY IF EXISTS "Users can view their own company" ON public.companies;

-- Owner-only SELECT (authenticated)
CREATE POLICY "Owner can view own company"
  ON public.companies FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Owner-only UPDATE
CREATE POLICY "Owner can update own company"
  ON public.companies FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Owner-only DELETE
CREATE POLICY "Owner can delete own company"
  ON public.companies FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Owner-only INSERT (user_id must match)
CREATE POLICY "Owner can insert own company"
  ON public.companies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- 2. FIX ASSETS TABLE POLICIES
-- =============================================

-- Create a helper function to check company ownership (avoids recursion)
CREATE OR REPLACE FUNCTION public.is_company_owner(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = _company_id AND user_id = auth.uid()
  );
$$;

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Auth_All_Assets" ON public.assets;
DROP POLICY IF EXISTS "Authenticated users can delete assets" ON public.assets;
DROP POLICY IF EXISTS "Authenticated users can insert assets" ON public.assets;
DROP POLICY IF EXISTS "Authenticated users can update assets" ON public.assets;

-- Keep public read for QR scan functionality
-- "Public can view assets" and "Public_Read_Assets" are intentionally kept

-- Owner-scoped mutations
CREATE POLICY "Owner can insert assets"
  ON public.assets FOR INSERT TO authenticated
  WITH CHECK (public.is_company_owner(company_id));

CREATE POLICY "Owner can update assets"
  ON public.assets FOR UPDATE TO authenticated
  USING (public.is_company_owner(company_id))
  WITH CHECK (public.is_company_owner(company_id));

CREATE POLICY "Owner can delete assets"
  ON public.assets FOR DELETE TO authenticated
  USING (public.is_company_owner(company_id));

CREATE POLICY "Owner can select assets"
  ON public.assets FOR SELECT TO authenticated
  USING (public.is_company_owner(company_id));

-- =============================================
-- 3. FIX ASSET_REPORTS INSERT POLICIES
-- =============================================

-- Drop overly permissive insert policies
DROP POLICY IF EXISTS "Public_Can_Insert_Reports" ON public.asset_reports;
DROP POLICY IF EXISTS "Authenticated_Can_Insert_Reports" ON public.asset_reports;

-- Add existence-validated insert policies
CREATE POLICY "Anon can insert reports for valid assets"
  ON public.asset_reports FOR INSERT TO anon
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.assets WHERE id = asset_id)
    AND EXISTS (SELECT 1 FROM public.companies WHERE id = company_id)
  );

CREATE POLICY "Auth can insert reports for valid assets"
  ON public.asset_reports FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.assets WHERE id = asset_id)
    AND EXISTS (SELECT 1 FROM public.companies WHERE id = company_id)
  );

-- =============================================
-- 4. FIX STORAGE POLICIES
-- =============================================

-- Drop overly permissive storage mutation policies
DROP POLICY IF EXISTS "Authenticated users can delete asset photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update asset photos" ON storage.objects;

-- Scoped storage mutation policies (user folder based)
CREATE POLICY "Owner can delete own asset photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owner can update own asset photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update INSERT policy to enforce user folder
DROP POLICY IF EXISTS "Authenticated users can upload asset photos" ON storage.objects;
CREATE POLICY "Auth can upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
