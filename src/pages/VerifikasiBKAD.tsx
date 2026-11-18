import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck, Eye, CheckCircle2, XCircle, FileText, Clock,
  Package, AlertTriangle, Loader2, ExternalLink,
  ArrowLeft, ImageOff, RotateCcw, History
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";

type DocumentArchiveRow = Database["public"]["Tables"]["document_archives"]["Row"];

interface OtorisasiAset {
  asset_id?: string;
  id?: string;
  kode_aset?: string;
  nama_aset?: string;
  nama_barang?: string;
  kode_barang?: string;
  rekon_rekomendasi?: string;
  rekomendasi?: string;
  Kondisi?: string;
  kondisi?: string;
  nilai_perolehan?: number;
  "Nilai Perolehan"?: number;
  harga?: number;
  kib?: string;
  assetData?: {
    nama_barang?: string;
    nama_aset?: string;
    kode_aset?: string;
    kib?: string;
    nilai_perolehan?: number;
    Kondisi?: string;
  };
}

function safeNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isFinite(val) ? val : 0;
  const s = String(val).trim();
  if (!s) return 0;
  const cleaned = s.split(",")[0].replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

function flattenOtorisasiArray(doc: DocumentArchiveRow): OtorisasiAset[] {
  const list: OtorisasiAset[] = [];
  try {
    if (Array.isArray(doc.data_otorisasi)) {
      list.push(...(doc.data_otorisasi as OtorisasiAset[]));
    } else if (typeof doc.data_otorisasi === "object" && doc.data_otorisasi !== null) {
      const obj = doc.data_otorisasi as any;
      if (Array.isArray(obj.aset_detail)) list.push(...(obj.aset_detail as OtorisasiAset[]));
      if (Array.isArray(obj.assets)) list.push(...(obj.assets as OtorisasiAset[]));
    }
  } catch {}
  return list;
}

function getNamaAset(item: OtorisasiAset): string {
  return (
    item.nama_barang ||
    item.nama_aset ||
    item.assetData?.nama_barang ||
    item.assetData?.nama_aset ||
    "Nama tidak tersedia"
  );
}

function getNilaiPerolehan(item: OtorisasiAset): number {
  return (
    safeNumber(item["Nilai Aset"]) ||
    safeNumber(item["Nilai Perolehan"]) ||
    safeNumber(item.nilai_perolehan) ||
    safeNumber(item.harga) ||
    safeNumber(item.assetData?.nilai_perolehan) ||
    safeNumber(item.assetData?.["Nilai Aset"]) ||
    safeNumber(item.assetData?.["Nilai Perolehan"]) ||
    0
  );
}

