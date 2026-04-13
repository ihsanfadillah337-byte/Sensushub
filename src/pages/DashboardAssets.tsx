import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getKondisi, getKondisiStyle } from "@/lib/kondisi";
import { getSmartLocation } from "@/lib/smartLocation";
import { Plus, Eye, Trash2, Pencil, Package, Printer, Loader2, Search, X, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Helper: resolve smart location from asset's custom_data
function assetSmartLocation(a: { custom_data: unknown; kode_divisi: string | null }): string {
  const cd = typeof a.custom_data === "object" && a.custom_data && !Array.isArray(a.custom_data)
    ? (a.custom_data as Record<string, unknown>)
    : null;
  return getSmartLocation(cd, a.kode_divisi);
}

export default function DashboardAssets() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { companyId, companyName } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPrinting, setIsPrinting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterKategori, setFilterKategori] = useState("__all__");
  const [filterLokasi, setFilterLokasi] = useState("__all__");

  // Single delete
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nama: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk delete
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["assets", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const kategoriOptions = useMemo(() => [...new Set(assets.map((a) => a.kategori))].sort(), [assets]);
  const lokasiOptions = useMemo(() => [...new Set(assets.map((a) => assetSmartLocation(a)))].filter((l) => l !== "-").sort(), [assets]);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return assets.filter((a) => {
      if (q && !a.nama_aset.toLowerCase().includes(q) && !a.kode_aset.toLowerCase().includes(q)) return false;
      if (filterKategori !== "__all__" && a.kategori !== filterKategori) return false;
      if (filterLokasi !== "__all__" && assetSmartLocation(a) !== filterLokasi) return false;
      return true;
    });
  }, [assets, searchQuery, filterKategori, filterLokasi]);

  const allSelected = filteredAssets.length > 0 && filteredAssets.every((a) => selectedIds.has(a.id));
  const someSelected = filteredAssets.some((a) => selectedIds.has(a.id)) && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredAssets.map((a) => a.id)));
  }, [allSelected, filteredAssets]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("assets").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(`Aset "${deleteTarget.nama}" berhasil dihapus.`);
    } catch (err: any) {
      toast.error(err.message || "Gagal menghapus aset.");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, queryClient]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    try {
      const { error } = await supabase.from("assets").delete().in("id", ids);
      if (error) throw error;
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(`${ids.length} aset berhasil dihapus.`);
    } catch (err: any) {
      toast.error(err.message || "Gagal menghapus aset.");
    } finally {
      setIsBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  }, [selectedIds, queryClient]);

  const handlePrintLabels = useCallback(async () => {
    const selected = assets.filter((a) => selectedIds.has(a.id));
    if (selected.length === 0) return;
    selected.sort((a, b) => a.kategori.localeCompare(b.kategori));
    setIsPrinting(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { default: LabelPDF } = await import("@/components/LabelPDF");
      const blob = await pdf(
        <LabelPDF
          assets={selected.map((a: any) => ({
            id: a.id, kode_aset: a.kode_aset, nama_aset: a.nama_aset,
            kategori: a.kategori,
            kode_divisi: a.kode_divisi || null,
            kib: a.kib || null,
            custom_data: (typeof a.custom_data === "object" && a.custom_data ? a.custom_data : {}) as Record<string, unknown>,
          }))}
          companyName={companyName || "Perusahaan Saya"}
          baseUrl={window.location.origin}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "Label-Aset.pdf";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Berhasil men-download label untuk ${selected.length} aset!`);
    } catch (err) {
      console.error(err);
      toast.error("Gagal membuat PDF.");
    } finally {
      setIsPrinting(false);
    }
  }, [assets, selectedIds]);

  const getExportData = useCallback(() => {
    if (selectedIds.size > 0) {
      return assets.filter((a) => selectedIds.has(a.id));
    }
    return assets;
  }, [assets, selectedIds]);

  const handleExportExcel = useCallback(async () => {
    const exportData = getExportData();
    if (exportData.length === 0) return;
    setIsExportingExcel(true);
    try {
      const XLSX = await import("xlsx");
      const customKeys = Array.from(new Set(exportData.flatMap((a) => Object.keys(typeof a.custom_data === "object" && a.custom_data ? a.custom_data as Record<string, unknown> : {}))));
      const mapRow = (a: typeof assets[0], idx: number) => {
        const row: Record<string, unknown> = { No: idx + 1, "Kode Aset": a.kode_aset, "Nama Aset": a.nama_aset, Kategori: a.kategori, "Lokasi / Ruangan": assetSmartLocation(a) };
        const cd = typeof a.custom_data === "object" && a.custom_data ? a.custom_data as Record<string, unknown> : {};
        customKeys.forEach((k) => { row[k] = cd[k] ?? ""; });
        return row;
      };

      const autoWidth = (ws: any, rows: Record<string, unknown>[]) => {
        if (rows.length === 0) return;
        const keys = Object.keys(rows[0]);
        ws["!cols"] = keys.map((k) => {
          const maxLen = Math.max(k.length, ...rows.map((r) => String(r[k] ?? "").length));
          return { wch: Math.min(maxLen + 2, 50) };
        });
      };

      const wb = XLSX.utils.book_new();
      const allRows = exportData.map((a, i) => mapRow(a, i));
      const ws1 = XLSX.utils.json_to_sheet(allRows);
      autoWidth(ws1, allRows);
      XLSX.utils.book_append_sheet(wb, ws1, "Semua Aset");
      const grouped: Record<string, typeof assets> = {};
      exportData.forEach((a) => { const key = (a.kib as string) || "Tanpa KIB"; (grouped[key] ??= []).push(a); });
      Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).forEach(([kib, items]) => {
        const rows = items.map((a, i) => mapRow(a, i));
        const ws = XLSX.utils.json_to_sheet(rows);
        autoWidth(ws, rows);
        XLSX.utils.book_append_sheet(wb, ws, kib.slice(0, 31));
      });
      const filename = selectedIds.size > 0 ? `Laporan_Aset_Terpilih_${selectedIds.size}.xlsx` : "Laporan_Audit_Aset.xlsx";
      XLSX.writeFile(wb, filename);
      toast.success(`File Excel berhasil di-download! (${exportData.length} aset)`);
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal membuat file Excel.");
    } finally {
      setIsExportingExcel(false);
    }
  }, [assets, selectedIds, getExportData]);

  const handleExportPDF = useCallback(async () => {
    const exportData = getExportData();
    if (exportData.length === 0) return;
    setIsExportingPDF(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const title = selectedIds.size > 0
        ? `Laporan Aset Terpilih (${exportData.length}) - ${companyName || "Perusahaan"}`
        : `Laporan Inventaris Aset - ${companyName || "Perusahaan"}`;
      doc.setFontSize(16);
      doc.text(title, 14, 18);
      doc.setFontSize(10);
      doc.text(`Tanggal: ${new Date().toLocaleDateString("id-ID")}`, 14, 26);
      const body = exportData.map((a, i) => [i + 1, a.kode_aset, a.nama_aset, a.kategori, assetSmartLocation(a)]);
      autoTable(doc, {
        startY: 32,
        head: [["No", "Kode Aset", "Nama Aset", "Kategori", "Lokasi / Ruangan"]],
        body,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [41, 128, 185] },
      });

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`${companyName || "Perusahaan"} — Dicetak: ${new Date().toLocaleDateString("id-ID")}`, 14, pageH - 8);
        doc.text(`Halaman ${i} / ${totalPages}`, pageW - 14, pageH - 8, { align: "right" });
      }

      const filename = selectedIds.size > 0 ? `Laporan_Aset_Terpilih_${selectedIds.size}.pdf` : "Laporan_Audit_Aset.pdf";
      doc.save(filename);
      toast.success(`File PDF berhasil di-download! (${exportData.length} aset)`);
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal membuat file PDF.");
    } finally {
      setIsExportingPDF(false);
    }
  }, [assets, selectedIds, companyName, getExportData]);

  const activeFilterCount = [searchQuery, filterKategori !== "__all__", filterLokasi !== "__all__"].filter(Boolean).length;
  const clearFilters = () => { setSearchQuery(""); setFilterKategori("__all__"); setFilterLokasi("__all__"); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Daftar Aset</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Kelola semua aset inventaris perusahaan Anda.</p>
        </div>
        <div className="flex items-center gap-2 self-start flex-wrap">
          {selectedIds.size > 0 && (
            <>
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Hapus Terpilih ({selectedIds.size})
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" disabled={isPrinting} onClick={handlePrintLabels}>
                {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Cetak Label ({selectedIds.size})
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" disabled={isExportingExcel || assets.length === 0} onClick={handleExportExcel}>
            {isExportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Export Excel{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={isExportingPDF || assets.length === 0} onClick={handleExportPDF}>
            {isExportingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Export PDF{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => navigate("/dashboard/assets/new")}>
            <Plus className="h-4 w-4" />
            Tambah Aset
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cari nama aset..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterKategori} onValueChange={setFilterKategori}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Semua Kategori" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Semua Kategori</SelectItem>
            {kategoriOptions.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterLokasi} onValueChange={setFilterLokasi}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Semua Lokasi" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Semua Lokasi</SelectItem>
            {lokasiOptions.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground shrink-0" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />Reset
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">{assets.length === 0 ? "Belum ada aset" : "Tidak ada aset yang cocok"}</p>
            <p className="text-xs mt-1">{assets.length === 0 ? "Klik '+ Tambah Aset' untuk memulai." : "Coba ubah filter pencarian Anda."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      ref={(el) => { if (el) (el as unknown as HTMLInputElement).indeterminate = someSelected; }}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kode Aset</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nama Aset</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Kategori</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Kondisi</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Lokasi</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssets.map((asset) => (
                  <TableRow key={asset.id} data-state={selectedIds.has(asset.id) ? "selected" : undefined}>
                    <TableCell><Checkbox checked={selectedIds.has(asset.id)} onCheckedChange={() => toggleOne(asset.id)} /></TableCell>
                    <TableCell className="font-mono text-sm font-medium text-foreground">{asset.kode_aset}</TableCell>
                    <TableCell className="text-sm text-foreground">
                      <div className="flex items-center gap-1.5">
                        {asset.nama_aset}
                        {(() => {
                          const cd = typeof asset.custom_data === "object" && asset.custom_data && !Array.isArray(asset.custom_data) ? asset.custom_data as Record<string, unknown> : null;
                          if (cd?.["status_aset"] === "Unit Pengganti") {
                            return <Badge variant="outline" className="bg-chart-3/10 text-chart-3 border-chart-3/30 text-[10px] px-1.5 py-0 leading-4 shrink-0">Pengganti</Badge>;
                          }
                          if (cd?.["status_aset"] === "Usul Hapus") {
                            return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] px-1.5 py-0 leading-4 shrink-0">Usul Hapus</Badge>;
                          }
                          return null;
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary">{asset.kategori}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {(() => {
                        const cd = typeof asset.custom_data === "object" && asset.custom_data && !Array.isArray(asset.custom_data) ? asset.custom_data as Record<string, unknown> : null;
                        const kondisi = getKondisi(cd);
                        const style = getKondisiStyle(kondisi);
                        return <Badge className={`${style.bg} ${style.color} ${style.border} text-xs`}>{style.label}</Badge>;
                      })()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{assetSmartLocation(asset)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => navigate(`/dashboard/assets/${asset.id}/edit`)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => window.open(`/scan/${asset.id}`, "_blank")}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget({ id: asset.id, nama: asset.nama_aset })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Single Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Aset?</AlertDialogTitle>
            <AlertDialogDescription>
              Aset <span className="font-semibold text-foreground">"{deleteTarget?.nama}"</span> akan dihapus secara permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {selectedIds.size} Aset?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua aset yang dipilih akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isBulkDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isBulkDeleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Hapus Semua
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
