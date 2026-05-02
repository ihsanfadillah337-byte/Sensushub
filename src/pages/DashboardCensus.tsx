import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getKondisi, getKondisiStyle } from "@/lib/kondisi";
import { getSmartLocation } from "@/lib/smartLocation";
import {
  ClipboardCheck, CheckCircle2, XCircle, BarChart3,
  Search, Package, Clock, ScanLine, Camera, FileText,
  RotateCcw, AlertTriangle, CalendarDays, Power, ShieldAlert, Archive, Trash2, History
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// ─── Helpers ────────────────────────────────────────────
function getCd(asset: any): Record<string, unknown> | null {
  return typeof asset.custom_data === "object" && asset.custom_data && !Array.isArray(asset.custom_data)
    ? (asset.custom_data as Record<string, unknown>) : null;
}

function getTerakhirDiaudit(cd: Record<string, unknown> | null): string | null {
  if (!cd) return null;
  const v = cd["Terakhir Diaudit"];
  return typeof v === "string" && v.length >= 8 ? v : null;
}

function formatTanggal(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

// ─── Component ──────────────────────────────────────────
export default function DashboardCensus() {
  const navigate = useNavigate();
  const { companyId } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "belum" | "sudah">("all");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [togglingCensus, setTogglingCensus] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveName, setArchiveName] = useState("");
  const scannerRef = useRef<any>(null);
  const scannedRef = useRef(false);
  const scannerContainerId = "qr-reader-census";

  // ─── Sensus Active flag ────────────────────────────────
  const { data: sensusActive = false } = useQuery({
    queryKey: ["sensus-active", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("sensus_active")
        .eq("id", companyId!)
        .maybeSingle();
      return data?.sensus_active ?? false;
    },
    enabled: !!companyId,
  });

  const handleToggleCensus = async () => {
    if (!companyId) return;
    setTogglingCensus(true);
    try {
      const newVal = !sensusActive;
      const { error } = await supabase.from("companies").update({ sensus_active: newVal }).eq("id", companyId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["sensus-active"] });
      toast.success(newVal ? "Sensus DIAKTIFKAN. Auditor kini bisa mengisi form audit." : "Sensus DINONAKTIFKAN. Auditor hanya bisa melihat profil aset.");
    } catch (e: any) {
      toast.error("Gagal mengubah status sensus: " + e.message);
    } finally {
      setTogglingCensus(false);
    }
  };

  // ─── Data fetching ────────────────────────────────────
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["census-assets", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("company_id", companyId!)
        .order("kode_aset", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // ─── Audit data from asset_audits (source of truth) ───
  const { data: auditsRaw = [], isLoading: isLoadingAudits } = useQuery({
    queryKey: ["census-audits", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_audits")
        .select("id, asset_id, kondisi, tindak_lanjut, catatan, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Build a map: asset_id → latest audit record
  const auditMap = useMemo(() => {
    const map = new Map<string, { kondisi: string; tindak_lanjut: string; catatan: string | null; created_at: string }>();
    // Filter only audits for assets in this company
    const companyAssetIds = new Set(assets.map(a => a.id));
    auditsRaw.forEach((audit) => {
      if (!companyAssetIds.has(audit.asset_id)) return;
      if (!map.has(audit.asset_id)) {
        map.set(audit.asset_id, {
          kondisi: audit.kondisi,
          tindak_lanjut: audit.tindak_lanjut,
          catatan: audit.catatan,
          created_at: audit.created_at,
        });
      }
    });
    return map;
  }, [auditsRaw, assets]);

  // ─── Sensus Archives (historical data) ─────────────────
  const { data: archives = [] } = useQuery({
    queryKey: ["sensus-archives", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sensus_archives")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // ─── QR Scanner ───────────────────────────────────────
  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current) {
        const s = scannerRef.current;
        scannerRef.current = null;
        await s.stop().catch(() => {});
        s.clear();
      }
    } catch { /* silent */ }
  }, []);

  const startScanner = useCallback(async () => {
    scannedRef.current = false;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      await new Promise((r) => setTimeout(r, 400));
      const el = document.getElementById(scannerContainerId);
      if (!el) return;

      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (scannedRef.current) return;
          scannedRef.current = true;
          const match = decodedText.match(/\/scan\/([a-zA-Z0-9-]+)/);
          try {
            if (scannerRef.current) { const s = scannerRef.current; scannerRef.current = null; await s.stop().catch(() => {}); s.clear(); }
          } catch { /* silent */ }
          setTimeout(() => {
            setScannerOpen(false);
            if (match?.[1]) {
              toast.success("QR Code terbaca!");
              navigate(`/dashboard/census/audit/${match[1]}`);
            } else {
              toast.error("Format QR tidak valid untuk SensusHub.");
            }
          }, 100);
        },
        () => {}
      );
    } catch {
      toast.error("Gagal membuka kamera scanner.");
      setScannerOpen(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (scannerOpen) startScanner();
    return () => { stopScanner(); };
  }, [scannerOpen, startScanner, stopScanner]);

  // ─── Census statistics (based on DISTINCT asset_id in asset_audits) ───
  const stats = useMemo(() => {
    const total = assets.length;
    let baik = 0, rusakRingan = 0, rusakBerat = 0;
    const auditDates: string[] = [];

    // Count by latest audit kondisi from auditMap
    auditMap.forEach((audit) => {
      auditDates.push(audit.created_at);
      const k = audit.kondisi;
      if (k === "Baik") baik++;
      else if (k === "Rusak Ringan") rusakRingan++;
      else if (k === "Rusak Berat" || k === "Dalam Perbaikan") rusakBerat++;
    });

    const audited = auditMap.size;
    const belumDicek = total - audited;
    const progress = total > 0 ? Math.round((audited / total) * 100) : 0;

    // Periode: earliest and latest audit dates
    auditDates.sort();
    const periodeAwal = auditDates.length > 0 ? auditDates[0] : null;
    const periodeAkhir = auditDates.length > 0 ? auditDates[auditDates.length - 1] : null;

    return { total, baik, rusakRingan, rusakBerat, belumDicek, audited, progress, periodeAwal, periodeAkhir };
  }, [assets, auditMap]);

  // ─── Filtered list ────────────────────────────────────
  const filteredAssets = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return assets.filter((a) => {
      if (q && !a.nama_aset.toLowerCase().includes(q) && !a.kode_aset.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all") {
        const hasAudit = auditMap.has(a.id);
        if (statusFilter === "sudah" && !hasAudit) return false;
        if (statusFilter === "belum" && hasAudit) return false;
      }
      return true;
    });
  }, [assets, searchQuery, statusFilter, auditMap]);

  // ─── Archive & Reset Sensus ────────────────────────────
  const handleArchiveAndReset = async () => {
    if (!companyId || !archiveName.trim()) return;
    setResetting(true);
    try {
      const assetIds = assets.map(a => a.id);

      // Step A: Build audit snapshot from raw data
      const companyAudits = auditsRaw.filter(a => assetIds.includes(a.asset_id));
      const auditSnapshot = companyAudits.map(a => ({
        asset_id: a.asset_id,
        kondisi: a.kondisi,
        tindak_lanjut: a.tindak_lanjut,
        catatan: a.catatan,
        created_at: a.created_at,
      }));

      // Step B: INSERT archive record
      const { error: archiveErr } = await supabase
        .from("sensus_archives")
        .insert({
          company_id: companyId,
          period_name: archiveName.trim(),
          start_date: stats.periodeAwal,
          end_date: stats.periodeAkhir,
          total_assets: stats.total,
          total_audited: stats.audited,
          total_baik: stats.baik,
          total_rusak_ringan: stats.rusakRingan,
          total_rusak_berat: stats.rusakBerat,
          audit_snapshot: auditSnapshot as any,
        });
      if (archiveErr) throw archiveErr;

      // Step C: DELETE all audit records
      if (assetIds.length > 0) {
        const { error: deleteErr } = await supabase
          .from("asset_audits")
          .delete()
          .in("asset_id", assetIds);
        if (deleteErr) throw deleteErr;
      }

      // Step D: Refresh all queries
      queryClient.invalidateQueries({ queryKey: ["census-audits"] });
      queryClient.invalidateQueries({ queryKey: ["census-assets"] });
      queryClient.invalidateQueries({ queryKey: ["sensus-archives"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });

      // Deactivate census
      await supabase.from("companies").update({ sensus_active: false }).eq("id", companyId);
      queryClient.invalidateQueries({ queryKey: ["sensus-active"] });

      toast.success(`Sensus "${archiveName.trim()}" berhasil diarsipkan. Progres kembali ke 0%.`);
      setArchiveOpen(false);
      setArchiveName("");
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal mengarsipkan sensus: " + (err.message || "Coba lagi."));
    } finally {
      setResetting(false);
    }
  };

  // ─── Cetak Berita Acara PDF ───────────────────────────
  const handleCetakPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF("p", "mm", "a4");
      const pageW = doc.internal.pageSize.getWidth();

      // Title
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("BERITA ACARA", pageW / 2, 20, { align: "center" });
      doc.text("SENSUS BARANG MILIK DAERAH / PERUSAHAAN", pageW / 2, 27, { align: "center" });

      // Periode
      const periodeText = stats.periodeAwal
        ? `Periode Sensus: ${formatTanggal(stats.periodeAwal)} s/d ${formatTanggal(stats.periodeAkhir)}`
        : "Periode Sensus: Belum dimulai";
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(periodeText, pageW / 2, 35, { align: "center" });

      // Summary line
      doc.setFontSize(9);
      doc.text(`Total Aset: ${stats.total}  |  Sudah Diaudit: ${stats.audited}  |  Belum Dicek: ${stats.belumDicek}`, pageW / 2, 42, { align: "center" });

      // Table — only audited assets (from asset_audits)
      const auditedAssets = assets.filter((a) => auditMap.has(a.id));

      const tableBody = auditedAssets.map((a, idx) => {
        const audit = auditMap.get(a.id);
        return [
          (idx + 1).toString(),
          a.kode_aset,
          a.nama_aset,
          audit?.kondisi ?? "—",
          formatTanggal(audit?.created_at ?? null),
          audit?.tindak_lanjut ?? "—",
        ];
      });

      autoTable(doc, {
        startY: 48,
        head: [["No", "Kode Aset", "Nama Aset", "Kondisi", "Tgl Audit", "Tindak Lanjut"]],
        body: tableBody,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
          0: { halign: "center", cellWidth: 10 },
          1: { cellWidth: 30 },
          3: { cellWidth: 25 },
          4: { cellWidth: 25 },
          5: { cellWidth: 28 },
        },
      });

      // Signature area
      const finalY = (doc as any).lastAutoTable?.finalY || 200;
      const sigY = finalY + 20;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");

      // Left signature
      doc.text("Mengetahui,", 30, sigY, { align: "center" });
      doc.text("Pimpinan", 30, sigY + 5, { align: "center" });
      doc.text("(________________________)", 30, sigY + 30, { align: "center" });

      // Right signature
      doc.text("Auditor Lapangan,", pageW - 30, sigY, { align: "center" });
      doc.text("", pageW - 30, sigY + 5, { align: "center" });
      doc.text("(________________________)", pageW - 30, sigY + 30, { align: "center" });

      doc.save("Berita_Acara_Sensus.pdf");
      toast.success("PDF Berita Acara berhasil di-download!");
    } catch (err: any) {
      console.error("PDF generation error:", err);
      toast.error("Gagal membuat PDF: " + (err.message || "Coba lagi."));
    }
  };

  // ─── Helpers ──────────────────────────────────────────
  function assetLocation(a: typeof assets[0]) {
    return getSmartLocation(getCd(a), a.kode_divisi);
  }

  function assetKondisi(a: typeof assets[0]) {
    const audit = auditMap.get(a.id);
    // Use audit kondisi if available, otherwise fall back to master
    return getKondisiStyle(audit?.kondisi ?? getKondisi(getCd(a)));
  }

  function assetTerakhirDiaudit(a: typeof assets[0]): string {
    const audit = auditMap.get(a.id);
    return formatTanggal(audit?.created_at ?? null);
  }

  const metricCards = [
    { title: "Total Aset", value: stats.total, icon: Package, color: "text-primary", bgColor: "bg-primary/10" },
    { title: "Sudah Diaudit", value: stats.audited, icon: CheckCircle2, color: "text-chart-3", bgColor: "bg-chart-3/10" },
    { title: "Belum Dicek", value: stats.belumDicek, icon: Clock, color: "text-warning", bgColor: "bg-warning/10" },
    { title: "Rusak Berat", value: stats.rusakBerat, icon: XCircle, color: "text-destructive", bgColor: "bg-destructive/10" },
  ];

  // ─── Render ───────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Sensus Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge className={sensusActive ? "bg-chart-3/15 text-chart-3 border-chart-3/30" : "bg-destructive/10 text-destructive border-destructive/20"}>
            {sensusActive ? "SENSUS AKTIF" : "SENSUS NONAKTIF"}
          </Badge>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground truncate">
              {stats.periodeAwal
                ? `${formatTanggal(stats.periodeAwal)} s/d ${formatTanggal(stats.periodeAkhir)}`
                : "Belum dimulai"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <Button
            className={`gap-2 ${sensusActive ? '' : 'animate-pulse'}`}
            size="sm"
            variant={sensusActive ? "outline" : "default"}
            onClick={handleToggleCensus}
            disabled={togglingCensus}
          >
            <Power className="h-4 w-4" />
            {sensusActive ? "Nonaktifkan Sensus" : "Aktifkan Sensus"}
          </Button>
          <Button className="gap-2" size="sm" onClick={() => setScannerOpen(true)} disabled={!sensusActive}>
            <Camera className="h-4 w-4" />
            <span className="hidden sm:inline">Scan</span> QR
          </Button>
          <Button className="gap-2" size="sm" variant="outline" onClick={handleCetakPDF} disabled={stats.audited === 0}>
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Cetak</span> Berita Acara
          </Button>
          <Button className="gap-2" size="sm" variant="destructive" disabled={resetting || stats.audited === 0} onClick={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" />
            Tutup & Arsipkan
          </Button>
        </div>
      </div>

      {/* QR Scanner Dialog */}
      <Dialog open={scannerOpen} onOpenChange={(open) => { if (!open) { stopScanner(); setScannerOpen(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" />
              Scanner QR Aset
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div id={scannerContainerId} className="w-full rounded-lg overflow-hidden" />
            <p className="text-xs text-muted-foreground text-center">
              Arahkan kamera ke QR Code pada label aset.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5">
            <ScanLine className="h-4 w-4" />
            Daftar Aset
          </TabsTrigger>
        </TabsList>

        {/* ========== TAB 1: OVERVIEW ========== */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {isLoading || isLoadingAudits ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : (
            <>
              {/* Metric Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {metricCards.map((m) => (
                  <Card key={m.title} className="border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className={`h-9 w-9 rounded-lg ${m.bgColor} flex items-center justify-center`}>
                          <m.icon className={`h-4.5 w-4.5 ${m.color}`} />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{m.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{m.title}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Progress Bar */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Progres Sensus</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {stats.audited} dari {stats.total} aset sudah punya catatan audit
                    </span>
                    <span className="font-bold text-foreground">{stats.progress}%</span>
                  </div>
                  <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-chart-3 rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${stats.progress}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-chart-3" />
                      <span className="text-xs text-muted-foreground">Baik: <strong className="text-foreground">{stats.baik}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-warning" />
                      <span className="text-xs text-muted-foreground">Rusak Ringan: <strong className="text-foreground">{stats.rusakRingan}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-destructive" />
                      <span className="text-xs text-muted-foreground">Rusak Berat: <strong className="text-foreground">{stats.rusakBerat}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
                      <span className="text-xs text-muted-foreground">Belum Dicek: <strong className="text-foreground">{stats.belumDicek}</strong></span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Action */}
              {sensusActive ? (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                      <ScanLine className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-foreground">Mulai Audit Lapangan</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tekan "Scan QR" atau pilih aset dari tab "Daftar Aset" untuk mulai mengaudit.
                      </p>
                    </div>
                    <Button className="gap-1.5 shrink-0" onClick={() => setScannerOpen(true)}>
                      <Camera className="h-4 w-4" />
                      Scan Sekarang
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-warning/30 bg-warning/5">
                  <CardContent className="p-5 flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-warning mt-0.5 shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Sensus Tidak Aktif</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tekan tombol "Aktifkan Sensus" di atas untuk membuka akses Form Audit bagi para Auditor lapangan. Selama nonaktif, scan QR hanya menampilkan profil aset tanpa form input.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Archive History */}
              {archives.length > 0 && (
                <Card className="border-border/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      Riwayat Sensus Sebelumnya
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Periode</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tanggal</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Aset</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Diaudit</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center hidden sm:table-cell">Baik</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center hidden sm:table-cell">Rusak</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {archives.map((arc) => {
                            const pct = arc.total_assets > 0 ? Math.round((arc.total_audited / arc.total_assets) * 100) : 0;
                            return (
                              <TableRow key={arc.id}>
                                <TableCell className="text-sm font-medium text-foreground">{arc.period_name}</TableCell>
                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                  {arc.start_date ? formatTanggal(arc.start_date) : "—"}
                                  {" s/d "}
                                  {arc.end_date ? formatTanggal(arc.end_date) : "—"}
                                </TableCell>
                                <TableCell className="text-center text-sm">{arc.total_assets}</TableCell>
                                <TableCell className="text-center text-sm font-medium">{arc.total_audited}</TableCell>
                                <TableCell className="text-center text-sm text-chart-3 hidden sm:table-cell">{arc.total_baik}</TableCell>
                                <TableCell className="text-center text-sm text-destructive hidden sm:table-cell">{arc.total_rusak_ringan + arc.total_rusak_berat}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="outline" className={pct === 100 ? 'bg-chart-3/10 text-chart-3 border-chart-3/30' : 'bg-warning/10 text-warning border-warning/30'}>
                                    {pct}%
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ========== TAB 2: DAFTAR ASET ========== */}
        <TabsContent value="list" className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari kode atau nama aset…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-0.5 self-start">
              {[
                { key: "all" as const, label: "Semua" },
                { key: "belum" as const, label: "Belum Dicek" },
                { key: "sudah" as const, label: "Sudah Diaudit" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setStatusFilter(opt.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === opt.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Package className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Tidak ada aset ditemukan</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kode Aset</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nama Aset</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Lokasi</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kondisi</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Terakhir Cek</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssets.map((asset) => {
                      const kondisiStyle = assetKondisi(asset);
                      const tglCek = assetTerakhirDiaudit(asset);
                      return (
                        <TableRow key={asset.id}>
                          <TableCell className="font-mono text-xs sm:text-sm font-medium text-foreground max-w-[90px] sm:max-w-none truncate">{asset.kode_aset}</TableCell>
                          <TableCell className="text-sm text-foreground max-w-[120px] sm:max-w-none truncate">{asset.nama_aset}</TableCell>
                          <TableCell className="text-xs sm:text-sm text-muted-foreground hidden md:table-cell truncate max-w-[140px]">{assetLocation(asset)}</TableCell>
                          <TableCell>
                            <Badge className={`${kondisiStyle.bg} ${kondisiStyle.color} ${kondisiStyle.border} text-xs`}>
                              {kondisiStyle.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{tglCek}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={sensusActive ? "outline" : "ghost"}
                              className="gap-1.5"
                              disabled={!sensusActive}
                              onClick={() => navigate(`/dashboard/census/audit/${asset.id}`)}
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                              {sensusActive ? "Audit" : "Nonaktif"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Archive & Reset Dialog */}
      <Dialog open={archiveOpen} onOpenChange={(open) => !open && setArchiveOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-primary" />
              Tutup & Arsipkan Sensus
            </DialogTitle>
            <DialogDescription>
              Data sensus saat ini ({stats.audited} aset diaudit dari {stats.total}) akan disimpan sebagai arsip historis, lalu progres direset ke 0%.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="archive-name">Nama Periode Sensus <span className="text-destructive">*</span></Label>
              <Input
                id="archive-name"
                placeholder='Contoh: "Sensus Semester 1 2026"'
                value={archiveName}
                onChange={(e) => setArchiveName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rangkuman Yang Akan Diarsipkan</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-muted-foreground">Total Aset</span>
                <span className="font-medium text-foreground">{stats.total}</span>
                <span className="text-muted-foreground">Sudah Diaudit</span>
                <span className="font-medium text-foreground">{stats.audited}</span>
                <span className="text-muted-foreground">Baik</span>
                <span className="font-medium text-chart-3">{stats.baik}</span>
                <span className="text-muted-foreground">Rusak Ringan</span>
                <span className="font-medium text-warning">{stats.rusakRingan}</span>
                <span className="text-muted-foreground">Rusak Berat</span>
                <span className="font-medium text-destructive">{stats.rusakBerat}</span>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive">
                Setelah diarsipkan, seluruh data audit lapangan akan dihapus dan progres kembali ke 0%. Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)} disabled={resetting}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchiveAndReset}
              disabled={resetting || !archiveName.trim()}
              className="gap-2"
            >
              {resetting && <RotateCcw className="h-4 w-4 animate-spin" />}
              Simpan Arsip & Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