function formatTanggal(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function extractTahun(val: unknown): string {
  if (!val) return "";
  const s = String(val);
  const m = s.match(/(19|20)\d{2}/);
  return m ? m[0] : "";
}

function getJumlahAset(doc: DocumentArchiveRow): number {
  if (typeof doc.total_aset === "number" && doc.total_aset > 0) return doc.total_aset;
  try {
    if (Array.isArray(doc.kode_barang_list)) return doc.kode_barang_list.length;
    if (Array.isArray(doc.data_otorisasi)) return (doc.data_otorisasi as any[]).length;
    if (typeof doc.data_otorisasi === "object" && doc.data_otorisasi !== null) {
      const obj = doc.data_otorisasi as any;
      if (Array.isArray(obj.aset_detail)) return obj.aset_detail.length;
      if (Array.isArray(obj.assets)) return obj.assets.length;
    }
  } catch {}
  return 0;
}

function getTotalNilai(doc: DocumentArchiveRow): number {
  if (typeof doc.total_nilai === "number" && doc.total_nilai > 0) return doc.total_nilai;
  const list = flattenOtorisasiArray(doc);
  if (list.length > 0) {
    const sum = list.reduce((acc, it) => acc + getNilaiPerolehan(it), 0);
    if (sum > 0) return sum;
  }
  if (Array.isArray(doc.kode_barang_list)) {
    return doc.kode_barang_list.reduce<number>((acc, it) => {
      if (typeof it === "object" && it !== null) {
        return acc + getNilaiPerolehan(it as OtorisasiAset);
      }
      return acc;
    }, 0);
  }
  return 0;
}

function rekomendasiToKondisi(rekomendasi: string): "Rusak Berat" | "Rusak Ringan" | "Dalam Perbaikan" {
  const r = (rekomendasi || "").trim().toLowerCase();
  if (r.includes("perubahan kondisi") || r.includes("rusak berat") || r.includes("hapus")) return "Rusak Berat";
  if (r.includes("perbaikan")) return "Rusak Ringan";
  return "Rusak Ringan";
}

export default function VerifikasiBKAD() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, hasRole, companyId, loading, role } = useAuth();

  // ─── Audit Split-Screen State ─────────────────────────────
  interface AuditItem {
    key: string;
    kode_barang: string;
    nama_aset: string;
    tahun_perolehan?: string;
    nilai_perolehan: number;
    lokasi?: string;
    kondisi?: string;
    rekomendasi?: string;
    asset_id?: string;
    _bkad_status: "pending" | "approved" | "rejected";
    _bkad_catatan?: string;
    _bkad_checked_at?: string;
    _bkad_catatan_sebelumnya?: string;
    fotoUrl?: string;
    raw: any;
  }

  const [auditDoc, setAuditDoc] = useState<DocumentArchiveRow | null>(null);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [selectedAuditIndex, setSelectedAuditIndex] = useState(0);
  const [rejectText, setRejectText] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [confirmFinalOpen, setConfirmFinalOpen] = useState(false);
  const [finalMode, setFinalMode] = useState<"approve" | "reject">("approve");
  const [photoLoading, setPhotoLoading] = useState(false);

  // RBAC GLOBAL — hanya staf_bkad yang boleh di sini.
  // PENTING: tunggu proses loading profil selesai sebelum mengevaluasi role,
  // agar refresh (F5) tidak salah me-redirect ke dashboard saat role belum termuat.
  useEffect(() => {
    if (loading || !role) return;
    if (!hasRole("staf_bkad")) {
      toast.error("Akses ditolak: Anda tidak memiliki wewenang BKAD.");
      navigate("/dashboard/overview", { replace: true });
    }
  }, [loading, role, hasRole, navigate]);

  const { data: pendingDocs = [], isLoading } = useQuery({
    queryKey: ["bkad-pending-documents", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("document_archives")
        .select("*")
        .eq("company_id", companyId)
        .eq("status_approval", "menunggu_bkad")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as DocumentArchiveRow[]) || [];
    },
    enabled: !!companyId && hasRole("staf_bkad"),
  });

  // ─── Mutasi Partial Reject (revisi parsial) ──────────────
  // Menyimpan status per-baris ke data_otorisasi, approved tetap terkunci,
  // rejected -> revisi_bkad dengan catatan di custom_data.rekon_catatan_bkad.
  const partialRejectMutation = useMutation({
    mutationFn: async ({ doc, items }: { doc: DocumentArchiveRow; items: AuditItem[] }) => {
      if (!user?.id) throw new Error("User tidak terautentikasi");
      const timestamp = new Date().toISOString();

      const approvedItems = items.filter((it) => it._bkad_status === "approved");
      const rejectedItems = items.filter((it) => it._bkad_status === "rejected");

      // Update assets yang ditolak -> revisi_bkad dengan catatan BKAD.
      // Pencocokan: prioritaskan UUID asset_id/id dari snapshot, fallback kode_aset.
      if (rejectedItems.length > 0) {
        const idTargets = rejectedItems.map((it) => it.asset_id).filter((v): v is string => !!v);
        const kodeTargets = rejectedItems
          .filter((it) => !it.asset_id)
          .map((it) => it.kode_barang)
          .filter((v): v is string => !!v);

        const matched: { id: string; kode_aset: string | null; custom_data: any }[] = [];
        if (idTargets.length > 0) {
          const { data: rows, error } = await supabase
            .from("assets")
            .select("id, kode_aset, custom_data")
            .in("id", idTargets);
          if (error) throw error;
          (rows ?? []).forEach((r: any) => matched.push(r));
        }
        if (kodeTargets.length > 0) {
          const { data: rows, error } = await supabase
            .from("assets")
            .select("id, kode_aset, custom_data")
            .in("kode_aset", kodeTargets);
          if (error) throw error;
          (rows ?? []).forEach((r: any) => {
            if (!matched.some((m) => m.id === r.id)) matched.push(r);
          });
        }

        const updatePromises = matched.map((row) => {
          const cd = row.custom_data ? { ...(row.custom_data as object) } : {};
          const item = rejectedItems.find(
            (it) => (it.asset_id && it.asset_id === row.id) || (it.kode_barang && it.kode_barang === row.kode_aset)
          );
          cd["Kondisi"] = item?.kondisi || cd["Kondisi"];
          cd["status_rekon"] = "revisi_bkad";
          cd["rekon_ditolak_by"] = user.id;
          cd["rekon_catatan_bkad"] = item?._bkad_catatan || "Perlu perbaikan data";
          return supabase
            .from("assets")
            .update({ custom_data: cd } as any)
            .eq("id", row.id)
            .then((r) => {
              if (r.error) throw new Error(`Gagal update aset ${row.kode_aset || row.id}: ${r.error.message}`);
              return r;
            });
        });
        const results = await Promise.all(updatePromises);
        const failed = (results as any[]).find((r: any) => r && r.error);
        if (failed?.error) throw failed.error;
      }

      // Simpan status per-baris ke data_otorisasi
      const existingOto: Record<string, any> = doc.data_otorisasi ? { ...(doc.data_otorisasi as Record<string, any>) } : { aset_detail: [] };
      const detailArray = Array.isArray(existingOto.aset_detail)
        ? existingOto.aset_detail
        : (existingOto.assets as any[] || []);

      const detailWithStatus = detailArray.map((d: any) => {
        const match = items.find((it) =>
          it.kode_barang === (d.kode_barang || d.kode_aset || d.asset_id || d.id)
        );
        if (match) {
          return {
            ...d,
            _bkad_status: match._bkad_status,
            _bkad_catatan: match._bkad_status === "rejected" ? match._bkad_catatan : "",
            _bkad_checked_at: match._bkad_checked_at,
            _bkad_catatan_sebelumnya: match._bkad_status === "rejected" ? match._bkad_catatan : match._bkad_catatan_sebelumnya,
          };
        }
        return { ...d, _bkad_status: "approved" as const };
      });

      const updatedOto = { ...existingOto, aset_detail: detailWithStatus };
      const catatanSummary = `${rejectedItems.length} aset perlu revisi. ${approvedItems.length} aset disetujui & tetap terkunci.`;

      const { error: docErr } = await supabase
        .from("document_archives")
        .update({
          status_approval: "ditolak",
          status: "Ditolak BKAD",
          catatan_bkad: catatanSummary,
          data_otorisasi: updatedOto,
          approved_by: user.id,
          approved_at: timestamp,
        })
        .eq("id", doc.id);
      if (docErr) throw docErr;

      return { approved: approvedItems.length, rejected: rejectedItems.length };
    },
    onSuccess: (data) => {
      toast.success(`✓ ${data.rejected} aset dikembalikan ke SKPD untuk revisi. ${data.approved} aset tetap terkunci disetujui.`);
      queryClient.invalidateQueries({ queryKey: ["bkad-pending-documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-archives"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["rekon-assets-joined"] });
      closeAudit();
      setConfirmFinalOpen(false);
    },
    onError: (err: any) => {
      toast.error("Gagal memproses revisi: " + err.message);
    },
  });

  // ─── Mutasi Approve All (dari audit view) ────────────────
  const auditApproveMutation = useMutation({
    mutationFn: async ({ doc, items }: { doc: DocumentArchiveRow; items: AuditItem[] }) => {
      if (!user?.id) throw new Error("User tidak terautentikasi");
      const timestamp = new Date().toISOString();

      // Pencocokan: prioritaskan UUID asset_id/id dari snapshot, fallback kode_aset.
      const idTargets = items.map((it) => it.asset_id).filter((v): v is string => !!v);
      const kodeTargets = items
        .filter((it) => !it.asset_id)
        .map((it) => it.kode_barang)
        .filter((v): v is string => !!v);

      const matched: { id: string; kode_aset: string | null; custom_data: any }[] = [];
      if (idTargets.length > 0) {
        const { data: rows, error } = await supabase
          .from("assets")
          .select("id, kode_aset, custom_data")
          .in("id", idTargets);
        if (error) throw error;
        (rows ?? []).forEach((r: any) => matched.push(r));
      }
      if (kodeTargets.length > 0) {
        const { data: rows, error } = await supabase
          .from("assets")
          .select("id, kode_aset, custom_data")
          .in("kode_aset", kodeTargets);
        if (error) throw error;
        (rows ?? []).forEach((r: any) => {
          if (!matched.some((m) => m.id === r.id)) matched.push(r);
        });
      }

      if (matched.length > 0) {
        const updatePromises = matched.map((row) => {
          const cd = row.custom_data ? { ...(row.custom_data as object) } : {};
          const item = items.find(
            (it) => (it.asset_id && it.asset_id === row.id) || (it.kode_barang && it.kode_barang === row.kode_aset)
          );
          cd["Kondisi"] = item?.kondisi || rekomendasiToKondisi(item?.rekomendasi) || cd["Kondisi"];
          cd["status_rekon"] = "disetujui";
          delete cd["rekon_catatan_bkad"];
          delete cd["rekon_ditolak_by"];
          return supabase
            .from("assets")
            .update({
              custom_data: cd,
              kib: "04 - Aset Lainnya",
              kategori: "Aset Lain-lain",
            } as any)
            .eq("id", row.id)
            .then((r) => {
              if (r.error) throw new Error(`Gagal update aset ${row.kode_aset || row.id}: ${r.error.message}`);
              return r;
            });
        });
        const results = await Promise.all(updatePromises);
        const failed = (results as any[]).find((r: any) => r && r.error);
        if (failed?.error) throw failed.error;
      }

      // Bersihkan _bkad_* & tandai semua approved di data_otorisasi
      const existingOto: Record<string, any> = doc.data_otorisasi ? { ...(doc.data_otorisasi as Record<string, any>) } : { aset_detail: [] };
      const detailArray = Array.isArray(existingOto.aset_detail)
        ? existingOto.aset_detail
        : (existingOto.assets as any[] || []);
      const detailClean = detailArray.map((d: any) => {
        const clone = { ...d };
        delete clone._bkad_status;
        delete clone._bkad_catatan;
        delete clone._bkad_checked_at;
        delete clone._bkad_catatan_sebelumnya;
        return clone;
      });
      const updatedOto = { ...existingOto, aset_detail: detailClean };

      const { error: docErr } = await supabase
        .from("document_archives")
        .update({
          status_approval: "disetujui",
          status: "Disetujui BKAD",
          data_otorisasi: updatedOto,
          approved_by: user.id,
          approved_at: timestamp,
        })
        .eq("id", doc.id);
      if (docErr) throw docErr;

      return items.length;
    },
    onSuccess: (count) => {
      toast.success(`✓ ${count} aset disetujui & dimutasikan ke KIB 04.`);
      queryClient.invalidateQueries({ queryKey: ["bkad-pending-documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-archives"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["rekon-assets-joined"] });
      closeAudit();
      setConfirmFinalOpen(false);
    },
    onError: (err: any) => {
      toast.error("Gagal menyetujui: " + err.message);
    },
  });

  const handleFinalizeApprove = () => {
    if (!auditDoc) return;
    setFinalMode("approve");
    setConfirmFinalOpen(true);
  };

  const handleFinalizeReject = () => {
    if (!auditDoc) return;
    setFinalMode("reject");
    setConfirmFinalOpen(true);
  };

  const confirmFinalize = () => {
    if (!auditDoc) return;
    if (finalMode === "approve") {
      auditApproveMutation.mutate({ doc: auditDoc, items: auditItems });
    } else {
      partialRejectMutation.mutate({ doc: auditDoc, items: auditItems });
    }
  };

  // Bangun daftar item audit dari data_otorisasi, pertahankan status _bkad_*
  // dari putaran sebelumnya (untuk bundel hasil revisi SKPD).
  const buildAuditItems = (doc: DocumentArchiveRow): AuditItem[] => {
    const rawList = flattenOtorisasiArray(doc);
    // Gabung juga dengan kode_barang_list agar tidak ada aset yang hilang
    try {
      if (Array.isArray(doc.kode_barang_list)) {
        (doc.kode_barang_list as any[]).forEach((kb) => {
          if (typeof kb === "object" && kb) {
            const kbKey = kb.kode_barang || kb.kode_aset || kb.asset_id || kb.id || "";
            const match = rawList.find((l) => {
              const lk = l.kode_barang || l.kode_aset || l.asset_id || l.id || "";
              return lk && kbKey && lk === kbKey;
            });
            if (!match) rawList.push(kb as OtorisasiAset);
          } else if (typeof kb === "string") {
            const match = rawList.find((l) => (l.kode_barang || l.kode_aset || l.asset_id || l.id || "") === kb);
            if (!match) rawList.push({ kode_barang: kb });
          }
        });
      }
    } catch {}

    return rawList.map((item, i) => {
      const kodeBarang =
        item.kode_barang || item.kode_aset || item.assetData?.kode_aset || item.asset_id || item.id || String(i);
      const assetId = item.asset_id || item.id || (item as any).assetData?.id || "";
      const status = (item as any)._bkad_status || "pending";
      return {
        key: `${kodeBarang}-${i}`,
        kode_barang: kodeBarang,
        nama_aset: getNamaAset(item),
        tahun_perolehan:
          (item as any).tahun_perolehan ||
          (item as any)["Tahun Perolehan"] ||
          (item as any).assetData?.["Tahun Perolehan"] ||
          extractTahun((item as any).tanggal_perolehan || (item as any).assetData?.tanggal_perolehan) ||
          "—",
        nilai_perolehan: getNilaiPerolehan(item),
        lokasi:
          (item as any).Lokasi ||
          (item as any).lokasi_ruangan ||
          (item as any).assetData?.Lokasi ||
          (item as any).assetData?.lokasi_ruangan ||
          "—",
        kondisi:
          item.Kondisi || item.kondisi || item.assetData?.Kondisi || "—",
        rekomendasi: item.rekon_rekomendasi || item.rekomendasi || "—",
        asset_id: assetId,
        _bkad_status: status === "approved" || status === "rejected" ? status : "pending",
        _bkad_catatan: (item as any)._bkad_catatan || "",
        _bkad_checked_at: (item as any)._bkad_checked_at || "",
        _bkad_catatan_sebelumnya: (item as any)._bkad_catatan_sebelumnya || "",
        fotoUrl: undefined,
        raw: item,
      };
    });
  };

  // Buka audit view: bangun item + fetch foto bukti dari asset_reports & asset_audits
  const openAudit = async (doc: DocumentArchiveRow) => {
    const items = buildAuditItems(doc);
    setAuditDoc(doc);
    setAuditItems(items);
    setRejectText("");
    setShowRejectInput(false);

    // Fokus awal ke aset pertama yang berstatus pending (Belum Dicek)
    const firstPendingIdx = items.findIndex((it) => it._bkad_status === "pending");
    setSelectedAuditIndex(firstPendingIdx >= 0 ? firstPendingIdx : 0);

    // Fetch foto bukti untuk setiap aset (dari asset_reports.image_url / asset_audits.foto_url)
    setPhotoLoading(true);
    try {
      const assetIds = items.map((it) => it.asset_id).filter((v): v is string => !!v);
      if (assetIds.length > 0) {
        const { data, error } = await supabase
          .from("assets")
          .select(`
            id, kode_aset,
            asset_reports (image_url, created_at, status),
            asset_audits (foto_url, created_at)
          `)
          .in("id", assetIds);
        if (!error && data) {
          const fotoMap = new Map<string, string>();
          (data as any[]).forEach((row) => {
            let foto: string | undefined;
            // Prioritaskan foto dari report terbaru (status Menunggu/Diproses), lalu audit terbaru
            const reports = (row.asset_reports || []) as any[];
            const audits = (row.asset_audits || []) as any[];
            const latestReport = reports
              .filter((r) => r.image_url)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
            const latestAudit = audits
              .filter((a) => a.foto_url)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
            foto = latestReport?.image_url || latestAudit?.foto_url;
            if (foto) fotoMap.set(row.id, foto);
          });
          setAuditItems((prev) =>
            prev.map((it) => (it.asset_id && fotoMap.has(it.asset_id) ? { ...it, fotoUrl: fotoMap.get(it.asset_id) } : it))
          );
        }
      }
    } catch (e) {
      console.error("Gagal fetch foto bukti", e);
    } finally {
      setPhotoLoading(false);
    }
  };

  // Statistik audit real-time
  const auditStats = useMemo(() => {
    const total = auditItems.length;
    const approved = auditItems.filter((it) => it._bkad_status === "approved").length;
    const rejected = auditItems.filter((it) => it._bkad_status === "rejected").length;
    const pending = total - approved - rejected;
    return { total, approved, rejected, pending };
  }, [auditItems]);

  const isRevisiBundle = useMemo(() => {
    // Bundel hasil revisi SKPD jika status menunggu_bkad tapi ada item yang sudah approved
    return auditDoc?.status_approval === "menunggu_bkad" && auditItems.some((it) => it._bkad_status === "approved");
  }, [auditDoc, auditItems]);

  const selectedItem = auditItems[selectedAuditIndex] || null;

  // Set status per-baris + auto-next ke pending berikutnya
  const setItemStatus = (index: number, status: "approved" | "rejected", catatan = "") => {
    setAuditItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        _bkad_status: status,
        _bkad_catatan: status === "rejected" ? catatan : "",
        _bkad_checked_at: new Date().toISOString(),
        _bkad_catatan_sebelumnya: status === "rejected" ? catatan : next[index]._bkad_catatan_sebelumnya,
      };
      return next;
    });
    // auto-next ke aset pending berikutnya
    const nextPending = auditItems.findIndex((it, i) => i > index && it._bkad_status === "pending");
    if (nextPending >= 0) {
      setSelectedAuditIndex(nextPending);
    } else {
      // cari pending dari awal
      const firstPending = auditItems.findIndex((it, i) => i !== index && it._bkad_status === "pending");
      if (firstPending >= 0) setSelectedAuditIndex(firstPending);
    }
  };

  const handleApproveItem = (index: number) => {
    setItemStatus(index, "approved");
    setShowRejectInput(false);
    setRejectText("");
  };

  const handleConfirmReject = (index: number) => {
    if (!rejectText.trim()) {
      toast.error("Alasan penolakan wajib diisi.");
      return;
    }
    setItemStatus(index, "rejected", rejectText.trim());
    setShowRejectInput(false);
    setRejectText("");
  };

  const handleResetItem = (index: number) => {
    setAuditItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], _bkad_status: "pending", _bkad_catatan: "", _bkad_checked_at: "" };
      return next;
    });
  };

  const closeAudit = () => {
    setAuditDoc(null);
    setAuditItems([]);
    setShowRejectInput(false);
    setRejectText("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-blue-700" />
            Verifikasi BKAD
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Daftar pengajuan rekonsiliasi massal dari Pengurus Barang yang menunggu persetujuan Anda.
          </p>
        </div>
        <Badge className="shrink-0" variant="secondary">
          <Clock className="h-3 w-3 mr-1" />
          {pendingDocs.length} Pengajuan Aktif
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Antrean Pengajuan Menunggu Persetujuan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Memuat daftar pengajuan…
            </div>
          ) : pendingDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-500/70 mb-3" />
              <p className="font-semibold text-foreground">Tidak Ada Antrean</p>
              <p className="text-sm text-muted-foreground mt-1">
                Semua pengajuan saat ini sudah diproses. Cek kembali nanti.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>Nomor Dokumen</TableHead>
                    <TableHead>Tanggal Diajukan</TableHead>
                    <TableHead className="text-center">Jumlah Aset</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingDocs.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="font-mono text-sm font-semibold text-primary">
                          {doc.nomor_surat}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {doc.jenis_kib ? `KIB: ${doc.jenis_kib} · ` : ""}
                          Nilai: Rp {getTotalNilai(doc).toLocaleString("id-ID")}
                        </div>
                      </TableCell>
                      <TableCell className="">
                        {formatTanggal(doc.tanggal_surat || doc.created_at)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-semibold">
                          <Package className="h-3 w-3 mr-1.5" />
                          {getJumlahAset(doc)} aset
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                          <Clock className="h-3 w-3 mr-1" />
                          Menunggu BKAD
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            onClick={() => openAudit(doc)}
                            className="bg-primary hover:bg-primary/90 text-white"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            Verifikasi Bundel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Audit Split-Screen View ─── */}
      <Dialog open={!!auditDoc} onOpenChange={(o) => !o && closeAudit()}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] p-0 flex flex-col gap-0">
          {auditDoc && (
            <>
              {/* Header Bundel */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="ghost" onClick={closeAudit} className="h-8 px-2">
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Kembali
                    </Button>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                      Verifikasi Bundel Aset
                    </h2>
                    {isRevisiBundle && (
                      <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Hasil Revisi SKPD
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-600 flex-wrap">
                    <span><strong>No. Surat:</strong> <span className="font-mono">{auditDoc.nomor_surat || "—"}</span></span>
                    <span><strong>Tgl:</strong> {formatTanggal(auditDoc.tanggal_surat || auditDoc.created_at)}</span>
                    <span><strong>Total Aset:</strong> {getJumlahAset(auditDoc)} unit</span>
                    <span><strong>Total Nilai:</strong> Rp {getTotalNilai(auditDoc).toLocaleString("id-ID")}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Prioritas: dokumen_url (hasil revisi terbaru) dulu, baru BA/SP lama.
                      const url = auditDoc.dokumen_url || auditDoc.url_berita_acara || auditDoc.url_surat_pernyataan;
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                      else toast.info("Berkas scan belum diunggah.");
                    }}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    Lihat Lampiran PDF (BA &amp; SP)
                  </Button>
                  {/* Progress pills */}
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <span className="text-xs font-medium text-slate-600">
                      Progres Audit: <strong>{auditStats.approved + auditStats.rejected}/{auditStats.total}</strong>
                    </span>
                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-[11px]">
                      Sesuai: {auditStats.approved}
                    </Badge>
                    <Badge className="bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-50 text-[11px]">
                      Ditolak: {auditStats.rejected}
                    </Badge>
                    <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100 text-[11px]">
                      Belum Dicek: {auditStats.pending}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Split-Screen Body */}
              <div className="flex-1 overflow-hidden px-6 py-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                  {/* Panel Kiri — Master List */}
                  <div className="lg:col-span-5 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                        <Package className="h-4 w-4" />
                        Daftar Aset Bundel
                      </h3>
                      <span className="text-[11px] text-slate-400">{auditItems.length} aset</span>
                    </div>
                    <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-100 bg-white" style={{ maxHeight: "calc(92vh - 260px)" }}>
                      {auditItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-6 text-center">Tidak ada data aset.</p>
                      ) : (
                        <ul className="divide-y divide-slate-50">
                          {auditItems.map((it, i) => {
                            const active = i === selectedAuditIndex;
                            const statusCls =
                              it._bkad_status === "approved"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : it._bkad_status === "rejected"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-slate-100 text-slate-600 border-slate-200";
                            const statusLabel =
                              it._bkad_status === "approved" ? "Sesuai" : it._bkad_status === "rejected" ? "Ditolak" : "Belum Dicek";
                            return (
                              <li
                                key={it.key}
                                onClick={() => setSelectedAuditIndex(i)}
                                className={`px-3 py-2.5 cursor-pointer transition-colors border-l-4 ${
                                  active
                                    ? "bg-primary/5 border-l-4 border-primary"
                                    : "bg-white border-l-4 border-transparent hover:bg-slate-50"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11px] font-mono text-slate-400">{String(i + 1).padStart(2, "0")}</span>
                                      <span className="text-xs font-mono font-medium text-slate-700 truncate">{it.kode_barang}</span>
                                    </div>
                                    <p className="text-sm font-medium text-slate-800 truncate">{it.nama_aset}</p>
                                  </div>
                                  <Badge className={`${statusCls} text-[10px] shrink-0`}>{statusLabel}</Badge>
                                </div>
                                {it._bkad_status === "rejected" && it._bkad_catatan && (
                                  <p className="text-[11px] text-rose-600 mt-1 truncate">⚠ {it._bkad_catatan}</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Panel Kanan — Detail Aset */}
                  <div className="lg:col-span-7 flex flex-col overflow-y-auto" style={{ maxHeight: "calc(92vh - 260px)" }}>
                    {selectedItem ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                            <Eye className="h-4 w-4" />
                            Detail Aset &amp; Bukti Lapangan
                          </h3>
                          <Badge variant="outline" className="font-mono text-[11px]">{selectedItem.kode_barang}</Badge>
                        </div>

                        {/* Info aset */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-xl border border-slate-100 p-3">
                            <p className="text-[11px] uppercase tracking-wider text-slate-400">Nama Aset</p>
                            <p className="font-medium text-slate-800">{selectedItem.nama_aset}</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 p-3">
                            <p className="text-[11px] uppercase tracking-wider text-slate-400">Tahun Perolehan</p>
                            <p className="font-medium text-slate-800">{selectedItem.tahun_perolehan || "—"}</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 p-3">
                            <p className="text-[11px] uppercase tracking-wider text-slate-400">Nilai Perolehan</p>
                            <p className="font-medium text-slate-800">
                              {selectedItem.nilai_perolehan > 0 ? `Rp ${selectedItem.nilai_perolehan.toLocaleString("id-ID")}` : "—"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-100 p-3">
                            <p className="text-[11px] uppercase tracking-wider text-slate-400">Lokasi / Ruangan</p>
                            <p className="font-medium text-slate-800">{selectedItem.lokasi || "—"}</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 p-3 col-span-2">
                            <p className="text-[11px] uppercase tracking-wider text-slate-400">Kondisi yang Diusulkan</p>
                            <p className="font-medium text-slate-800">{selectedItem.kondisi || "—"}</p>
                          </div>
                        </div>

                        {/* Foto bukti */}
                        <div className="rounded-2xl border border-slate-100 p-3">
                          <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Foto Bukti Lapangan</p>
                          {photoLoading ? (
                            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Memuat foto...
                            </div>
                          ) : selectedItem.fotoUrl ? (
                            <a href={selectedItem.fotoUrl} target="_blank" rel="noopener noreferrer" className="block">
                              <img
                                src={selectedItem.fotoUrl}
                                alt={selectedItem.nama_aset}
                                className="w-full max-h-72 object-cover rounded-xl border border-slate-100 hover:opacity-90 transition"
                              />
                              <p className="text-[11px] text-primary mt-1.5 flex items-center gap-1">
                                <ExternalLink className="h-3 w-3" /> Klik untuk buka penuh di tab baru
                              </p>
                            </a>
                          ) : (
                            <div className="h-48 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              <ImageOff className="h-8 w-8 mb-1" />
                              <p className="text-sm">Tidak ada foto bukti terlampir</p>
                            </div>
                          )}
                        </div>

                        {/* Catatan revisi sebelumnya */}
                        {selectedItem._bkad_catatan_sebelumnya && selectedItem._bkad_status !== "rejected" && (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-[11px] uppercase tracking-wider text-amber-700 flex items-center gap-1 mb-1">
                              <History className="h-3 w-3" /> Catatan Revisi Sebelumnya
                            </p>
                            <p className="text-sm text-amber-800">{selectedItem._bkad_catatan_sebelumnya}</p>
                          </div>
                        )}

                        {/* Tombol keputusan per-baris */}
                        <div className="space-y-2">
                          {selectedItem._bkad_status === "rejected" && (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                              <p className="text-sm text-rose-700 flex items-center gap-1.5">
                                <AlertTriangle className="h-4 w-4" /> Alasan penolakan: {selectedItem._bkad_catatan}
                              </p>
                            </div>
                          )}

                          {showRejectInput ? (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-3 space-y-2">
                              <Label className="text-xs text-rose-700 font-medium">
                                Alasan Penolakan (wajib) — contoh: "Foto buram", "Kondisi fisik belum rusak berat"
                              </Label>
                              <Textarea
                                value={rejectText}
                                onChange={(e) => setRejectText(e.target.value)}
                                placeholder="Tuliskan alasan spesifik penolakan aset ini..."
                                rows={2}
                                autoFocus
                              />
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => { setShowRejectInput(false); setRejectText(""); }}>
                                  Batal
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-rose-600 hover:bg-rose-700 text-white"
                                  onClick={() => handleConfirmReject(selectedAuditIndex)}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1.5" /> Konfirmasi Tolak
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button
                                className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
                                onClick={() => handleApproveItem(selectedAuditIndex)}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Sesuai / Setuju
                              </Button>
                              <Button
                                variant="destructive"
                                className="bg-rose-600 hover:bg-rose-700 text-white flex-1"
                                onClick={() => { setRejectText(""); setShowRejectInput(true); }}
                              >
                                <XCircle className="h-4 w-4 mr-1.5" /> Tolak / Revisi
                              </Button>
                              {selectedItem._bkad_status !== "pending" && (
                                <Button variant="outline" size="sm" onClick={() => handleResetItem(selectedAuditIndex)} title="Reset ke Belum Dicek">
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center mt-10">Pilih aset dari daftar di kiri.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Gerbang Finalisasi (sticky footer) */}
              <div className="px-6 py-3 border-t border-slate-100 bg-white flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs text-slate-500">
                  {auditStats.pending > 0
                    ? `Masih ada ${auditStats.pending} aset yang belum diperiksa.`
                    : auditStats.rejected > 0
                    ? `${auditStats.rejected} aset akan dikembalikan untuk revisi. ${auditStats.approved} aset disetujui & tetap terkunci.`
                    : "Semua aset sesuai. Bundel siap dimutasikan."}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={closeAudit}>Tutup</Button>
                  {auditStats.pending > 0 ? (
                    <Button disabled className="bg-slate-300 text-slate-500">
                      <Clock className="h-4 w-4 mr-1.5" />
                      Periksa Sisa {auditStats.pending} Aset Sebelum Finalisasi
                    </Button>
                  ) : auditStats.rejected === 0 ? (
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleFinalizeApprove}>
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      Setujui Bundel &amp; Mutasikan Aset
                    </Button>
                  ) : (
                    <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleFinalizeReject}>
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      Kembalikan {auditStats.rejected} Aset Revisi ke SKPD
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Konfirmasi Finalisasi ─── */}
      <AlertDialog open={confirmFinalOpen} onOpenChange={setConfirmFinalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className={`flex items-center gap-2 ${finalMode === "approve" ? "text-emerald-600" : "text-amber-600"}`}>
              {finalMode === "approve" ? <CheckCircle2 className="h-5 w-5" /> : <RotateCcw className="h-5 w-5" />}
              {finalMode === "approve" ? "Konfirmasi Persetujuan Bundel" : "Konfirmasi Pengembalian Revisi"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {finalMode === "approve" ? (
                <>
                  <p>Seluruh <strong>{auditStats.total}</strong> aset dalam bundel akan <strong>disetujui & dimutasikan ke KIB 04 (Aset Lainnya)</strong> dengan status <code className="bg-slate-100 px-1 rounded">disetujui</code>.</p>
                  <p className="text-xs text-slate-500">Catatan BKAD & status per-baris akan dibersihkan.</p>
                </>
              ) : (
                <>
                  <p><strong>{auditStats.rejected} aset</strong> akan dikembalikan ke SKPD untuk diperbaiki, sementara <strong>{auditStats.approved} aset</strong> yang sudah sesuai tetap terkunci disetujui di dalam bundel.</p>
                  <p className="text-xs text-slate-500">Aset revisi akan berstatus <code className="bg-slate-100 px-1 rounded">revisi_bkad</code> beserta catatan BKAD.</p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmFinalize}
              className={finalMode === "approve" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"}
            >
              {finalMode === "approve" ? "Ya, Setujui & Mutasikan" : "Ya, Kembalikan Revisi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
