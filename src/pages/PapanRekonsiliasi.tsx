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
  const { getColumnsForKib, kibColumns } = useCustomColumns();

  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyItem | null>(null);
  const [rekomendasi, setRekomendasi] = useState<string>("");
  const [isResolving, setIsResolving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch assets with joined reports and audits
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["rekon-assets-joined", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select(`
          id, kode_aset, nama_aset, custom_data, nilai_perolehan, master_kib,
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

  // Build anomaly list
  const anomalies = useMemo(() => {
    const result: AnomalyItem[] = [];

    assets.forEach((asset: any) => {
      // 1. Jalur Publik: Ambil reports yang berstatus Menunggu atau Diproses
      const openReports = (asset.asset_reports || []).filter((r: any) => 
        r.status === "Menunggu" || r.status === "Diproses"
      );
      // Urutkan laporan dari yang terbaru
      openReports.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // 2. Jalur Sensus: Ambil audits yang kondisinya Rusak
      const damagedAudits = (asset.asset_audits || []).filter((a: any) =>
        a.kondisi === "Rusak Ringan" || a.kondisi === "Rusak Berat" || a.kondisi === "Dalam Perbaikan"
      );
      // Urutkan audit dari yang terbaru
      damagedAudits.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const hasReport = openReports?.length > 0;
      const hasAudit = damagedAudits?.length > 0;

      // SYARAT MUTLAK: Harus punya laporan publik ATAU audit bermasalah
      if (!hasReport && !hasAudit) return;

      let source: AnomalyItem["source"] = "keluhan";
      if (hasReport && hasAudit) source = "both";
      else if (hasAudit) source = "sensus";

      // Determine kondisi & description
      let kondisi = "—";
      let deskripsi = "";
      let latestDate = "";
      let reporterContact: string | undefined;

      // Prioritas 1: Ambil data dari laporan publik jika ada
      if (hasReport) {
        const latestRep = openReports[0];
        kondisi = latestRep.actual_condition || latestRep.issue_category || "Dilaporkan";
        deskripsi = latestRep.judul || latestRep.deskripsi || "";
        latestDate = latestRep.created_at;
        reporterContact = latestRep.reporter_contact || undefined;
      }

      // Prioritas 2: Timpa dengan data audit sensus jika ada (Sensus selalu menang/override)
      if (hasAudit) {
        const latestAud = damagedAudits[0];
        kondisi = latestAud.kondisi;
        if (!deskripsi) deskripsi = latestAud.tindak_lanjut || latestAud.catatan || "";
        if (!latestDate || new Date(latestAud.created_at) > new Date(latestDate)) {
          latestDate = latestAud.created_at;
        }
      }

      result.push({
        assetId: asset.id,
        kodeAset: asset.kode_aset,
        namaAset: asset.nama_aset,
        source,
        kondisi,
        deskripsi,
        reportCount: reps?.length ?? 0,
        latestDate,
        reporterContact,
        reportId: reps && reps.length > 0 ? reps[0].id : undefined,
        assetData: asset,
      });
    });

    // Sort by severity: Rusak Berat first, then both sources, then date
    result.sort((a, b) => {
      const sevOrder = (k: string) => k === "Rusak Berat" ? 0 : k === "Rusak Ringan" ? 1 : k === "Dalam Perbaikan" ? 2 : 3;
      const srcOrder = (s: string) => s === "both" ? 0 : s === "keluhan" ? 1 : 2;
      const sevDiff = sevOrder(a.kondisi) - sevOrder(b.kondisi);
      if (sevDiff !== 0) return sevDiff;
      const srcDiff = srcOrder(a.source) - srcOrder(b.source);
      if (srcDiff !== 0) return srcDiff;
      return new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime();
    });

    return result;
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
        // Jika ada di sensus (Rusak), override jadi Baik? Prompt: "Jika pilih Layak Pakai: Ubah status di tabel reports menjadi Selesai. Aset otomatis hilang dari Papan Rekonsiliasi."
        // We will just clear the audit if it was from sensus, or update it.
        if (selectedAnomaly.source === "sensus" || selectedAnomaly.source === "both") {
           await supabase.from("asset_audits").update({ kondisi: "Baik", tindak_lanjut: "Layak Pakai (Hasil Rekonsiliasi)" }).eq("asset_id", selectedAnomaly.assetId);
        }
      } else if (rekomendasi === "Usul Perbaikan") {
        if (selectedAnomaly.reportId) {
          await supabase.from("asset_reports").update({ status: "Diproses" } as any).eq("id", selectedAnomaly.reportId);
        }
      } else if (rekomendasi === "Pengajuan Perubahan Kondisi") {
        const customData = (selectedAnomaly.assetData.custom_data as Record<string, any>) || {};
        await supabase.from("assets").update({
          custom_data: { ...customData, status_usulan: "Pengajuan Perubahan Kondisi" }
        }).eq("id", selectedAnomaly.assetId);
      }

      await queryClient.invalidateQueries({ queryKey: ["rekon-assets-joined"] });
      toast.success("Tindak lanjut berhasil disimpan.");
      setResolveModalOpen(false);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Gagal menyimpan tindak lanjut.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleExportExcel = () => {
    setIsExporting(true);
    try {
      const exportAssets = assets.filter(a => {
        const cd = (a.custom_data as Record<string, any>) || {};
        return cd.status_usulan === "Pengajuan Perubahan Kondisi";
      });

      if (exportAssets.length === 0) {
        toast.info("Tidak ada aset dengan status Pengajuan Perubahan Kondisi.");
        setIsExporting(false);
        return;
      }

      // We group by KIB or just make one big sheet with all possible columns
      // Prompt: "Struktur Kolom Baku: [No] | [Kode Barang] | [Nama Barang] | [...Kolom Dinamis sesuai Konfigurasi KIB] | [Kondisi] | [Nilai Perolehan]"
      const kibSet = new Set(exportAssets.map(a => a.master_kib || ""));
      const dynamicCols = new Set<string>();
      
      kibSet.forEach(kib => {
        const cols = getColumnsForKib(kib);
        cols.forEach(c => dynamicCols.add(c.name));
      });

      const dynamicColList = Array.from(dynamicCols);

      const rows = exportAssets.map((asset, index) => {
        const cd = (asset.custom_data as Record<string, any>) || {};
        const damagedAudits = (asset.asset_audits || []).filter((a: any) =>
          a.kondisi === "Rusak Ringan" || a.kondisi === "Rusak Berat" || a.kondisi === "Dalam Perbaikan"
        );
        damagedAudits.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const kondisi = damagedAudits.length > 0 ? damagedAudits[0].kondisi : "Rusak Berat";

        const rowData: Record<string, any> = {
          "No": index + 1,
          "Kode Barang": asset.kode_aset,
          "Nama Barang": asset.nama_aset,
        };

        dynamicColList.forEach(col => {
          rowData[col] = cd[col] !== undefined ? cd[col] : "";
        });

        rowData["Kondisi"] = kondisi;
        rowData["Nilai Perolehan"] = asset.nilai_perolehan || 0;

        return rowData;
      });

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

  // ─── Render ───────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : anomalies.length === 0 ? (
          /* ───── Empty State ───── */
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
                              <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="gap-1.5 text-xs"
                                      onClick={() => openResolveModal(item)}
                                    >
                                      <Wrench className="h-3.5 w-3.5" />
                                      Tindak Lanjuti
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Buat Berita Acara Rekonsiliasi</TooltipContent>
                              </Tooltip>
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

        {/* Tindak Lanjut Modal */}
        <Dialog open={resolveModalOpen} onOpenChange={setResolveModalOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Tindak Lanjut Eksekusi</DialogTitle>
              <DialogDescription>
                Pilih rekomendasi tindak lanjut untuk anomali aset ini.
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
                      <SelectItem value="Layak Pakai">Layak Pakai (Tutup Laporan)</SelectItem>
                      <SelectItem value="Usul Perbaikan">Usul Perbaikan</SelectItem>
                      <SelectItem value="Pengajuan Perubahan Kondisi">Pengajuan Perubahan Kondisi (Rusak Berat)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveModalOpen(false)} disabled={isResolving}>
                Batal
              </Button>
              <Button onClick={handleResolveSubmit} disabled={!rekomendasi || isResolving} className="gap-2">
                {isResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Simpan & Selesaikan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
