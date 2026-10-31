import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

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

function _baExtractYear(v: any): string {
  if (!v) return "-";
  const s = String(v).trim();
  if (!s) return "-";
  
  // Mencari 4 digit tahun (19xx atau 20xx)
  const match = s.match(/\b(19|20)\d{2}\b/);
  if (match) return match[0];

  // Coba parse sebagai tanggal
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return String(d.getFullYear());
  }
  
  return "-";
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
    
    // Pencarian key tanggal perolehan yang lebih luas (menampilkan full date sesuai database)
    const tglRaw = _baRowGet(a, [
      "Tanggal Perolehan", "tanggal_perolehan", 
      "Tahun Perolehan", "tahun_perolehan", "tahun", "Tahun", 
      "Tahun Pembelian", "tahun_pembelian", 
      "tanggal_pembelian", "waktu_perolehan"
    ]);

    return [
      String(idx + 1),
      _baDash(_baRowGet(a, ["Merek/Type", "merek", "Merek", "Type", "Tipe"])),
      _baDash(_baRowGet(a, ["no_register", "nomor_register", "No Register", "Nomor Register", "no_reg", "No. Register"])),
      _baDash(_baRowGet(a, ["Nomor Polisi", "nomor_polisi", "nopol", "No Polisi"])),
      _baDash(_baRowGet(a, ["Nomor Rangka", "nomor_rangka", "rangka", "No Rangka"])),
      _baDash(_baRowGet(a, ["Nomor Mesin", "nomor_mesin", "mesin", "No Mesin"])),
      _baDash(_baRowGet(a, ["Nomor BPKB", "nomor_bpkb", "bpkb", "No BPKB"])),
      _baDash(_baRowGet(a, ["Bahan", "bahan"])),
      _baDash(tglRaw), // Menggunakan tglRaw langsung (full date)
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

    // Pencarian key tahun perolehan yang lebih luas
    const tahunVal = _baRowGet(a, [
      "Tahun Perolehan", "tahun_perolehan", "tahun", "Tahun", 
      "Tanggal Perolehan", "tanggal_perolehan", 
      "Tahun Pembelian", "tahun_pembelian", 
      "tanggal_pembelian", "waktu_perolehan"
    ]);

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
      _baExtractYear(tahunVal),
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
  
  // Menambahkan baris penomoran kolom (1-13) di bawah header
  const bodyWithNumbering = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"],
    ...body
  ];

  const foot = [[
    { content: "TOTAL", colSpan: 12, styles: { halign: "center" as const, fontStyle: "bold" as const } },
    { content: new Intl.NumberFormat("id-ID").format(total), styles: { halign: "right" as const, fontStyle: "bold" as const } },
  ]];

  autoTable(doc, {
    startY,
    head: [_spTableHeaders],
    body: bodyWithNumbering,
    foot,
    showFoot: "lastPage",
    theme: "grid",
    styles: { 
      font: "times", 
      fontSize: 7.5, // Sedikit diperbesar
      cellPadding: 1.5, 
      lineColor: [0, 0, 0], 
      lineWidth: 0.1, 
      textColor: [0, 0, 0], 
      overflow: "linebreak", 
      valign: "middle" 
    },
    headStyles: { 
      fillColor: [255, 255, 255], 
      textColor: [0, 0, 0], 
      fontStyle: "bold", 
      halign: "center", 
      valign: "middle", 
      fontSize: 8 // Header lebih besar
    },
    // Styling khusus untuk baris nomor kolom (baris pertama di body)
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === 0) {
        data.cell.styles.halign = 'center';
        data.cell.styles.fontStyle = 'normal';
        data.cell.styles.fontSize = 7;
      }
    },
    footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontSize: 8 },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      12: { halign: "right", cellWidth: 25 },
    },
    margin: { left: _baMargin, right: _baMargin, bottom: 20 },
    pageBreak: 'auto', // Memastikan paginasi dinamis
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
  doc.setFontSize(st.font_size_dinas || 18); // Diperbesar ke 18
  doc.text(String(st.dinas_name || "").toUpperCase(), pageW / 2 + 10, y, { align: "center" });
  y += 5;
  doc.setFont("times", "normal");
  doc.setFontSize(st.font_size_address || 10);
  doc.text(String(st.dinas_address || ""), pageW / 2 + 10, y, { align: "center" });
  
  // Note: Logo skipped as requested
  
  y += 4;
  // Garis ganda: satu tebal di atas, satu tipis di bawah
  doc.setLineWidth(1.0); // Lebih tebal (1.0)
  doc.line(_baMargin, y, pageW - _baMargin, y);
  doc.setLineWidth(0.3); // Garis tipis (0.3)
  doc.line(_baMargin, y + 1.5, pageW - _baMargin, y + 1.5); // Jarak 1.5mm
  return y + 10;
}

