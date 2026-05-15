import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getSmartLocation } from "@/lib/smartLocation";
import {
  FileCheck2, Search, ChevronLeft, ChevronRight, Loader2, Package,
  ShieldCheck, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

// ─── Constants ───────────────────────────────────────────
const TARGET_KONDISI = "Diusulkan Reklasifikasi (Rusak Berat)";
const FINAL_KONDISI = "Rusak Berat";
const ITEMS_PER_PAGE = 15;

// ─── Helpers ─────────────────────────────────────────────
function getCd(asset: any): Record<string, unknown> | null {
  return typeof asset.custom_data === "object" && asset.custom_data && !Array.isArray(asset.custom_data)
    ? (asset.custom_data as Record<string, unknown>)
    : null;
}

function assetSmartLocation(a: any): string {
  return getSmartLocation(getCd(a), a.kode_divisi);
}

// ─── Component ───────────────────────────────────────────
export default function FinalisasiRekon() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // ─── Fetch only reklasifikasi assets ─────────────────
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["finalisasi-rekon-assets", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("company_id", companyId!)
        .order("kode_aset", { ascending: true });
      if (error) throw error;
      // Client-side filter: only show assets with Kondisi = TARGET_KONDISI
      return (data ?? []).filter((a: any) => {
        const cd = getCd(a);
        return cd?.["Kondisi"] === TARGET_KONDISI;
      });
    },
    enabled: !!companyId,
  });

  // ─── Filter + pagination ──────────────────────────────
  const filteredAssets = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (a: any) =>
        a.nama_aset.toLowerCase().includes(q) ||
        a.kode_aset.toLowerCase().includes(q)
    );
  }, [assets, searchQuery]);

  const totalItems = filteredAssets.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const indexOfFirstItem = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const indexOfLastItem = indexOfFirstItem + ITEMS_PER_PAGE;
  const currentAssets = filteredAssets.slice(indexOfFirstItem, indexOfLastItem);

  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push("...");
      for (let i = Math.max(2, safeCurrentPage - 1); i <= Math.min(totalPages - 1, safeCurrentPage + 1); i++) pages.push(i);
      if (safeCurrentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, safeCurrentPage]);

  // ─── Selection helpers ────────────────────────────────
  const allSelected = filteredAssets.length > 0 && filteredAssets.every((a: any) => selectedIds.has(a.id));
  const someSelected = filteredAssets.some((a: any) => selectedIds.has(a.id)) && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredAssets.map((a: any) => a.id)));
  }, [allSelected, filteredAssets]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ─── Finalisasi logic ─────────────────────────────────
  const handleFinalisasi = async () => {
    if (selectedIds.size === 0) return;
    setIsFinalizing(true);
    try {
      const ids = Array.from(selectedIds);

      // Fetch current custom_data for each selected asset
      const { data: rows, error: fetchErr } = await supabase
        .from("assets")
        .select("id, custom_data")
        .in("id", ids);
      if (fetchErr) throw fetchErr;

      // Update each asset: set Kondisi = FINAL_KONDISI, status_usulan = "Selesai"
      const updates = (rows ?? []).map((asset: any) => {
        const cd = (typeof asset.custom_data === "object" && asset.custom_data)
          ? { ...(asset.custom_data as Record<string, any>) }
          : {};
        return supabase
          .from("assets")
          .update({
            custom_data: {
              ...cd,
              Kondisi: FINAL_KONDISI,
              status_usulan: "Selesai",
            },
          })
          .eq("id", asset.id);
      });

      const results = await Promise.all(updates);
      const firstErr = results.find((r) => r.error);
      if (firstErr?.error) throw firstErr.error;

      toast.success(
        `✅ ${ids.length} aset berhasil difinalisasi menjadi "${FINAL_KONDISI}".`
      );
      setSelectedIds(new Set());
      setConfirmOpen(false);

      // Refresh queries
      queryClient.invalidateQueries({ queryKey: ["finalisasi-rekon-assets"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Gagal memfinalisasi aset.");
    } finally {
      setIsFinalizing(false);
    }
  };

  // ─── Render ───────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Finalisasi Rekonsiliasi
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Aset yang sudah direkonsiliasi dengan SIMDA dan siap dikunci status menjadi{" "}
            <span className="font-semibold text-destructive">Rusak Berat</span>.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground self-start"
          disabled={selectedIds.size === 0}
          onClick={() => setConfirmOpen(true)}
        >
          <ShieldCheck className="h-4 w-4" />
          Finalisasi Rusak Berat ({selectedIds.size})
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
        <p className="text-sm text-orange-700 dark:text-orange-400 leading-relaxed">
          Halaman ini hanya menampilkan aset berstatus{" "}
          <span className="font-semibold">🔶 Diusulkan Reklasifikasi (Rusak Berat)</span>. Pastikan Anda telah
          melakukan rekonsiliasi manual dengan pihak SIMDA sebelum memfinalisasi. Tindakan ini tidak dapat
          dibatalkan secara otomatis.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari kode atau nama aset..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          className="pl-9"
        />
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">
              {assets.length === 0
                ? "Tidak ada aset yang menunggu finalisasi"
                : "Tidak ada aset yang cocok dengan pencarian"}
            </p>
            <p className="text-xs mt-1">
              {assets.length === 0
                ? "Semua aset sudah terfinalisasi atau belum ada yang diusulkan."
                : "Coba ubah kata kunci pencarian."}
            </p>
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
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">KIB</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Lokasi</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status Saat Ini</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentAssets.map((asset: any) => (
                  <TableRow
                    key={asset.id}
                    data-state={selectedIds.has(asset.id) ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => toggleOne(asset.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(asset.id)}
                        onCheckedChange={() => toggleOne(asset.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs sm:text-sm font-medium text-foreground max-w-[110px] truncate">
                      {asset.kode_aset}
                    </TableCell>
                    <TableCell className="text-sm text-foreground max-w-[200px] truncate">
                      {asset.nama_aset}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary">{asset.kib || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell truncate max-w-[160px]">
                      {assetSmartLocation(asset)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30 text-[10px] px-1.5 py-0.5 leading-4 whitespace-nowrap"
                      >
                        Usul Reklasifikasi
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination Footer */}
        {!isLoading && totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border/60">
            <p className="text-xs text-muted-foreground order-2 sm:order-1">
              Menampilkan{" "}
              <span className="font-medium text-foreground">
                {indexOfFirstItem + 1}–{Math.min(indexOfLastItem, totalItems)}
              </span>{" "}
              dari{" "}
              <span className="font-medium text-foreground">{totalItems}</span> aset
            </p>
            <div className="flex items-center gap-1 order-1 sm:order-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {pageNumbers.map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p as number)}
                    className={`h-8 w-8 rounded-md text-xs font-medium transition-colors ${
                      p === safeCurrentPage
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                    aria-label={`Halaman ${p}`}
                    aria-current={p === safeCurrentPage ? "page" : undefined}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Halaman berikutnya"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-destructive" />
              Finalisasi {selectedIds.size} Aset?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              Anda akan mengubah status{" "}
              <span className="font-semibold text-foreground">{selectedIds.size} aset</span> ini secara
              resmi menjadi{" "}
              <span className="font-semibold text-destructive">"{FINAL_KONDISI}"</span>.
              <br /><br />
              Pastikan Anda sudah melakukan rekonsiliasi manual dengan pihak{" "}
              <span className="font-semibold">SIMDA</span> sebelum melanjutkan.{" "}
              <span className="font-semibold text-destructive">Tindakan ini tidak dapat dibatalkan secara otomatis.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isFinalizing}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFinalisasi}
              disabled={isFinalizing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isFinalizing && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Ya, Finalisasi Sekarang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
