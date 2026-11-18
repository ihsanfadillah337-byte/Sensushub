import { supabase } from "@/integrations/supabase/client";

export interface DuplikasiResult {
  isDuplicate: boolean;
  reason: string;
}

/** Pesan penolakan standar untuk kebutuhan Black Box Testing. */
export const MSG_SUDAH_DIREKLASIFIKASI =
  "Penolakan Duplikasi: Aset ini sudah direklasifikasi ke 04 - Aset Lainnya sebelumnya dan tidak dapat diajukan ulang.";
export const MSG_DALAM_ANTREAN =
  "Penolakan Duplikasi: Aset ini sudah masuk dalam antrean/pengajuan reklasifikasi yang sedang diproses.";
export const MSG_DRAFT_PENGAJUAN =
  "Penolakan Duplikasi: Aset ini sudah masuk dalam daftar tunggu Papan Rekonsiliasi (draft_pengajuan) dan tidak dapat diusulkan ganda.";

/**
 * Mode validasi:
 *  - "entry" = pintu masuk antrean (verifikasi laporan / input sensus).
 *  - "batch" = pengiriman bundel dari Papan Rekonsiliasi ke BKAD.
 */
export type ValidasiMode = "entry" | "batch";

/** Status `custom_data.status_rekon` yang diblokir per mode. */
const STATUS_REKON_ENTRY_BLOCKED = ["draft_pengajuan", "siap_reklas", "menunggu_bkad", "disetujui"];
const STATUS_REKON_BATCH_BLOCKED = ["menunggu_bkad", "disetujui"];

/** Petakan status_rekon yang memblokir ke pesan penolakan yang sesuai. */
function messageForStatusRekon(statusRekon: string): string {
  if (statusRekon === "draft_pengajuan") return MSG_DRAFT_PENGAJUAN;
  if (statusRekon === "disetujui") return MSG_SUDAH_DIREKLASIFIKASI;
  // siap_reklas / menunggu_bkad
  return MSG_DALAM_ANTREAN;
}

/** Ambil id aset dari satu entri snapshot (mendukung beberapa konvensi penamaan). */
function extractAssetId(entry: unknown): string | null {
  if (!entry || typeof entry !== "object") return null;
  const obj = entry as Record<string, unknown>;
  const candidate = obj.id ?? obj.asset_id ?? obj.assetId;
  return candidate ? String(candidate) : null;
}

/**
 * Kumpulkan seluruh asset id dari JSON `data_otorisasi`.
 * Mendukung dua struktur yang dipakai aplikasi:
 *  - Array langsung: [{ id, ... }, ...]
 *  - Object bertingkat: { aset_detail: [...] , ... }
 */
function collectAssetIds(data: unknown): string[] {
  const ids: string[] = [];
  const pushFrom = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const entry of arr) {
      const id = extractAssetId(entry);
      if (id) ids.push(id);
    }
  };

  if (Array.isArray(data)) {
    pushFrom(data);
    return ids;
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    // Struktur bertingkat yang dikenal
    pushFrom(obj.aset_detail);
    pushFrom(obj.asetDetail);
    pushFrom(obj.assets);
    pushFrom(obj.data_aset);
    // Jaring pengaman: cek satu level di bawah untuk setiap nilai yang berupa array
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) pushFrom(value);
    }
  }
  return ids;
}

/**
 * Validasi terpusat penolakan duplikasi reklasifikasi.
 * Mengecek:
 *  1. Master `assets` (id = assetId): kib === "04 - Aset Lainnya" ATAU custom_data.status_rekon
 *     yang diblokir sesuai `mode`.
 *  2. `document_archives` (filter company_id bila ada) dengan status_approval
 *     ["menunggu_bkad", "disetujui"]: apakah assetId sudah tercantum di JSON `data_otorisasi`.
 *
 * @param mode "entry" (pintu masuk antrean) atau "batch" (pengiriman bundel ke BKAD).
 *             Pada mode "batch", status "draft_pengajuan" diizinkan (karena itulah yang sedang dikirim).
 */
export async function cekDuplikasiReklasifikasi(
  assetId: string,
  companyId?: string | null,
  mode: ValidasiMode = "entry",
): Promise<DuplikasiResult> {
  if (!assetId) return { isDuplicate: false, reason: "" };

  const blockedStatuses = mode === "batch" ? STATUS_REKON_BATCH_BLOCKED : STATUS_REKON_ENTRY_BLOCKED;

  try {
    // ── 1. Cek master aset ────────────────────────────────
    const { data: asset, error: assetErr } = await supabase
      .from("assets")
      .select("id, kib, custom_data")
      .eq("id", assetId)
      .maybeSingle();

    if (assetErr) {
      console.error("[cekDuplikasiReklasifikasi] asset query error:", assetErr);
    }

    if (asset) {
      const cd =
        typeof asset.custom_data === "object" && asset.custom_data && !Array.isArray(asset.custom_data)
          ? (asset.custom_data as Record<string, unknown>)
          : {};

      const kibStr = String(asset.kib || "").trim();
      const statusRekon = String(cd["status_rekon"] || "").trim().toLowerCase();

      // Sudah berstatus KIB 04 - Aset Lainnya → sudah direklasifikasi
      if (kibStr === "04 - Aset Lainnya") {
        return { isDuplicate: true, reason: MSG_SUDAH_DIREKLASIFIKASI };
      }
      // Status rekon yang diblokir sesuai mode (entry vs batch)
      if (blockedStatuses.includes(statusRekon)) {
        return { isDuplicate: true, reason: messageForStatusRekon(statusRekon) };
      }
    }

    // ── 2. Cek document_archives ──────────────────────────
    let query = supabase
      .from("document_archives")
      .select("id, status_approval, data_otorisasi")
      .in("status_approval", ["menunggu_bkad", "disetujui"]);

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data: archives, error: arcErr } = await query;
    if (arcErr) {
      console.error("[cekDuplikasiReklasifikasi] archive query error:", arcErr);
    }

    if (archives && archives.length > 0) {
      for (const arc of archives) {
        const ids = collectAssetIds((arc as { data_otorisasi?: unknown }).data_otorisasi);
        if (ids.includes(assetId)) {
          const approved = String((arc as { status_approval?: string }).status_approval) === "disetujui";
          return {
            isDuplicate: true,
            reason: approved ? MSG_SUDAH_DIREKLASIFIKASI : MSG_DALAM_ANTREAN,
          };
        }
      }
    }

    return { isDuplicate: false, reason: "" };
  } catch (err) {
    console.error("[cekDuplikasiReklasifikasi] unexpected error:", err);
    return { isDuplicate: false, reason: "" };
  }
}
