import { useState, useCallback } from "react";
import { AlertCircle, Loader2, ExternalLink, FileText, Download, MessageCircle, Users, ClipboardCheck, Camera, MapPin, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const statusConfig: Record<string, { label: string; class: string }> = {
  Menunggu: { label: "Menunggu", class: "bg-warning/15 text-warning border-warning/30" },
  Diproses: { label: "Diproses", class: "bg-chart-3/15 text-chart-3 border-chart-3/30" },
  Selesai: { label: "Selesai", class: "bg-chart-1/15 text-chart-1 border-chart-1/30" },
};

interface ResolusiForm {
  aksi: string;
  biaya: string;
  catatan: string;
}

function formatPhone(raw: string): string {
  let num = raw.replace(/\D/g, "");
  if (num.startsWith("0")) num = "62" + num.slice(1);
  if (!num.startsWith("62")) num = "62" + num;
  return num;
}

function handlePrintBeritaAcara(report: any) {
  const assetData = report.assets as any;
  const resolusi = report.resolusi as Record<string, any> | null;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text("BERITA ACARA PEMELIHARAAN ASET", 105, 20, { align: "center" });
  doc.setFontSize(10);
  doc.text(`Tanggal cetak: ${new Date().toLocaleDateString("id-ID")}`, 105, 28, { align: "center" });

  doc.setLineWidth(0.5);
  doc.line(14, 32, 196, 32);

  const rows = [
    ["ID Tiket", report.id.substring(0, 8).toUpperCase()],
    ["Tanggal Laporan", new Date(report.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })],
    ["Nama Aset", assetData?.nama_aset ?? "-"],
    ["Kode Aset", assetData?.kode_aset ?? "-"],
    ["Judul Kendala", report.judul],
    ["Deskripsi Kendala", report.deskripsi || "-"],
    ["Nama Pelapor", report.nama_pelapor || "-"],
    ["Kontak Pelapor", report.kontak_pelapor || "-"],
    ["Tindakan (Resolusi)", resolusi?.aksi || "-"],
    ["Total Biaya", `Rp ${Math.round(Number(resolusi?.biaya || 0)).toLocaleString("id-ID")}`],
    ["Catatan Teknisi", resolusi?.catatan || "-"],
    ["Tanggal Selesai", resolusi?.resolved_at ? new Date(resolusi.resolved_at).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "-"],
  ];

  autoTable(doc, {
    startY: 38,
    head: [],
    body: rows,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { cellWidth: 130 },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? 180;

  doc.setFontSize(10);
  const sigY = finalY + 25;
  doc.text("Mengetahui,", 40, sigY, { align: "center" });
  doc.text("Pelapor,", 160, sigY, { align: "center" });
  doc.text("(______________________)", 40, sigY + 30, { align: "center" });
  doc.text("(______________________)", 160, sigY + 30, { align: "center" });

  doc.save(`Berita-Acara_${report.id.substring(0, 8)}.pdf`);
  toast.success("PDF Berita Acara berhasil di-download.");
}

function handleExportExcel(reports: any[]) {
  const rows = reports.map((r) => {
    const asset = r.assets as any;
    const resolusi = r.resolusi as Record<string, any> | null;
    return {
      "Tanggal": new Date(r.created_at).toLocaleDateString("id-ID"),
      "Nama Aset": asset?.nama_aset ?? "-",
      "Kode Aset": asset?.kode_aset ?? "-",
      "Judul": r.judul,
      "Deskripsi": r.deskripsi || "-",
      "Nama Pelapor": r.nama_pelapor || "-",
      "Kontak": r.kontak_pelapor || "-",
      "Status": r.status,
      "Tindakan": resolusi?.aksi || "-",
      "Biaya (Rp)": Number(resolusi?.biaya || 0),
      "Catatan": resolusi?.catatan || "-",
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Log Book");
  XLSX.writeFile(wb, `LogBook_Pemeliharaan_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast.success("Excel Log Book berhasil di-download.");
}

export default function DashboardReports() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("__all__");

  const [resolveReport, setResolveReport] = useState<any | null>(null);
  const [resolusiForm, setResolusiForm] = useState<ResolusiForm>({ aksi: "Diperbaiki", biaya: "", catatan: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal for evidence photos
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["asset_reports", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_reports")
        .select("*, assets(nama_aset, kode_aset)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: audits = [], isLoading: isLoadingAudits } = useQuery({
    queryKey: ["asset_audits_issues", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_audits")
        .select("*, assets!inner(nama_aset, kode_aset, company_id, custom_data)")
        .eq("assets.company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      const latestPerAsset = new Map<string, any>();
      data.forEach((audit: any) => {
        if (!latestPerAsset.has(audit.asset_id)) {
           latestPerAsset.set(audit.asset_id, audit);
        }
      });
      
      return Array.from(latestPerAsset.values()).filter(
        a => typeof a.kondisi === "string" && !a.kondisi.toLowerCase().includes("baik")
      );
    },
    enabled: !!companyId,
  });

  const filtered = filterStatus === "__all__"
    ? reports
    : reports.filter((r) => r.status === filterStatus);

  const handleStatusChange = useCallback(async (report: any, newStatus: string) => {
    if (newStatus === "Selesai") {
      setResolveReport(report);
      setResolusiForm({ aksi: "Diperbaiki", biaya: "", catatan: "" });
      return;
    }
    setUpdatingId(report.id);
    try {
      const { error } = await supabase
        .from("asset_reports")
        .update({ status: newStatus })
        .eq("id", report.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["asset_reports"] });
      toast.success(`Status diubah menjadi "${newStatus}".`);
    } catch (err: any) {
      toast.error(err.message || "Gagal mengubah status.");
    } finally {
      setUpdatingId(null);
    }
  }, [queryClient]);

  const handleResolve = useCallback(async () => {
    if (!resolveReport) return;
    setIsSubmitting(true);
    try {
      const resolusi = {
        aksi: resolusiForm.aksi,
        biaya: Math.round(Number(resolusiForm.biaya) || 0),
        catatan: resolusiForm.catatan,
        resolved_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("asset_reports")
        .update({ status: "Selesai", resolusi } as any)
        .eq("id", resolveReport.id);
      if (error) throw error;

      if (resolusiForm.aksi === "Dihapuskan" && resolveReport.asset_id) {
        const { data: asset } = await supabase
          .from("assets")
          .select("custom_data")
          .eq("id", resolveReport.asset_id)
          .single();

        const currentCustom = (asset?.custom_data as Record<string, any>) || {};
        const { error: assetErr } = await supabase
          .from("assets")
          .update({
            custom_data: { ...currentCustom, status_aset: "Usul Hapus" },
          })
          .eq("id", resolveReport.asset_id);
        if (assetErr) throw assetErr;
        await queryClient.invalidateQueries({ queryKey: ["assets"] });
      }

      if (resolusiForm.aksi === "Diganti" && resolveReport.asset_id) {
        const { data: asset } = await supabase
          .from("assets")
          .select("custom_data")
          .eq("id", resolveReport.asset_id)
          .single();

        const currentCustom = (asset?.custom_data as Record<string, any>) || {};
        const { error: assetErr } = await supabase
          .from("assets")
          .update({
            custom_data: { ...currentCustom, status_aset: "Unit Pengganti", Kondisi: "Baik" },
          })
          .eq("id", resolveReport.asset_id);
        if (assetErr) throw assetErr;
        await queryClient.invalidateQueries({ queryKey: ["assets"] });
      }

      await queryClient.invalidateQueries({ queryKey: ["asset_reports"] });
      toast.success("Tiket diselesaikan.");
      setResolveReport(null);
    } catch (err: any) {
      toast.error(err.message || "Gagal menyelesaikan tiket.");
    } finally {
      setIsSubmitting(false);
    }
  }, [resolveReport, resolusiForm, queryClient]);

  const counts = {
    Menunggu: reports.filter((r) => r.status === "Menunggu").length,
    Diproses: reports.filter((r) => r.status === "Diproses").length,
    Selesai: reports.filter((r) => r.status === "Selesai").length,
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Manajemen Masalah & Laporan</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tangani keluhan publik dan tindak lanjuti temuan sensus lapangan.
            </p>
          </div>
        </div>

        <Tabs defaultValue="public_reports" className="space-y-6">
          <TabsList className="bg-muted/50 p-1 inline-flex w-full sm:w-auto h-auto">
            <TabsTrigger value="public_reports" className="gap-2 px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Users className="h-4 w-4" />
              Keluhan Publik
              {counts.Menunggu > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 min-w-[20px] flex items-center justify-center text-[10px] rounded-full">
                  {counts.Menunggu}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="census_audits" className="gap-2 px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <ClipboardCheck className="h-4 w-4" />
              Temuan Sensus
              {audits.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 min-w-[20px] flex items-center justify-center text-[10px] rounded-full">
                  {audits.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: KELUHAN PUBLIK */}
          <TabsContent value="public_reports" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
            <div className="flex justify-between items-center bg-card p-3 rounded-lg border border-border/60">
              <div className="flex items-center gap-2">
                {Object.entries(counts).map(([status, count]) => (
                  <Badge key={status} variant="outline" className={statusConfig[status]?.class}>
                    {status}: {count}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder="Semua Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Semua Status</SelectItem>
                    <SelectItem value="Menunggu">Menunggu</SelectItem>
                    <SelectItem value="Diproses">Diproses</SelectItem>
                    <SelectItem value="Selesai">Selesai</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={() => handleExportExcel(filtered)} disabled={filtered.length === 0}>
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>

        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <AlertCircle className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">
                {reports.length === 0 ? "Belum ada laporan masuk" : "Tidak ada laporan dengan status ini"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tanggal</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aset</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pelapor</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Judul</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Deskripsi</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((report) => {
                    const assetData = report.assets as any;
                    const cfg = statusConfig[report.status ?? "Menunggu"] ?? statusConfig.Menunggu;
                    const resolusi = (report as any).resolusi as Record<string, any> | null;
                    return (
                      <TableRow key={report.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(report.created_at).toLocaleDateString("id-ID", {
                            day: "2-digit", month: "short", year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-foreground">{assetData?.nama_aset ?? "—"}</p>
                            <p className="text-xs font-mono text-muted-foreground">{assetData?.kode_aset ?? ""}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-foreground">{report.nama_pelapor || "—"}</p>
                            <p className="text-xs text-muted-foreground">{report.kontak_pelapor || ""}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-foreground max-w-[200px] truncate">
                          {report.judul}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden md:table-cell max-w-[250px]">
                          <p className="truncate">{report.deskripsi || "—"}</p>
                          {report.status === "Selesai" && resolusi?.aksi && (
                            <p className="text-xs mt-1 text-chart-1">
                              ✓ {resolusi.aksi} — Rp{Math.round(Number(resolusi.biaya || 0)).toLocaleString("id-ID")}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {updatingId === report.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Select
                              value={report.status ?? "Menunggu"}
                              onValueChange={(v) => handleStatusChange(report, v)}
                            >
                              <SelectTrigger className="h-8 w-[130px] text-xs">
                                <Badge variant="outline" className={cfg.class}>{cfg.label}</Badge>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Menunggu">Menunggu</SelectItem>
                                <SelectItem value="Diproses">Diproses</SelectItem>
                                <SelectItem value="Selesai">Selesai</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {report.kontak_pelapor && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-chart-1 hover:text-primary hover:bg-accent"
                                    onClick={() => window.open(`https://wa.me/${formatPhone(report.kontak_pelapor)}`, "_blank")}
                                  >
                                    <MessageCircle className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Chat WhatsApp Pelapor</TooltipContent>
                              </Tooltip>
                            )}
                            {report.status === "Selesai" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    onClick={() => handlePrintBeritaAcara(report)}
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Cetak Berita Acara (PDF)</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  onClick={() => window.open(`/scan/${report.asset_id}`, "_blank")}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Lihat Aset</TooltipContent>
                            </Tooltip>
                          </div>
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

        {/* TAB 2: TEMUAN SENSUS */}
        <TabsContent value="census_audits" className="space-y-4 focus-visible:outline-none focus-visible:ring-0">
          <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
            {isLoadingAudits ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : audits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ClipboardCheck className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Tidak ada temuan aset rusak dari sensus.</p>
              </div>
            ) : (
               <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tgl Sensus</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Auditor</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Informasi Aset</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kondisi</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rekomendasi</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Bukti</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audits.map((audit) => {
                       const assetData = audit.assets as any;
                       const customData = assetData?.custom_data as any || {};
                       const auditorName = customData["Auditor"] || "—";
                       return (
                         <TableRow key={audit.id}>
                           <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                             {new Date(audit.created_at).toLocaleDateString("id-ID", {
                               day: "2-digit", month: "short", year: "numeric",
                             })}
                           </TableCell>
                           <TableCell className="text-sm text-muted-foreground">
                              {auditorName}
                           </TableCell>
                           <TableCell>
                             <div>
                               <p className="text-sm font-medium text-foreground">{assetData?.nama_aset || "—"}</p>
                               <p className="text-xs font-mono text-muted-foreground">{assetData?.kode_aset || ""}</p>
                             </div>
                           </TableCell>
                           <TableCell>
                              <Badge variant="outline" className={audit.kondisi === "Rusak Berat" ? "bg-destructive/15 text-destructive border-destructive/30" : "bg-warning/15 text-warning border-warning/30"}>
                                {audit.kondisi}
                              </Badge>
                           </TableCell>
                           <TableCell>
                              <p className="text-sm font-medium">{audit.tindak_lanjut || "—"}</p>
                              {audit.catatan && <p className="text-xs text-muted-foreground mt-0.5 max-w-[150px] truncate" title={audit.catatan}>"{audit.catatan}"</p>}
                           </TableCell>
                           <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-2">
                                {audit.latitude && audit.longitude ? (
                                   <Tooltip>
                                     <TooltipTrigger asChild>
                                        <a href={`https://www.google.com/maps?q=${audit.latitude},${audit.longitude}`} target="_blank" rel="noopener noreferrer">
                                          <MapPin className="h-4 w-4 text-chart-3" />
                                        </a>
                                     </TooltipTrigger>
                                     <TooltipContent>Lihat di Google Maps</TooltipContent>
                                   </Tooltip>
                                ) : (
                                   <Tooltip>
                                     <TooltipTrigger>
                                        <MapPin className="h-4 w-4 text-muted-foreground/30" />
                                     </TooltipTrigger>
                                     <TooltipContent>GPS Tidak Ada</TooltipContent>
                                   </Tooltip>
                                )}
                                {audit.foto_url ? (
                                   <Tooltip>
                                     <TooltipTrigger asChild>
                                        <button onClick={() => setSelectedPhoto(audit.foto_url)} type="button" className="focus:outline-none">
                                          <Camera className="h-4 w-4 text-primary" />
                                        </button>
                                     </TooltipTrigger>
                                     <TooltipContent>Lihat Foto Bukti</TooltipContent>
                                   </Tooltip>
                                ) : (
                                   <Tooltip>
                                     <TooltipTrigger>
                                        <Camera className="h-4 w-4 text-muted-foreground/30" />
                                     </TooltipTrigger>
                                     <TooltipContent>Foto Tidak Ada</TooltipContent>
                                   </Tooltip>
                                )}
                              </div>
                           </TableCell>
                           <TableCell className="text-right">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 gap-1.5"
                                onClick={() => toast("Fitur eksekusi SPK & Disposal segera hadir.")}
                              >
                                <Wrench className="h-3.5 w-3.5" />
                                Eksekusi
                              </Button>
                           </TableCell>
                         </TableRow>
                       )
                    })}
                  </TableBody>
                </Table>
               </div>
            )}
          </div>
        </TabsContent>
        </Tabs>

        {/* Resolution Modal */}
        <Dialog open={!!resolveReport} onOpenChange={(open) => !open && setResolveReport(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Resolusi Tiket</DialogTitle>
              <DialogDescription>
                Lengkapi data penyelesaian untuk tiket: <strong>{resolveReport?.judul}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Aksi Tindakan</Label>
                <Select value={resolusiForm.aksi} onValueChange={(v) => setResolusiForm((f) => ({ ...f, aksi: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Diperbaiki">Diperbaiki</SelectItem>
                    <SelectItem value="Diganti">Diganti</SelectItem>
                    <SelectItem value="Dihapuskan">Dihapuskan</SelectItem>
                  </SelectContent>
                </Select>
                {resolusiForm.aksi === "Dihapuskan" && (
                  <p className="text-xs text-destructive">⚠ Aset akan ditandai sebagai "Usul Hapus".</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Total Biaya (Rp)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={resolusiForm.biaya}
                  onChange={(e) => setResolusiForm((f) => ({ ...f, biaya: e.target.value }))}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                />
              </div>
              <div className="space-y-2">
                <Label>Catatan Teknisi</Label>
                <Textarea
                  placeholder="Tuliskan catatan penyelesaian..."
                  value={resolusiForm.catatan}
                  onChange={(e) => setResolusiForm((f) => ({ ...f, catatan: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveReport(null)} disabled={isSubmitting}>
                Batal
              </Button>
              <Button onClick={handleResolve} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Selesaikan Tiket
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Photo Evidence Modal */}
        <Dialog open={!!selectedPhoto} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Foto Bukti Temuan Sensus</DialogTitle>
            </DialogHeader>
            <div className="p-2 border border-border rounded-lg bg-muted/40">
              {selectedPhoto && (
                <img 
                  src={selectedPhoto} 
                  alt="Bukti Sensus" 
                  className="w-full h-auto rounded-md object-contain max-h-[70vh]" 
                />
              )}
            </div>
            <DialogFooter>
               <Button variant="outline" onClick={() => setSelectedPhoto(null)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
