import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCustomColumns } from "@/contexts/CustomColumnsContext";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type ArchiveRow = any;

function _psNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;
  const cleaned = s.split(",")[0].replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

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

// ─── PDF Generator Helper ───────────────────────────────
async function generatePDF(page1Id: string, page2BaseId: string, filename: string) {
  const el1 = document.getElementById(page1Id);
  if (!el1) throw new Error("Page 1 element not found");

  const canvas1 = await html2canvas(el1, { scale: 2, useCORS: true, logging: false });
  const imgData1 = canvas1.toDataURL("image/png");

  // F4 Portrait: 215 x 330 mm
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [215, 330] });
  const pW = 215, pH = 330;
  const margin = 15;
  const contentW = pW - margin * 2;
  const imgH1 = (canvas1.height * contentW) / canvas1.width;
  pdf.addImage(imgData1, "PNG", margin, margin, contentW, Math.min(imgH1, pH - margin * 2));

  // Loop through all landscape chunks
  let i = 0;
  while (true) {
    const el2 = document.getElementById(`${page2BaseId}-${i}`);
    if (!el2) break; // No more chunks
    
    const canvas2 = await html2canvas(el2, { scale: 2, useCORS: true, logging: false });
    const imgData2 = canvas2.toDataURL("image/png");
    
    // F4 Landscape: 330 x 215 mm
    pdf.addPage([215, 330], "landscape");
    const lW = 330, lH = 215;
    const cW2 = lW - margin * 2;
    const imgH2 = (canvas2.height * cW2) / canvas2.width; // Kunci Proporsi
    pdf.addImage(imgData2, "PNG", margin, margin, cW2, Math.min(imgH2, lH - margin * 2));
    
    i++;
  }

  pdf.save(filename);
}

// ─── Shared PDF Inline Styles ───────────────────────────
const S = {
  wrap1: { position: "fixed" as const, top: "-9999px", left: "-9999px", width: "900px", fontFamily: "Arial, sans-serif", color: "#000", background: "#fff" },
  page1: { width: "900px", minHeight: "1300px", padding: "60px", backgroundColor: "#fff", color: "#000", fontSize: "18px", lineHeight: "1.6" as const },
  kopBox: { display: "flex", alignItems: "center", gap: "20px", borderBottom: "4px solid #000", paddingBottom: "12px" },
  kopLogo: { width: "130px", flexShrink: 0 },
  kopTitle: { fontWeight: "bold" as const, fontSize: "28px", letterSpacing: "1px" },
  kopSub: { fontWeight: "bold" as const, fontSize: "20px" },
  kopAddr: { fontSize: "14px", marginTop: "4px" },
  judul: { fontWeight: "bold" as const, textDecoration: "underline" as const, fontSize: "20px", textAlign: "center" as const },
  nomor: { fontSize: "18px", marginTop: "6px", textAlign: "center" as const },
  para: { textAlign: "justify" as const, marginBottom: "24px", fontSize: "18px", lineHeight: "1.6" },
  paraIndent: { textAlign: "justify" as const, marginBottom: "24px", fontSize: "18px", lineHeight: "1.6", textIndent: "30px" },
  idTable: { marginLeft: "30px", marginBottom: "24px", fontSize: "18px" },
  idTd: { paddingRight: "24px", verticalAlign: "top" as const, fontSize: "18px" },
  signBlock: { display: "flex", justifyContent: "flex-end", marginBottom: "60px" },
  signInner: { textAlign: "center" as const, width: "380px", fontSize: "18px", lineHeight: "1.5" },
  tembusanBox: { fontSize: "16px", lineHeight: "1.5", marginTop: "20px" },
  wrap2: { position: "fixed" as const, top: "-9999px", left: "-9999px", width: "330mm", fontFamily: "Arial, sans-serif", color: "#000", background: "#fff" },
  page2: { width: "330mm", minHeight: "215mm", padding: "15mm", backgroundColor: "#fff", color: "#000", boxSizing: "border-box" as const },
  p2Header: { marginBottom: "12px", fontSize: "12px", lineHeight: "1.15" },
  p2Title: { fontWeight: "bold" as const, textAlign: "center" as const, fontSize: "13px", marginBottom: "4px", lineHeight: "1.15" },
  p2Sub: { fontWeight: "bold" as const, textAlign: "center" as const, fontSize: "12px", marginBottom: "16px", lineHeight: "1.15" },
  tbl: { width: "100%", borderCollapse: "collapse" as const, tableLayout: "auto" as const, fontSize: "11px", lineHeight: "1.15" },
  th: { border: "1px solid #000", padding: "8px 4px", fontWeight: "bold" as const, verticalAlign: "middle" as const, wordWrap: "break-word" as const, fontSize: "11px" },
  td: { border: "1px solid #000", padding: "8px 4px", verticalAlign: "middle" as const, wordWrap: "break-word" as const, fontSize: "11px" },
  p2Sign: { display: "flex", justifyContent: "flex-end", marginTop: "30px" },
  p2SignInner: { textAlign: "center" as const, fontSize: "12px", width: "300px", lineHeight: "1.15" },
};

