-- Migrasi RLS untuk tabel user_profiles
-- Mengizinkan user dengan role 'super_admin' untuk melakukan INSERT dan UPDATE pada profil user di company yang sama.

-- 1. Policy untuk INSERT
CREATE POLICY "Super admins can insert profiles for their company" 
ON public.user_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles AS admin_profile
    WHERE admin_profile.id = auth.uid() 
      AND admin_profile.role = 'super_admin'
      AND admin_profile.company_id = user_profiles.company_id
  )
);

-- 2. Policy untuk UPDATE (Membutuhkan USING dan WITH CHECK)
CREATE POLICY "Super admins can update profiles for their company" 
ON public.user_profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles AS admin_profile
    WHERE admin_profile.id = auth.uid() 
      AND admin_profile.role = 'super_admin'
      AND admin_profile.company_id = user_profiles.company_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles AS admin_profile
    WHERE admin_profile.id = auth.uid() 
      AND admin_profile.role = 'super_admin'
      AND admin_profile.company_id = user_profiles.company_id
  )
);
