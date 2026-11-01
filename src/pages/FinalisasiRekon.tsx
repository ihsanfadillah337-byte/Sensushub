import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCustomColumns } from "@/contexts/CustomColumnsContext";
import {
  Archive, Search, ChevronLeft, ChevronRight, Loader2, Package,
  Printer, Download, Filter, Calendar, FileCheck2, FileText, Upload, CheckCircle2
} from "lucide-react";
import { generateBeritaAcaraPDF, generateSuratPernyataanPDF, type DualPdfInput } from "@/utils/pdfGenerators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

// ─── Local Types ─────────────────────────────────────────
interface ArchiveRow {
  id: string;
  company_id: string;
  nomor_surat?: string;
  tanggal_surat?: string | null;
  tanggal_penelusuran?: string | null;
  jenis_kib?: string | null;
  total_aset?: number | null;
  total_nilai?: number | null;
  kode_barang_list?: any;
  tembusan?: any;
  data_otorisasi?: any;
  status?: string | null;
  status_approval?: string | null;
  dokumen_url?: string | null;
  created_at?: string | null;
}

// ─── Helpers (copied & adapted from PengajuanSuratPage) ──
function _psField(a: any, ...keys: string[]): string {
  if (!a || typeof a !== "object") return "-";
  if (Array.isArray(a)) {
    for (const el of a) { const v = _psField(el, ...keys); if (v && v !== "-") return v; }
    return "-";
  }
  if (a.aset_detail) { const v = _psField(a.aset_detail, ...keys); if (v && v !== "-") return v; }
  if (a.assets) { const v = _psField(a.assets, ...keys); if (v && v !== "-") return v; }
  for (const k of keys) {
    const v = a[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  const cd = typeof a.custom_data === "object" && a.custom_data ? a.custom_data : null;
  if (cd && typeof cd === "object") {
    for (const k of keys) {
      const v = (cd as Record<string, any>)[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
  }
  return "-";
}

function _psNumber(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.,-]/g, "").replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function _psKode(a: any) { return _psField(a, "Kode Barang", "kode_barang", "kode_aset", "kodeBarang", "kode", "kode_barang_inventaris"); }
function _psNama(a: any) { return _psField(a, "Nama Barang", "nama_barang", "nama_aset", "namaBarang", "nama"); }
function _psSpesifikasi(a: any) { return _psField(a, "Spesifikasi Nama Barang", "spesifikasi_nama_barang", "Spesifikasi", "spesifikasi", "spesifikasiBarang"); }
function _psMerek(a: any) { return _psField(a, "Merek/Type", "merek_type", "Merek/Type Barang", "merek", "type", "tipe", "merk"); }
function _psBahan(a: any) { return _psField(a, "Bahan", "bahan"); }
function _psLokasi(a: any) { return _psField(a, "Lokasi", "lokasi", "Lokasi Ruangan", "lokasi_ruangan", "Lokasi Barang"); }
function _psNomorPolisi(a: any) { return _psField(a, "Nomor Polisi", "nomor_polisi", "no_polisi", "NoPol", "no polisi", "nopol", "Nomor Pol"); }
function _psMetodePerolehan(a: any) { return _psField(a, "Metode Perolehan", "metode_perolehan", "cara_perolehan", "asal_perolehan", "Perolehan"); }
function _psBidangPengguna(a: any) { return _psField(a, "Bidang Pengguna", "bidang_pengguna", "Pengguna", "pengguna", "Bidang", "bidang"); }
function _psKeterangan(a: any) { return _psField(a, "Keterangan", "keterangan", "Ket", "ket"); }
function _psKondisi(a: any) { return _psField(a, "Kondisi", "kondisi", "Kondisi Fisik", "kondisi_fisik", "Kondisi Barang"); }
function _psNilai(a: any): number {
  if (!a || typeof a !== "object") return 0;
  // Support 3-level nested array path
  if (Array.isArray(a)) return a.reduce((acc, it) => acc + _psNilai(it), 0);
  if (a.aset_detail) return _psNilai(a.aset_detail);
  if (a.assets) return _psNilai(a.assets);
  const cd = typeof a.custom_data === "object" && a.custom_data ? a.custom_data as Record<string, any> : null;
  const checkKeys = ["Nilai Aset", "Nilai Perolehan", "harga", "nilai_perolehan", "nilai_aset", "Harga Perolehan", "harga_perolehan", "total_harga"];
  for (const k of checkKeys) {
    const ra = a[k]; const rn = _psNumber(ra);
    if (rn > 0) return rn;
    if (cd) {
      const rc = cd[k]; const cn = _psNumber(rc);
      if (cn > 0) return cn;
    }
  }
  return 0;
}

function _psFlatten(arc: ArchiveRow): any[] {
  const list: any[] = [];
  try {
    if (Array.isArray(arc.data_otorisasi)) { list.push(...arc.data_otorisasi); }
    else if (typeof arc.data_otorisasi === "object" && arc.data_otorisasi !== null) {
      const obj: any = arc.data_otorisasi;
      if (Array.isArray(obj.aset_detail)) list.push(...obj.aset_detail);
      if (Array.isArray(obj.assets)) list.push(...obj.assets);
      if (Array.isArray(obj.lampiran_data)) list.push(...obj.lampiran_data);
    }
  } catch {}
  return list;
}

function _psBuildLampiranRows(arc: ArchiveRow): { rows: any[]; headers: string[]; nilaiKey: string; total: number } {
  const legacyOtor = typeof arc.data_otorisasi === "object" && arc.data_otorisasi !== null ? arc.data_otorisasi : {};
  if (Array.isArray((legacyOtor as any).lampiran_data) && (legacyOtor as any).lampiran_data.length > 0) {
    const rows = (legacyOtor as any).lampiran_data;
    const headers = Array.isArray((legacyOtor as any).lampiran_headers) && (legacyOtor as any).lampiran_headers.length > 0
      ? (legacyOtor as any).lampiran_headers
      : Object.keys(rows[0]).filter(k => k.toLowerCase() !== "no");
    const nilaiKey = headers.find((h: string) => h.toLowerCase().includes("nilai") || h.toLowerCase().includes("harga")) || "";
    let total = 0;
    if (typeof arc.total_nilai === "number" && arc.total_nilai > 0) total = arc.total_nilai;
    else if (nilaiKey) rows.forEach((r: any) => { total += _psNumber(r[nilaiKey]); });
    return { rows, headers, nilaiKey, total };
  }
  const flat = _psFlatten(arc);
  const kbList: any[] = Array.isArray(arc.kode_barang_list) ? arc.kode_barang_list : [];
  const merged: any[] = [];
  const seenKode = new Set<string>();
  flat.forEach(it => { const k = _psKode(it); if (k) seenKode.add(k); merged.push(it); });
  kbList.forEach(kb => {
    if (typeof kb === "string") { if (!seenKode.has(kb)) { seenKode.add(kb); merged.push({ kode_barang: kb }); } }
    else if (kb && typeof kb === "object") {
      const k = _psKode(kb);
      if (k && !seenKode.has(k)) { seenKode.add(k); merged.push(kb); }
    }
  });
  const headers = [
    "Kode Barang", "Nama Barang", "Spesifikasi Nama Barang", "Merek/Type", "Bahan",
    "Lokasi", "Nomor Polisi", "Metode Perolehan", "Bidang Pengguna", "Keterangan",
    "Kondisi", "Nilai Perolehan",
  ];
  const nilaiKey = "Nilai Perolehan";
  let total = 0;
  const rows = merged.map((it, idx) => {
    const n = _psNilai(it);
    total += n;
    return {
      "No": idx + 1,
      "Kode Barang": _psKode(it) || "-",
      "Nama Barang": _psNama(it),
      "Spesifikasi Nama Barang": _psSpesifikasi(it),
      "Merek/Type": _psMerek(it),
      "Bahan": _psBahan(it),
      "Lokasi": _psLokasi(it),
      "Nomor Polisi": _psNomorPolisi(it),
      "Metode Perolehan": _psMetodePerolehan(it),
      "Bidang Pengguna": _psBidangPengguna(it),
      "Keterangan": _psKeterangan(it),
      "Kondisi": _psKondisi(it),
      "Nilai Perolehan": n,
    };
  });
  if (typeof arc.total_nilai === "number" && arc.total_nilai > 0 && total === 0) total = arc.total_nilai;
  return { rows, headers, nilaiKey, total };
}

// ─── Reprint Dialog (Arsip) ───────────────────────────────
function ReprintDialog({ arc, onClose, tenantSettings }: { arc: ArchiveRow; onClose: () => void; tenantSettings?: any }) {
  const ot = arc.data_otorisasi || {};
  const tmb: string[] = (arc.tembusan || []).filter((t: string) => t?.trim());
  const tglSuratRaw = arc.tanggal_surat || "";
  const tglSurat = tglSuratRaw ? new Date(tglSuratRaw).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const [previewing, setPreviewing] = useState<"" | "BA" | "SP">("");

  const built = _psBuildLampiranRows(arc);
  const totalNilaiDisplay = built.total > 0 ? built.total : (typeof arc.total_nilai === "number" ? arc.total_nilai : 0);
  const jumlahAsetDisplay =
    (typeof arc.total_aset === "number" && arc.total_aset > 0) ? arc.total_aset : built.rows.length;

  // Rekonstruksi input generator dari data arsip (fallback ke metadata batch bila perlu).
  const buildInput = (): DualPdfInput => ({
    tenantSettings,
    nomorBA: ot.nomorBA || arc.nomor_surat || "",
    tanggalBA: ot.tanggalBA || tglSuratRaw,
    nomorSP: ot.nomorSP || arc.nomor_surat || "",
    tanggalSP: ot.tanggalSP || tglSuratRaw,
    assets: Array.isArray(ot.aset_detail) ? ot.aset_detail : built.rows,
    namaKadis: ot.nama || "",
    nipKadis: ot.nip || "",
    jabatanKadis: ot.jabatan || "",
    timPemeriksa: Array.isArray(ot.tim_pemeriksa) ? ot.tim_pemeriksa : [],
    tembusan: tmb,
    tglPenelusuran: arc.tanggal_penelusuran || "",
  });

  const openDraft = async (kind: "BA" | "SP") => {
    setPreviewing(kind);
    try {
      const input = buildInput();
      const blob = kind === "BA" 
        ? await generateBeritaAcaraPDF(input) 
        : await generateSuratPernyataanPDF(input);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error(err);
      toast.error("Gagal membuat pratinjau PDF.");
    } finally {
      setPreviewing("");
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-blue-700" /> Unduh Ulang Surat</DialogTitle>
        </DialogHeader>
        <div className="rounded-md border border-gray-200 p-4 space-y-2 bg-gray-50 text-[13px]">
          <p><strong>ID Unik Batch:</strong> {arc.nomor_surat || "—"}</p>
          <p><strong>Tanggal:</strong> {tglSurat}</p>
          <p><strong>Jenis KIB:</strong> {arc.jenis_kib || "—"}</p>
          <p><strong>Jumlah Aset:</strong> {jumlahAsetDisplay} item</p>
          <p><strong>Total Nilai:</strong> Rp {totalNilaiDisplay.toLocaleString("id-ID")}</p>
          <p><strong>Kepala Dinas:</strong> {ot.nama || "—"} (NIP. {ot.nip || "—"})</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={() => openDraft("BA")} disabled={previewing !== ""} className="gap-1.5">
            {previewing === "BA" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Lihat Draf BA
          </Button>
          <Button variant="outline" onClick={() => openDraft("SP")} disabled={previewing !== ""} className="gap-1.5">
            {previewing === "SP" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Lihat Draf SP
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Upload Scan Dialog ───────────────────────────────────
function UploadScanDialog({ arc, onClose, onSuccess }: { arc: ArchiveRow; onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      toast.error("Silakan pilih file terlebih dahulu.");
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${arc.id}_${Date.now()}.${fileExt}`;
      const filePath = `arsip/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("dokumen_usulan")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("dokumen_usulan")
        .getPublicUrl(filePath);

      // Update document_archives
      const { error: updateArcError } = await supabase
        .from("document_archives")
        .update({
          status: "Menunggu Verifikasi BKAD",
          status_approval: "menunggu_bkad",
          dokumen_url: publicUrl
        })
        .eq("id", arc.id);

      if (updateArcError) throw updateArcError;

      // Update status_rekon seluruh aset yang terikat dengan batch ini.
      // ID aset diambil dari snapshot `data_otorisasi` (kode_barang_list hanya
      // menyimpan kode barang, bukan UUID aset).
      const assetIds = Array.from(new Set(
        _psFlatten(arc)
          .map((a: any) => a?.id || a?.asset_id)
          .filter((v: any) => typeof v === "string" && v)
      ));

      if (assetIds.length > 0) {
        // custom_data adalah JSONB; ambil dulu agar field lain tidak hilang saat di-merge.
        const { data: assets, error: fetchError } = await supabase
          .from("assets")
          .select("id, custom_data")
          .in("id", assetIds);
        if (fetchError) throw fetchError;

        const updates = (assets ?? []).map((a: any) => {
          const cd = (typeof a.custom_data === "object" && a.custom_data) ? a.custom_data : {};
          return supabase
            .from("assets")
            .update({ custom_data: { ...cd, status_rekon: "menunggu_bkad" } })
            .eq("id", a.id);
        });
        const results = await Promise.all(updates);
        const firstErr = results.find((r: any) => r.error);
        if (firstErr?.error) throw firstErr.error;
      }

      toast.success("Dokumen berhasil diunggah dan diajukan ke BKAD.");
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengunggah dokumen.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-700" /> Unggah & Ajukan Scan Dokumen
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="text-[13px] text-gray-600 space-y-2">
            <p>Silakan unggah file scan Surat Pernyataan yang telah ditandatangani basah untuk melanjutkan proses pengajuan ke BKAD.</p>
            <p className="font-medium text-amber-700">Format yang didukung: PDF, Gambar (JPG, PNG)</p>
          </div>
          
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="scan-file">Pilih File</Label>
            <Input
              id="scan-file"
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={uploading}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Batal
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading} className="gap-1.5 bg-blue-700 hover:bg-blue-800">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Simpan & Ajukan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Constants ───────────────────────────────────────────
const ITEMS_PER_PAGE = 10;

// ─── Component ───────────────────────────────────────────
export default function FinalisasiRekon() {
  const { companyId } = useAuth();
  // Master KIB ditarik dari Supabase (tabel companies.master_kib) via context,
  // sehingga opsi filter selalu sinkron dengan data master instansi.
  const { masterKib } = useCustomColumns();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterKib, setFilterKib] = useState<string>("all");
  const [tglFrom, setTglFrom] = useState("");
  const [tglTo, setTglTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [reprintArc, setReprintArc] = useState<ArchiveRow | null>(null);
  const [uploadArc, setUploadArc] = useState<ArchiveRow | null>(null);

  // Fetch document_archives (hanya yang BERITA ACARA DITETAPKAN — sorted newest first)
  const { data: archives = [], isLoading } = useQuery({
    queryKey: ["document-archives-ba", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_archives")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((arc: any) => {
        const status = String(arc.status || "").trim();
        // TOLAK mentah-mentah jika status masih antrean BKAD
        if (status === "Disetujui BKAD") return false;
        // Arsip yang sudah diajukan tetap tampil agar progres status terlihat jelas
        if (arc.status_approval === "menunggu_bkad") return true;
        // HANYA lolos jika ada indikasi kuat sudah menjadi arsip Berita Acara
        return status.includes("Berita Acara") || status.includes("Ditetapkan");
      }) as ArchiveRow[];
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 2,
  });

  // Fetch tenant settings (logo + kop identity PDF)
  const { data: tenantSettings } = useQuery({
    queryKey: ["tenant-settings", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Filter + search + pagination (all client side, tolerant)
  const filteredArchives = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const fromD = tglFrom ? new Date(tglFrom + "T00:00:00") : null;
    const toD = tglTo ? new Date(tglTo + "T23:59:59") : null;
    return (archives as ArchiveRow[]).filter(arc => {
      if (q) {
        const inNo = (arc.nomor_surat || "").toLowerCase().includes(q);
        const inId = (arc.id || "").toLowerCase().includes(q);
        if (!inNo && !inId) return false;
      }
      if (filterKib !== "all") {
        const k = (arc.jenis_kib || "").toLowerCase();
        const t = filterKib.toLowerCase();
        const norm = (s: string) => s.replace(/[^a-z0-9]/gi, "");
        if (norm(k) !== norm(t)) return false;
      }
      if (arc.tanggal_surat) {
        const d = new Date(arc.tanggal_surat);
        if (fromD && d < fromD) return false;
        if (toD && d > toD) return false;
      }
      return true;
    });
  }, [archives, searchQuery, filterKib, tglFrom, tglTo]);

  const totalItems = filteredArchives.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const indexOfFirstItem = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const indexOfLastItem = indexOfFirstItem + ITEMS_PER_PAGE;
  const currentItems = filteredArchives.slice(indexOfFirstItem, indexOfLastItem);

  const pageNumbers = useMemo(() => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push("...");
      for (let i = Math.max(2, safeCurrentPage - 1); i <= Math.min(totalPages - 1, safeCurrentPage + 1); i++) pages.push(i);
      if (safeCurrentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, safeCurrentPage]);

  const formatTgl = (d: string | null | undefined) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return "—"; }
  };

  const clearFilter = () => {
    setSearchQuery(""); setFilterKib("all"); setTglFrom(""); setTglTo(""); setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 sm:h-6 sm:w-6 text-blue-700" />
            Arsip Berita Acara
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Pusat arsip resmi Berita Acara penerbitan BMD. Cari, filter, dan cetak ulang dokumen lengkap dengan lampiran.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
        <Archive className="h-4 w-4 text-blue-700 mt-0.5 shrink-0" />
        <p className="text-[13px] text-blue-800 leading-relaxed">
          Dokumen yang diterbitkan oleh Wizard akan langsung muncul di sini. Gunakan tombol <strong>Cetak</strong> untuk mengunduh ulang
          PDF lengkap dengan lampiran, atau <strong>Ajukan</strong> untuk mengunggah scan Surat Pernyataan bertanda tangan basah
          dan meneruskannya ke meja verifikasi BKAD.
        </p>
      </div>

      {/* Filter + Search Card */}
      <Card className="bg-white border border-gray-200 rounded-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Filter className="h-4 w-4" /> Pencarian &amp; Filter Arsip
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Cari berdasarkan ID Unik Batch / Nomor Surat..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Select value={filterKib} onValueChange={(v) => { setFilterKib(v); setCurrentPage(1); }}>
                <SelectTrigger><SelectValue placeholder="Filter Jenis KIB" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua KIB</SelectItem>
                  {masterKib
                    .filter((k) => !!k.label)
                    .map((k) => (
                      <SelectItem key={k.id} value={k.label}>{k.label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilter}
                className="shrink-0 text-gray-500 hover:text-gray-900"
                title="Reset filter"
              >
                Reset
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                type="date"
                value={tglFrom}
                onChange={(e) => { setTglFrom(e.target.value); setCurrentPage(1); }}
                className="pl-9"
                placeholder="Tanggal dari"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                type="date"
                value={tglTo}
                onChange={(e) => { setTglTo(e.target.value); setCurrentPage(1); }}
                className="pl-9"
                placeholder="Tanggal sampai"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table card */}
      <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}
          </div>
        ) : filteredArchives.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Package className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">
              {archives.length === 0 ? "Belum ada arsip Berita Acara yang diterbitkan." : "Tidak ada arsip yang cocok dengan filter."}
            </p>
            <p className="text-xs mt-1">
              {archives.length === 0 ? "Gunakan menu Pengajuan Surat untuk menerbitkan Berita Acara baru." : "Coba ubah kata kunci atau reset filter."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 text-center">No</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200">ID Unik Batch / Nomor Surat</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200">Tanggal</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200">Jenis KIB</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 text-center">Jumlah Aset</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 text-right">Total Nilai</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 text-center">Status</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 text-center w-48">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems.map((arc, i) => {
                    const built = _psBuildLampiranRows(arc);
                    const jumlahAset =
                      (typeof arc.total_aset === "number" && arc.total_aset > 0)
                        ? arc.total_aset
                        : (built.rows.length || _psFlatten(arc).length);
                    const totalNilai =
                      (typeof arc.total_nilai === "number" && arc.total_nilai > 0)
                        ? arc.total_nilai
                        : built.total;
                    return (
                      <TableRow key={arc.id} className="hover:bg-gray-50">
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-800 text-center">{indexOfFirstItem + i + 1}</TableCell>
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-800 font-medium">{arc.nomor_surat || <span className="text-gray-500 italic">—</span>}</TableCell>
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-800">{formatTgl(arc.tanggal_surat)}</TableCell>
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-800">{arc.jenis_kib || "—"}</TableCell>
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-800 text-center">{jumlahAset}</TableCell>
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-800 text-right font-semibold">Rp {totalNilai.toLocaleString("id-ID")}</TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            variant="outline" 
                            className={`px-2 py-0.5 text-[11px] font-semibold rounded border inline-flex items-center ${
                              arc.status_approval === "menunggu_bkad" 
                                ? "bg-amber-50 text-amber-700 border-amber-200" 
                                : "bg-green-50 text-green-700 border-green-200"
                            }`}
                          >
                            {arc.status || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 hover:bg-gray-50"
                              onClick={() => setReprintArc(arc)}
                              title="Cetak ulang Berita Acara lengkap dengan lampiran aset"
                            >
                              <Printer className="h-4 w-4 text-blue-700" />
                              <span className="text-xs font-medium text-blue-700">Cetak</span>
                            </Button>
                            
                            {(arc.status_approval === "draft" || !arc.status_approval) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5 hover:bg-gray-50"
                                onClick={() => setUploadArc(arc)}
                                title="Unggah scan dokumen & ajukan ke BKAD"
                              >
                                <Upload className="h-4 w-4 text-amber-600" />
                                <span className="text-xs font-medium text-amber-600">Ajukan</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-500">
                Menampilkan <strong>{indexOfFirstItem + 1}</strong>–<strong>{Math.min(indexOfLastItem, totalItems)}</strong> dari <strong>{totalItems}</strong> arsip
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safeCurrentPage === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {pageNumbers.map((pn, idx) => (
                  pn === "..." ? (
                    <span key={`e-${idx}`} className="px-2 text-xs text-gray-500">…</span>
                  ) : (
                    <Button
                      key={pn}
                      size="sm"
                      variant={pn === safeCurrentPage ? "default" : "ghost"}
                      onClick={() => setCurrentPage(pn as number)}
                      className="h-8 w-8 p-0 text-xs font-medium"
                    >
                      {pn}
                    </Button>
                  )
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {reprintArc && (
        <ReprintDialog
          arc={reprintArc}
          onClose={() => setReprintArc(null)}
          tenantSettings={tenantSettings}
        />
      )}

      {uploadArc && (
        <UploadScanDialog
          arc={uploadArc}
          onClose={() => setUploadArc(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["document-archives-ba"] })}
        />
      )}
    </div>
  );
}
