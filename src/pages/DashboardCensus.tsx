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
  RotateCcw, AlertTriangle, CalendarDays
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

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
  const scannerRef = useRef<any>(null);
  const scannedRef = useRef(false);
  const scannerContainerId = "qr-reader-census";

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

  // ─── Census statistics (based on Terakhir Diaudit) ───
  const stats = useMemo(() => {
    const total = assets.length;
    let baik = 0, rusakRingan = 0, rusakBerat = 0, belumDicek = 0;
    const auditDates: string[] = [];

    assets.forEach((asset) => {
      const cd = getCd(asset);
      const tglAudit = getTerakhirDiaudit(cd);

      if (!tglAudit) {
        // No audit date → belum dicek regardless of kondisi bawaan
        belumDicek++;
        return;
      }

      auditDates.push(tglAudit);
      const kondisi = getKondisi(cd);
      if (kondisi === "Baik") baik++;
      else if (kondisi === "Rusak Ringan") rusakRingan++;
      else if (kondisi === "Rusak Berat" || kondisi === "Dalam Perbaikan") rusakBerat++;
      else belumDicek++;
    });

    const audited = total - belumDicek;
    const progress = total > 0 ? Math.round((audited / total) * 100) : 0;

    // Periode: earliest and latest audit dates
    auditDates.sort();
    const periodeAwal = auditDates.length > 0 ? auditDates[0] : null;
    const periodeAkhir = auditDates.length > 0 ? auditDates[auditDates.length - 1] : null;

    return { total, baik, rusakRingan, rusakBerat, belumDicek, audited, progress, periodeAwal, periodeAkhir };
  }, [assets]);

  // ─── Filtered list ────────────────────────────────────
  const filteredAssets = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return assets.filter((a) => {
      if (q && !a.nama_aset.toLowerCase().includes(q) && !a.kode_aset.toLowerCase().includes(q)) return false;
      // Status filter
      if (statusFilter !== "all") {
        const cd = getCd(a);
        const hasAudit = !!getTerakhirDiaudit(cd);
        if (statusFilter === "sudah" && !hasAudit) return false;
        if (statusFilter === "belum" && hasAudit) return false;
      }
      return true;
    });
  }, [assets, searchQuery, statusFilter]);

  // ─── Reset Sensus ─────────────────────────────────────
  const handleResetSensus = async () => {
    if (!companyId) return;
    setResetting(true);
    try {
      // Fetch all assets for this company
      const { data: allAssets, error: fetchErr } = await supabase
        .from("assets")
        .select("id, custom_data")
        .eq("company_id", companyId);
      if (fetchErr) throw fetchErr;

      // Mass-update: clear audit fields from custom_data
      const updates = (allAssets || []).map((a) => {
        const cd = (typeof a.custom_data === "object" && a.custom_data && !Array.isArray(a.custom_data))
          ? { ...(a.custom_data as Record<string, Json>) }
          : {};
        delete cd["Terakhir Diaudit"];
        delete cd["Tindak Lanjut Sensus"];
        delete cd["Auditor"];
        // Keep Kondisi bawaan as-is but it won't count towards progress without Terakhir Diaudit

        return supabase.from("assets").update({ custom_data: cd }).eq("id", a.id);
      });

      await Promise.all(updates);
      queryClient.invalidateQueries({ queryKey: ["census-assets"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success("Siklus sensus direset. Progres kembali ke 0%.");
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal mereset sensus.");
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

      // Summary
      doc.setFontSize(9);
      doc.text(
        `Total Aset: ${stats.total}  |  Sudah Diaudit: ${stats.audited}  |  Belum Dicek: ${stats.belumDicek}`,
        pageW / 2, 42, { align: "center" }
      );

      // Table — only audited assets
      const auditedAssets = assets.filter((a) => !!getTerakhirDiaudit(getCd(a)));

      const tableBody = auditedAssets.map((a, idx) => {
        const cd = getCd(a);
        return [
          String(idx + 1),
          a.kode_aset || "—",
          a.nama_aset || "—",
          getKondisi(cd) || "—",
          formatTanggal(getTerakhirDiaudit(cd)),
          (cd?.["Tindak Lanjut Sensus"] as string) || "—",
        ];
      });

      // Use functional API (not prototype method)
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
      doc.text("Mengetahui,", 30, sigY, { align: "center" });
      doc.text("Pimpinan", 30, sigY + 5, { align: "center" });
      doc.text("(________________________)", 30, sigY + 30, { align: "center" });
      doc.text("Auditor Lapangan,", pageW - 30, sigY, { align: "center" });
      doc.text("", pageW - 30, sigY + 5, { align: "center" });
      doc.text("(________________________)", pageW - 30, sigY + 30, { align: "center" });

      doc.save("Berita_Acara_Sensus.pdf");
      toast.success("PDF Berita Acara berhasil di-download!");
    } catch (error: any) {
      console.error("PDF export error:", error);
      toast.error("Gagal cetak PDF: " + (error.message || "Unknown error"));
    }
  };

  // ─── Helpers ──────────────────────────────────────────
  function assetLocation(a: typeof assets[0]) {
    return getSmartLocation(getCd(a), a.kode_divisi);
  }

  function assetKondisi(a: typeof assets[0]) {
    return getKondisiStyle(getKondisi(getCd(a)));
  }

  function assetTerakhirDiaudit(a: typeof assets[0]): string {
    return formatTanggal(getTerakhirDiaudit(getCd(a)));
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Sensus Aset
          </h1>
          {/* Periode Sensus */}
          <div className="flex items-center gap-1.5 mt-1">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {stats.periodeAwal
                ? `Periode: ${formatTanggal(stats.periodeAwal)} s/d ${formatTanggal(stats.periodeAkhir)}`
                : "Periode Sensus: Belum dimulai"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <Button className="gap-2" size="sm" onClick={() => setScannerOpen(true)}>
            <Camera className="h-4 w-4" />
            Scan QR
          </Button>
          <Button className="gap-2" size="sm" variant="outline" onClick={handleCetakPDF} disabled={stats.audited === 0}>
            <FileText className="h-4 w-4" />
            Cetak Berita Acara
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="gap-2" size="sm" variant="destructive" disabled={resetting}>
                <RotateCcw className="h-4 w-4" />
                Mulai Sensus Baru
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Reset Siklus Sensus?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Semua data "Terakhir Diaudit" dan "Tindak Lanjut Sensus" akan dihapus dari seluruh aset.
                  Progres sensus akan kembali ke <strong>0%</strong>. Data histori di tabel <code>asset_audits</code> tetap aman.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetSensus} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Ya, Reset Sensus
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
          {isLoading ? (
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
                          <TableCell className="font-mono text-sm font-medium text-foreground">{asset.kode_aset}</TableCell>
                          <TableCell className="text-sm text-foreground">{asset.nama_aset}</TableCell>
                          <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{assetLocation(asset)}</TableCell>
                          <TableCell>
                            <Badge className={`${kondisiStyle.bg} ${kondisiStyle.color} ${kondisiStyle.border} text-xs`}>
                              {kondisiStyle.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{tglCek}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => navigate(`/dashboard/census/audit/${asset.id}`)}
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                              Audit
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
    </div>
  );
}
