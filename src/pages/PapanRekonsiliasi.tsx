import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCustomColumns } from "@/contexts/CustomColumnsContext";
import * as XLSX from "xlsx";
import {
  AlertTriangle, CheckCircle2, Wrench, Users, ClipboardCheck,
  ExternalLink, PartyPopper, MessageCircle, Shield, FileSpreadsheet, Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Package, Scale, Send, Clock } from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────
interface AnomalyItem {
  assetId: string;
  kodeAset: string;
  namaAset: string;
  source: "keluhan" | "sensus" | "both";
  kondisi: string;
  deskripsi: string;
  reportCount: number;
  latestDate: string;
  reporterContact?: string;
  reportId?: string;
  assetData: any;
}

// ─── Component ──────────────────────────────────────────
export default function PapanRekonsiliasi() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();
  const { getColumnsForKib, kibColumns, masterKib } = useCustomColumns();

  const [activeTab, setActiveTab] = useState("anomali");
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyItem | null>(null);
  const [rekomendasi, setRekomendasi] = useState<string>("");
  const [isResolving, setIsResolving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBatching, setIsBatching] = useState(false);
  const [confirmBatchOpen, setConfirmBatchOpen] = useState(false);

  // Fetch assets with joined reports and audits
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["rekon-assets-joined", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select(`
          id, kode_aset, nama_aset, custom_data, kib,
          asset_reports (id, judul, deskripsi, status, actual_condition, issue_category, reporter_contact, created_at),
          asset_audits (kondisi, tindak_lanjut, catatan, created_at)
        `)
        .eq("company_id", companyId!)
        .order("kode_aset", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Build anomaly list and draft_pengajuan list
  const { anomalies, draftPengajuanItems } = useMemo(() => {
    const anomalyResult: AnomalyItem[] = [];
    const draftResult: AnomalyItem[] = [];

    assets.forEach((asset: any) => {
      const cd = (typeof asset.custom_data === "object" && asset.custom_data) ? asset.custom_data : {};
      const statusRekon = String(cd["status_rekon"] || "");

      // 1. Jalur Publik: Ambil reports yang berstatus Menunggu atau Diproses
      const openReports = (asset.asset_reports || []).filter((r: any) => 
        r.status === "Menunggu" || r.status === "Diproses"
      );
      openReports.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // 2. Jalur Sensus: Ambil audits yang kondisinya Rusak ATAU cek master assets custom_data (untuk arsip)
      const statusUsulan = String(cd["status_usulan"] || "");
      const masterKondisi = String(cd["Kondisi"] || "");

      const hasArchivedAnomaly = 
        statusUsulan === "Pengajuan Perubahan Kondisi (Rusak Berat)" ||
        statusUsulan === "Perbaikan" ||
        statusUsulan === "Usul Perbaikan" ||
        statusUsulan === "Usul Hapus" ||
        statusUsulan === "Mutasi" ||
        masterKondisi === "Rusak Berat" || 
        masterKondisi === "Rusak Ringan" || 
        masterKondisi === "Dalam Perbaikan";

      const damagedAudits = (asset.asset_audits || []).filter((a: any) =>
        a.kondisi === "Rusak Ringan" || a.kondisi === "Rusak Berat" || a.kondisi === "Dalam Perbaikan"
      );
      damagedAudits.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const hasReport = openReports?.length > 0;
      const hasAudit = damagedAudits?.length > 0 || hasArchivedAnomaly;

      let source: AnomalyItem["source"] = "keluhan";
      if (hasReport && hasAudit) source = "both";
      else if (hasAudit) source = "sensus";

      let kondisi = "—";
      let deskripsi = "";
      let latestDate = "";
      let reporterContact: string | undefined;

      if (hasReport) {
        const latestRep = openReports[0];
        kondisi = latestRep.actual_condition || latestRep.issue_category || "Dilaporkan";
        deskripsi = latestRep.judul || latestRep.deskripsi || "";
        latestDate = latestRep.created_at;
        reporterContact = latestRep.reporter_contact || undefined;
      }

      if (hasAudit) {
        if (damagedAudits.length > 0) {
          const latestAud = damagedAudits[0];
          kondisi = latestAud.kondisi;
          if (!deskripsi) deskripsi = latestAud.tindak_lanjut || latestAud.catatan || "";
          if (!latestDate || new Date(latestAud.created_at) > new Date(latestDate)) {
            latestDate = latestAud.created_at;
          }
        } else if (hasArchivedAnomaly) {
          kondisi = masterKondisi || "Anomali";
          if (!deskripsi) deskripsi = cd["catatan_sensus"] || statusUsulan || "Aset anomali (Telah Diarsipkan)";
        }
      }

      // ─── BUFFER STATE: draft_pengajuan check ───
      // Jika sudah ditandai draft_pengajuan, masukkan ke buffer tab (Finalisasi Rekon)
      if (statusRekon === "draft_pengajuan") {
        draftResult.push({
          assetId: asset.id,
          kodeAset: asset.kode_aset,
          namaAset: asset.nama_aset,
          source,
          kondisi,
          deskripsi,
          reportCount: openReports.length,
          latestDate,
          reporterContact,
          reportId: hasReport ? openReports[0].id : undefined,
          assetData: asset,
        });
        return;
      }

      // Skip assets yang sudah "Tutup Periode" (sudah diproses via Pengajuan Surat)
      if (statusUsulan === "Menunggu Update SIMDA") return;

      // Skip assets yang status_rekon-nya sudah menunggu_bkad / disetujui (sudah diajukan)
      if (statusRekon === "menunggu_bkad" || statusRekon === "disetujui" || statusRekon === "ditolak") return;

      anomalyResult.push({
        assetId: asset.id,
        kodeAset: asset.kode_aset,
        namaAset: asset.nama_aset,
        source,
        kondisi,
        deskripsi,
        reportCount: openReports.length,
        latestDate,
        reporterContact,
        reportId: hasReport ? openReports[0].id : undefined,
        assetData: asset,
      });
    });

    const sortFn = (a: AnomalyItem, b: AnomalyItem) => {
      const sevOrder = (k: string) => k === "Rusak Berat" ? 0 : k === "Rusak Ringan" ? 1 : k === "Dalam Perbaikan" ? 2 : 3;
      const srcOrder = (s: string) => s === "both" ? 0 : s === "keluhan" ? 1 : 2;
      const sevDiff = sevOrder(a.kondisi) - sevOrder(b.kondisi);
      if (sevDiff !== 0) return sevDiff;
      const srcDiff = srcOrder(a.source) - srcOrder(b.source);
      if (srcDiff !== 0) return srcDiff;
      return new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime();
    };

    anomalyResult.sort(sortFn);
    draftResult.sort(sortFn);

    return { anomalies: anomalyResult, draftPengajuanItems: draftResult };
  }, [assets]);

  // ─── Stats ────────────────────────────────────────────
  const statsData = useMemo(() => {
    const total = anomalies.length;
    const rusakBerat = anomalies.filter(a => a.kondisi === "Rusak Berat").length;
    const fromPublic = anomalies.filter(a => a.source === "keluhan" || a.source === "both").length;
    const fromCensus = anomalies.filter(a => a.source === "sensus" || a.source === "both").length;
    return { total, rusakBerat, fromPublic, fromCensus };
  }, [anomalies]);

  // ─── Badge Helpers ────────────────────────────────────
  function sourceLabel(source: AnomalyItem["source"]) {
    switch (source) {
      case "keluhan": return { text: "Keluhan Publik", icon: Users, class: "bg-primary/10 text-primary border-primary/30" };
      case "sensus": return { text: "Temuan Sensus", icon: ClipboardCheck, class: "bg-chart-3/10 text-chart-3 border-chart-3/30" };
      case "both": return { text: "Keduanya", icon: AlertTriangle, class: "bg-destructive/10 text-destructive border-destructive/30" };
    }
  }

  function kondisiBadge(kondisi: string) {
    switch (kondisi) {
      case "Rusak Berat": return "bg-destructive/10 text-destructive border-destructive/30";
      case "Rusak Ringan": return "bg-warning/10 text-warning border-warning/30";
      case "Dalam Perbaikan": return "bg-chart-3/10 text-chart-3 border-chart-3/30";
      default: return "bg-muted text-muted-foreground";
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return "—"; }
  }

  // ─── Actions ──────────────────────────────────────────
  const openResolveModal = (item: AnomalyItem) => {
    setSelectedAnomaly(item);
    setRekomendasi("");
    setResolveModalOpen(true);
  };

  const handleResolveSubmit = async () => {
    if (!selectedAnomaly || !rekomendasi) return;
    setIsResolving(true);
    try {
      if (rekomendasi === "Layak Pakai") {
        if (selectedAnomaly.reportId) {
          await supabase.from("asset_reports").update({ status: "Selesai" } as any).eq("id", selectedAnomaly.reportId);
        }
        if (selectedAnomaly.source === "sensus" || selectedAnomaly.source === "both") {
           await supabase.from("asset_audits").update({ kondisi: "Baik", tindak_lanjut: "Layak Pakai (Hasil Rekonsiliasi)" }).eq("asset_id", selectedAnomaly.assetId);
        }
        toast.success("Aset ditandai Layak Pakai & dikeluarkan dari daftar anomali.");
      } else if (rekomendasi === "Usul Perbaikan" || rekomendasi === "Pengajuan Perubahan Kondisi") {
        // ─── DUAL APPROVAL BUFFER: Masukkan ke draft_pengajuan ───
        // Tidak langsung dilempar ke BKAD, tapi masuk ke buffer state dulu
        // Aset akan muncul di Tab "Finalisasi Rekon" untuk diajukan secara massal
        const customData = (selectedAnomaly.assetData.custom_data as Record<string, any>) || {};

        // Simpan catatan rekomendasi asli untuk konteks batch
        const rekonCatatan = rekomendasi === "Pengajuan Perubahan Kondisi"
          ? "Pengajuan Perubahan Kondisi (Rusak Berat)"
          : "Usul Perbaikan";

        await supabase.from("assets").update({
          custom_data: {
            ...customData,
            status_rekon: "draft_pengajuan",       // Buffer state flag
            rekon_rekomendasi: rekonCatatan,       // Simpan jenis rekomendasi
            rekon_tanggal: new Date().toISOString(),
            status_usulan: rekonCatatan,           // Kompatibilitas dengan alur lama
          }
        }).eq("id", selectedAnomaly.assetId);

        // Untuk laporan publik: tandai "Diproses" biar tidak muncul lagi
        if (selectedAnomaly.reportId) {
          await supabase.from("asset_reports").update({ status: "Diproses" } as any).eq("id", selectedAnomaly.reportId);
        }

        toast.success(
          `Aset masuk ke buffer "${rekonCatatan}". Buka Tab "Finalisasi Rekon" untuk ajukan massal ke BKAD.`,
          { description: "Dapat diajukan bersama aset lain sekaligus." }
        );
      }

      await queryClient.invalidateQueries({ queryKey: ["rekon-assets-joined"] });
      setResolveModalOpen(false);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Gagal menyimpan tindak lanjut.");
    } finally {
      setIsResolving(false);
    }
  };

  // ─── BATCH: Ajukan Semua draft_pengajuan ke BKAD (Dual-Approval Step 2) ───
  const handleAjukanKeBKAD = async () => {
    if (draftPengajuanItems.length === 0) return;
    setIsBatching(true);
    try {
      const ids = draftPengajuanItems.map((item) => item.assetId);
      const today = new Date();
      const tanggalSurat = today.toISOString().split("T")[0];
      const nomorSuratAuto = `REKON-BKAD/${tanggalSurat.replace(/-/g, "/")}/${Math.floor(Math.random() * 900 + 100)}`;

      // Hitung total nilai & kumpulkan kode barang untuk arsip
      const kodeBarangList: string[] = [];
      let totalNilai = 0;
      const assetSnapshot: any[] = [];

      for (const item of draftPengajuanItems) {
        kodeBarangList.push(item.kodeAset);
        const cd = (item.assetData.custom_data as Record<string, any>) || {};
        const nilaiRaw = item.assetData.nilai_perolehan || item.assetData.harga || cd["Nilai Perolehan"] || cd["Harga"] || 0;
        const parsed = typeof nilaiRaw === "number" ? nilaiRaw : Number(String(nilaiRaw).replace(/[^0-9]/g, "")) || 0;
        totalNilai += parsed;
        assetSnapshot.push({
          id: item.assetId,
          kode_aset: item.kodeAset,
          nama_aset: item.namaAset,
          kondisi: item.kondisi,
          rekomendasi: cd.rekon_rekomendasi || "Usul Perbaikan",
          sumber: item.source,
        });
      }

      // 1. Buat entry document_archives dengan status_approval = menunggu_bkad
      const { error: arcErr, data: newArc } = await supabase
        .from("document_archives")
        .insert({
          company_id: companyId!,
          nomor_surat: nomorSuratAuto,
          tanggal_surat: tanggalSurat,
          jenis_kib: "Campuran (Hasil Rekonsiliasi)",
          total_aset: draftPengajuanItems.length,
          total_nilai: totalNilai,
          kode_barang_list: kodeBarangList as any,
          tembusan: ["BKAD", "Pokja Inventarisasi", "Atasan Langsung"] as any,
          data_otorisasi: {
            jenis_pengajuan: "Batch Rekonsiliasi Aset Rusak",
            aset_detail: assetSnapshot,
            sumber_verifikasi: "super_admin / Pengurus Barang",
          } as any,
          status: "Menunggu Persetujuan BKAD",
          status_approval: "menunggu_bkad",
        })
        .select("id")
        .maybeSingle();
      if (arcErr) throw arcErr;

      // 2. Bulk UPDATE: status_rekon menjadi menunggu_bkad pada SEMUA aset di buffer
      //    dan simpan referensi ke document_archives
      const updates = draftPengajuanItems.map((item) => {
        const cd = (item.assetData.custom_data as Record<string, any>) || {};
        return supabase
          .from("assets")
          .update({
            custom_data: {
              ...cd,
              status_rekon: "menunggu_bkad",
              rekon_diajukan_at: today.toISOString(),
              rekon_document_archive_id: newArc?.id || null,
              status_usulan: cd.rekon_rekomendasi || cd.status_usulan || "Usul Perbaikan",
            },
          })
          .eq("id", item.assetId);
      });

      const results = await Promise.all(updates);
      const firstErr = results.find((r) => r.error);
      if (firstErr?.error) throw firstErr.error;

      // 3. Tutup semua asset_reports terkait (status ke Selesai, karena sudah masuk alur BKAD)
      const reportIds = draftPengajuanItems.filter((i) => i.reportId).map((i) => i.reportId!);
      if (reportIds.length > 0) {
        await supabase
          .from("asset_reports")
          .update({ status: "Selesai", catatan_admin: "Otomatis: Diajukan ke BKAD via Batch Rekonsiliasi" } as any)
          .in("id", reportIds);
      }

      await queryClient.invalidateQueries({ queryKey: ["rekon-assets-joined"] });
      queryClient.invalidateQueries({ queryKey: ["document-archives"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });

      toast.success(
        `✅ ${draftPengajuanItems.length} aset berhasil diajukan ke BKAD (No. ${nomorSuratAuto}).`,
        { description: "Staf BKAD dapat meninjau dan menyetujui di halaman Persetujuan." }
      );
      setActiveTab("anomali");
      setConfirmBatchOpen(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Gagal mengajukan batch ke BKAD.");
    } finally {
      setIsBatching(false);
    }
  };

  const handleExportExcel = () => {
    setIsExporting(true);
    try {
      const exportItems = anomalies.filter(item => {
        const cd = (item.assetData.custom_data as Record<string, any>) || {};
        return cd.status_usulan === "Pengajuan Perubahan Kondisi";
      });

      if (exportItems.length === 0) {
        toast.info("Tidak ada aset dengan status Pengajuan Perubahan Kondisi.");
        setIsExporting(false);
        return;
      }

      // We group by KIB or just make one big sheet with all possible columns
      // Prompt: "Struktur Kolom Baku: [No] | [Kode Barang] | [Nama Barang] | [...Kolom Dinamis sesuai Konfigurasi KIB] | Keterangan | Kondisi | Nilai Perolehan"
      const kibSet = new Set(exportItems.map(item => item.assetData.kib || ""));
      const dynamicCols = new Set<string>();
      
      kibSet.forEach(kib => {
        const kibCode = kib.split(" - ")[0]?.trim();
        const kibItem = masterKib.find((k) => k.code === kibCode);
        const kibLabel = kibItem ? kibItem.label : kib.split(" - ")[1]?.trim() || kib;
        const cols = getColumnsForKib(kibLabel);
        cols.forEach(c => {
          if (c.name.toLowerCase() !== "kode aset") {
            dynamicCols.add(c.name);
          }
        });
      });

      const dynamicColList = Array.from(dynamicCols);

      let totalNilai = 0;

      const rows = exportItems.map((item, index) => {
        const asset = item.assetData;
        const cd = (asset.custom_data as Record<string, any>) || {};

        const rowData: Record<string, any> = {
          "No": index + 1,
          "Kode Barang": asset.kode_aset,
          "Nama Barang": asset.nama_aset,
        };

        dynamicColList.forEach(col => {
          rowData[col] = cd[col] !== undefined ? cd[col] : "";
        });

        rowData["Keterangan"] = item.deskripsi || "—";
        rowData["Kondisi"] = item.kondisi;

        // Sapu Jagat pencarian Nilai Perolehan / Harga
        let nilaiRaw: any = asset.nilai_perolehan || asset.harga;
        
        if (nilaiRaw === undefined || nilaiRaw === null || nilaiRaw === "") {
          const cdKeys = Object.keys(cd);
          const matchKey = cdKeys.find(k => {
            const lower = k.toLowerCase();
            return lower.includes("nilai") || lower.includes("harga");
          });
          if (matchKey) {
            nilaiRaw = cd[matchKey];
          }
        }

        let num = 0;
        if (nilaiRaw !== undefined && nilaiRaw !== null && nilaiRaw !== "") {
          // Ambil string sebelum koma desimal (contoh: Rp. 15.000.000,00 -> Rp. 15.000.000)
          let strVal = String(nilaiRaw).split(",")[0];
          // Hapus semua karakter yang BUKAN ANGKA (titik, Rp, spasi, teks lain)
          const parsed = Number(strVal.replace(/[^0-9]/g, ""));
          if (!isNaN(parsed)) {
            num = parsed;
          }
        }

        totalNilai += num;
        rowData["Nilai Perolehan"] = num === 0 ? "0" : num.toLocaleString("id-ID");

        return rowData;
      });

      // Tambahkan baris total di akhir
      const totalRow: Record<string, any> = {
        "No": "",
        "Kode Barang": "",
        "Nama Barang": "TOTAL KESELURUHAN",
      };
      dynamicColList.forEach(col => { totalRow[col] = ""; });
      totalRow["Keterangan"] = "";
      totalRow["Kondisi"] = "";
      totalRow["Nilai Perolehan"] = totalNilai > 0 ? totalNilai.toLocaleString("id-ID") : "";
      
      rows.push(totalRow);

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Lampiran Perubahan Kondisi");
      
      const dateStr = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `Lampiran_Perubahan_Kondisi_${dateStr}.xlsx`);
      toast.success("Excel berhasil diunduh.");
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal mengekspor Excel.");
    } finally {
      setIsExporting(false);
    }
  };

  // ─── Batch Stats for Finalisasi Tab ────────────────────
  const finalisasiStats = useMemo(() => {
    const rusakBerat = draftPengajuanItems.filter((i) => i.kondisi === "Rusak Berat").length;
    const fromBoth = draftPengajuanItems.filter((i) => i.source === "both" || i.source === "keluhan").length;
    return { total: draftPengajuanItems.length, rusakBerat, fromBoth };
  }, [draftPengajuanItems]);

  // ─── Render ───────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ──── Tabs (Dual-Approval Workflow) ──── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="border-b border-border -mx-1 px-1 mb-6">
            <TabsList className="bg-transparent p-0 h-auto gap-6 sm:gap-10 w-full justify-start">
              <TabsTrigger
                value="anomali"
                className="relative py-3 px-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none h-auto text-sm font-medium"
              >
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-primary" />
                  <span>Daftar Anomali</span>
                  {anomalies.length > 0 && (
                    <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 rounded-full text-[10px] bg-destructive/15 text-destructive">
                      {anomalies.length}
                    </Badge>
                  )}
                </div>
              </TabsTrigger>
              <TabsTrigger
                value="finalisasi"
                className="relative py-3 px-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none h-auto text-sm font-medium"
              >
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-chart-3" />
                  <span>Finalisasi Rekon</span>
                  {draftPengajuanItems.length > 0 && (
                    <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 rounded-full text-[10px] bg-chart-3/15 text-chart-3 border-chart-3/30">
                      {draftPengajuanItems.length}
                    </Badge>
                  )}
                </div>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ═══════════════════════════════════════════════════════
              TAB 1: DAFTAR ANOMALI (Existing Original Workflow)
              ═══════════════════════════════════════════════════════ */}
          <TabsContent value="anomali" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            {isLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <Skeleton className="h-64 rounded-xl" />
              </div>
            ) : anomalies.length === 0 ? (
              /* ───── Empty State Anomali ───── */
              <Card className="border-chart-3/20 bg-chart-3/5">
                <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="h-20 w-20 rounded-2xl bg-chart-3/10 flex items-center justify-center mb-5">
                    <PartyPopper className="h-10 w-10 text-chart-3" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Luar biasa! Semua Aset Aman 🎉</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Tidak ada aset yang bermasalah saat ini. Semua data rekonsiliasi antara laporan publik,
                    temuan sensus, dan data master SIMDA sudah selaras.
                  </p>
                  <div className="flex items-center gap-2 mt-5">
                    <Shield className="h-4 w-4 text-chart-3" />
                    <span className="text-xs text-chart-3 font-medium">0 anomali terdeteksi</span>
                  </div>
                  {draftPengajuanItems.length > 0 && (
                    <Button
                      variant="outline"
                      className="mt-6 gap-2"
                      onClick={() => setActiveTab("finalisasi")}
                    >
                      <Clock className="h-4 w-4 text-chart-3" />
                      Lihat {draftPengajuanItems.length} aset di Buffer Finalisasi
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Header Actions */}
                <div className="flex justify-end mb-4">
                  <Button onClick={handleExportExcel} disabled={isExporting} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                    Cetak Lampiran Perubahan Kondisi
                  </Button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                          <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{statsData.total}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Total Anomali</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                          <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-destructive">{statsData.rusakBerat}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Rusak Berat</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Users className="h-4.5 w-4.5 text-primary" />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{statsData.fromPublic}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Dari Keluhan Publik</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="h-9 w-9 rounded-lg bg-chart-3/10 flex items-center justify-center">
                          <ClipboardCheck className="h-4.5 w-4.5 text-chart-3" />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{statsData.fromCensus}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Dari Temuan Sensus</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Anomaly Table */}
                <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aset</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sumber</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kondisi</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Keterangan</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Terakhir</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {anomalies.map((item) => {
                          const src = sourceLabel(item.source);
                          return (
                            <TableRow key={item.assetId}>
                              <TableCell>
                                <div className="max-w-[140px] sm:max-w-[180px]">
                                  <p className="text-sm font-medium text-foreground truncate">{item.namaAset}</p>
                                  <p className="text-xs font-mono text-muted-foreground truncate">{item.kodeAset}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${src.class}`}>
                                    <src.icon className="h-3 w-3 mr-1" />
                                    {src.text}
                                  </Badge>
                                  {item.reportCount > 1 && (
                                    <Badge variant="destructive" className="h-5 px-1.5 min-w-[20px] flex items-center justify-center text-[10px] rounded-full">
                                      {item.reportCount}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={kondisiBadge(item.kondisi)}>
                                  {item.kondisi}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <p className="text-sm text-muted-foreground truncate max-w-[200px]">{item.deskripsi || "—"}</p>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(item.latestDate)}</span>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {(() => {
                                    const customData = (item.assetData.custom_data as Record<string, any>) || {};
                                    const isDiajukan = customData.status_usulan === "Pengajuan Perubahan Kondisi" || customData.status_aset === "Usul Hapus";
                                    if (isDiajukan) {
                                      return (
                                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px] gap-1 py-1 mr-2 px-2">
                                          <CheckCircle2 className="h-3 w-3" /> Siap Diekspor
                                        </Badge>
                                      );
                                    }
                                    return (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="gap-1.5 text-xs mr-1"
                                              onClick={() => openResolveModal(item)}
                                            >
                                              <Wrench className="h-3.5 w-3.5" />
                                              Tindak Lanjuti
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Buat Berita Acara Rekonsiliasi — Hasil masuk ke Buffer Finalisasi</TooltipContent>
                                      </Tooltip>
                                    );
                                  })()}
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                        onClick={() => window.open(`/scan/${item.assetId}`, "_blank")}
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Lihat Profil Aset</TooltipContent>
                                  </Tooltip>
                                  {item.reporterContact && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-chart-1 hover:text-primary hover:bg-accent"
                                          onClick={() => {
                                            let num = item.reporterContact!.replace(/\D/g, "");
                                            if (num.startsWith("0")) num = "62" + num.slice(1);
                                            if (!num.startsWith("62")) num = "62" + num;
                                            window.open(`https://wa.me/${num}`, "_blank");
                                          }}
                                        >
                                          <MessageCircle className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Chat WhatsApp Pelapor</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 2: FINALISASI REKON (Batching Buffer State)
              ═══════════════════════════════════════════════════════ */}
          <TabsContent value="finalisasi" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            {isLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <Skeleton className="h-64 rounded-xl" />
              </div>
            ) : draftPengajuanItems.length === 0 ? (
              /* ───── Empty State Finalisasi ───── */
              <Card className="border-chart-3/20 bg-chart-3/5">
                <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                    <Package className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Buffer Finalisasi Kosong</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Belum ada aset yang ditandai untuk diajukan ke BKAD. Gunakan tombol{" "}
                    <span className="font-medium">"Tindak Lanjuti"</span> di Tab{" "}
                    <span className="font-medium">"Daftar Anomali"</span> dan pilih rekomendasi
                    <span className="font-medium"> "Usul Perbaikan"</span> atau{" "}
                    <span className="font-medium">"Pengajuan Perubahan Kondisi"</span> untuk memasukkan aset ke buffer ini.
                  </p>
                  <div className="flex items-center gap-2 mt-5">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-xs text-primary font-medium">0 aset dalam buffer</span>
                  </div>
                  {anomalies.length > 0 && (
                    <Button
                      variant="outline"
                      className="mt-6 gap-2"
                      onClick={() => setActiveTab("anomali")}
                    >
                      <Scale className="h-4 w-4 text-destructive" />
                      Tinjau {anomalies.length} Anomali yang Tersedia
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <>
                {/* ── Finalisasi Header Action Bar ── */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5">
                      <Clock className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-500">
                        {draftPengajuanItems.length} aset dalam buffer — siap diajukan
                      </span>
                    </div>
                  </div>
                  <Button
                    onClick={() => setConfirmBatchOpen(true)}
                    disabled={isBatching}
                    className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 sm:self-end"
                  >
                    {isBatching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Ajukan ke BKAD ({draftPengajuanItems.length})
                  </Button>
                </div>

                {/* Finalisasi Info Banner */}
                <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 mb-4">
                  <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="text-xs sm:text-sm text-primary-foreground/90 dark:text-primary/90 leading-relaxed">
                    <span className="font-semibold">Dual-Approval Workflow:</span> Aset di bawah ini telah diverifikasi
                    oleh <span className="font-semibold">Pengurus Barang (super_admin)</span>. Menekan tombol{" "}
                    <span className="font-semibold">"Ajukan ke BKAD"</span> akan mengirim SEMUA aset ini secara massal
                    ke <span className="font-semibold">Pengelola Barang (staf_bkad)</span> untuk persetujuan digital,
                    dan membuat catatan otomatis di <span className="font-mono text-[11px]">document_archives</span>
                    dengan status <span className="font-mono text-[11px]">menunggu_bkad</span>.
                  </div>
                </div>

                {/* Finalisasi Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <Card className="border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="h-9 w-9 rounded-lg bg-chart-3/10 flex items-center justify-center">
                          <Package className="h-4.5 w-4.5 text-chart-3" />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{finalisasiStats.total}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Total Siap Diajukan</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                          <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-destructive">{finalisasiStats.rusakBerat}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Kategori Rusak Berat</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Users className="h-4.5 w-4.5 text-primary" />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{finalisasiStats.fromBoth}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Dengan Bukti Laporan Publik</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Finalisasi Buffer Table */}
                <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aset</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sumber</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kondisi</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Rekomendasi</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Keterangan</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Masuk Buffer</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {draftPengajuanItems.map((item) => {
                          const src = sourceLabel(item.source);
                          const cd = (item.assetData.custom_data as Record<string, any>) || {};
                          const rekomendasi = cd.rekon_rekomendasi || cd.status_usulan || "Usul Perbaikan";
                          const masukAt = cd.rekon_tanggal || item.latestDate;
                          return (
                            <TableRow key={item.assetId} className="bg-chart-3/[0.03]">
                              <TableCell>
                                <div className="max-w-[140px] sm:max-w-[180px]">
                                  <p className="text-sm font-medium text-foreground truncate">{item.namaAset}</p>
                                  <p className="text-xs font-mono text-muted-foreground truncate">{item.kodeAset}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${src.class}`}>
                                    <src.icon className="h-3 w-3 mr-1" />
                                    {src.text}
                                  </Badge>
                                  {item.reportCount > 1 && (
                                    <Badge variant="destructive" className="h-5 px-1.5 min-w-[20px] flex items-center justify-center text-[10px] rounded-full">
                                      {item.reportCount}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={kondisiBadge(item.kondisi)}>
                                  {item.kondisi}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <Badge
                                  variant="outline"
                                  className={
                                    rekomendasi.includes("Perubahan Kondisi") || rekomendasi.includes("Rusak Berat")
                                      ? "bg-destructive/10 text-destructive border-destructive/30 text-[10px] px-1.5 py-0"
                                      : "bg-warning/10 text-warning border-warning/30 text-[10px] px-1.5 py-0"
                                  }
                                >
                                  {rekomendasi}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <p className="text-sm text-muted-foreground truncate max-w-[220px]">{item.deskripsi || "—"}</p>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatDate(masukAt)}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* ─── Tindak Lanjut Modal (Global, luar Tab) ─── */}
        <Dialog open={resolveModalOpen} onOpenChange={setResolveModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Tindak Lanjut Eksekusi</DialogTitle>
              <DialogDescription>
                Pilih rekomendasi tindak lanjut untuk anomali aset ini. Hasil verifikasi akan masuk ke
                <span className="font-medium"> Buffer Finalisasi Rekon</span> dan dapat diajukan secara
                massal ke BKAD.
              </DialogDescription>
            </DialogHeader>
            {selectedAnomaly && (
              <div className="space-y-4 py-4">
                <div className="rounded-md bg-muted p-3 space-y-1">
                  <p className="text-sm font-medium">{selectedAnomaly.namaAset}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedAnomaly.kodeAset}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className={kondisiBadge(selectedAnomaly.kondisi)}>
                      {selectedAnomaly.kondisi}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Rekomendasi Tindak Lanjut</Label>
                  <Select value={rekomendasi} onValueChange={setRekomendasi}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih rekomendasi..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Layak Pakai">Layak Pakai — Tutup & keluar dari daftar</SelectItem>
                      <SelectItem value="Usul Perbaikan">
                        📦 Usul Perbaikan — Masuk Buffer Finalisasi
                      </SelectItem>
                      <SelectItem value="Pengajuan Perubahan Kondisi">
                        📦 Pengajuan Perubahan Kondisi (Rusak Berat) — Masuk Buffer
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="rounded-md border border-chart-3/30 bg-chart-3/[0.04] p-2.5 mt-2">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      <span className="font-semibold text-chart-3">Catatan Dual-Approval:</span> Pilihan
                      selain "Layak Pakai" akan memasukkan aset ke{" "}
                      <span className="font-medium">Buffer Finalisasi Rekon</span> (draft_pengajuan).
                      Aset yang terkumpul dapat diajukan <span className="font-medium">SEKALIGUS</span>{" "}
                      secara digital ke <span className="font-medium">staf_bkad</span>.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveModalOpen(false)} disabled={isResolving}>
                Batal
              </Button>
              <Button onClick={handleResolveSubmit} disabled={!rekomendasi || isResolving} className="gap-2">
                {isResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Simpan Verifikasi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Konfirmasi Batch Ajukan ke BKAD ─── */}
        <AlertDialog open={confirmBatchOpen} onOpenChange={setConfirmBatchOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Ajukan {draftPengajuanItems.length} Aset ke BKAD?
              </AlertDialogTitle>
              <AlertDialogDescription className="leading-relaxed text-sm">
                Anda akan menjalankan <span className="font-semibold text-foreground">mutasi massal</span>{" "}
                untuk <span className="font-semibold">{draftPengajuanItems.length} aset</span> dalam
                buffer Finalisasi Rekon:
                <ul className="list-disc list-inside mt-2 space-y-1 text-[13px] pl-1">
                  <li>
                    Status aset berubah dari <span className="font-mono bg-muted px-1 rounded text-[12px]">draft_pengajuan</span> →{" "}
                    <span className="font-mono bg-warning/15 text-warning px-1 rounded text-[12px]">menunggu_bkad</span>
                  </li>
                  <li>
                    Entri baru dibuat di <span className="font-mono bg-muted px-1 rounded text-[12px]">document_archives</span>{" "}
                    dengan <span className="font-mono bg-muted px-1 rounded text-[12px]">status_approval = menunggu_bkad</span>
                  </li>
                  <li>
                    <span className="font-semibold">Staf BKAD (Pengelola Barang)</span> dapat meninjau & menyetujui
                    secara digital di halaman Persetujuan
                  </li>
                </ul>
                <br />
                Pastikan semua aset telah diverifikasi sebelum dilanjutkan. Tindakan ini memicu
                <span className="font-semibold"> langkah ke-2 dari Dual-Approval Workflow</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isBatching}>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleAjukanKeBKAD();
                }}
                disabled={isBatching}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isBatching && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Ya, Ajukan Semua ke BKAD
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