// Paragraf rata kanan-kiri dengan auto-wrap; mengembalikan Y berikutnya.
function _baParagraph(doc: any, text: string, y: number, opts?: { 
  fontSize?: number; 
  indent?: number; 
  bold?: boolean; 
  align?: "left" | "justify" | "center"; 
  lineHeight?: number;
}): number {
  const pageW = doc.internal.pageSize.getWidth();
  const fontSize = opts?.fontSize ?? 12;
  const indent = opts?.indent ?? 0;
  const lineHeight = opts?.lineHeight ?? 1.5; 
  
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
  const xRight = pageW - _baMargin - 45; // Sedikit geser ke kiri untuk proporsi F4
  
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
  
  // Menghapus duplikasi "selaku Pengguna BMD" jika ada
  let label = opts?.selakuLabel || "Selaku Pengguna Barang Milik Daerah,";
  doc.text(label, xRight, y, { align: "center" });
  
  y += 28; // Ruang tanda tangan lebih luas
  
  const namaUpper = (nama || "").toUpperCase();
  doc.setFont("times", "bold");
  doc.text(namaUpper, xRight, y, { align: "center" });
  
  // Underline nama penandatangan
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
export async function generateBeritaAcaraPDF(input: DualPdfInput): Promise<Blob> {
  const st = { ...DEFAULT_SETTINGS, ...(input.tenantSettings || {}) };
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ─── Halaman 1: Render via html2canvas (Hybrid Approach) ───
  const container = document.createElement("div");
  container.style.width = "210mm";
  container.style.minHeight = "297mm";
  container.style.padding = "15mm 12mm"; // Disamakan dengan _baMargin (12mm)
  container.style.backgroundColor = "white";
  container.style.fontFamily = "'Times New Roman', Times, serif";
  container.style.color = "black";
  container.style.fontSize = "12pt";
  container.style.lineHeight = "1.3";
  container.style.position = "fixed";
  container.style.top = "-10000px";
  container.style.left = "-10000px";
  container.style.zIndex = "-1000";

  const dayName = _baGetDayName(input.tanggalBA);
  const dateWords = _baDateToWords(input.tanggalBA);
  const dateShort = new Date(input.tanggalBA).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  const dinasName = String(st.dinas_name).toUpperCase();

  const timHtml = (input.timPemeriksa || []).slice(0, 2).map((t, i) => `
    <div style="margin-left: 20px; margin-bottom: 10px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="width: 25px; vertical-align: top;">${i + 1}.</td>
          <td style="width: 150px; vertical-align: top;">Nama</td>
          <td style="width: 20px; vertical-align: top;">:</td>
          <td style="font-weight: bold; vertical-align: top;">${t.nama.toUpperCase() || "-"}</td>
        </tr>
        <tr>
          <td></td>
          <td style="vertical-align: top;">NIP</td>
          <td style="vertical-align: top;">:</td>
          <td style="vertical-align: top;">${t.nip || "-"}</td>
        </tr>
        <tr>
          <td></td>
          <td style="vertical-align: top;">Pangkat/Golongan</td>
          <td style="vertical-align: top;">:</td>
          <td style="vertical-align: top;">${t.pangkat || "-"}</td>
        </tr>
      </table>
    </div>
  `).join("");

  container.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 2px; width: 100%;">
      <img src="/logo-bandung.png" style="width: 25mm; height: auto; margin-right: 15px;" />
      <div style="flex: 1; text-align: center; padding-right: 25mm;">
        <div style="font-weight: bold; font-size: 14pt; margin-bottom: 2px; white-space: nowrap;">${st.pemda_name.toUpperCase()}</div>
        <div style="font-weight: bold; font-size: 16pt; margin-bottom: 2px; white-space: nowrap;">${st.dinas_name.toUpperCase()}</div>
        <div style="font-size: 10pt;">${st.dinas_address}</div>
      </div>
    </div>
    
    <!-- Double Line Kop Surat -->
    <div style="border-bottom: 2.5pt solid black; margin-top: 8px;"></div>
    <div style="border-bottom: 0.5pt solid black; margin-top: 2px; margin-bottom: 15px;"></div>

    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-weight: bold; text-decoration: underline; font-size: 13pt;">BERITA ACARA HASIL PENELITIAN/ PEMERIKSAAN PERALATAN DAN MESIN</div>
      <div style="font-size: 12pt;">Nomor : ${input.nomorBA || "-"}</div>
    </div>

    <div style="text-align: justify; text-indent: 1.27cm; margin-bottom: 15px; font-size: 12pt;">
      Pada hari ini ${dayName} tanggal ${dateWords} (${dateShort}), kami yang bertanda tangan dibawah ini:
    </div>

    ${timHtml}

    <div style="text-align: justify; text-indent: 1.27cm; margin-bottom: 15px; font-size: 12pt;">
      Selaku Pengurus Barang Pengguna dan Pengurus Barang Pembantu pada ${dinasName} Kabupaten Bandung yang ditetapkan berdasarkan Keputusan Bupati Bandung Tanggal 31 Desember 2025 Nomor 000.2.5/KEP.809-BKAD/2025 tentang Penetapan Pengurus Barang Pengguna dan Pengurus Barang Pembantu di Lingkungan Pemerintah Kabupaten Bandung, telah melaksanakan penelitian/pemeriksaan fisik Barang Milik Daerah berupa peralatan dan mesin yang tercatat sebagai Barang Milik Daerah pada ${dinasName} Kabupaten Bandung.
    </div>

    <div style="text-align: justify; text-indent: 1.27cm; margin-bottom: 10px; font-size: 12pt;">
      Adapun hasil penelitian/pemeriksaan fisik terhadap peralatan dan mesin dimaksud adalah sebagai berikut:
    </div>
  `;

  document.body.appendChild(container);
  const canvas = await html2canvas(container, { 
    scale: 2,
    useCORS: true,
    logging: false
  });
  document.body.removeChild(container);

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  doc.addImage(imgData, "JPEG", 0, 0, pageW, pageH);

  // ─── Tabel Aset & Paginasi Dinamis ───
  let currentY = 185; // Estimasi posisi setelah teks pembuka (bisa dinamis bila perlu)
  
  // Render Tabel
  const finalY = _baRenderUniversalTable(doc, currentY, input.assets);
  
  // Paragraf Penutup & Tanda Tangan
  const count = input.assets.length;
  const countWords = _baTerbilang(count);
  const dateLine = `Soreang, ${_baFmtDate(input.tanggalBA)}`;

  // Gunakan doc.addPage() jika finalY sudah terlalu bawah
  let nextY = finalY + 10;
  if (nextY > 250) {
    doc.addPage();
    nextY = 20;
  }

  nextY = _baParagraph(
    doc,
    "       " + `Berdasarkan hasil penelitian/pemeriksaan fisik sebagaimana tersebut di atas, diperoleh hasil bahwa Barang Milik Daerah berupa ${count} (${countWords}) unit peralatan dan mesin tersebut dalam kondisi rusak berat dan sudah tidak dapat digunakan secara optimal untuk menunjang pelaksanaan tugas kedinasan.`,
    nextY,
    { align: "justify", lineHeight: 1.3 }
  );

  if (nextY > 260) { doc.addPage(); nextY = 20; }
  nextY = _baParagraph(
    doc,
    "       " + "Hasil penelitian/pemeriksaan fisik ini selanjutnya menjadi bahan pertimbangan dan dasar dalam proses pengajuan perubahan kondisi Barang Milik Daerah dari kondisi sebelumnya menjadi kondisi rusak berat, sesuai dengan ketentuan pengelolaan Barang Milik Daerah yang berlaku.",
    nextY,
    { align: "justify", lineHeight: 1.3 }
  );

  if (nextY > 260) { doc.addPage(); nextY = 20; }
  nextY = _baParagraph(
    doc,
    "       " + "Demikian Berita Acara Hasil Penelitian ini dibuat dengan sebenarnya berdasarkan hasil penelitian/pemeriksaan fisik di lapangan, untuk dapat dipergunakan sebagaimana mestinya.",
    nextY,
    { align: "justify", lineHeight: 1.3 }
  );

  nextY += 15; // Jarak lebih besar sebelum tanda tangan
  if (nextY > 210) { doc.addPage(); nextY = 20; }
  
  _baSignLeftTim(doc, nextY, input.timPemeriksa);
  _baSignRight(doc, nextY, dateLine, input.jabatanKadis, input.namaKadis, input.nipKadis, { pangkat: "Pembina Utama Muda, IV/c" });

  return doc.output("blob");
}

// ─── Generator 2: Surat Pernyataan (SP) ────────────────
export async function generateSuratPernyataanPDF(input: DualPdfInput): Promise<Blob> {
  const st = { ...DEFAULT_SETTINGS, ...(input.tenantSettings || {}) };
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ─── Halaman 1: Render via html2canvas (Hybrid Approach) ───
  const container = document.createElement("div");
  container.style.width = "210mm";
  container.style.minHeight = "297mm";
  container.style.padding = "15mm 12mm"; // Disamakan dengan _baMargin (12mm)
  container.style.backgroundColor = "white";
  container.style.fontFamily = "'Times New Roman', Times, serif";
  container.style.color = "black";
  container.style.fontSize = "12pt";
  container.style.lineHeight = "1.5";
  container.style.position = "fixed";
  container.style.top = "-10000px";
  container.style.left = "-10000px";
  container.style.zIndex = "-1000";

  const dateBA = _baFmtDate(input.tanggalBA);
  const dateSP = _baFmtDate(input.tanggalSP || input.tanggalBA);
  
  // Clean Jabatan duplication
  let jabatanStr = input.jabatanKadis || "-";
  if (jabatanStr.toLowerCase().includes("selaku pengguna bmd")) {
    jabatanStr = jabatanStr.replace(/,?\s*selaku pengguna bmd/gi, "");
  }

  const tembusanHtml = (input.tembusan || [])
    .filter(t => t && t.trim())
    .map((t, i) => `<div style="margin-left: 20px; text-indent: -20px;">${i + 1}. ${t};</div>`)
    .join("");

  container.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 2px; width: 100%;">
      <img src="/logo-bandung.png" style="width: 25mm; height: auto; margin-right: 15px;" />
      <div style="flex: 1; text-align: center; padding-right: 25mm;">
        <div style="font-weight: bold; font-size: 14pt; margin-bottom: 2px; white-space: nowrap;">${st.pemda_name.toUpperCase()}</div>
        <div style="font-weight: bold; font-size: 16pt; margin-bottom: 2px; white-space: nowrap;">${st.dinas_name.toUpperCase()}</div>
        <div style="font-size: 10pt;">${st.dinas_address}</div>
      </div>
    </div>
    
    <!-- Double Line Kop Surat -->
    <div style="border-bottom: 2.5pt solid black; margin-top: 8px;"></div>
    <div style="border-bottom: 0.5pt solid black; margin-top: 2px; margin-bottom: 20px;"></div>

    <div style="text-align: center; margin-bottom: 25px;">
      <div style="font-weight: bold; text-decoration: underline; font-size: 13pt;">SURAT PERNYATAAN PENGAJUAN PERUBAHAN KONDISI BMD</div>
      <div style="font-size: 12pt;">Nomor : ${input.nomorSP || "-"}</div>
    </div>

    <div style="margin-bottom: 12px; font-size: 12pt;">Yang bertandatangan dibawah ini:</div>
    
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; margin-left: 20px; font-size: 12pt;">
      <tr>
        <td style="width: 100px; vertical-align: top;">Nama</td>
        <td style="width: 20px; vertical-align: top;">:</td>
        <td style="font-weight: bold; vertical-align: top;">${input.namaKadis.toUpperCase() || "-"}</td>
      </tr>
      <tr>
        <td style="vertical-align: top;">NIP</td>
        <td style="vertical-align: top;">:</td>
        <td style="vertical-align: top;">${input.nipKadis || "-"}</td>
      </tr>
      <tr>
        <td style="vertical-align: top;">Jabatan</td>
        <td style="vertical-align: top;">:</td>
        <td style="vertical-align: top;">${jabatanStr}, selaku Pengguna BMD</td>
      </tr>
    </table>

    <div style="text-align: justify; text-indent: 1.27cm; margin-bottom: 15px; font-size: 12pt;">
      Berdasarkan Berita Acara Hasil Penelitian/ Pemeriksaan Peralatan dan Mesin Tanggal ${dateBA} Nomor: ${input.nomorBA || "-"}, menyatakan dengan sebenarnya bahwa barang dalam penguasaan kami sebagaimana terlampir sudah rusak berat dan tidak dapat dioperasionalkan kembali dalam pelayanan umum untuk mendukung tugas pokok dan fungsi Perangkat Daerah kami.
    </div>

    <div style="text-align: justify; text-indent: 1.27cm; margin-bottom: 15px; font-size: 12pt;">
      Untuk itu kami menyatakan pengajuan untuk merubah kondisi barang tersebut.
    </div>

    <div style="text-align: justify; text-indent: 1.27cm; margin-bottom: 45px; font-size: 12pt;">
      Demikian untuk dapat diketahui, sebagai bahan lebih lanjut.
    </div>

    <div style="float: right; text-align: center; width: 300px; font-size: 12pt;">
      <div>Soreang, ${dateSP}</div>
      <div style="font-weight: bold; margin-top: 5px;">KEPALA</div>
      <div style="font-weight: bold;">${st.dinas_name.toUpperCase()}</div>
      <div>Selaku Pengguna BMD,</div>
      <div style="height: 2.5cm;"></div>
      <div style="font-weight: bold; text-decoration: underline;">${input.namaKadis.toUpperCase() || "-"}</div>
      <div>NIP. ${input.nipKadis || "-"}</div>
    </div>
    <div style="clear: both;"></div>

    <div style="margin-top: 30px; font-size: 10pt;">
      <div style="font-weight: bold; text-decoration: underline; margin-bottom: 5px;">Tembusan, kepada Yth:</div>
      <div style="line-height: 1.2;">
        ${tembusanHtml}
      </div>
    </div>
  `;

  document.body.appendChild(container);
  const canvas = await html2canvas(container, { 
    scale: 2,
    useCORS: true,
    logging: false
  });
  document.body.removeChild(container);

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  doc.addImage(imgData, "JPEG", 0, 0, pageW, pageH);

  // ─── Halaman 2 (Lampiran): Landscape & autoTable ───
  doc.addPage("a4", "landscape");
  const lW = doc.internal.pageSize.getWidth();
  let ly = _baMargin + 5;

  doc.setFont("times", "normal");
  doc.setFontSize(10);
  doc.text(`Lampiran Surat Pernyataan Pengajuan Perubahan Kondisi BMD`, _baMargin, ly);
  doc.text(`Nomor : ${input.nomorSP || "-"}`, _baMargin, ly + 5);
  ly += 15;

  ly = _spRenderUniversalTable(doc, ly, input.assets);
  ly += 10;

  // Footer di halaman lampiran
  const dateLine = `Soreang, ${dateSP}`;
  _baSignRight(doc, ly, dateLine, input.jabatanKadis, input.namaKadis, input.nipKadis, { 
    skipMengetahui: true, 
    selakuLabel: "Selaku Pengguna BMD," 
  });

  return doc.output("blob");
}
