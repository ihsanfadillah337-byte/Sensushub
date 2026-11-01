import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { getKondisi, getKondisiStyle } from "@/lib/kondisi";
import { getSmartLocation } from "@/lib/smartLocation";
import {
  ClipboardCheck, Search, Package, ScanLine, Camera, FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── Helpers ────────────────────────────────────────────
function getCd(asset: any): Record<string, unknown> | null {
  return typeof asset.custom_data === "object" && asset.custom_data && !Array.isArray(asset.custom_data)
    ? (asset.custom_data as Record<string, unknown>) : null;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "belum" | "sudah">("all");
  const [scannerOpen, setScannerOpen] = useState(false);
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

  // ─── Audit data from asset_audits (source of truth) ───
  const { data: auditsRaw = [] } = useQuery({
    queryKey: ["census-audits", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_audits")
        .select("id, asset_id, kondisi, tindak_lanjut, catatan, kesesuaian_kib, rekomendasi_auditor, lokasi_aktual, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Build a map: asset_id → latest audit record
  const auditMap = useMemo(() => {
    const map = new Map<string, typeof auditsRaw[number]>();
    // Filter only audits for assets in this company
    const companyAssetIds = new Set(assets.map(a => a.id));
    auditsRaw.forEach((audit) => {
      if (!companyAssetIds.has(audit.asset_id)) return;
      if (!map.has(audit.asset_id)) map.set(audit.asset_id, audit);
    });
    return map;
  }, [auditsRaw, assets]);

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
              toast.error("Format QR tidak valid untuk SIPPA-BMD.");
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

  const handleExportArchiveExcel = () => {
    const exportData = filteredAssets.filter((a) => auditMap.has(a.id));

    if (exportData.length === 0) {
      toast.info("Tidak ada aset yang sudah diaudit pada filter ini.");
      return;
    }

    let totalNilai = 0;

    const rows = exportData.map((asset, index) => {
      const cd = getCd(asset) || {};
      const audit = auditMap.get(asset.id);

      // Sapu Jagat pencarian Nilai Perolehan / Harga
      let nilaiRaw: any = (asset as any).nilai_perolehan || (asset as any).harga;

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
        const strVal = String(nilaiRaw).split(",")[0];
        const parsed = Number(strVal.replace(/[^0-9]/g, ""));
        if (!isNaN(parsed)) {
          num = parsed;
        }
      }

      totalNilai += num;
      const nilaiFormatted = num === 0 ? "0" : num.toLocaleString("id-ID");

      let tglPelaksanaan = "—";
      let waktu = "—";
      const createdAt = audit?.created_at;
      if (createdAt) {
        const d = new Date(createdAt);
        tglPelaksanaan = d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
        waktu = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", ".");
      }

      return {
        "No": index + 1,
        "Tgl Pelaksanaan": tglPelaksanaan,
        "Waktu": waktu,
        "Kode Barang": asset.kode_aset,
        "Nama Barang": asset.nama_aset,
        "Lokasi Aktual": audit?.lokasi_aktual || "—",
        "Kondisi": audit?.kondisi || "—",
        "Kesesuaian KIB": audit?.kesesuaian_kib || "—",
        "Rekomendasi": audit?.rekomendasi_auditor || audit?.tindak_lanjut || "—",
        "Catatan / Keterangan": audit?.catatan || "—",
        "Nilai Perolehan": nilaiFormatted,
      };
    });

    const totalRow = {
      "No": "",
      "Tgl Pelaksanaan": "",
      "Waktu": "",
      "Kode Barang": "",
      "Nama Barang": "TOTAL KESELURUHAN",
      "Lokasi Aktual": "",
      "Kondisi": "",
      "Kesesuaian KIB": "",
      "Rekomendasi": "",
      "Catatan / Keterangan": "",
      "Nilai Perolehan": totalNilai > 0 ? totalNilai.toLocaleString("id-ID") : "0",
    };

    rows.push(totalRow as any);

    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [
      { wch: 5 },  // No
      { wch: 15 }, // Tgl Pelaksanaan
      { wch: 10 }, // Waktu
      { wch: 20 }, // Kode Barang
      { wch: 35 }, // Nama Barang
      { wch: 25 }, // Lokasi Aktual
      { wch: 15 }, // Kondisi
      { wch: 15 }, // Kesesuaian KIB
      { wch: 25 }, // Rekomendasi
      { wch: 40 }, // Catatan
      { wch: 20 }, // Nilai Perolehan
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Arsip Sensus");

    const dateStr = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `Arsip_Sensus_Excel_${dateStr}.xlsx`);
  };

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

  // ─── Render ───────────────────────────────────────────
  return (
    <div className="space-y-6">
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

      {/* Mulai Audit Lapangan */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="h-12 w-12 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
            <ScanLine className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Mulai Audit Lapangan</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tekan "Scan Sekarang" atau pilih aset dari daftar di bawah untuk mulai mengaudit.
            </p>
          </div>
          <Button className="gap-1.5 shrink-0" onClick={() => setScannerOpen(true)}>
            <Camera className="h-4 w-4" />
            Scan Sekarang
          </Button>
        </CardContent>
      </Card>

      {/* Daftar Aset */}
      <div className="space-y-4">
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
                    ? "bg-white text-gray-900"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            className="gap-2 self-start border border-gray-300 bg-white text-gray-700 rounded-md text-xs hover:bg-gray-50"
            onClick={handleExportArchiveExcel}
          >
            <FileText className="h-4 w-4 text-primary" />
            Export Arsip (Excel)
          </Button>
        </div>

        <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
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
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200">Kode Aset</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200">Nama Aset</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 hidden md:table-cell">Lokasi</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200">Kondisi</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 hidden sm:table-cell">Terakhir Cek</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.map((asset) => {
                    const kondisiStyle = assetKondisi(asset);
                    const tglCek = assetTerakhirDiaudit(asset);
                    return (
                      <TableRow key={asset.id} className="hover:bg-gray-50">
                        <TableCell className="py-1.5 px-2.5 text-[13px] font-mono font-medium text-gray-800 max-w-[90px] sm:max-w-none truncate">{asset.kode_aset}</TableCell>
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-800 max-w-[120px] sm:max-w-none truncate">{asset.nama_aset}</TableCell>
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-500 hidden md:table-cell truncate max-w-[140px]">{assetLocation(asset)}</TableCell>
                        <TableCell className="py-1.5 px-2.5">
                          <Badge className={`px-2 py-0.5 text-[11px] font-semibold rounded border inline-flex items-center ${kondisiStyle.bg} ${kondisiStyle.color} ${kondisiStyle.border}`}>
                            {kondisiStyle.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-500 hidden sm:table-cell">{tglCek}</TableCell>
                        <TableCell className="py-1.5 px-2.5 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 rounded-md text-xs"
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
      </div>
    </div>
  );
}
