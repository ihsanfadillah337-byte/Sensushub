import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Util numerik bersama ────────────────────────────────
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

// Helper Terbilang (Indonesian Words for Numbers)
function _baTerbilang(n: number): string {
  const angka = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
  if (n < 12) return angka[n];
  if (n < 20) return _baTerbilang(n - 10) + " belas";
  if (n < 100) return _baTerbilang(Math.floor(n / 10)) + " puluh " + _baTerbilang(n % 10);
  if (n < 200) return "seratus " + _baTerbilang(n - 100);
  if (n < 1000) return _baTerbilang(Math.floor(n / 100)) + " ratus " + _baTerbilang(n % 100);
  if (n < 2000) return "seribu " + _baTerbilang(n - 1000);
  if (n < 1000000) return _baTerbilang(Math.floor(n / 1000)) + " ribu " + _baTerbilang(n % 1000);
  return String(n);
}

function _baGetDayName(dateStr?: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  return days[d.getDay()] || "-";
}

function _baDateToWords(dateStr?: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${_baTerbilang(day)} Bulan ${month} Tahun ${_baTerbilang(year)}`;
}

// ─── Pengaturan default kop surat ────────────────────────
export const DEFAULT_SETTINGS = {
  pemda_name: "PEMERINTAH KABUPATEN BANDUNG",
  dinas_name: "BADAN KEUANGAN DAN ASET DAERAH",
  dinas_address: "Jl. Raya Soreang KM 17",
  dinas_contact: "",
  font_size_pemda: 14,
  font_size_dinas: 16,
  font_size_address: 10,
  margin_top: 45,
};

// ─── Dual-PDF Generator (Berita Acara & Surat Pernyataan) ───────────────
// Standar baku BKAD: Tabel Universal 13 Kolom + baris TOTAL. Murni jsPDF +
// autoTable, mengembalikan Blob (bukan doc.save()) untuk di-upload ke Storage.

const _baTableHeaders = [
  "NO", "MERK/ TYPE", "NO REG", "NO POLISI", "NO RANGKA", "NO MESIN", "NO BPKB", "BAHAN", "TAHUN PEROLEHAN", "HARGA PEROLEHAN (RP)",
];

const _spTableHeaders = [
  "NO", "KODE ASET", "NAMA ASET", "NO REG", "MERK/ TYPE", "NOMOR POLISI",
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

// Bangun body Tabel Universal dari snapshot aset (BA 10 Kolom).
function _baBuildUniversalRows(assets: any[]): { body: any[][]; total: number } {
  let total = 0;
  const body = (assets || []).map((a: any, idx: number) => {
    const harga = _psNumber(
      a?.["Nilai Perolehan"] ?? a?.["Nilai Aset"] ?? a?.nilai_perolehan ?? a?.harga
    );
    total += harga;
    return [
      String(idx + 1),
      _baDash(_baRowGet(a, ["Merek/Type", "merek", "Merek", "Type", "Tipe"])),
      _baDash(_baRowGet(a, ["no_register", "nomor_register", "No Register", "Nomor Register", "no_reg", "No. Register"])),
      _baDash(_baRowGet(a, ["Nomor Polisi", "nomor_polisi", "nopol", "No Polisi"])),
      _baDash(_baRowGet(a, ["Nomor Rangka", "nomor_rangka", "rangka", "No Rangka"])),
      _baDash(_baRowGet(a, ["Nomor Mesin", "nomor_mesin", "mesin", "No Mesin"])),
      _baDash(_baRowGet(a, ["Nomor BPKB", "nomor_bpkb", "bpkb", "No BPKB"])),
      _baDash(_baRowGet(a, ["Bahan", "bahan"])),
      _baDash(_baRowGet(a, ["Tahun Perolehan", "tahun_perolehan", "tahun", "Tahun"])),
      new Intl.NumberFormat("id-ID").format(harga),
    ];
  });
  return { body, total };
}

// Bangun body Tabel Universal 13 Kolom untuk Lampiran SP.
function _spBuildUniversalRows(assets: any[]): { body: any[][]; total: number } {
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

// Render Tabel BA (10 Kolom).
function _baRenderUniversalTable(doc: any, startY: number, assets: any[]): number {
  const { body, total } = _baBuildUniversalRows(assets);
  const foot = [[
    { content: "TOTAL", colSpan: 9, styles: { halign: "center" as const, fontStyle: "bold" as const } },
    { content: new Intl.NumberFormat("id-ID").format(total), styles: { halign: "right" as const, fontStyle: "bold" as const } },
  ]];
  autoTable(doc, {
    startY,
    head: [_baTableHeaders],
    body,
    foot,
    showFoot: "lastPage",
    theme: "grid",
    styles: { font: "times", fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0], overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", halign: "center", valign: "middle", fontSize: 8 },
    footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 8 },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      9: { halign: "right", cellWidth: 30 },
    },
    margin: { left: _baMargin, right: _baMargin, bottom: 20 },
  });
  return (doc as any).lastAutoTable?.finalY ?? startY;
}

// Render Tabel SP (13 Kolom).
function _spRenderUniversalTable(doc: any, startY: number, assets: any[]): number {
  const { body, total } = _spBuildUniversalRows(assets);
  const foot = [[
    { content: "TOTAL", colSpan: 12, styles: { halign: "center" as const, fontStyle: "bold" as const } },
    { content: new Intl.NumberFormat("id-ID").format(total), styles: { halign: "right" as const, fontStyle: "bold" as const } },
  ]];
  autoTable(doc, {
    startY,
    head: [_spTableHeaders],
    body,
    foot,
    showFoot: "lastPage",
    theme: "grid",
    styles: { font: "times", fontSize: 7, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1, textColor: [0, 0, 0], overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", halign: "center", valign: "middle", fontSize: 7 },
    footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 7 },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      12: { halign: "right", cellWidth: 25 },
    },
    margin: { left: _baMargin, right: _baMargin, bottom: 20 },
  });
  return (doc as any).lastAutoTable?.finalY ?? startY;
}

// Kop surat resmi (teks dua baris + garis ganda).
function _baDrawKop(doc: any, st: any): number {
  const pageW = doc.internal.pageSize.getWidth();
  let y = 15;
  doc.setFont("times", "bold");
  doc.setFontSize(st.font_size_pemda || 14);
  doc.text(String(st.pemda_name || "").toUpperCase(), pageW / 2 + 10, y, { align: "center" });
  y += 7;
  doc.setFontSize(st.font_size_dinas || 16);
  doc.text(String(st.dinas_name || "").toUpperCase(), pageW / 2 + 10, y, { align: "center" });
  y += 5;
  doc.setFont("times", "normal");
  doc.setFontSize(st.font_size_address || 10);
  doc.text(String(st.dinas_address || ""), pageW / 2 + 10, y, { align: "center" });
  
  // Note: Logo skipped as requested
  
  y += 4;
  doc.setLineWidth(0.8);
  doc.line(_baMargin, y, pageW - _baMargin, y);
  doc.setLineWidth(0.2);
  doc.line(_baMargin, y + 1.2, pageW - _baMargin, y + 1.2);
  return y + 8;
}

// Paragraf rata kanan-kiri dengan auto-wrap; mengembalikan Y berikutnya.
function _baParagraph(doc: any, text: string, y: number, opts?: { fontSize?: number; indent?: number; bold?: boolean; align?: "left" | "justify" | "center"; lineHeight?: number }): number {
  const pageW = doc.internal.pageSize.getWidth();
  const fontSize = opts?.fontSize ?? 12;
  const indent = opts?.indent ?? 0;
  const lineHeight = opts?.lineHeight ?? 1.2;
  doc.setFont("times", opts?.bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  const maxW = pageW - _baMargin * 2 - indent;
  const lines = doc.splitTextToSize(text, maxW) as string[];
  doc.text(lines, _baMargin + indent, y, { align: opts?.align ?? "left", maxWidth: maxW, lineHeightFactor: lineHeight });
  return y + lines.length * fontSize * (lineHeight * 0.35) + 3;
}

// Blok tanda tangan kanan (Kepala SKPD).
function _baSignRight(doc: any, y: number, dateLine: string, jabatan: string, nama: string, nip: string, opts?: { pangkat?: string; skipMengetahui?: boolean; selakuLabel?: string }): number {
  const pageW = doc.internal.pageSize.getWidth();
  const xRight = pageW - _baMargin - 40; // Center of the right signature block
  
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text(dateLine, xRight, y, { align: "center" });
  y += 5;
  
  if (!opts?.skipMengetahui) {
    doc.text("Mengetahui,", xRight, y, { align: "center" });
    y += 5;
  }
  
  doc.setFont("times", "bold");
  doc.text("KEPALA", xRight, y, { align: "center" });
  y += 5;
  doc.text(String(DEFAULT_SETTINGS.dinas_name).toUpperCase(), xRight, y, { align: "center" });
  y += 5;
  doc.setFont("times", "normal");
  doc.text(opts?.selakuLabel || "Selaku Pengguna Barang Milik Daerah,", xRight, y, { align: "center" });
  
  y += 25; // Space for signature
  
  const namaUpper = (nama || "").toUpperCase();
  doc.setFont("times", "bold");
  doc.text(namaUpper, xRight, y, { align: "center" });
  // Underline
  const textWidth = doc.getTextWidth(namaUpper);
  doc.setLineWidth(0.5);
  doc.line(xRight - textWidth / 2, y + 1, xRight + textWidth / 2, y + 1);
  
  y += 5;
  doc.setFont("times", "normal");
  if (opts?.pangkat) {
    doc.text(opts.pangkat, xRight, y, { align: "center" });
    y += 5;
  }
  doc.text(`NIP. ${nip || "-"}`, xRight, y, { align: "center" });
  
  return y;
}

// Blok tanda tangan kiri (Tim Pemeriksa).
function _baSignLeftTim(doc: any, y: number, tim: { nama: string; nip: string; pangkat: string }[]): number {
  const xLeft = _baMargin + 5;
  const xDotted = xLeft + 65;
  
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text("Tim Pemeriksa,", xLeft, y);
  y += 10;
  
  (tim || []).filter(t => (t?.nama || "").trim()).forEach((t, i) => {
    const num = `${i + 1}. `;
    doc.text(num, xLeft, y);
    
    const startX = xLeft + 5;
    doc.setFont("times", "bold");
    doc.text((t.nama || "").toUpperCase(), startX, y);
    y += 5;
    doc.setFont("times", "normal");
    doc.text(`NIP. ${t.nip || "-"}`, startX, y);
    
    // Dotted line for signature
    doc.text("...........................................", xDotted, y);
    
    y += 12; // Gap between members
  });
  
  return y;
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

  // Title
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  const judulStr = "BERITA ACARA HASIL PENELITIAN/ PEMERIKSAAN FISIK KENDARAAN";
  doc.text(judulStr, pageW / 2, y, { align: "center" });
  // Underline
  const judulW = doc.getTextWidth(judulStr);
  doc.setLineWidth(0.5);
  doc.line(pageW / 2 - judulW / 2, y + 1, pageW / 2 + judulW / 2, y + 1);
  y += 5;
  doc.setFont("times", "normal");
  doc.text(`Nomor : ${input.nomorBA || "-"}`, pageW / 2, y, { align: "center" });
  y += 12;

  // Paragraph 1
  const dayName = _baGetDayName(input.tanggalBA);
  const dateWords = _baDateToWords(input.tanggalBA);
  const dateShort = new Date(input.tanggalBA).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  
  y = _baParagraph(
    doc,
    `Pada hari ini  ${dayName} tanggal  ${dateWords} (${dateShort}), kami yang bertanda tangan dibawah ini:`,
    y,
    { indent: 15, align: "justify" }
  );

  // Examiners list
  (input.timPemeriksa || []).slice(0, 2).forEach((t, i) => {
    const startX = _baMargin + 15;
    doc.text(`${i + 1}. Nama`, startX, y);
    doc.text(`: ${t.nama.toUpperCase() || "-"}`, startX + 35, y);
    y += 6;
    doc.text("   NIP", startX, y);
    doc.text(`: ${t.nip || "-"}`, startX + 35, y);
    y += 6;
    doc.text("   Pangkat/Golongan", startX, y);
    doc.text(`: ${t.pangkat || "-"}`, startX + 35, y);
    y += 7;
  });

  // Paragraph 2
  const dinasName = String(st.dinas_name).toUpperCase();
  y = _baParagraph(
    doc,
    `Selaku Pengurus Barang Pengguna dan Pengurus Barang Pembantu pada ${dinasName} Kabupaten Bandung yang ditetapkan berdasarkan Keputusan Bupati Bandung Tanggal 31 Desember 2025 Nomor 000.2.5/KEP.809-BKAD/2025 tentang Penetapan Pengurus Barang Pengguna dan Pengurus Barang Pembantu di Lingkungan Pemerintah Kabupaten Bandung, telah melaksanakan penelitian/pemeriksaan fisik Barang Milik Daerah berupa kendaraan sepeda motor yang tercatat sebagai Barang Milik Daerah pada ${dinasName} Kabupaten Bandung.`,
    y,
    { indent: 15, align: "justify" }
  );

  y = _baParagraph(
    doc,
    "Adapun hasil penelitian/pemeriksaan fisik terhadap kendaraan dimaksud adalah sebagai berikut:",
    y,
    { indent: 15, align: "justify" }
  );

  // Table
  y = _baRenderUniversalTable(doc, y, input.assets);
  y += 8;

  // Paragraph 3 (Results)
  const count = input.assets.length;
  const countWords = _baTerbilang(count);
  y = _baParagraph(
    doc,
    `Berdasarkan hasil penelitian/pemeriksaan fisik sebagaimana tersebut di atas, diperoleh hasil bahwa Barang Milik Daerah berupa ${count} (${countWords}) unit kendaraan sepeda motor tersebut dalam kondisi rusak berat dan sudah tidak dapat digunakan secara optimal untuk menunjang pelaksanaan tugas kedinasan.`,
    y,
    { indent: 15, align: "justify" }
  );

  y = _baParagraph(
    doc,
    "Hasil penelitian/pemeriksaan fisik ini selanjutnya menjadi bahan pertimbangan dan dasar dalam proses pengajuan perubahan kondisi Barang Milik Daerah dari kondisi sebelumnya menjadi kondisi rusak berat, sesuai dengan ketentuan pengelolaan Barang Milik Daerah yang berlaku.",
    y,
    { indent: 15, align: "justify" }
  );

  y = _baParagraph(
    doc,
    "Demikian Berita Acara Hasil Penelitian ini dibuat dengan sebenarnya berdasarkan hasil penelitian/pemeriksaan fisik di lapangan, untuk dapat dipergunakan sebagaimana mestinya.",
    y,
    { indent: 15, align: "justify" }
  );

  y += 10;
  
  // Signatures
  const dateLine = `Soreang, ${_baFmtDate(input.tanggalBA)}`;
  _baSignLeftTim(doc, y, input.timPemeriksa);
  _baSignRight(doc, y, dateLine, input.jabatanKadis, input.namaKadis, input.nipKadis, { pangkat: "Pembina Utama Muda, IV/c" });

  return doc.output("blob");
}

// ─── Generator 2: Surat Pernyataan (SP) ────────────────
export function generateSuratPernyataanPDF(input: DualPdfInput): Blob {
  const st = { ...DEFAULT_SETTINGS, ...(input.tenantSettings || {}) };
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [215, 330] });
  const pageW = doc.internal.pageSize.getWidth();
  const kontenW = pageW - _baMargin * 2;

  let y = _baDrawKop(doc, st);

  // Title
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  const judulStr = "SURAT PERNYATAAN PENGAJUAN PERUBAHAN KONDISI BMD";
  doc.text(judulStr, pageW / 2, y, { align: "center" });
  // Underline
  const judulW = doc.getTextWidth(judulStr);
  doc.setLineWidth(0.5);
  doc.line(pageW / 2 - judulW / 2, y + 1, pageW / 2 + judulW / 2, y + 1);
  y += 5;
  doc.setFont("times", "normal");
  doc.text(`Nomor : ${input.nomorSP || "-"}`, pageW / 2, y, { align: "center" });
  y += 15;

  y = _baParagraph(doc, "Yang bertandatangan dibawah ini:", y, { indent: 15 });
  y += 2;

  // Identity Table
  autoTable(doc, {
    startY: y,
    body: [
      ["Nama", ":", input.namaKadis.toUpperCase() || "-"],
      ["NIP", ":", input.nipKadis || "-"],
      ["Jabatan", ":", `${input.jabatanKadis || "-"}, selaku Pengguna BMD`],
    ],
    theme: "plain",
    styles: { font: "times", fontSize: 12, cellPadding: { top: 1, bottom: 1, left: 0, right: 2 }, textColor: [0, 0, 0] },
    columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 4 } },
    margin: { left: _baMargin + 15, right: _baMargin },
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 8;

  const dateBA = _baFmtDate(input.tanggalBA);
  y = _baParagraph(
    doc,
    `Berdasarkan  Berita Acara Hasil Penelitian/ Pemeriksaan Fisik Kendaraan Tanggal ${dateBA} Nomor: ${input.nomorBA || "-"}, menyatakan dengan sebenarnya bahwa barang dalam penguasaan kami sebagaimana terlampir sudah rusak berat dan tidak dapat dioperasionalkan kembali dalam pelayanan umum untuk mendukung tugas pokok dan fungsi Perangkat Daerah kami.`,
    y,
    { indent: 15, align: "justify" }
  );

  y = _baParagraph(
    doc,
    "Untuk itu kami menyatakan pengajuan untuk merubah kondisi barang tersebut.",
    y,
    { indent: 15, align: "justify" }
  );

  y = _baParagraph(
    doc,
    "Demikian untuk dapat diketahui, sebagai bahan lebih lanjut.",
    y,
    { indent: 15, align: "justify" }
  );

  y += 15;

  const dateLine = `Soreang, ${_baFmtDate(input.tanggalSP || input.tanggalBA)}`;
  const yAfterSign = _baSignRight(doc, y, dateLine, input.jabatanKadis, input.namaKadis, input.nipKadis, { skipMengetahui: true, selakuLabel: "Selaku Pengguna BMD," });

  // Tembusan
  const tmb = (input.tembusan || []).filter(t => t && t.trim());
  if (tmb.length) {
    let ty = yAfterSign + 10;
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.text("Tembusan, kepada Yth:", _baMargin, ty);
    ty += 5;
    tmb.forEach((t, i) => {
      const lines = doc.splitTextToSize(`${i + 1}. ${t};`, kontenW - 8) as string[];
      doc.text(lines, _baMargin + 4, ty);
      ty += lines.length * 4.5;
    });
  }

  // ─── Halaman 2 (Lampiran, landscape): Tabel Universal 13 Kolom ───
  doc.addPage([215, 330], "landscape");
  const lW = doc.internal.pageSize.getWidth();
  let ly = _baMargin + 5;

  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.text(`Lampiran Surat Pernyataan Pengajuan Perubahan Kondisi BMD`, _baMargin, ly);
  doc.text(`Nomor : ${input.nomorSP || "-"}`, _baMargin, ly + 5);
  ly += 15;

  ly = _spRenderUniversalTable(doc, ly, input.assets);
  ly += 10;

  _baSignRight(doc, ly, dateLine, input.jabatanKadis, input.namaKadis, input.nipKadis, { skipMengetahui: true, selakuLabel: "Selaku Pengguna BMD," });

  return doc.output("blob");
}
