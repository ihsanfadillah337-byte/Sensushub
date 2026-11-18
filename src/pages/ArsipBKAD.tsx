import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Archive, Eye, FileText, Loader2, Package, ExternalLink,
  CheckCircle2, XCircle, AlertTriangle, Users, Download,
  FileSpreadsheet, FileDown, ClipboardList, CalendarDays, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Database } from "@/integrations/supabase/types";

type DocumentArchiveRow = Database["public"]["Tables"]["document_archives"]["Row"];

interface OtorisasiAset {
  asset_id?: string;
  id?: string;
  kode_aset?: string;
  nama_aset?: string;
  nama_barang?: string;
  kode_barang?: string;
  kib?: string;
  KIB?: string;
  tahun_perolehan?: string | number;
  "Tahun Perolehan"?: string | number;
  tanggal_perolehan?: string;
  rekon_rekomendasi?: string;
  rekomendasi?: string;
  Kondisi?: string;
  kondisi?: string;
  nilai_perolehan?: number;
  "Nilai Perolehan"?: number;
  "Nilai Aset"?: number;
  harga?: number;
  assetData?: {
    id?: string;
    nama_barang?: string;
    nama_aset?: string;
    kode_aset?: string;
    kib?: string;
    tahun_perolehan?: string | number;
    "Tahun Perolehan"?: string | number;
    tanggal_perolehan?: string;
    nilai_perolehan?: number;
    Kondisi?: string;
    "Nilai Aset"?: number;
    "Nilai Perolehan"?: number;
  };
}

// ─── Normalisasi label KIB (hindari "KIB TAK TERDEFINISI") ───
const KIB_BY_CODE: Record<string, string> = {
  "01": "KIB A - Tanah",
  "02": "KIB B - Peralatan & Mesin",
  "03": "KIB C - Gedung & Bangunan",
  "04": "KIB D - Jalan/Irigasi/Jaringan",
  "05": "KIB E - Aset Tetap Lainnya",
};
const KIB_BY_LETTER: Record<string, string> = {
  a: KIB_BY_CODE["01"],
  b: KIB_BY_CODE["02"],
  c: KIB_BY_CODE["03"],
  d: KIB_BY_CODE["04"],
  e: KIB_BY_CODE["05"],
};

