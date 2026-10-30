-- Phase 1.2: Restrukturisasi peran — 'Auditor' diganti sepenuhnya menjadi 'Operator'.
-- ENUM app_role sudah mendukung nilai 'operator', sehingga TIDAK perlu ALTER TYPE.
-- Migrasi ini mengalihkan pengguna lama yang masih ber-role 'auditor' agar tidak
-- kehilangan akses/menu setelah frontend hanya mengenali role 'operator'.

UPDATE public.user_profiles
SET role = 'operator'
WHERE role = 'auditor';
