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

// === Asset Reports (Ticketing / Evidence Collection) ===
// This is the INDEPENDENT ticketing system for field-reported issues.
// actual_condition is the reporter's on-site assessment — it does NOT
// override the master asset's "Kondisi Tercatat (Data SIMDA)".
export type IssueCategory = 'Rusak Fisik' | 'Kendala Sistem' | 'Hilang/Tidak Ditemukan' | 'Lainnya';
export type ActualCondition = 'Baik' | 'Rusak Ringan' | 'Rusak Berat';
export type ReportStatus = 'Menunggu Validasi' | 'Tervalidasi' | 'Ditolak';

export interface AssetReport {
  id: string;
  asset_id: string;
  company_id: string;
  reporter_name: string | null;
  reporter_contact: string | null;
  origin_department: string | null;
  current_location: string | null;
  issue_category: IssueCategory;
  actual_condition: ActualCondition;
  judul: string;
  deskripsi: string | null;
  image_url: string | null;
  status: ReportStatus;
  resolusi: Record<string, unknown> | null;
  created_at: string;
  // Legacy columns (backward compat)
  nama_pelapor: string | null;
  kontak_pelapor: string | null;
}
