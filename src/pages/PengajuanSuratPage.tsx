import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCustomColumns } from "@/contexts/CustomColumnsContext";
import { _psNumber, generateBeritaAcaraPDF, generateSuratPernyataanPDF, type DualPdfInput } from "@/utils/pdfGenerators";
import {
  FileSignature, Plus, ArrowLeft, ArrowRight, Check, Trash2,
  FileText, Download, Loader2, AlertCircle, CheckCircle2, Printer,
  ListChecks
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type ArchiveRow = any;

function _psNama(it: any): string {
  if (!it) return "Nama tidak tersedia";
  return (
    it.nama_barang ||
    it.nama_aset ||
    it.assetData?.nama_barang ||
    it.assetData?.nama_aset ||
    it["Nama Barang"] ||
    it["Nama Aset"] ||
    "Nama tidak tersedia"
  );
}

function _psKode(it: any): string {
  if (!it) return "";
  return (
    it.kode_barang ||
    it.kode_aset ||
    it.assetData?.kode_aset ||
    it.asset_id ||
    it.id ||
    it["Kode Barang"] ||
    it["Kode Aset"] ||
    ""
  );
}

function _psNilai(it: any): number {
  if (!it) return 0;
  return (
    _psNumber(it["Nilai Aset"]) ||
    _psNumber(it["Nilai Perolehan"]) ||
    _psNumber(it.nilai_perolehan) ||
    _psNumber(it.harga) ||
    _psNumber(it["Harga"]) ||
    _psNumber(it.assetData?.["Nilai Aset"]) ||
    _psNumber(it.assetData?.["Nilai Perolehan"]) ||
    _psNumber(it.assetData?.nilai_perolehan) ||
    0
  );
}

function _psField(it: any, keys: string[], fallback = "-"): string {
  if (!it) return fallback;
  const candidates: any[] = [it];
  if (typeof it.assetData === "object" && it.assetData !== null) {
    candidates.push(it.assetData);
  }
  for (const obj of candidates) {
    for (const k of keys) {
      const v = obj[k];
      if (v !== null && v !== undefined && String(v).trim() !== "") {
        return String(v);
      }
    }
  }
  return fallback;
}

function _psSpesifikasi(it: any): string {
  return _psField(it, ["Spesifikasi Nama Barang", "spesifikasi", "Spesifikasi", "Spesifikasi Barang", "Spesifikasi_Barang"]);
}

function _psMerek(it: any): string {
  return _psField(it, ["Merek/Type", "merek", "Merek", "Type", "Tipe", "Merek / Type", "Merek_Type", "merek_type"]);
}

function _psBahan(it: any): string {
  return _psField(it, ["Bahan", "bahan"]);
}

function _psLokasi(it: any): string {
  return _psField(it, ["Lokasi", "Lokasi Ruangan", "lokasi", "lokasi_ruangan", "Ruangan", "lokasiRuangan"]);
}

function _psNomorPolisi(it: any): string {
  return _psField(it, ["Nomor Polisi", "nopol", "nomor_polisi", "No. Polisi", "No Polisi", "no_polisi", "nopolisi"]);
}

function _psMetodePerolehan(it: any): string {
  return _psField(it, [
    "Metode Perolehan",
    "metode_perolehan",
    "Cara Perolehan",
    "Perolehan",
    "Sumber Perolehan",
    "cara_perolehan",
    "sumber_perolehan",
  ]);
}

function _psBidangPengguna(it: any): string {
  return _psField(it, [
    "Bidang Pengguna",
    "bidang_pengguna",
    "Pengguna",
    "Bidang",
    "Unit Pengguna",
    "Unit Kerja",
    "unit_kerja",
    "bidangPengguna",
  ]);
}

function _psKeterangan(it: any): string {
  return _psField(it, ["Keterangan", "keterangan", "Catatan", "catatan", "Keterangan_Barang", "Deskripsi", "deskripsi"]);
}

function _psKondisi(it: any): string {
  return _psField(it, ["Kondisi", "kondisi", "Kondisi_Barang", "Kondisi Akhir", "kondisi_akhir"], "-");
}

function _psFlatten(arc: ArchiveRow): any[] {
  const list: any[] = [];
  try {
    if (Array.isArray(arc.data_otorisasi)) {
      list.push(...arc.data_otorisasi);
    } else if (typeof arc.data_otorisasi === "object" && arc.data_otorisasi !== null) {
      const obj = arc.data_otorisasi;
      if (Array.isArray(obj.aset_detail)) list.push(...obj.aset_detail);
      if (Array.isArray(obj.assets)) list.push(...obj.assets);
      if (Array.isArray(obj.lampiran_data)) list.push(...obj.lampiran_data);
    }
  } catch {}
  return list;
}

function _psBuildLampiranRows(arc: ArchiveRow): { rows: any[]; headers: string[]; nilaiKey: string; total: number } {
  const legacyOtor = typeof arc.data_otorisasi === "object" && arc.data_otorisasi !== null ? arc.data_otorisasi : {};
  if (Array.isArray(legacyOtor.lampiran_data) && legacyOtor.lampiran_data.length > 0) {
    const rows = legacyOtor.lampiran_data;
    const headers = Array.isArray(legacyOtor.lampiran_headers) && legacyOtor.lampiran_headers.length > 0
      ? legacyOtor.lampiran_headers
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
  flat.forEach(it => {
    const k = _psKode(it);
    if (k) seenKode.add(k);
    merged.push(it);
  });
  kbList.forEach(kb => {
    if (typeof kb === "string") {
      if (!seenKode.has(kb)) {
        seenKode.add(kb);
        merged.push({ kode_barang: kb });
      }
    } else if (kb && typeof kb === "object") {
      const k = _psKode(kb);
      if (k && !seenKode.has(k)) {
        seenKode.add(k);
        merged.push(kb);
      }
    }
  });

  const headers = [
    "Kode Barang",
    "Nama Barang",
    "Spesifikasi Nama Barang",
    "Merek/Type",
    "Bahan",
    "Lokasi",
    "Nomor Polisi",
    "Metode Perolehan",
    "Bidang Pengguna",
    "Keterangan",
    "Kondisi",
    "Nilai Perolehan",
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

  if (typeof arc.total_nilai === "number" && arc.total_nilai > 0 && total === 0) {
    total = arc.total_nilai;
  }
  return { rows, headers, nilaiKey, total };
}

// ─── Main Page ──────────────────────────────────────────
export default function PengajuanSuratPage() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reprintArc, setReprintArc] = useState<any>(null);

  const { data: archives = [], isLoading } = useQuery({
    queryKey: ["document-archives-verifikasi", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_archives")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Riwayat penuh: tampilkan seluruh arsip dokumen perusahaan apa adanya
      return data ?? [];
    },
    enabled: !!companyId,
  });

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

  const formatTgl = (d: string | null) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return "—"; }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight flex items-center gap-2">
            <FileSignature className="h-5 w-5 sm:h-6 sm:w-6 text-blue-700" />
            Penerbitan Berita Acara
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Terbitkan Berita Acara & Surat Pernyataan untuk aset BMD pada tahap Finalisasi Rekon (pra-pengajuan ke BKAD).
          </p>
        </div>
        <Button className="gap-2 shrink-0 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium px-3 py-2" onClick={() => setWizardOpen(true)}>
          <Plus className="h-4 w-4" /> Terbitkan Berita Acara Baru
        </Button>
      </div>

      <Card className="bg-white border border-gray-200 rounded-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-900">Riwayat Arsip Dokumen</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : archives.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Belum ada arsip Berita Acara.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200">ID Unik Batch</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200">Tanggal</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200">Jenis KIB</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 text-center">Total Aset</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 text-right">Total Nilai</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 text-center">Status</TableHead>
                    <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archives.map((arc: any) => {
                    const jumlahAset =
                      (typeof arc.total_aset === "number" && arc.total_aset > 0)
                        ? arc.total_aset
                        : (Array.isArray(arc.kode_barang_list)
                          ? arc.kode_barang_list.length
                          : _psFlatten(arc).length);
                    const totalNilai =
                      (typeof arc.total_nilai === "number" && arc.total_nilai > 0)
                        ? arc.total_nilai
                        : _psFlatten(arc).reduce((acc, it) => acc + _psNilai(it), 0);
                    return (
                      <TableRow key={arc.id} className="hover:bg-gray-50">
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-800">{arc.nomor_surat}</TableCell>
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-800">{formatTgl(arc.tanggal_surat)}</TableCell>
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-800">{arc.jenis_kib || "—"}</TableCell>
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-800 text-center">{jumlahAset}</TableCell>
                        <TableCell className="py-1.5 px-2.5 text-[13px] text-gray-800 text-right font-semibold">Rp {totalNilai.toLocaleString("id-ID")}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="px-2 py-0.5 text-[11px] font-semibold rounded border inline-flex items-center bg-green-50 text-green-700 border-green-200">{arc.status}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 hover:bg-gray-50"
                            onClick={() => setReprintArc(arc)}
                            title="Buka dokumen Berita Acara & Surat Pernyataan"
                          >
                            <Printer className="h-4 w-4 text-blue-700" />
                            <span className="text-[12px] font-medium text-blue-700">Cetak Ulang</span>
                          </Button>
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

      {wizardOpen && (
        <WizardDialog
          open={wizardOpen}
          onClose={() => { setWizardOpen(false); queryClient.invalidateQueries({ queryKey: ["document-archives"] }); }}
          tenantSettings={tenantSettings}
        />
      )}

      {reprintArc && (
        <ReprintDialog arc={reprintArc} onClose={() => setReprintArc(null)} tenantSettings={tenantSettings} />
      )}
    </div>
  );
}

// ─── Wizard Dialog ──────────────────────────────────────
function WizardDialog({ open, onClose, tenantSettings }: { open: boolean; onClose: () => void; tenantSettings?: any }) {
  const { companyId } = useAuth();
  const { masterKib } = useCustomColumns();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  // Step 1
  const [nomorSurat, setNomorSurat] = useState("");
  const [tglPenelusuran, setTglPenelusuran] = useState("");
  const [tglSurat, setTglSurat] = useState(new Date().toISOString().split("T")[0]);
  const [namaKadis, setNamaKadis] = useState("");
  const [nipKadis, setNipKadis] = useState("");
  const [jabatanKadis, setJabatanKadis] = useState("Kepala Dinas Perumahan, Kawasan Permukiman Dan Pertanahan, selaku Pengguna BMD");

  // Step 1b: Dokumen Berita Acara (BA) & Surat Pernyataan (SP)
  const [nomorBA, setNomorBA] = useState("");
  const [tanggalBA, setTanggalBA] = useState(new Date().toISOString().split("T")[0]);
  const [nomorSP, setNomorSP] = useState("");
  const [tanggalSP, setTanggalSP] = useState(new Date().toISOString().split("T")[0]);
  const [timPemeriksa, setTimPemeriksa] = useState<{ nama: string; nip: string; pangkat: string }[]>([
    { nama: "", nip: "", pangkat: "" },
    { nama: "", nip: "", pangkat: "" },
  ]);

  // Step 2
  const [jenisKib, setJenisKib] = useState("");
  const [parsedKodeBarang, setParsedKodeBarang] = useState<string[]>([]);
  const [parsedTotalNilai, setParsedTotalNilai] = useState(0);
  const [parsedRowCount, setParsedRowCount] = useState(0);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedNilaiKey, setParsedNilaiKey] = useState("");

  // Step 2: Dynamic Asset Selector state
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [selectedAssets, setSelectedAssets] = useState<any[]>([]);

  // Step 3
  const [tembusan, setTembusan] = useState([
    "Bapak Bupati Bandung selaku Pemegang Kekuasaan Pengelolaan BMD",
    "Bapak Sekretaris Daerah selaku Pengelola BMD",
    "Kepala Badan Keuangan Daerah",
    "Inspektur Kabupaten Bandung",
  ]);

  const steps = ["Administrasi", "Pilih Aset", "Tembusan", "Preview & Cetak"];

  // ─── Handler Tim Pemeriksa (minimal 2 slot) ─────────────
  const addPemeriksa = () => setTimPemeriksa(prev => [...prev, { nama: "", nip: "", pangkat: "" }]);
  const removePemeriksa = (i: number) => setTimPemeriksa(prev => prev.length <= 2 ? prev : prev.filter((_, j) => j !== i));
  const updatePemeriksa = (i: number, key: "nama" | "nip" | "pangkat", val: string) =>
    setTimPemeriksa(prev => prev.map((p, j) => j === i ? { ...p, [key]: val } : p));

  // ─── Dynamic Asset Selector Query (Hotfix: Company-only pull + stale cache) ──
  const { data: allCompanyAssets = [], isFetching: isFetchingApproved, error: queryError } = useQuery({
    queryKey: ["approved-assets-for-ba", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("assets")
        .select("id, kode_aset, nama_aset, kib, custom_data")
        .eq("company_id", companyId);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!(companyId && open && step >= 2),
  });

  console.log("1. HASIL API SUPABASE:", { 
    jumlahData: allCompanyAssets?.length,
    sampleData: allCompanyAssets?.[0],
    error: queryError 
  });

  // ─── useMemo: Filter Client-side Tolerant (Hotfix Empty Data & Slow Fetch) ──
  const filteredAssets = useMemo(() => {
    return allCompanyAssets.filter((a: any) => {
      const cd = (typeof a.custom_data === "object" && a.custom_data !== null)
        ? (a.custom_data as Record<string, any>)
        : {};

      console.log("2. UJI FILTER ASET (ID: " + a.kode_aset + "):", {
        kib_di_database: a.kib,
        kib_di_dropdown: jenisKib,
        status_native: a.status_rekon,
        status_cd: cd["status_rekon"],
        status_usulan: cd["status_usulan"]
      });

      // 1. Status Rekon: kolam PRA-PENGAJUAN (finalisasi rekon), BUKAN pasca-verifikasi staf
      //    Fallback chain: Cek kolom utama tabel dulu, lalu ke JSON custom_data
      const rawStatus = a.status_rekon || cd["status_rekon"] || "";
      const statusRekonRaw = String(rawStatus).trim().toLowerCase();
      if (statusRekonRaw !== "draft_pengajuan") return false;

      // 2. Pencegah Duplikasi: Jangan ambil aset yang sudah dicetak BA
      const statusUsulan = String(cd["status_usulan"] || "").trim();
      if (statusUsulan === "Sudah Ditetapkan Dalam Berita Acara") return false;

      // 3. KIB Match: Tolerant substring check (case-insensitive)
      //    Misal jenisKib="KIB A - Mesin & Peralatan" / "KIB A"
      //    asset.kib="KIB A" / "KIB-A" / "KIB.A" / "A"
      if (jenisKib) {
        const jenis = jenisKib.trim();
        const assetKib = String(a.kib || "").trim();
        if (!jenis || !assetKib) return false;

        // Normalisasi: hilangkan whitespace, strip karakter non-alphanumeric kecuali hyphen/underscore
        const _norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const jenisNorm = _norm(jenis);
        const assetNorm = _norm(assetKib);

        // Deduce kode KIB (single letter): A, B, C, D, E, F
        const kodeJenis = jenisNorm.match(/kib([abcdef])/)?.[1] || jenis.match(/\b([ABCDEF])\b/)?.[1]?.toLowerCase() || jenisNorm.charAt(jenisNorm.length - 1);
        const kodeAsset = assetNorm.match(/kib([abcdef])/)?.[1] || assetKib.match(/\b([ABCDEF])\b/)?.[1]?.toLowerCase() || assetNorm;

        // Match strategy (OR): salah satu terpenuhi → lolos
        const matchExact = jenisNorm === assetNorm;
        const matchAssetContainsJenisNorm = assetNorm.includes(jenisNorm);
        const matchJenisContainsAssetNorm = jenisNorm.includes(assetNorm);
        const matchKodeLetter = !!kodeJenis && !!kodeAsset && kodeJenis === kodeAsset;

        if (!(matchExact || matchAssetContainsJenisNorm || matchJenisContainsAssetNorm || matchKodeLetter)) {
          return false;
        }
      }

      return true;
    });
  }, [allCompanyAssets, jenisKib]);

  // ─── Helpers untuk display approvedAssets ───────────────
  const _apKondisi = (a: any): string => {
    const cd = (typeof a.custom_data === "object" && a.custom_data) ? a.custom_data : {};
    return String(cd["Kondisi"] || cd["kondisi"] || cd.rekon_rekomendasi || cd.status_usulan || "-");
  };

  const _apNilai = (a: any): number => {
    const cd = (typeof a.custom_data === "object" && a.custom_data) ? a.custom_data : {};
    const raw =
      cd["Nilai Aset"] ?? cd["Nilai Perolehan"] ?? cd["nilai_perolehan"] ??
      a.nilai_perolehan ?? a.harga ?? cd["Harga"] ?? 0;
    if (typeof raw === "number") return isFinite(raw) ? raw : 0;
    if (raw === null || raw === undefined) return 0;
    const s = String(raw).trim();
    if (!s) return 0;
    const cleaned = s.split(",")[0].replace(/[^0-9]/g, "");
    if (!cleaned) return 0;
    const n = Number(cleaned);
    return isFinite(n) ? n : 0;
  };

  // ─── Build Snapshot payload (mirip PapanRekonsiliasi) ───
  const _buildAssetSnapshot = (asset: any): any => {
    const cd = (typeof asset.custom_data === "object" && asset.custom_data) ? asset.custom_data : {};
    const _cdGet = (keys: string[], fallback = "-") => {
      for (const k of keys) {
        if (cd[k] !== null && cd[k] !== undefined && String(cd[k]).trim() !== "") return String(cd[k]);
      }
      return fallback;
    };
    const nilaiAngka = _apNilai(asset);
    const spesifikasi = _cdGet(["Spesifikasi Nama Barang", "spesifikasi", "Spesifikasi", "Spesifikasi Barang"]);
    const merek = _cdGet(["Merek/Type", "merek", "Merek", "Type", "Tipe", "Merek / Type"]);
    const bahan = _cdGet(["Bahan", "bahan"]);
    const lokasi =
      (asset.lokasi_ruangan && String(asset.lokasi_ruangan).trim()) ||
      _cdGet(["Lokasi", "Lokasi Ruangan", "lokasi", "lokasi_ruangan", "Ruangan"], "-");
    const nopol = _cdGet(["Nomor Polisi", "nopol", "nomor_polisi", "No. Polisi", "No Polisi"]);
    const metodePerolehan = _cdGet(["Metode Perolehan", "metode_perolehan", "Cara Perolehan", "Perolehan", "Sumber Perolehan"]);
    const bidangPengguna = _cdGet(["Bidang Pengguna", "bidang_pengguna", "Pengguna", "Bidang", "Unit Pengguna", "Unit Kerja"]);
    const keterangan = _cdGet(["Keterangan", "keterangan", "Catatan", "catatan", "Deskripsi", "deskripsi"]);
    const kondisiAkhir = _apKondisi(asset);
    return {
      ...cd,
      id: asset.id,
      asset_id: asset.id,
      "Kode Barang": asset.kode_aset || "-",
      kode_barang: asset.kode_aset,
      kode_aset: asset.kode_aset,
      "Nama Barang": asset.nama_aset || _psNama(cd) || "-",
      nama_barang: asset.nama_aset,
      nama_aset: asset.nama_aset,
      kib: asset.kib,
      Kondisi: kondisiAkhir,
      kondisi: kondisiAkhir,
      rekon_rekomendasi: cd.rekon_rekomendasi || cd.status_usulan || "",
      rekomendasi: cd.rekon_rekomendasi || cd.status_usulan || "",
      nilai_perolehan: nilaiAngka,
      "Nilai Aset": nilaiAngka,
      "Nilai Perolehan": nilaiAngka,
      "Spesifikasi Nama Barang": spesifikasi,
      spesifikasi,
      "Merek/Type": merek,
      merek,
      Bahan: bahan,
      bahan,
      Lokasi: lokasi,
      lokasi_ruangan: asset.lokasi_ruangan || lokasi,
      "Nomor Polisi": nopol,
      nopol,
      nomor_polisi: nopol,
      "Metode Perolehan": metodePerolehan,
      metode_perolehan: metodePerolehan,
      "Bidang Pengguna": bidangPengguna,
      bidang_pengguna: bidangPengguna,
      Keterangan: keterangan,
      keterangan,
      assetData: {
        ...cd,
        nama_barang: asset.nama_aset,
        nama_aset: asset.nama_aset,
        kode_aset: asset.kode_aset,
        kib: asset.kib,
        nilai_perolehan: nilaiAngka,
        "Nilai Aset": nilaiAngka,
        Kondisi: kondisiAkhir,
        "Spesifikasi Nama Barang": spesifikasi,
        "Merek/Type": merek,
        Bahan: bahan,
        Lokasi: lokasi,
        "Nomor Polisi": nopol,
        "Metode Perolehan": metodePerolehan,
        "Bidang Pengguna": bidangPengguna,
        Keterangan: keterangan,
      },
    };
  };

  // ─── Bridge: selectedAssetIds → legacy state ────────────
  useEffect(() => {
    const picked = filteredAssets.filter((a: any) => selectedAssetIds.has(a.id));
    setSelectedAssets(picked);

    const kodeList = picked.map((a: any) => a.kode_aset).filter(Boolean);
    let total = 0;
    picked.forEach((a: any) => { total += _apNilai(a); });

    const snapshotRows = picked.map((a: any) => _buildAssetSnapshot(a));
    const headers13 = [
      "Kode Barang",
      "Nama Barang",
      "Spesifikasi Nama Barang",
      "Merek/Type",
      "Bahan",
      "Lokasi",
      "Nomor Polisi",
      "Metode Perolehan",
      "Bidang Pengguna",
      "Keterangan",
      "Kondisi",
      "Nilai Perolehan",
    ];

    setParsedKodeBarang(kodeList);
    setParsedTotalNilai(total);
    setParsedRowCount(picked.length);
    setParsedRows(snapshotRows);
    setParsedHeaders(headers13);
    setParsedNilaiKey("Nilai Perolehan");
  }, [selectedAssetIds, filteredAssets]);

  // Reset pilihan saat jenisKib berubah
  useEffect(() => {
    setSelectedAssetIds(new Set());
  }, [jenisKib]);

  // ─── Checkbox handlers ──────────────────────────────────
  const toggleAsset = (id: string) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedAssetIds.size === filteredAssets.length && filteredAssets.length > 0) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(filteredAssets.map((a: any) => a.id)));
    }
  };

  // ─── Bangun input generator ganda PDF dari state wizard ──
  const buildDualPdfInput = (): DualPdfInput => ({
    tenantSettings,
    nomorBA: nomorBA || nomorSurat,
    tanggalBA: tanggalBA || tglSurat,
    nomorSP: nomorSP || nomorSurat,
    tanggalSP: tanggalSP || tglSurat,
    assets: selectedAssets.map((a: any) => _buildAssetSnapshot(a)),
    namaKadis,
    nipKadis,
    jabatanKadis,
    timPemeriksa,
    tembusan: tembusan.map(t => t.trim()).filter(Boolean),
    tglPenelusuran,
  });

  // ─── Pratinjau draf PDF (Blob → blob URL, dibuka di tab baru) ──
  const [previewing, setPreviewing] = useState<"" | "BA" | "SP">("");
  const openDraftPreview = (kind: "BA" | "SP") => {
    setPreviewing(kind);
    try {
      const input = buildDualPdfInput();
      const blob = kind === "BA" ? generateBeritaAcaraPDF(input) : generateSuratPernyataanPDF(input);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal membuat pratinjau PDF.");
    } finally {
      setPreviewing("");
    }
  };

  // Tutup Periode & Save (Finalisasi Berita Acara)
  const handleSubmit = async () => {
    if (!companyId) return;
    setSubmitting(true);
    try {
      // Build payload snapshot full aset terpilih
      const assetSnapshotFull = selectedAssets.map((a: any) => _buildAssetSnapshot(a));

      // 1. Generate kedua dokumen PDF di background (Blob)
      const pdfInput: DualPdfInput = { ...buildDualPdfInput(), assets: assetSnapshotFull };
      const baBlob = generateBeritaAcaraPDF(pdfInput);
      const spBlob = generateSuratPernyataanPDF(pdfInput);

      // 2. Unggah kedua Blob ke bucket "dokumen_usulan" (hentikan bila gagal)
      const stamp = Date.now();
      const baPath = `${companyId}/BA_${stamp}.pdf`;
      const spPath = `${companyId}/SP_${stamp}.pdf`;
      const { error: baUploadErr } = await supabase.storage
        .from("dokumen_usulan")
        .upload(baPath, baBlob, { contentType: "application/pdf", upsert: false });
      if (baUploadErr) throw new Error(`Gagal mengunggah Berita Acara: ${baUploadErr.message}`);
      const { error: spUploadErr } = await supabase.storage
        .from("dokumen_usulan")
        .upload(spPath, spBlob, { contentType: "application/pdf", upsert: false });
      if (spUploadErr) throw new Error(`Gagal mengunggah Surat Pernyataan: ${spUploadErr.message}`);

      const urlBeritaAcara = supabase.storage.from("dokumen_usulan").getPublicUrl(baPath).data.publicUrl;
      const urlSuratPernyataan = supabase.storage.from("dokumen_usulan").getPublicUrl(spPath).data.publicUrl;

      // 3. Save document archive — status: "Berita Acara Ditetapkan"
      //    data_otorisasi adalah ARRAY aset (mirip payload PapanRekonsiliasi) + metadata otorisasi
      const otorisasiPayload: any = {
        nama: namaKadis,
        nip: nipKadis,
        jabatan: jabatanKadis,
        nomorBA: nomorBA || nomorSurat,
        tanggalBA: tanggalBA || tglSurat,
        nomorSP: nomorSP || nomorSurat,
        tanggalSP: tanggalSP || tglSurat,
        tim_pemeriksa: timPemeriksa.filter(t => (t.nama || "").trim()),
      };
      Object.assign(otorisasiPayload, { aset_detail: assetSnapshotFull });
      const { error: insertErr } = await supabase.from("document_archives").insert({
        company_id: companyId,
        nomor_surat: nomorSurat,
        tanggal_surat: tglSurat,
        tanggal_penelusuran: tglPenelusuran || null,
        jenis_kib: jenisKib,
        total_aset: parsedRowCount,
        total_nilai: parsedTotalNilai,
        kode_barang_list: parsedKodeBarang as any,
        tembusan: tembusan as any,
        url_berita_acara: urlBeritaAcara,
        url_surat_pernyataan: urlSuratPernyataan,
        data_otorisasi: otorisasiPayload as any,
        status: "Berita Acara Ditetapkan",
      });
      if (insertErr) throw insertErr;

      // 4. Bulk update assets — TAMBAHKAN FLAG Berita Acara, JANGAN UBAH KONDISI
      if (parsedKodeBarang.length > 0 && selectedAssets.length > 0) {
        const updates = selectedAssets.map((asset: any) => {
          const cd = (typeof asset.custom_data === "object" && asset.custom_data) ? asset.custom_data as Record<string, any> : {};
          const newCd = {
            ...cd,
            status_usulan: "Sudah Ditetapkan Dalam Berita Acara",
            no_berita_acara: nomorSurat,
            tanggal_berita_acara: tglSurat,
          };
          return supabase.from("assets").update({ custom_data: newCd }).eq("id", asset.id);
        });
        const results = await Promise.all(updates);
        const firstErr = results.find((r: any) => r.error);
        if (firstErr?.error) throw firstErr.error;

        // Auto-close public reports terkait (status ke Selesai — karena sudah final BA)
        const matchedIds = selectedAssets.map((a: any) => a.id);
        if (matchedIds.length > 0) {
          const { error: reportsErr } = await supabase
            .from("asset_reports")
            .update({
              status: "Selesai",
              catatan_admin: "Otomatis: Sudah ditetapkan dalam Berita Acara"
            } as any)
            .in("asset_id", matchedIds)
            .in("status", ["Menunggu", "Diproses"]);
          if (reportsErr) console.error("[FinalisasiBA] Gagal menutup laporan publik:", reportsErr);
        }
      }

      // 5. Invalidate caches (refresh kedua halaman arsip: verifikasi & BA final)
      queryClient.invalidateQueries({ queryKey: ["document-archives"] });
      queryClient.invalidateQueries({ queryKey: ["document-archives-verifikasi"] });
      queryClient.invalidateQueries({ queryKey: ["document-archives-ba"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["rekon-assets-joined"] });
      queryClient.invalidateQueries({ queryKey: ["approved-assets-for-ba"] });

      toast.success("Berita Acara berhasil diterbitkan dan diarsipkan!");

      // 6. Tampilkan pop-up sukses
      setSuccessOpen(true);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Gagal menetapkan Berita Acara.");
    } finally {
      setSubmitting(false);
    }
  };

  const canNext = () => {
    if (step === 1) return nomorSurat.trim() && tglSurat && namaKadis.trim() && nipKadis.trim();
    if (step === 2) return parsedRowCount > 0 && jenisKib;
    if (step === 3) return tembusan.filter(t => t.trim()).length > 0;
    return true;
  };

  const tglSuratFormatted = tglSurat ? new Date(tglSurat).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const tglPenelusuranFormatted = tglPenelusuran ? new Date(tglPenelusuran).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-blue-700" />
            Terbitkan Berita Acara
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-1 mb-4">
          {steps.map((label, i) => (
            <div key={i} className="flex-1 flex items-center gap-1">
              <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold shrink-0 transition-colors ${
                step > i + 1 ? "bg-blue-600 text-white" : step === i + 1 ? "bg-primary text-primary-foreground" : "bg-gray-100 text-gray-500"
              }`}>
                {step > i + 1 ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-[11px] font-medium truncate hidden sm:inline ${step === i + 1 ? "text-gray-900" : "text-gray-500"}`}>{label}</span>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 rounded ${step > i + 1 ? "bg-blue-600" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Administrasi */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Nomor Surat <span className="text-destructive">*</span></Label>
                <Input placeholder="Contoh: 028/1274/Dinperkim" value={nomorSurat} onChange={e => setNomorSurat(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Tanggal Surat <span className="text-destructive">*</span></Label>
                <Input type="date" value={tglSurat} onChange={e => setTglSurat(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tanggal Penelusuran Fisik</Label>
              <Input type="date" value={tglPenelusuran} onChange={e => setTglPenelusuran(e.target.value)} />
            </div>
            <div className="rounded-md border border-gray-200 p-4 space-y-3 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Data Otorisasi (Kepala Dinas)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Nama Lengkap <span className="text-destructive">*</span></Label>
                  <Input placeholder="Nama Kepala Dinas" value={namaKadis} onChange={e => setNamaKadis(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">NIP <span className="text-destructive">*</span></Label>
                  <Input placeholder="NIP Kepala Dinas" value={nipKadis} onChange={e => setNipKadis(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Jabatan</Label>
                <Textarea rows={2} value={jabatanKadis} onChange={e => setJabatanKadis(e.target.value)} />
              </div>
            </div>

            <div className="rounded-md border border-gray-200 p-4 space-y-4 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Dokumen Berita Acara (BA) & Surat Pernyataan (SP)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Nomor Berita Acara</Label>
                  <Input placeholder="Contoh: 028/BA/2026" value={nomorBA} onChange={e => setNomorBA(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Tanggal Berita Acara</Label>
                  <Input type="date" value={tanggalBA} onChange={e => setTanggalBA(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Nomor Surat Pernyataan</Label>
                  <Input placeholder="Contoh: 028/SP/2026" value={nomorSP} onChange={e => setNomorSP(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Tanggal Surat Pernyataan</Label>
                  <Input type="date" value={tanggalSP} onChange={e => setTanggalSP(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="rounded-md border border-gray-200 p-4 space-y-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tim Pemeriksa (minimal 2)</p>
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addPemeriksa}>
                  <Plus className="h-3.5 w-3.5" /> Tambah
                </Button>
              </div>
              {timPemeriksa.map((p, i) => (
                <div key={i} className="rounded-md border border-gray-200 bg-white p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-600">Pemeriksa {i + 1}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      disabled={timPemeriksa.length <= 2}
                      onClick={() => removePemeriksa(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Input placeholder="Nama" value={p.nama} onChange={e => updatePemeriksa(i, "nama", e.target.value)} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input placeholder="NIP" value={p.nip} onChange={e => updatePemeriksa(i, "nip", e.target.value)} />
                    <Input placeholder="Pangkat/Golongan" value={p.pangkat} onChange={e => updatePemeriksa(i, "pangkat", e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Dynamic Asset Selector */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Pilih Jenis KIB <span className="text-destructive">*</span></Label>
              <Select value={jenisKib} onValueChange={setJenisKib}>
                <SelectTrigger><SelectValue placeholder="Pilih KIB..." /></SelectTrigger>
                <SelectContent>
                  {masterKib.filter(k => !!k.label).map(k => (
                    <SelectItem key={k.id} value={k.label}>
                      <span className="font-mono text-muted-foreground mr-2">{k.code}</span>{k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {jenisKib ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ListChecks className="h-4 w-4 text-blue-700" />
                    <span>
                      {isFetchingApproved ? "Memuat aset finalisasi rekon..." : `${filteredAssets.length} aset siap ditetapkan (status_rekon = draft_pengajuan)`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleAll}
                      disabled={isFetchingApproved || filteredAssets.length === 0}
                      className="gap-1.5 text-xs"
                    >
                      {selectedAssetIds.size === filteredAssets.length && filteredAssets.length > 0
                        ? <Check className="h-3.5 w-3.5" />
                        : <ListChecks className="h-3.5 w-3.5" />}
                      {selectedAssetIds.size === filteredAssets.length && filteredAssets.length > 0
                        ? "Batalkan Pilih Semua"
                        : "Pilih Semua"}
                    </Button>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[11px] px-2 py-1">
                      {selectedAssetIds.size} dipilih
                    </Badge>
                  </div>
                </div>

                <div className="rounded-md border border-gray-200 overflow-hidden">
                  <div className="max-h-[360px] overflow-y-auto overflow-x-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-12 bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 text-center">
                            <span className="sr-only">Select</span>
                          </TableHead>
                          <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 whitespace-nowrap">Kode Barang</TableHead>
                          <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200">Nama Barang</TableHead>
                          <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 whitespace-nowrap">Kondisi</TableHead>
                          <TableHead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider py-2 px-2.5 border-b border-gray-200 whitespace-nowrap text-right">Nilai Perolehan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isFetchingApproved ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-full max-w-[280px]" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                            </TableRow>
                          ))
                        ) : filteredAssets.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="h-32 text-center text-[13px] text-gray-500">
                              Belum ada aset pada tahap <span className="font-medium">Finalisasi Rekon</span> untuk KIB ini, atau semua sudah diterbitkan Berita Acaranya.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredAssets.map((a: any) => {
                            const checked = selectedAssetIds.has(a.id);
                            return (
                              <TableRow
                                key={a.id}
                                onClick={() => toggleAsset(a.id)}
                                className={`cursor-pointer transition-colors ${checked ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-gray-50"}`}
                              >
                                <TableCell className="text-center py-1.5 px-2.5">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleAsset(a.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                                  />
                                </TableCell>
                                <TableCell className="py-1.5 px-2.5">
                                  <span className="text-xs font-mono text-gray-500 whitespace-nowrap">{a.kode_aset || "-"}</span>
                                </TableCell>
                                <TableCell className="py-1.5 px-2.5">
                                  <div className="max-w-[320px]">
                                    <p className="text-[13px] font-medium text-gray-800 truncate">{a.nama_aset || _psNama(a)}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="py-1.5 px-2.5 whitespace-nowrap">
                                  <Badge variant="outline" className="px-2 py-0.5 text-[11px] font-semibold rounded border inline-flex items-center bg-slate-100 text-slate-700 border-slate-200">
                                    {_apKondisi(a)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="py-1.5 px-2.5 text-right whitespace-nowrap font-mono text-[13px] text-gray-800">
                                  Rp {_apNilai(a).toLocaleString("id-ID")}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {parsedRowCount > 0 && (
                  <div className="flex items-start gap-3 rounded-md bg-blue-50 border border-blue-200 p-4">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[13px] font-semibold text-blue-700">{parsedRowCount} Aset Terpilih</p>
                      <p className="text-xs text-blue-700 mt-0.5">
                        Total Nilai Perolehan: <strong>Rp {parsedTotalNilai.toLocaleString("id-ID")}</strong>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-[13px] text-gray-500 bg-gray-50">
                <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Pilih Jenis KIB terlebih dahulu untuk melihat daftar aset pada tahap Finalisasi Rekon (pra-pengajuan).
              </div>
            )}
          </div>
        )}

        {/* Step 3: Tembusan */}
        {step === 3 && (
          <div className="space-y-3">
            <Label className="text-xs font-medium">Daftar Tembusan</Label>
            {tembusan.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                <Input value={t} onChange={e => setTembusan(prev => prev.map((x, j) => j === i ? e.target.value : x))} className="flex-1" />
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setTembusan(prev => prev.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1.5 w-full" onClick={() => setTembusan(prev => [...prev, ""])}>
              <Plus className="h-3.5 w-3.5" /> Tambah Tembusan
            </Button>
          </div>
        )}

        {/* Step 4: Preview & Submit */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Setelah menekan tombol di bawah, <strong>{parsedRowCount} aset</strong> akan ditandai
                <span className="font-medium"> "Sudah Ditetapkan Dalam Berita Acara"</span> dan diberi cap
                <code className="mx-1 px-1.5 py-0.5 bg-amber-100 rounded text-[10px] font-mono">no_berita_acara</code>
                serta <code className="mx-1 px-1.5 py-0.5 bg-amber-100 rounded text-[10px] font-mono">tanggal_berita_acara</code>
                pada metadata aset. Aset ini otomatis hilang dari selector Berita Acara selanjutnya (pencegah duplikasi).
              </p>
            </div>
            <div className="rounded-md border border-gray-200 p-4 space-y-2 bg-gray-50 text-[13px]">
              <p><strong>Nomor Berita Acara:</strong> {nomorSurat}</p>
              <p><strong>Tanggal Berita Acara:</strong> {tglSuratFormatted}</p>
              <p><strong>Jenis KIB:</strong> {jenisKib}</p>
              <p><strong>Jumlah Aset:</strong> {parsedRowCount} item</p>
              <p><strong>Total Nilai:</strong> Rp {parsedTotalNilai.toLocaleString("id-ID")}</p>
              <p><strong>Pejabat Otorisasi:</strong> {namaKadis} (NIP. {nipKadis})</p>
              <p><strong>Tembusan:</strong> {tembusan.filter(t => t.trim()).length} pihak</p>
            </div>

            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2">
              <p className="text-xs font-medium text-blue-800">Pratinjau Draf Dokumen</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 bg-white" disabled={previewing !== ""} onClick={() => openDraftPreview("BA")}>
                  {previewing === "BA" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Lihat Draf BA
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 bg-white" disabled={previewing !== ""} onClick={() => openDraftPreview("SP")}>
                  {previewing === "SP" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Lihat Draf SP
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button variant="outline" onClick={() => step === 1 ? onClose() : setStep(s => s - 1)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> {step === 1 ? "Batal" : "Kembali"}
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="gap-1.5">
              Lanjut <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {submitting ? "Memproses..." : "Tetapkan & Arsipkan Berita Acara"}
            </Button>
          )}
        </div>
      </DialogContent>

      <AlertDialog open={successOpen} onOpenChange={(o) => { if (!o) setSuccessOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-blue-700">
              <CheckCircle2 className="h-5 w-5" /> Berita Acara Berhasil Diterbitkan
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed pt-2">
              Berita Acara berhasil diterbitkan dan diarsipkan! Silakan unduh dokumen lengkap dengan lampirannya melalui
              menu <strong>Pusat Arsip Berita Acara</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <AlertDialogAction
              onClick={() => { setSuccessOpen(false); onClose(); }}
              className="bg-transparent text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-none"
            >
              Tetap di Halaman Ini
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => { setSuccessOpen(false); onClose(); navigate("/dashboard/finalisasi-rekon"); }}
              className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Buka Pusat Arsip <ArrowRight className="h-4 w-4" />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// ─── Reprint Dialog ─────────────────────────────────────
function ReprintDialog({ arc, onClose, tenantSettings }: { arc: any; onClose: () => void; tenantSettings?: any }) {
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

  const openDraft = (kind: "BA" | "SP") => {
    setPreviewing(kind);
    try {
      const input = buildInput();
      const blob = kind === "BA" ? generateBeritaAcaraPDF(input) : generateSuratPernyataanPDF(input);
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
          <p><strong>ID Unik Batch:</strong> {arc.nomor_surat}</p>
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
