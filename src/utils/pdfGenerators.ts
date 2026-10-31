import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Util numerik bersama ────────────────────────────────
// Dipakai generator PDF sekaligus halaman pemanggil (PengajuanSuratPage).
export function _psNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;
  const cleaned = s.split(",")[0].replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

// ─── Pengaturan default kop surat ────────────────────────
export const DEFAULT_SETTINGS = {
  pemda_name: "PEMERINTAH KABUPATEN BANDUNG",
  dinas_name: "DINAS PERUMAHAN, KAWASAN PERMUKIMAN DAN PERTANAHAN",
  dinas_address: "Jl. Raya Soreang KM 17 Telp. (022) 5893660 Soreang 40911 Kabupaten Bandung Provinsi Jawa Barat,",
  dinas_contact: "E-mail : disperkimtan@bandungkab.go.id Website : www.bandungkab.go.id",
  font_size_pemda: 28,
  font_size_dinas: 20,
  font_size_address: 14,
  margin_top: 60,
};

// ─── Dual-PDF Generator (Berita Acara & Surat Pernyataan) ───────────────
// Standar baku BKAD: Tabel Universal 13 Kolom + baris TOTAL. Murni jsPDF +
// autoTable, mengembalikan Blob (bukan doc.save()) untuk di-upload ke Storage.

const _baTableHeaders = [
  "NO", "KODE ASET", "NAMA ASET", "NO REG", "MERK/TYPE", "NOMOR POLISI",
  "NOMOR RANGKA", "NOMOR MESIN", "NOMOR BPKB", "BAHAN", "TAHUN PEROLEHAN",
  "ASAL USUL", "HARGA PEROLEHAN (RP)",
];

const _baMargin = 12;