function normalizeKibLabel(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "KIB Lainnya";
  const lower = s.toLowerCase();
  const containsLainnya = lower.includes("aset lainnya") || lower.includes("ekstrakomptabel");
  // Pengecualian lebih dulu: label "Aset Lainnya"/"Ekstrakomptabel" TANPA awalan kode 01/02/03/05
  // (mis. "04 - Aset Lainnya") dipastikan KIB Lainnya — bukan KIB D (Jalan/Irigasi/Jaringan).
  const startsWithOtherKibCode = /^\s*0[1235]/.test(s);
  if (containsLainnya && !startsWithOtherKibCode) return "KIB Lainnya";
  // Pencocokan kode 01–05: awalan tanpa \b agar kode_aset seperti "02030101001" tetap terbaca.
  const code = s.match(/^(0[1-5])/)?.[1] || s.match(/\b(0[1-5])\b/)?.[1];
  if (code && KIB_BY_CODE[code]) return KIB_BY_CODE[code];
  // Setelah kode 01–05 tidak cocok → baru cek label "aset lainnya"/"ekstrakomptabel".
  if (containsLainnya) return "KIB Lainnya";
  const letter = s.match(/kib\s*[-.]?\s*([a-e])/i)?.[1];
  if (letter && KIB_BY_LETTER[letter.toLowerCase()]) return KIB_BY_LETTER[letter.toLowerCase()];
  return "KIB Lainnya";
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

function getKodeBarang(item: OtorisasiAset): string {
  return (
    item.kode_barang ||
    item.kode_aset ||
    item.assetData?.kode_aset ||
    item.asset_id ||
    item.id ||
    "—"
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

function getTahunPerolehan(item: OtorisasiAset): string {
  const candidates: unknown[] = [
    item.tahun_perolehan,
    item["Tahun Perolehan"],
    item.tanggal_perolehan,
    item.assetData?.tahun_perolehan,
    item.assetData?.["Tahun Perolehan"],
    item.assetData?.tanggal_perolehan,
  ];
  for (const c of candidates) {
    if (c === null || c === undefined) continue;
    const s = String(c).trim();
    if (!s) continue;
    const y = s.match(/\b(19|20)\d{2}\b/);
    return y ? y[0] : s;
  }
  return "—";
}

function getAsalKib(doc: DocumentArchiveRow, item: OtorisasiAset): string {
  const raw = item.kib || item.KIB || item.assetData?.kib || doc.jenis_kib || "";
  if (raw) return normalizeKibLabel(String(raw));
  const kode = getKodeBarang(item);
  const m = String(kode).match(/^(\d{2})/);
  if (m) return normalizeKibLabel(m[1]);
  return "KIB Lainnya";
}

function getNomorDokumen(doc: DocumentArchiveRow): { ba: string; sp: string } {
  let obj: any = {};
  if (typeof doc.data_otorisasi === "object" && doc.data_otorisasi !== null && !Array.isArray(doc.data_otorisasi)) {
    obj = doc.data_otorisasi as any;
  }
  const fallback = doc.nomor_surat || "—";
  return {
    ba: obj.nomorBA || obj.no_berita_acara || fallback,
    sp: obj.nomorSP || obj.no_surat_pernyataan || fallback,
  };
}

function formatTanggal(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function formatTanggalSingkat(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
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
  return 0;
}

function statusMeta(doc: DocumentArchiveRow) {
  const approved = doc.status_approval === "disetujui";
  return approved
    ? { label: doc.status || "Disetujui BKAD", cls: "bg-green-50 text-green-700 border-green-200", Icon: CheckCircle2 }
    : { label: doc.status || "Ditolak BKAD", cls: "bg-red-50 text-red-700 border-red-200", Icon: XCircle };
}

interface RekapRow {
  key: string;
  companyId: string;
  skpdName: string;
  nomorBA: string;
  nomorSP: string;
  tanggal: string | null;
  kodeBarang: string;
  namaAset: string;
  tahunPerolehan: string;
  asalKib: string;
  nilai: number;
}

export default function ArsipBKAD() {
  const { companyId, role, loading } = useAuth();
  const isBKAD = role === "staf_bkad";

  const [activeTab, setActiveTab] = useState<"arsip" | "rekap">("arsip");

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentArchiveRow | null>(null);

  // ── Filter Rekapitulasi Mutasi ──
  const [dariTanggal, setDariTanggal] = useState("");
  const [sampaiTanggal, setSampaiTanggal] = useState("");
  const [filterSKPD, setFilterSKPD] = useState("__all__");
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const { data: archives = [], isLoading } = useQuery({
    queryKey: ["document-archives-bkad", companyId, isBKAD],
    queryFn: async () => {
      // Staf BKAD melihat seluruh arsip lintas SKPD (konsisten dengan tab Rekapitulasi);
      // akun SKPD tetap dibatasi ke company_id miliknya.
      let query = supabase
        .from("document_archives")
        .select("*")
        .in("status_approval", ["disetujui", "ditolak"]);
      if (!isBKAD) query = query.eq("company_id", companyId!);
      const { data, error } = await query.order("approved_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentArchiveRow[];
    },
    enabled: !!companyId || isBKAD,
    staleTime: 1000 * 60 * 2,
  });

  // ── Sumber data Rekapitulasi Mutasi (seluruh bundel disetujui, lintas SKPD) ──
  const { data: rekapDocs = [], isLoading: isLoadingRekap } = useQuery({
    queryKey: ["rekap-mutasi-bkad"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_archives")
        .select("id, company_id, nomor_surat, jenis_kib, approved_at, created_at, status_approval, data_otorisasi")
        .eq("status_approval", "disetujui")
        .order("approved_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentArchiveRow[];
    },
    staleTime: 1000 * 60 * 2,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-name-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string | null }[];
    },
    staleTime: 1000 * 60 * 10,
  });

  const companyNameById = useMemo(() => {
    const m = new Map<string, string>();
    companies.forEach((c) => m.set(c.id, c.name || "SKPD Tanpa Nama"));
    return m;
  }, [companies]);

  const rekapRows = useMemo<RekapRow[]>(() => {
    const out: RekapRow[] = [];
    rekapDocs.forEach((doc) => {
      const list = flattenOtorisasiArray(doc);
      const { ba, sp } = getNomorDokumen(doc);
      const tanggal = doc.approved_at || doc.created_at || null;
      const skpdName = companyNameById.get(doc.company_id) || "SKPD Tanpa Nama";
      list.forEach((item, i) => {
        out.push({
          key: `${doc.id}-${i}`,
          companyId: doc.company_id,
          skpdName,
          nomorBA: ba,
          nomorSP: sp,
          tanggal,
          kodeBarang: getKodeBarang(item),
          namaAset: getNamaAset(item),
          tahunPerolehan: getTahunPerolehan(item),
          asalKib: getAsalKib(doc, item),
          nilai: getNilaiPerolehan(item),
        });
      });
    });
    return out;
  }, [rekapDocs, companyNameById]);

  const skpdOptions = useMemo(() => {
    const m = new Map<string, string>();
    rekapRows.forEach((r) => m.set(r.companyId, r.skpdName));
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rekapRows]);

  const filteredRekap = useMemo(() => {
    const hasDateFilter = !!dariTanggal || !!sampaiTanggal;
    const from = dariTanggal ? new Date(`${dariTanggal}T00:00:00`).getTime() : null;
    const to = sampaiTanggal ? new Date(`${sampaiTanggal}T23:59:59`).getTime() : null;
    return rekapRows.filter((r) => {
      if (filterSKPD !== "__all__" && r.companyId !== filterSKPD) return false;
      if (hasDateFilter) {
        if (!r.tanggal) return false;
        const t = new Date(r.tanggal).getTime();
        if (from !== null && t < from) return false;
        if (to !== null && t > to) return false;
      }
      return true;
    });
  }, [rekapRows, filterSKPD, dariTanggal, sampaiTanggal]);

  const totalUnit = filteredRekap.length;
  const totalNilai = useMemo(() => filteredRekap.reduce((s, r) => s + r.nilai, 0), [filteredRekap]);

  const resetRekapFilter = () => {
    setDariTanggal("");
    setSampaiTanggal("");
    setFilterSKPD("__all__");
  };

  const activeRekapFilterCount =
    [!!dariTanggal, !!sampaiTanggal, filterSKPD !== "__all__"].filter(Boolean).length;

  const nomorDokumenLabel = (r: RekapRow): string => {
    if (r.nomorBA && r.nomorSP && r.nomorBA !== r.nomorSP) return `${r.nomorBA} / ${r.nomorSP}`;
    return r.nomorBA || r.nomorSP || "—";
  };

  // ─── Export Excel (.xlsx) ───
  const handleExportRekapExcel = async () => {
    if (filteredRekap.length === 0) {
      toast.error("Tidak ada data mutasi sesuai filter untuk diekspor.");
      return;
    }
    setIsExportingExcel(true);
    try {
      const XLSX = await import("xlsx");
      const header = [
        "No", "Nama SKPD Asal", "Nomor BA & SP", "Tanggal Persetujuan",
        "Kode Barang", "Nama Aset", "Tahun Perolehan", "Asal KIB", "Nilai Perolehan (Rp)",
      ];
      const body = filteredRekap.map((r, i) => [
        i + 1,
        r.skpdName,
        nomorDokumenLabel(r),
        formatTanggalSingkat(r.tanggal),
        r.kodeBarang,
        r.namaAset,
        r.tahunPerolehan,
        r.asalKib,
        r.nilai,
      ]);
      const emptyRow = new Array(header.length).fill("");
      const totalRow = ["", "", "", "", "", "TOTAL NILAI MUTASI", "", "", totalNilai];
      const aoa: any[][] = [header, ...body, emptyRow, totalRow];

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // Format angka ribuan pada seluruh sel kolom "Nilai Perolehan (Rp)" (kolom I),
      // termasuk baris TOTAL di bagian bawah.
      for (let r = 2; r <= aoa.length; r++) {
        const cell = ws[`I${r}`];
        if (cell) cell.z = "#,##0";
      }
      ws["!cols"] = [
        { wch: 5 }, { wch: 32 }, { wch: 24 }, { wch: 18 }, { wch: 22 },
        { wch: 38 }, { wch: 14 }, { wch: 22 }, { wch: 18 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rekap Mutasi");
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Laporan_Rekapitulasi_Mutasi_Ekstrakomptabel_${stamp}.xlsx`);
      toast.success(`Excel berhasil diunduh (${filteredRekap.length} aset).`);
    } catch (err) {
      console.error(err);
      toast.error("Gagal membuat file Excel.");
    } finally {
      setIsExportingExcel(false);
    }
  };

  // ─── Export PDF (Laporan Pimpinan) ───
  const handleExportRekapPDF = async () => {
    if (filteredRekap.length === 0) {
      toast.error("Tidak ada data mutasi sesuai filter untuk diekspor.");
      return;
    }
    setIsExportingPDF(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      const title1 = "LAPORAN REKAPITULASI MUTASI ASET KE ASET LAINNYA (EKSTRAKOMPTABEL)";
      const title2 = "PEMERINTAH KABUPATEN BANDUNG";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12.5);
      doc.text(title1, pageW / 2, 15, { align: "center" });
      doc.setFontSize(11);
      doc.text(title2, pageW / 2, 21, { align: "center" });

      const periode = `${dariTanggal ? formatTanggalSingkat(dariTanggal) : "Awal"} s.d. ${sampaiTanggal ? formatTanggalSingkat(sampaiTanggal) : "Sekarang"}`;
      const skpdLabel = filterSKPD === "__all__" ? "Semua SKPD" : (companyNameById.get(filterSKPD) || filterSKPD);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Periode Persetujuan: ${periode}    |    SKPD: ${skpdLabel}`, pageW / 2, 27.5, { align: "center" });
      doc.text(
        `Total Unit Termutasi: ${totalUnit} unit    |    Total Nilai: Rp ${totalNilai.toLocaleString("id-ID")}`,
        pageW / 2, 32.5, { align: "center" },
      );

      const body = filteredRekap.map((r, i) => [
        i + 1,
        r.skpdName,
        nomorDokumenLabel(r),
        formatTanggalSingkat(r.tanggal),
        r.kodeBarang,
        r.namaAset,
        r.tahunPerolehan,
        r.asalKib,
        `Rp ${r.nilai.toLocaleString("id-ID")}`,
      ]);

      autoTable(doc, {
        startY: 37,
        head: [["No", "SKPD Asal", "No. BA & SP", "Tgl. Persetujuan", "Kode Barang", "Nama Aset", "Tahun", "Asal KIB", "Nilai Perolehan"]],
        body,
        styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak", valign: "middle" },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 7, fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 9, halign: "center" },
          3: { cellWidth: 24 },
          6: { cellWidth: 14, halign: "center" },
          8: { cellWidth: 32, halign: "right" },
        },
        foot: [["", "", "", "", "", "TOTAL NILAI MUTASI", "", "", `Rp ${totalNilai.toLocaleString("id-ID")}`]],
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold", fontSize: 7, halign: "right" },
      });

      // Blok tanda tangan pejabat BKAD
      let y = (doc as any).lastAutoTable?.finalY ?? 37;
      if (y + 44 > pageH - 12) {
        doc.addPage();
        y = 18;
      }
      const sigX = pageW - 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(
        `Bandung, ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`,
        sigX, y + 9, { align: "right" },
      );
      doc.text("Pejabat Pengelola Barang Milik Daerah", sigX, y + 15, { align: "right" });
      doc.text("BKAD Kabupaten Bandung", sigX, y + 20, { align: "right" });
      doc.text("(......................................)", sigX, y + 37, { align: "right" });
      doc.text("NIP. ......................................", sigX, y + 42, { align: "right" });

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(150);
        doc.text(`BKAD Kabupaten Bandung — Dicetak: ${new Date().toLocaleDateString("id-ID")}`, 14, pageH - 6);
        doc.text(`Halaman ${i} / ${totalPages}`, pageW - 14, pageH - 6, { align: "right" });
      }

      const stamp = new Date().toISOString().slice(0, 10);
      doc.save(`Laporan_Rekapitulasi_Mutasi_Ekstrakomptabel_${stamp}.pdf`);
      toast.success(`PDF Laporan Pimpinan berhasil diunduh (${filteredRekap.length} aset).`);
    } catch (err) {
      console.error(err);
      toast.error("Gagal membuat file PDF.");
    } finally {
      setIsExportingPDF(false);
    }
  };

  const openDetail = (doc: DocumentArchiveRow) => {
    setSelectedDoc(doc);
    setDetailOpen(true);
  };

  const detailAsetList = (() => {
    if (!selectedDoc) return [] as OtorisasiAset[];
    return flattenOtorisasiArray(selectedDoc);
  })();

  const totalDisetujui = archives.filter((a) => a.status_approval === "disetujui").length;
  const totalDitolak = archives.filter((a) => a.status_approval === "ditolak").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Archive className="h-6 w-6 text-blue-700" />
            Arsip BKAD
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Riwayat seluruh pengajuan rekonsiliasi yang telah Anda proses serta rekapitulasi aset yang sah termutasi ke Aset Lainnya (Ekstrakomptabel).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className="bg-green-50 text-green-700 border-green-200" variant="outline">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {totalDisetujui} Disetujui
          </Badge>
          <Badge className="bg-red-50 text-red-700 border-red-200" variant="outline">
            <XCircle className="h-3 w-3 mr-1" />
            {totalDitolak} Ditolak
          </Badge>
        </div>
      </div>

      {/* ─── Tab Switcher ─── */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-100 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab("arsip")}
          className={`flex items-center gap-2 px-3.5 py-2 text-sm rounded-xl transition ${
            activeTab === "arsip"
              ? "bg-primary/10 text-primary font-medium"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          <FileText className="h-4 w-4" />
          Lemari Arsip Dokumen
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("rekap")}
          className={`flex items-center gap-2 px-3.5 py-2 text-sm rounded-xl transition ${
            activeTab === "rekap"
              ? "bg-primary/10 text-primary font-medium"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Rekapitulasi Aset Termutasi (Ekstrakomptabel)
        </button>
      </div>

      {activeTab === "arsip" ? (
        <Card className="soft-card-interactive">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Lemari Arsip Dokumen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading || isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Memuat arsip dokumen…
              </div>
            ) : archives.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Archive className="h-14 w-14 text-gray-300 mb-3" />
                <p className="font-semibold text-foreground">Arsip Masih Kosong</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Belum ada pengajuan yang Anda proses. Arsip akan muncul setelah Anda menyetujui atau menolak pengajuan.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50/70">
                    <TableRow>
                      <TableHead className="uppercase tracking-wider text-xs">ID Unik Batch / Nomor Dokumen</TableHead>
                      <TableHead className="uppercase tracking-wider text-xs">SKPD Pengaju</TableHead>
                      <TableHead className="uppercase tracking-wider text-xs">Tanggal Diproses</TableHead>
                      <TableHead className="text-center uppercase tracking-wider text-xs">Jumlah Aset</TableHead>
                      <TableHead className="text-center uppercase tracking-wider text-xs">Status</TableHead>
                      <TableHead className="text-right uppercase tracking-wider text-xs">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {archives.map((doc) => {
                      const meta = statusMeta(doc);
                      return (
                        <TableRow key={doc.id} className="border-slate-100">
                          <TableCell>
                            <div className="font-mono text-sm font-semibold text-primary">
                              {doc.nomor_surat}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {doc.jenis_kib ? `KIB: ${doc.jenis_kib} · ` : ""}
                              Nilai: Rp {getTotalNilai(doc).toLocaleString("id-ID")}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-medium text-slate-700">
                            {companyNameById.get(doc.company_id) || "SKPD Tanpa Nama"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatTanggal(doc.approved_at || doc.created_at)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-semibold">
                              <Package className="h-3 w-3 mr-1.5" />
                              {getJumlahAset(doc)} aset
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={meta.cls} variant="outline">
                              <meta.Icon className="h-3 w-3 mr-1" />
                              {meta.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <Button size="sm" variant="outline" onClick={() => openDetail(doc)}>
                                <Eye className="h-3.5 w-3.5 mr-1.5" />
                                Detail
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Panel Filter */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filter Laporan Rekapitulasi Mutasi
              </CardTitle>
              <CardDescription className="text-xs">
                Filter aset yang telah sah direklasifikasi ke Aset Lainnya / Ekstrakomptabel sesuai rentang tanggal persetujuan BKAD.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Dari Tanggal Persetujuan</Label>
                  <Input type="date" value={dariTanggal} onChange={(e) => setDariTanggal(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Sampai Tanggal Persetujuan</Label>
                  <Input type="date" value={sampaiTanggal} onChange={(e) => setSampaiTanggal(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">SKPD Asal</Label>
                  <Select value={filterSKPD} onValueChange={setFilterSKPD}>
                    <SelectTrigger>
                      <SelectValue placeholder="Semua SKPD" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Semua SKPD</SelectItem>
                      {skpdOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={resetRekapFilter}
                    disabled={activeRekapFilterCount === 0}
                  >
                    Reset Filter{activeRekapFilterCount > 0 ? ` (${activeRekapFilterCount})` : ""}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ringkasan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Total Unit Termutasi</p>
                  <p className="text-2xl font-semibold text-slate-800">
                    {totalUnit.toLocaleString("id-ID")} <span className="text-sm font-normal text-slate-400">unit</span>
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Total Nilai Rupiah Mutasi</p>
                  <p className="text-2xl font-semibold text-slate-800">
                    Rp {totalNilai.toLocaleString("id-ID")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabel + Aksi Ekspor */}
          <Card className="soft-card-interactive">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Rincian Aset Termutasi (Ekstrakomptabel)
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {filteredRekap.length.toLocaleString("id-ID")} aset dari {rekapDocs.length} bundel persetujuan.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={handleExportRekapExcel}
                    disabled={isExportingExcel || totalUnit === 0}
                  >
                    {isExportingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                    Export Excel
                  </Button>
                  <Button
                    className="gap-1.5"
                    onClick={handleExportRekapPDF}
                    disabled={isExportingPDF || totalUnit === 0}
                  >
                    {isExportingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    Export PDF Pimpinan
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingRekap ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Memuat rekapitulasi mutasi…
                </div>
              ) : filteredRekap.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ClipboardList className="h-14 w-14 text-gray-300 mb-3" />
                  <p className="font-semibold text-foreground">
                    {rekapRows.length === 0 ? "Belum ada aset termutasi" : "Tidak ada data sesuai filter"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {rekapRows.length === 0
                      ? "Rekapitulasi akan muncul setelah ada pengajuan reklasifikasi yang disetujui BKAD."
                      : "Coba ubah rentang tanggal atau pilih SKPD lain."}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="max-h-[560px] overflow-auto">
                    <Table>
                      <TableHeader className="bg-slate-50/70 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="uppercase tracking-wider text-xs w-12">No</TableHead>
                          <TableHead className="uppercase tracking-wider text-xs">SKPD Asal</TableHead>
                          <TableHead className="uppercase tracking-wider text-xs">Nomor BA &amp; SP</TableHead>
                          <TableHead className="uppercase tracking-wider text-xs">Tgl. Persetujuan</TableHead>
                          <TableHead className="uppercase tracking-wider text-xs">Kode Barang</TableHead>
                          <TableHead className="uppercase tracking-wider text-xs">Nama Aset</TableHead>
                          <TableHead className="uppercase tracking-wider text-xs text-center">Tahun</TableHead>
                          <TableHead className="uppercase tracking-wider text-xs">Asal KIB</TableHead>
                          <TableHead className="uppercase tracking-wider text-xs text-right">Nilai Perolehan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRekap.map((r, i) => (
                          <TableRow key={r.key} className="border-slate-100">
                            <TableCell className="text-xs text-slate-400">{i + 1}</TableCell>
                            <TableCell className="text-xs font-medium text-slate-800">{r.skpdName}</TableCell>
                            <TableCell className="text-xs font-mono text-slate-600">{nomorDokumenLabel(r)}</TableCell>
                            <TableCell className="text-xs text-slate-600">{formatTanggalSingkat(r.tanggal)}</TableCell>
                            <TableCell className="text-xs font-mono text-slate-600">{r.kodeBarang}</TableCell>
                            <TableCell className="text-xs text-slate-800">{r.namaAset}</TableCell>
                            <TableCell className="text-xs text-center text-slate-600">{r.tahunPerolehan}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="rounded-full bg-slate-50 text-slate-600 border-slate-200 text-[11px]">
                                {r.asalKib}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono text-slate-700">
                              {r.nilai > 0 ? `Rp ${r.nilai.toLocaleString("id-ID")}` : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50/70 border-t border-slate-100">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Total {totalUnit.toLocaleString("id-ID")} Unit Termutasi
                    </span>
                    <span className="text-sm font-semibold text-slate-800">
                      Rp {totalNilai.toLocaleString("id-ID")}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Detail Dialog ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Detail Arsip Dokumen
            </DialogTitle>
            <DialogDescription>
              {selectedDoc && (
                <span>
                  Dokumen <span className="font-mono font-semibold">{selectedDoc.nomor_surat}</span> · {getJumlahAset(selectedDoc)} aset
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {selectedDoc && (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Tanggal Diproses</p>
                    <p className="font-medium">{formatTanggal(selectedDoc.approved_at || selectedDoc.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Jenis KIB</p>
                    <p className="font-medium">{selectedDoc.jenis_kib || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Total Aset</p>
                    <p className="font-medium">{getJumlahAset(selectedDoc)} unit</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Total Nilai</p>
                    <p className="font-medium">Rp {getTotalNilai(selectedDoc).toLocaleString("id-ID")}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Status Keputusan</p>
                    {(() => {
                      const meta = statusMeta(selectedDoc);
                      return (
                        <Badge className={meta.cls} variant="outline">
                          <meta.Icon className="h-3 w-3 mr-1" />
                          {meta.label}
                        </Badge>
                      );
                    })()}
                  </div>
                </div>

                {selectedDoc.status_approval === "ditolak" && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-red-700 flex items-center gap-2 mb-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Catatan Revisi
                    </p>
                    <p className="text-sm text-red-800 whitespace-pre-wrap">
                      {selectedDoc.catatan_bkad || "Tidak ada catatan."}
                    </p>
                  </div>
                )}

                {/* Dokumen fisik & PDF */}
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="bg-slate-50/70 px-4 py-2.5 border-b border-slate-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                      <Download className="h-3.5 w-3.5" />
                      Berkas Dokumen
                    </p>
                  </div>
                  <div className="p-4 space-y-2">
                    {[
                      { label: "Scan Surat Pernyataan (ttd basah)", url: selectedDoc.dokumen_url },
                      { label: "PDF Berita Acara", url: selectedDoc.url_berita_acara },
                      { label: "PDF Surat Pernyataan", url: selectedDoc.url_surat_pernyataan },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{item.label}</p>
                          <p className="text-[11px] text-muted-foreground truncate" title={item.url || undefined}>
                            {item.url || "Belum tersedia"}
                          </p>
                        </div>
                        {item.url ? (
                          <Button asChild size="sm" variant="outline" className="shrink-0">
                            <a href={item.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                              Lihat
                            </a>
                          </Button>
                        ) : (
                          <Badge variant="outline" className="shrink-0 text-muted-foreground">—</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tembusan */}
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="bg-slate-50/70 px-4 py-2.5 border-b border-slate-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      Tembusan
                    </p>
                  </div>
                  <div className="p-4">
                    {Array.isArray(selectedDoc.tembusan) && selectedDoc.tembusan.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedDoc.tembusan as any[]).map((t, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{String(t)}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">—</p>
                    )}
                  </div>
                </div>

                {/* Daftar Aset */}
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="bg-slate-50/70 px-4 py-2.5 border-b border-slate-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                      <Package className="h-3.5 w-3.5" />
                      Daftar Aset Tereklasifikasi
                    </p>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {detailAsetList.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-6 text-center">Data aset tidak tersedia.</p>
                    ) : (
                      <Table>
                        <TableHeader className="bg-slate-50/70 sticky top-0">
                          <TableRow>
                            <TableHead className="uppercase tracking-wider text-xs">Kode Aset</TableHead>
                            <TableHead className="uppercase tracking-wider text-xs">Nama Aset</TableHead>
                            <TableHead className="uppercase tracking-wider text-xs">Kondisi</TableHead>
                            <TableHead className="uppercase tracking-wider text-xs text-right">Nilai Perolehan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailAsetList.map((item, i) => {
                            const kodeKey =
                              item.kode_barang || item.kode_aset || item.assetData?.kode_aset ||
                              item.asset_id || item.id || String(i);
                            const kondisi =
                              item.Kondisi || item.kondisi || item.assetData?.Kondisi ||
                              item.rekon_rekomendasi || item.rekomendasi || "—";
                            return (
                              <TableRow key={kodeKey} className="border-slate-100">
                                <TableCell className="font-mono text-xs">
                                  {item.kode_barang || item.kode_aset || item.assetData?.kode_aset || "—"}
                                </TableCell>
                                <TableCell className="text-xs">{getNamaAset(item)}</TableCell>
                                <TableCell>
                                  <Badge className="text-[11px] rounded-full" variant="secondary">{kondisi}</Badge>
                                </TableCell>
                                <TableCell className="text-xs text-right font-mono text-muted-foreground">
                                  {getNilaiPerolehan(item) > 0
                                    ? `Rp ${getNilaiPerolehan(item).toLocaleString("id-ID")}`
                                    : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
