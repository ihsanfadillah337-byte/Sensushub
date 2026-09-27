import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  Archive, Search, ChevronLeft, ChevronRight, Loader2, Package,
  Printer, Download, Filter, Calendar, FileCheck2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// ─── PDF Generator ───────────────────────────────────────
async function generatePDF(page1Id: string, page2BaseId: string, filename: string) {
  const el1 = document.getElementById(page1Id);
  if (!el1) throw new Error("Page 1 element not found");
  const canvas1 = await html2canvas(el1, { scale: 2, useCORS: true, logging: false });
  const imgData1 = canvas1.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [215, 330] });
  const pW = 215, pH = 330;
  const margin = 15;
  const contentW = pW - margin * 2;
  const imgH1 = (canvas1.height * contentW) / canvas1.width;
  pdf.addImage(imgData1, "PNG", margin, margin, contentW, Math.min(imgH1, pH - margin * 2));
  let i = 0;
  while (true) {
    const el2 = document.getElementById(`${page2BaseId}-${i}`);
    if (!el2) break;
    const canvas2 = await html2canvas(el2, { scale: 2, useCORS: true, logging: false });
    const imgData2 = canvas2.toDataURL("image/png");
    pdf.addPage([215, 330], "landscape");
    const lW = 330, lH = 215;
    const cW2 = lW - margin * 2;
    const imgH2 = (canvas2.height * cW2) / canvas2.width;
    pdf.addImage(imgData2, "PNG", margin, margin, cW2, Math.min(imgH2, lH - margin * 2));
    i++;
  }
  pdf.save(filename);
}

// ─── Shared PDF Inline Styles ────────────────────────────
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

// ─── Reusable Off-Screen PDF Pages ───────────────────────
function PdfPages({ id1, id2, data, tenantSettings }: {
  id1: string; id2: string;
  data: { nomorSurat: string; tglSurat: string; tglPen: string; nama: string; nip: string; jabatan: string; tembusan: string[]; headers: string[]; rows: any[]; totalNilai: number; nilaiKey: string };
  tenantSettings?: any;
}) {
  const { nomorSurat, tglSurat, tglPen, nama, nip, jabatan, tembusan, headers, rows, totalNilai, nilaiKey } = data;
  const st = { ...DEFAULT_SETTINGS, ...(tenantSettings || {}) };
  const nilaiIdx = headers.findIndex(h => h === nilaiKey);
  const MAX_ROWS_PER_PAGE = 10;
  const chunks: any[][] = [];
  for (let i = 0; i < rows.length; i += MAX_ROWS_PER_PAGE) chunks.push(rows.slice(i, i + MAX_ROWS_PER_PAGE));
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

// ─── Reprint Dialog (Arsip) ───────────────────────────────
function ReprintDialog({ arc, onClose, tenantSettings }: { arc: ArchiveRow; onClose: () => void; tenantSettings?: any }) {
  const ot = (typeof arc.data_otorisasi === "object" && arc.data_otorisasi) || {};
  const tmb: string[] = Array.isArray(arc.tembusan) ? (arc.tembusan as any[]).filter((t: any) => typeof t === "string" && t.trim()) : [];
  const tglSurat = arc.tanggal_surat ? new Date(arc.tanggal_surat).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const tglPen = arc.tanggal_penelusuran ? new Date(arc.tanggal_penelusuran).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : tglSurat;
  const [downloading, setDownloading] = useState(false);
  const built = _psBuildLampiranRows(arc);
  const totalNilaiDisplay = built.total > 0 ? built.total : (typeof arc.total_nilai === "number" ? arc.total_nilai : 0);
  const jumlahAsetDisplay = (typeof arc.total_aset === "number" && arc.total_aset > 0) ? arc.total_aset : built.rows.length;
  const handleDownload = async () => {
    setDownloading(true);
    try {
      await new Promise(r => setTimeout(r, 300));
      await generatePDF("reprint-page-1", "reprint-page-2", `Berita_Acara_${(arc.nomor_surat || "BMD").replace(/\//g, "-")}.pdf`);
      toast.success("PDF Berita Acara berhasil diunduh!");
    } catch (err) { console.error(err); toast.error("Gagal generate PDF."); }
    finally { setDownloading(false); }
  };
  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Printer className="h-5 w-5 text-primary" /> Cetak Ulang Berita Acara</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-border p-4 space-y-2 bg-muted/20 text-sm">
          <p><strong>ID Unik Batch:</strong> {arc.nomor_surat || "—"}</p>
          <p><strong>Tanggal Surat:</strong> {tglSurat}</p>
          <p><strong>Jenis KIB:</strong> {arc.jenis_kib || "—"}</p>
          <p><strong>Jumlah Aset:</strong> {jumlahAsetDisplay} item</p>
          <p><strong>Total Nilai:</strong> Rp {totalNilaiDisplay.toLocaleString("id-ID")}</p>
          <p><strong>Kepala Dinas:</strong> {(ot as any).nama || "—"} (NIP. {(ot as any).nip || "—"})</p>
          <p><strong>Status:</strong> <Badge variant="outline" className="bg-chart-3/10 text-chart-3 border-chart-3/30">{arc.status || "—"}</Badge></p>
        </div>
        <div className="flex justify-end pt-3 border-t border-border">
          <Button onClick={handleDownload} disabled={downloading} className="gap-1.5">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "Memproses..." : "Unduh PDF Lengkap"}
          </Button>
        </div>
      </DialogContent>
      <PdfPages id1="reprint-page-1" id2="reprint-page-2" data={{
        nomorSurat: arc.nomor_surat || "", tglSurat, tglPen,
        nama: (ot as any).nama || "", nip: (ot as any).nip || "", jabatan: (ot as any).jabatan || "",
        tembusan: tmb,
        headers: built.headers,
        rows: built.rows,
        totalNilai: totalNilaiDisplay,
        nilaiKey: built.nilaiKey,
      }} tenantSettings={tenantSettings} />
    </Dialog>
  );
}