function _baRowGet(row: any, keys: string[]): string {
  if (!row) return "";
  for (const k of keys) {
    const v = row[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function _baDash(v: string): string {
  return v && v.trim() ? v : "-";
}

function _baFmtDate(v?: string): string {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

// Bangun body Tabel Universal 13 Kolom dari snapshot aset.
function _baBuildUniversalRows(assets: any[]): { body: any[][]; total: number } {
  let total = 0;
  const body = (assets || []).map((a: any, idx: number) => {
    const harga = _psNumber(
      a?.["Nilai Perolehan"] ?? a?.["Nilai Aset"] ?? a?.nilai_perolehan ?? a?.harga
    );
    total += harga;
    return [
      String(idx + 1),
      _baDash(_baRowGet(a, ["kode_aset", "kode_barang", "Kode Barang"])),
      _baDash(_baRowGet(a, ["nama_aset", "nama_barang", "Nama Aset", "Nama Barang"])),
      _baDash(_baRowGet(a, ["no_register", "nomor_register", "No Register", "Nomor Register", "no_reg", "No. Register"])),
      _baDash(_baRowGet(a, ["Merek/Type", "merek", "Merek", "Type", "Tipe"])),
      _baDash(_baRowGet(a, ["Nomor Polisi", "nomor_polisi", "nopol", "No Polisi"])),
      _baDash(_baRowGet(a, ["Nomor Rangka", "nomor_rangka", "rangka", "No Rangka"])),
      _baDash(_baRowGet(a, ["Nomor Mesin", "nomor_mesin", "mesin", "No Mesin"])),
      _baDash(_baRowGet(a, ["Nomor BPKB", "nomor_bpkb", "bpkb", "No BPKB"])),
      _baDash(_baRowGet(a, ["Bahan", "bahan"])),
      _baDash(_baRowGet(a, ["Tahun Perolehan", "tahun_perolehan", "tahun", "Tahun"])),
      _baDash(_baRowGet(a, ["Asal Usul", "asal_usul", "Metode Perolehan", "metode_perolehan", "Cara Perolehan", "Perolehan"])),
      new Intl.NumberFormat("id-ID").format(harga),
    ];
  });
  return { body, total };
}

// Render Tabel Universal 13 Kolom ke dokumen + baris TOTAL (colSpan 1-12).
function _baRenderUniversalTable(doc: any, startY: number, assets: any[]): number {
  const { body, total } = _baBuildUniversalRows(assets);
  const foot = [[
    { content: "TOTAL", colSpan: 12, styles: { halign: "right" as const, fontStyle: "bold" as const } },
    { content: new Intl.NumberFormat("id-ID").format(total), styles: { halign: "right" as const, fontStyle: "bold" as const } },
  ]];
  autoTable(doc, {
    startY,
    head: [_baTableHeaders],
    body,
    foot,
    showFoot: "lastPage",
    theme: "grid",
    styles: { fontSize: 6, cellPadding: 1.2, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0], overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold", halign: "center", valign: "middle", fontSize: 6 },
    footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 6 },
    columnStyles: {
      0: { halign: "center", cellWidth: 7 },
      12: { halign: "right", cellWidth: 26 },
    },
    margin: { left: _baMargin, right: _baMargin, bottom: 14 },
  });
  return (doc as any).lastAutoTable?.finalY ?? startY;
}

// Kop surat resmi (teks dua baris + garis ganda).
function _baDrawKop(doc: any, st: any): number {
  const pageW = doc.internal.pageSize.getWidth();
  let y = 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(String(st.pemda_name || "").toUpperCase(), pageW / 2, y, { align: "center" });
  y += 6;
  doc.setFontSize(12);
  doc.text(String(st.dinas_name || "").toUpperCase(), pageW / 2, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(String(st.dinas_address || ""), pageW / 2, y, { align: "center" });
  y += 4;
  doc.text(String(st.dinas_contact || ""), pageW / 2, y, { align: "center" });
  y += 3;
  doc.setLineWidth(0.8);
  doc.line(_baMargin, y, pageW - _baMargin, y);
  doc.setLineWidth(0.2);
  doc.line(_baMargin, y + 1.4, pageW - _baMargin, y + 1.4);
  return y + 9;
}

// Paragraf rata kanan-kiri dengan auto-wrap; mengembalikan Y berikutnya.
function _baParagraph(doc: any, text: string, y: number, opts?: { fontSize?: number; indent?: number; bold?: boolean; align?: "left" | "justify" }): number {
  const pageW = doc.internal.pageSize.getWidth();
  const fontSize = opts?.fontSize ?? 10;
  const indent = opts?.indent ?? 0;
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  const maxW = pageW - _baMargin * 2 - indent;
  const lines = doc.splitTextToSize(text, maxW) as string[];
  doc.text(lines, _baMargin + indent, y, { align: opts?.align ?? "left", maxWidth: maxW });
  return y + lines.length * fontSize * 0.45 + 2;
}

// Blok tanda tangan kanan (Kepala SKPD).
function _baSignRight(doc: any, y: number, dateLine: string, jabatan: string, nama: string, nip: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  const w = 72;
  const xRight = pageW - _baMargin - 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(dateLine, xRight, y, { align: "right" });
  let yy = y + 5;
  const jabLines = (doc.splitTextToSize(jabatan || "", w) as string[]) || [];
  if (jabLines.length) doc.text(jabLines, xRight, yy, { align: "right" });
  yy += jabLines.length * 4.6 + 22;
  const namaUpper = (nama || "").toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.text(namaUpper, xRight, yy, { align: "right" });
  doc.setLineWidth(0.3);
  doc.line(xRight - doc.getTextWidth(namaUpper), yy + 1.2, xRight, yy + 1.2);
  doc.setFont("helvetica", "normal");
  doc.text(`NIP. ${nip || "-"}`, xRight, yy + 5.5, { align: "right" });
  return yy + 10;
}

// Blok tanda tangan kiri (Tim Pemeriksa).
function _baSignLeftTim(doc: any, y: number, tim: { nama: string; nip: string; pangkat: string }[]): number {
  const xLeft = _baMargin + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Tim Pemeriksa,", xLeft, y);
  let yy = y + 6;
  (tim || []).filter(t => (t?.nama || "").trim()).forEach((t) => {
    doc.setFont("helvetica", "bold");
    doc.text((t.nama || "").toUpperCase(), xLeft, yy);
    doc.setFont("helvetica", "normal");
    yy += 4.6;
    if (t.pangkat && t.pangkat.trim()) { doc.text(t.pangkat, xLeft, yy); yy += 4.6; }
    doc.text(`NIP. ${t.nip || "-"}`, xLeft, yy);
    yy += 8;
  });
  return yy;
}

// Data masukan bersama untuk kedua dokumen.
export interface DualPdfInput {
  tenantSettings?: any;
  nomorBA: string;
  tanggalBA: string;
  nomorSP: string;
  tanggalSP: string;
  assets: any[];
  namaKadis: string;
  nipKadis: string;
  jabatanKadis: string;
  timPemeriksa: { nama: string; nip: string; pangkat: string }[];
  tembusan: string[];
  tglPenelusuran?: string;
}

// ─── Generator 1: Berita Acara (BA) ────────────────────
export function generateBeritaAcaraPDF(input: DualPdfInput): Blob {
  const st = { ...DEFAULT_SETTINGS, ...(input.tenantSettings || {}) };
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [215, 330] });
  const pageW = doc.internal.pageSize.getWidth();
  const kontenW = pageW - _baMargin * 2;

  let y = _baDrawKop(doc, st);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  const judul = doc.splitTextToSize("BERITA ACARA PENELUSURAN DAN PENETAPAN KONDISI BARANG MILIK DAERAH", kontenW) as string[];
  doc.text(judul, pageW / 2, y, { align: "center", maxWidth: kontenW });
  y += judul.length * 6 + 2;
  doc.setFontSize(11);
  doc.text(`Nomor : ${input.nomorBA || "-"}`, pageW / 2, y, { align: "center" });
  y += 9;

  y = _baParagraph(
    doc,
    `Pada hari ini, ${_baFmtDate(input.tanggalBA)}, telah dilakukan penelusuran fisik terhadap Barang Milik Daerah sebagaimana tercantum dalam lampiran Berita Acara ini, dengan hasil sebagaimana daftar di bawah. Berita Acara ini dibuat untuk dijadikan dasar penetapan kondisi Barang Milik Daerah.`,
    y,
    { align: "justify" }
  );
  y += 3;

  y = _baParagraph(doc, "Adapun Tim Pemeriksa yang ditunjuk adalah sebagai berikut :", y, { align: "justify" });
  y += 1;

  autoTable(doc, {
    startY: y,
    head: [["NO", "NAMA", "NIP", "PANGKAT/GOLONGAN"]],
    body: (input.timPemeriksa || [])
      .filter(t => (t?.nama || "").trim())
      .map((t, i) => [String(i + 1), t.nama, t.nip || "-", t.pangkat || "-"]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 1.6, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0] },
    headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold", halign: "center" },
    columnStyles: { 0: { halign: "center", cellWidth: 10 } },
    margin: { left: _baMargin, right: _baMargin },
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 7;

  y = _baParagraph(doc, "Daftar Barang Milik Daerah beserta kondisinya adalah sebagai berikut :", y, { align: "justify" });
  y += 1;

  y = _baRenderUniversalTable(doc, y, input.assets);
  y += 10;

  const dateLine = `Soreang, ${_baFmtDate(input.tanggalBA)}`;
  _baSignLeftTim(doc, y, input.timPemeriksa);
  _baSignRight(doc, y, dateLine, input.jabatanKadis, input.namaKadis, input.nipKadis);

  return doc.output("blob");
}

// ─── Generator 2: Surat Pernyataan (SP) ────────────────
export function generateSuratPernyataanPDF(input: DualPdfInput): Blob {
  const st = { ...DEFAULT_SETTINGS, ...(input.tenantSettings || {}) };
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [215, 330] });
  const pageW = doc.internal.pageSize.getWidth();
  const kontenW = pageW - _baMargin * 2;

  let y = _baDrawKop(doc, st);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  const judul = doc.splitTextToSize("SURAT PERNYATAAN PENGAJUAN PERUBAHAN KONDISI BARANG MILIK DAERAH", kontenW) as string[];
  doc.text(judul, pageW / 2, y, { align: "center", maxWidth: kontenW });
  y += judul.length * 6 + 2;
  doc.setFontSize(11);
  doc.text(`Nomor : ${input.nomorSP || "-"}`, pageW / 2, y, { align: "center" });
  y += 9;

  // Cross-reference dinamis ke Berita Acara
  y = _baParagraph(
    doc,
    `Berdasarkan Berita Acara Penelusuran dan Penetapan Kondisi Barang Milik Daerah Tanggal ${_baFmtDate(input.tanggalBA)} Nomor: ${input.nomorBA || "-"}, dengan ini kami yang bertanda tangan di bawah ini :`,
    y,
    { align: "justify" }
  );
  y += 2;

  // Identitas penandatangan
  autoTable(doc, {
    startY: y,
    body: [
      ["Nama", ":", input.namaKadis || "-"],
      ["NIP", ":", input.nipKadis || "-"],
      ["Jabatan", ":", input.jabatanKadis || "-"],
    ],
    theme: "plain",
    styles: { fontSize: 10, cellPadding: { top: 0.6, bottom: 0.6, left: 0, right: 2 }, textColor: [0, 0, 0] },
    columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 4 } },
    margin: { left: _baMargin + 12, right: _baMargin },
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;

  y = _baParagraph(
    doc,
    "Menyatakan dengan sebenarnya bahwa barang dalam penguasaan kami sebagaimana terlampir sudah rusak berat dan tidak dapat dioperasionalkan kembali dalam pelayanan umum untuk mendukung tugas pokok dan fungsi Perangkat Daerah kami.",
    y,
    { align: "justify" }
  );
  y = _baParagraph(
    doc,
    "Untuk itu kami menyatakan pengajuan untuk merubah kondisi barang tersebut.",
    y,
    { align: "justify" }
  );
  y = _baParagraph(
    doc,
    "Demikian Surat Pernyataan ini dibuat untuk dapat diketahui dan dipergunakan sebagai bahan lebih lanjut.",
    y,
    { align: "justify" }
  );
  y += 6;

  const dateLine = `Soreang, ${_baFmtDate(input.tanggalSP || input.tanggalBA)}`;
  const yAfterSign = _baSignRight(doc, y, dateLine, input.jabatanKadis, input.namaKadis, input.nipKadis);

  // Tembusan (kiri bawah)
  const tmb = (input.tembusan || []).filter(t => t && t.trim());
  if (tmb.length) {
    let ty = yAfterSign + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Tembusan, Kepada Yth :", _baMargin, ty);
    ty += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    tmb.forEach((t, i) => {
      const lines = doc.splitTextToSize(`${i + 1}. ${t};`, kontenW - 8) as string[];
      doc.text(lines, _baMargin + 4, ty);
      ty += lines.length * 4.2 + 0.8;
    });
  }

  // ─── Halaman 2 (Lampiran, landscape): Tabel Universal 13 Kolom ───
  doc.addPage([215, 330], "landscape");
  const lW = doc.internal.pageSize.getWidth();
  const lKontenW = lW - _baMargin * 2;
  let ly = _baMargin + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Lampiran Surat Pernyataan`, _baMargin, ly);
  doc.text(`Nomor : ${input.nomorSP || "-"}`, _baMargin, ly + 4);
  doc.text(`Tanggal : ${_baFmtDate(input.tanggalSP || input.tanggalBA)}`, _baMargin, ly + 8);
  ly += 15;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const ljudul = doc.splitTextToSize("DAFTAR BARANG MILIK DAERAH YANG DIUSULKAN PERUBAHAN KONDISI", lKontenW) as string[];
  doc.text(ljudul, lW / 2, ly, { align: "center", maxWidth: lKontenW });
  ly += ljudul.length * 5 + 1;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(String(st.dinas_name || ""), lW / 2, ly, { align: "center" });
  ly += 6;

  ly = _baRenderUniversalTable(doc, ly, input.assets);
  ly += 10;

  _baSignRight(doc, ly, dateLine, input.jabatanKadis, input.namaKadis, input.nipKadis);

  return doc.output("blob");
}
