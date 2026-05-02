export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      asset_reports: {
        Row: {
          id: string
          asset_id: string
          company_id: string
          judul: string
          deskripsi: string | null
          nama_pelapor: string | null
          kontak_pelapor: string | null
          reporter_name: string | null
          reporter_contact: string | null
          origin_department: string | null
          current_location: string | null
          issue_category: string
          actual_condition: string
          image_url: string | null
          status: string
          resolusi: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          company_id: string
          judul: string
          deskripsi?: string | null
          nama_pelapor?: string | null
          kontak_pelapor?: string | null
          reporter_name?: string | null
          reporter_contact?: string | null
          origin_department?: string | null
          current_location?: string | null
          issue_category?: string
          actual_condition?: string
          image_url?: string | null
          status?: string
          resolusi?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          asset_id?: string
          company_id?: string
          judul?: string
          deskripsi?: string | null
          nama_pelapor?: string | null
          kontak_pelapor?: string | null
          reporter_name?: string | null
          reporter_contact?: string | null
          origin_department?: string | null
          current_location?: string | null
          issue_category?: string
          actual_condition?: string
          image_url?: string | null
          status?: string
          resolusi?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_reports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_audits: {
        Row: {
          id: string
          asset_id: string
          auditor_id: string | null
          kondisi: string
          tindak_lanjut: string
          catatan: string | null
          foto_url: string | null
          latitude: number | null
          longitude: number | null
          created_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          auditor_id?: string | null
          kondisi: string
          tindak_lanjut: string
          catatan?: string | null
          foto_url?: string | null
          latitude?: number | null
          longitude?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          asset_id?: string
          auditor_id?: string | null
          kondisi?: string
          tindak_lanjut?: string
          catatan?: string | null
          foto_url?: string | null
          latitude?: number | null
          longitude?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_audits_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          company_id: string
          created_at: string
          custom_data: Json
          id: string
          image_url: string | null
          kategori: string
          kib: string | null
          kode_aset: string
          kode_divisi: string | null
          lokasi_ruangan: string
          nama_aset: string
          qr_url: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          custom_data?: Json
          id?: string
          image_url?: string | null
          kategori: string
          kib?: string | null
          kode_aset: string
          kode_divisi?: string | null
          lokasi_ruangan: string
          nama_aset: string
          qr_url?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          custom_data?: Json
          id?: string
          image_url?: string | null
          kategori?: string
          kib?: string | null
          kode_aset?: string
          kode_divisi?: string | null
          lokasi_ruangan?: string
          nama_aset?: string
          qr_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          custom_column_schema: Json | null
          id: string
          master_divisi: Json | null
          master_kib: Json | null
          name: string
          sensus_active: boolean
          settings_pin: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          custom_column_schema?: Json | null
          id?: string
          master_divisi?: Json | null
          master_kib?: Json | null
          name: string
          sensus_active?: boolean
          settings_pin?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          custom_column_schema?: Json | null
          id?: string
          master_divisi?: Json | null
          master_kib?: Json | null
          name?: string
          sensus_active?: boolean
          settings_pin?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          id: string
          company_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          full_name: string | null
          created_at: string
        }
        Insert: {
          id: string
          company_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          full_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          full_name?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sensus_archives: {
        Row: {
          id: string
          company_id: string
          period_name: string
          start_date: string | null
          end_date: string | null
          total_assets: number
          total_audited: number
          total_baik: number
          total_rusak_ringan: number
          total_rusak_berat: number
          audit_snapshot: Json
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          period_name: string
          start_date?: string | null
          end_date?: string | null
          total_assets?: number
          total_audited?: number
          total_baik?: number
          total_rusak_ringan?: number
          total_rusak_berat?: number
          audit_snapshot?: Json
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          period_name?: string
          start_date?: string | null
          end_date?: string | null
          total_assets?: number
          total_audited?: number
          total_baik?: number
          total_rusak_ringan?: number
          total_rusak_berat?: number
          audit_snapshot?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sensus_archives_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_company_owner: { Args: { _company_id: string }; Returns: boolean }
      get_auth_company_id: { Args: Record<string, never>; Returns: string }
    }
    Enums: {
      app_role: "super_admin" | "operator" | "auditor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