// ─── Constants ───────────────────────────────────────────
const ITEMS_PER_PAGE = 10;
const KIB_OPTIONS = ["KIB A", "KIB B", "KIB C", "KIB D", "KIB E", "KIB F"];

// ─── Component ───────────────────────────────────────────
export default function FinalisasiRekon() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterKib, setFilterKib] = useState<string>("all");
  const [tglFrom, setTglFrom] = useState("");
  const [tglTo, setTglTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [reprintArc, setReprintArc] = useState<ArchiveRow | null>(null);

  // Fetch document_archives (sorted newest first)
  const { data: archives = [], isLoading } = useQuery({
    queryKey: ["document-archives", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_archives")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ArchiveRow[];
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
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Arsip Berita Acara
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Pusat arsip resmi Berita Acara penerbitan BMD. Cari, filter, dan cetak ulang dokumen lengkap dengan lampiran.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        <Archive className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-sm text-primary-foreground/90 dark:text-primary-foreground/80 leading-relaxed">
          Dokumen yang diterbitkan oleh Wizard akan langsung muncul di sini. Gunakan tombol aksi <strong>Cetak Ulang</strong> di sisi kanan
          tabel untuk mengunduh PDF lengkap dengan lampiran daftar aset (format 12 kolom resmi).
        </p>
      </div>

      {/* Filter + Search Card */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Filter className="h-4 w-4" /> Pencarian &amp; Filter Arsip
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                  {KIB_OPTIONS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilter}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                title="Reset filter"
              >
                Reset
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={tglFrom}
                onChange={(e) => { setTglFrom(e.target.value); setCurrentPage(1); }}
                className="pl-9"
                placeholder="Tanggal dari"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
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
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}
          </div>
        ) : filteredArchives.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
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
                    <TableHead className="w-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">No</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ID Unik Batch / Nomor Surat</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tanggal</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jenis KIB</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Jumlah Aset</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Total Nilai</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center w-32">Aksi</TableHead>
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
                      <TableRow key={arc.id} className="hover:bg-muted/30">
                        <TableCell className="text-center text-sm text-muted-foreground">{indexOfFirstItem + i + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{arc.nomor_surat || <span className="text-muted-foreground italic">—</span>}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatTgl(arc.tanggal_surat)}</TableCell>
                        <TableCell className="text-sm">{arc.jenis_kib || "—"}</TableCell>
                        <TableCell className="text-center text-sm">{jumlahAset}</TableCell>
                        <TableCell className="text-right text-sm font-medium">Rp {totalNilai.toLocaleString("id-ID")}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-chart-3/10 text-chart-3 border-chart-3/30 text-xs">
                            {arc.status || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 hover:bg-primary/10"
                            onClick={() => setReprintArc(arc)}
                            title="Cetak ulang Berita Acara lengkap dengan lampiran aset"
                          >
                            <Printer className="h-4 w-4 text-primary" />
                            <span className="text-xs font-medium text-primary">Cetak Ulang</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-border/60 bg-muted/20">
              <p className="text-xs text-muted-foreground">
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
                    <span key={`e-${idx}`} className="px-2 text-xs text-muted-foreground">…</span>
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
    </div>
  );
}