const DEFAULT_SETTINGS = {
  pemda_name: "PEMERINTAH KABUPATEN BANDUNG",
  dinas_name: "DINAS PERUMAHAN, KAWASAN PERMUKIMAN DAN PERTANAHAN",
  dinas_address: "Jl. Raya Soreang KM 17 Telp. (022) 5893660 Soreang 40911 Kabupaten Bandung Provinsi Jawa Barat,",
  dinas_contact: "E-mail : disperkimtan@bandungkab.go.id Website : www.bandungkab.go.id",
  font_size_pemda: 28,
  font_size_dinas: 20,
  font_size_address: 14,
  margin_top: 60,
};

// ─── Reusable Off-Screen PDF Pages ──────────────────────
function PdfPages({ id1, id2, data, tenantSettings }: {
  id1: string; id2: string;
  data: { nomorSurat: string; tglSurat: string; tglPen: string; nama: string; nip: string; jabatan: string; tembusan: string[]; headers: string[]; rows: any[]; totalNilai: number; nilaiKey: string };
  tenantSettings?: any;
}) {
  const { nomorSurat, tglSurat, tglPen, nama, nip, jabatan, tembusan, headers, rows, totalNilai, nilaiKey } = data;
  const st = { ...DEFAULT_SETTINGS, ...(tenantSettings || {}) };
  // Determine which column is the "nilai" column for right-align + total row
  const nilaiIdx = headers.findIndex(h => h === nilaiKey);
  
  // LOGIKA CHUNKING MULTI-PAGE
  const MAX_ROWS_PER_PAGE = 10;
  const chunks: any[][] = [];
  for (let i = 0; i < rows.length; i += MAX_ROWS_PER_PAGE) {
    chunks.push(rows.slice(i, i + MAX_ROWS_PER_PAGE));
  }
  return (
    <>
      <div style={S.wrap1}>
        <div id={id1} style={{ ...S.page1, paddingTop: `${st.margin_top}px` }}>
          <div style={S.kopBox}>
            <div style={S.kopLogo}>
              <img src="/logo-bandung.png" alt="Logo" style={{ width: "100%", height: "auto", objectFit: "contain" }} crossOrigin="anonymous" />
            </div>
            <div style={{ textAlign: "center", flex: 1 }}>
              <p style={{ ...S.kopTitle, fontSize: `${st.font_size_pemda}px` }}>{st.pemda_name}</p>
              <p style={{ ...S.kopSub, fontSize: `${st.font_size_dinas}px` }}>{st.dinas_name}</p>
              <p style={{ ...S.kopAddr, fontSize: `${st.font_size_address}px` }}>{st.dinas_address}</p>
              <p style={{ fontSize: `${st.font_size_address}px` }}>{st.dinas_contact}</p>
            </div>
          </div>
          <div style={{ borderBottom: "1px solid #000", marginTop: "2px", marginBottom: "30px" }} />

          <div style={{ textAlign: "center", marginBottom: "30px" }}>
            <p style={S.judul}>SURAT PERNYATAAN PENGAJUAN PERUBAHAN KONDISI BMD</p>
            <p style={S.nomor}>Nomor : {nomorSurat}</p>
          </div>
          <p style={S.paraIndent}>Berdasarkan hasil penelusuran fisik BMD yang dilakukan pada <strong>{tglPen}</strong>, yang bertanda tangan di bawah ini :</p>
          <table style={S.idTable}><tbody>
            <tr><td style={S.idTd}>Nama</td><td style={{ paddingRight: "10px" }}>:</td><td>{nama}</td></tr>
            <tr><td style={S.idTd}>NIP</td><td style={{ paddingRight: "10px" }}>:</td><td>{nip}</td></tr>
            <tr><td style={S.idTd}>Jabatan</td><td style={{ paddingRight: "10px" }}>:</td><td>{jabatan}</td></tr>
          </tbody></table>
          <p style={S.para}>Menyatakan dengan sebenarnya bahwa barang dalam penguasaan kami sebagaimana terlampir sudah rusak berat dan tidak dapat dioperasionalkan kembali dalam pelayanan umum untuk mendukungi tugas pokok dan fungsi Perangkat Daerah kami.</p>
          <p style={S.para}>Untuk itu kami menyatakan pengajuan untuk merubah kondisi barang tersebut.</p>
          <p style={{ ...S.para, marginBottom: "48px" }}>Demikian untuk dapat diketahui, sebagai bahan lebih lanjut.</p>
          <div style={S.signBlock}>
            <div style={S.signInner}>
              <p>Soreang, {tglSurat}</p>
              <p style={{ marginTop: "6px" }}>{jabatan?.includes(",") ? jabatan.split(",")[0] + "," : jabatan}</p>
              {jabatan?.includes(",") && <p>{jabatan.split(",").slice(1).join(",").trim()}</p>}
              <div style={{ height: "120px" }} />
              <div style={{ display: "inline-block", borderBottom: "2px solid #000", paddingBottom: "2px", fontWeight: "bold", marginBottom: "4px" }}>
                {(nama || "").toUpperCase()}
              </div>
              <p>NIP. {nip}</p>
            </div>
          </div>
          <div style={S.tembusanBox}>
            <p style={{ marginBottom: "6px" }}><strong>Tembusan</strong>, Kepada Yth :</p>
            <div>
              {tembusan.filter(t => t.trim()).map((t, i) => (
                <p key={i} style={{ paddingLeft: "24px", textIndent: "-24px", margin: 0, marginBottom: "4px" }}>
                  {i + 1}. <span style={{ marginLeft: "4px" }}>{t};</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
      {chunks.length > 0 && (
        <div style={S.wrap2}>
          {chunks.map((chunkRows, chunkIndex) => {
            const isLastChunk = chunkIndex === chunks.length - 1;
            const globalOffset = chunkIndex * MAX_ROWS_PER_PAGE;
            return (
              <div key={chunkIndex} id={`${id2}-${chunkIndex}`} style={{ ...S.page2 }}>
                <div style={S.p2Header}>
                  <p>Lampiran I (Rubah Kondisi BMD)</p>
                  <p>Nomor : {nomorSurat}</p>
                  <p>Tanggal : {tglSurat}</p>
                </div>
                <p style={S.p2Title}>DAFTAR BARANG MILIK DAERAH YANG DIUSULKAN PERUBAHAN KONDISI</p>
                <p style={{ ...S.p2Sub }}>{st.dinas_name}</p>
                <table style={S.tbl}>
                  <thead><tr>
                    <th style={{ ...S.th, textAlign: "center", width: "30px" }}>No</th>
                    {headers.map((h, hi) => (
                      <th key={hi} style={{ ...S.th, ...(hi === nilaiIdx ? { textAlign: "right", whiteSpace: "nowrap" } : {}) }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {chunkRows.map((r: any, i: number) => (
                      <tr key={i}>
                        <td style={{ ...S.td, textAlign: "center" }}>{globalOffset + i + 1}</td>
                        {headers.map((h, hi) => {
                          const val = r[h] ?? "";
                          const isNilai = hi === nilaiIdx;
                          return (
                            <td key={hi} style={{ ...S.td, ...(isNilai ? { textAlign: "right", whiteSpace: "nowrap" } : {}) }}>
                              {isNilai && Number(val) > 0 ? new Intl.NumberFormat('id-ID').format(Number(val)) : String(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {isLastChunk && (
                      <tr>
                        <td style={{ ...S.td }} />
                        <td colSpan={headers.length - 1} style={{ ...S.td, fontWeight: "bold", textAlign: "right", paddingRight: "12px" }}>TOTAL</td>
                        <td style={{ ...S.td, fontWeight: "bold", textAlign: "right", whiteSpace: "nowrap" }}>{new Intl.NumberFormat('id-ID').format(totalNilai)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {isLastChunk && (
                  <div style={S.p2Sign}>
                    <div style={S.p2SignInner}>
                      <p>Soreang, {tglSurat}</p>
                      <p style={{ marginTop: "6px" }}>{jabatan?.includes(",") ? jabatan.split(",")[0] + "," : jabatan}</p>
                      {jabatan?.includes(",") && <p>{jabatan.split(",").slice(1).join(",").trim()}</p>}
                      <div style={{ height: "80px" }} />
                      <div style={{ display: "inline-block", borderBottom: "2px solid #000", paddingBottom: "2px", fontWeight: "bold", marginBottom: "4px" }}>
                        {(nama || "").toUpperCase()}
                      </div>
                      <p>NIP. {nip}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────
export default function PengajuanSuratPage() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reprintArc, setReprintArc] = useState<any>(null);

  const { data: archives = [], isLoading } = useQuery({
    queryKey: ["document-archives", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_archives")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
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
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <FileSignature className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Penerbitan Berita Acara
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Tetapkan dan cetak dokumen Berita Acara Hasil Akhir untuk aset BMD yang telah disetujui BKAD.
          </p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => setWizardOpen(true)}>
          <Plus className="h-4 w-4" /> Terbitkan Berita Acara Baru
        </Button>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Riwayat Arsip Dokumen</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : archives.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Belum ada arsip Berita Acara.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ID Unik Batch</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tanggal</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jenis KIB</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Total Aset</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Total Nilai</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Aksi</TableHead>
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
                      <TableRow key={arc.id}>
                        <TableCell className="text-sm font-medium">{arc.nomor_surat}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatTgl(arc.tanggal_surat)}</TableCell>
                        <TableCell className="text-sm">{arc.jenis_kib || "—"}</TableCell>
                        <TableCell className="text-center text-sm">{jumlahAset}</TableCell>
                        <TableCell className="text-right text-sm font-medium">Rp {totalNilai.toLocaleString("id-ID")}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-chart-3/10 text-chart-3 border-chart-3/30">{arc.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setReprintArc(arc)} title="Cetak Ulang">
                            <Printer className="h-4 w-4 text-primary" />
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
  const printRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [nomorSurat, setNomorSurat] = useState("");
  const [tglPenelusuran, setTglPenelusuran] = useState("");
  const [tglSurat, setTglSurat] = useState(new Date().toISOString().split("T")[0]);
  const [namaKadis, setNamaKadis] = useState("");
  const [nipKadis, setNipKadis] = useState("");
  const [jabatanKadis, setJabatanKadis] = useState("Kepala Dinas Perumahan, Kawasan Permukiman Dan Pertanahan, selaku Pengguna BMD");

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

  // ─── Dynamic Asset Selector Query (Hotfix: Company-only pull + stale cache) ──
  const { data: allCompanyAssets = [], isFetching: isFetchingApproved } = useQuery({
    queryKey: ["approved-assets-for-ba", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("assets")
        .select("id, kode_aset, nama_aset, kib, status_rekon, custom_data, nilai_perolehan, harga, lokasi_ruangan")
        .eq("company_id", companyId);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!(companyId && open && step >= 2),
  });

  // ─── useMemo: Filter Client-side Tolerant (Hotfix Empty Data & Slow Fetch) ──
  const filteredAssets = useMemo(() => {
    return allCompanyAssets.filter((a: any) => {
      const cd = (typeof a.custom_data === "object" && a.custom_data !== null)
        ? (a.custom_data as Record<string, any>)
        : {};

      // 1. Status Rekon: lowercase case-insensitive match
      //    Fallback chain: Cek kolom utama tabel dulu, lalu ke JSON custom_data
      const rawStatus = a.status_rekon || cd["status_rekon"] || "";
      const statusRekonRaw = String(rawStatus).trim().toLowerCase();
      if (statusRekonRaw !== "disetujui") return false;

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
      kode_barang: asset.kode_aset,
      kode_aset: asset.kode_aset,
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

  // Tutup Periode & Save (Finalisasi Berita Acara)
  const handleSubmit = async () => {
    if (!companyId) return;
    setSubmitting(true);
    try {
      // Build payload snapshot full aset terpilih
      const assetSnapshotFull = selectedAssets.map((a: any) => _buildAssetSnapshot(a));

      // 1. Save document archive — status: "Berita Acara Ditetapkan"
      //    data_otorisasi adalah ARRAY aset (mirip payload PapanRekonsiliasi) + metadata otorisasi
      const otorisasiPayload: any = {
        nama: namaKadis,
        nip: nipKadis,
        jabatan: jabatanKadis,
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
        data_otorisasi: otorisasiPayload as any,
        status: "Berita Acara Ditetapkan",
      });
      if (insertErr) throw insertErr;

      // 2. Bulk update assets — TAMBAHKAN FLAG Berita Acara, JANGAN UBAH KONDISI
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

      // 3. Invalidate caches
      queryClient.invalidateQueries({ queryKey: ["document-archives"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["rekon-assets-joined"] });
      queryClient.invalidateQueries({ queryKey: ["approved-assets-for-ba"] });

      toast.success("Berita Acara berhasil ditetapkan & disimpan!");

      // 4. Generate PDF via jsPDF
      try {
        await new Promise(r => setTimeout(r, 300));
        await generatePDF("pdf-page-1", "pdf-page-2", `Berita_Acara_BMD_${nomorSurat.replace(/\//g, "-")}.pdf`);
      } catch (pdfErr) {
        console.warn("PDF generation failed:", pdfErr);
      }
      onClose();
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
            <FileSignature className="h-5 w-5 text-primary" />
            Terbitkan Berita Acara
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-1 mb-4">
          {steps.map((label, i) => (
            <div key={i} className="flex-1 flex items-center gap-1">
              <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold shrink-0 transition-colors ${
                step > i + 1 ? "bg-chart-3 text-white" : step === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {step > i + 1 ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-[11px] font-medium truncate hidden sm:inline ${step === i + 1 ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 rounded ${step > i + 1 ? "bg-chart-3" : "bg-border"}`} />}
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
            <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data Otorisasi (Kepala Dinas)</p>
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
                    <ListChecks className="h-4 w-4 text-primary" />
                    <span>
                      {isFetchingApproved ? "Memuat aset disetujui..." : `${filteredAssets.length} aset siap ditetapkan (status_rekon = disetujui)`}
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

                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="max-h-[360px] overflow-y-auto overflow-x-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
                            <span className="sr-only">Select</span>
                          </TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Kode Barang</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nama Barang</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Kondisi</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap text-right">Nilai Perolehan</TableHead>
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
                            <TableCell colSpan={5} className="h-32 text-center text-sm text-muted-foreground">
                              Belum ada aset dengan status <span className="font-medium">disetujui BKAD</span> untuk KIB ini, atau semua sudah ditetapkan dalam Berita Acara.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredAssets.map((a: any) => {
                            const checked = selectedAssetIds.has(a.id);
                            return (
                              <TableRow
                                key={a.id}
                                onClick={() => toggleAsset(a.id)}
                                className={`cursor-pointer transition-colors ${checked ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"}`}
                              >
                                <TableCell className="text-center py-3">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleAsset(a.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                  />
                                </TableCell>
                                <TableCell className="py-3">
                                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{a.kode_aset || "-"}</span>
                                </TableCell>
                                <TableCell className="py-3">
                                  <div className="max-w-[320px]">
                                    <p className="text-sm font-medium text-foreground truncate">{a.nama_aset || _psNama(a)}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="py-3 whitespace-nowrap">
                                  <Badge variant="outline" className="bg-muted/50 border-border text-[11px] px-2 py-0.5">
                                    {_apKondisi(a)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="py-3 text-right whitespace-nowrap font-mono text-sm">
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
                  <div className="flex items-start gap-3 rounded-lg bg-chart-3/10 border border-chart-3/30 p-4">
                    <CheckCircle2 className="h-5 w-5 text-chart-3 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-chart-3">{parsedRowCount} Aset Terpilih</p>
                      <p className="text-xs text-chart-3/80 mt-0.5">
                        Total Nilai Perolehan: <strong>Rp {parsedTotalNilai.toLocaleString("id-ID")}</strong>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground bg-muted/20">
                <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Pilih Jenis KIB terlebih dahulu untuk melihat daftar aset yang telah disetujui BKAD.
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
            <div className="flex items-start gap-2 rounded-lg bg-chart-3/10 border border-chart-3/30 p-3">
              <AlertCircle className="h-4 w-4 text-chart-6 shrink-0 mt-0.5" />
              <p className="text-xs text-chart-7">
                Setelah menekan tombol di bawah, <strong>{parsedRowCount} aset</strong> akan ditandai
                <span className="font-medium"> "Sudah Ditetapkan Dalam Berita Acara"</span> dan diberi cap
                <code className="mx-1 px-1.5 py-0.5 bg-chart-3/20 rounded text-[10px] font-mono">no_berita_acara</code>
                serta <code className="mx-1 px-1.5 py-0.5 bg-chart-3/20 rounded text-[10px] font-mono">tanggal_berita_acara</code>
                pada metadata aset. Aset ini otomatis hilang dari selector Berita Acara selanjutnya (pencegah duplikasi).
              </p>
            </div>
            <div className="rounded-lg border border-border p-4 space-y-2 bg-muted/20 text-sm">
              <p><strong>Nomor Berita Acara:</strong> {nomorSurat}</p>
              <p><strong>Tanggal Berita Acara:</strong> {tglSuratFormatted}</p>
              <p><strong>Jenis KIB:</strong> {jenisKib}</p>
              <p><strong>Jumlah Aset:</strong> {parsedRowCount} item</p>
              <p><strong>Total Nilai:</strong> Rp {parsedTotalNilai.toLocaleString("id-ID")}</p>
              <p><strong>Pejabat Otorisasi:</strong> {namaKadis} (NIP. {nipKadis})</p>
              <p><strong>Tembusan:</strong> {tembusan.filter(t => t.trim()).length} pihak</p>
            </div>
          </div>
        )}

        {/* ═══ OFF-SCREEN PDF Containers ═══ */}
        {step === 4 && (
          <PdfPages id1="pdf-page-1" id2="pdf-page-2" data={{
            nomorSurat, tglSurat: tglSuratFormatted, tglPen: tglPenelusuranFormatted,
            nama: namaKadis, nip: nipKadis, jabatan: jabatanKadis,
            tembusan, headers: parsedHeaders, rows: parsedRows, totalNilai: parsedTotalNilai, nilaiKey: parsedNilaiKey,
          }} tenantSettings={tenantSettings} />
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
            <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5 bg-chart-3 hover:bg-chart-3/90 text-white">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {submitting ? "Memproses..." : "Tetapkan & Cetak Berita Acara"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reprint Dialog ─────────────────────────────────────
function ReprintDialog({ arc, onClose, tenantSettings }: { arc: any; onClose: () => void; tenantSettings?: any }) {
  const ot = arc.data_otorisasi || {};
  const tmb: string[] = (arc.tembusan || []).filter((t: string) => t?.trim());
  const tglSurat = arc.tanggal_surat ? new Date(arc.tanggal_surat).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const tglPen = arc.tanggal_penelusuran ? new Date(arc.tanggal_penelusuran).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : tglSurat;
  const [downloading, setDownloading] = useState(false);

  const built = _psBuildLampiranRows(arc);
  const totalNilaiDisplay = built.total > 0 ? built.total : (typeof arc.total_nilai === "number" ? arc.total_nilai : 0);
  const jumlahAsetDisplay =
    (typeof arc.total_aset === "number" && arc.total_aset > 0) ? arc.total_aset : built.rows.length;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await new Promise(r => setTimeout(r, 300));
      await generatePDF("reprint-page-1", "reprint-page-2", `Surat_${arc.nomor_surat?.replace(/\//g, "-") || "BMD"}.pdf`);
    } catch (err) { console.error(err); toast.error("Gagal generate PDF."); }
    finally { setDownloading(false); }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-primary" /> Unduh Ulang Surat</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-border p-4 space-y-2 bg-muted/20 text-sm">
          <p><strong>ID Unik Batch:</strong> {arc.nomor_surat}</p>
          <p><strong>Tanggal:</strong> {tglSurat}</p>
          <p><strong>Jenis KIB:</strong> {arc.jenis_kib || "—"}</p>
          <p><strong>Jumlah Aset:</strong> {jumlahAsetDisplay} item</p>
          <p><strong>Total Nilai:</strong> Rp {totalNilaiDisplay.toLocaleString("id-ID")}</p>
          <p><strong>Kepala Dinas:</strong> {ot.nama || "—"} (NIP. {ot.nip || "—"})</p>
        </div>
        <div className="flex justify-end pt-3 border-t border-border">
          <Button onClick={handleDownload} disabled={downloading} className="gap-1.5">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "Memproses..." : "Unduh PDF"}
          </Button>
        </div>
      </DialogContent>

      <PdfPages id1="reprint-page-1" id2="reprint-page-2" data={{
        nomorSurat: arc.nomor_surat || "", tglSurat, tglPen,
        nama: ot.nama || "", nip: ot.nip || "", jabatan: ot.jabatan || "",
        tembusan: tmb,
        headers: built.headers,
        rows: built.rows,
        totalNilai: totalNilaiDisplay,
        nilaiKey: built.nilaiKey,
      }} tenantSettings={tenantSettings} />
    </Dialog>
  );
}
