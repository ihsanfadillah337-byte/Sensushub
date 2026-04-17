// TypeScript interfaces untuk struktur database Inventarisasi Manajemen Aset
// Digunakan sebagai referensi tipe di seluruh frontend

// === RBAC Types ===
export type AppRole = 'super_admin' | 'operator' | 'auditor';

export interface UserProfile {
  id: string;
  company_id: string | null;
  role: AppRole;
  full_name: string | null;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  created_at: string;
}

export interface CompanyInsert {
  name: string;
}

export interface CompanyUpdate {
  name?: string;
}

// Tipe untuk custom_data JSONB - mendukung dynamic fields
export type CustomData = Record<string, string | number | boolean | null>;

export interface Asset {
  id: string;
  company_id: string;
  kode_aset: string;
  nama_aset: string;
  kategori: string;
  lokasi_ruangan: string;
  image_url: string | null;
  qr_url: string | null;
  custom_data: CustomData;
  created_at: string;
  kode_divisi: string | null;
  kib: string | null;
}

export interface AssetInsert {
  company_id: string;
  kode_aset: string;
  nama_aset: string;
  kategori: string;
  lokasi_ruangan: string;
  image_url?: string | null;
  qr_url?: string | null;
  custom_data?: CustomData;
}

export interface AssetUpdate {
  company_id?: string;
  kode_aset?: string;
  nama_aset?: string;
  kategori?: string;
  lokasi_ruangan?: string;
  image_url?: string | null;
  qr_url?: string | null;
  custom_data?: CustomData;
}

// Asset dengan relasi company (untuk query join)
export interface AssetWithCompany extends Asset {
  companies: Company;
}

// Audit history record
export interface AssetAudit {
  id: string;
  asset_id: string;
  auditor_id: string | null;
  kondisi: string;
  tindak_lanjut: string;
  catatan: string | null;
  foto_url: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}
