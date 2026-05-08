import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCustomColumns } from "@/contexts/CustomColumnsContext";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  FileSignature, Plus, ArrowLeft, ArrowRight, Check, Upload, Trash2,
  FileText, Download, Loader2, AlertCircle, CheckCircle2, Printer
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

// ─── PDF Generator Helper ───────────────────────────────
async function generatePDF(page1Id: string, page2Id: string, filename: string) {
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

  const el2 = document.getElementById(page2Id);
  if (el2) {
    const canvas2 = await html2canvas(el2, { scale: 2, useCORS: true, logging: false });
    const imgData2 = canvas2.toDataURL("image/png");
    // F4 Landscape: 330 x 215 mm
    pdf.addPage([215, 330], "landscape");
    const lW = 330, lH = 215;
    const cW2 = lW - margin * 2;
    const imgH2 = (canvas2.height * cW2) / canvas2.width;
    pdf.addImage(imgData2, "PNG", margin, margin, cW2, Math.min(imgH2, lH - margin * 2));
  }

  pdf.save(filename);
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
            Pengajuan Surat
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Generate surat pernyataan pengajuan perubahan kondisi BMD.
          </p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => setWizardOpen(true)}>
          <Plus className="h-4 w-4" /> Buat Surat Pengajuan Baru
        </Button>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Riwayat Surat</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : archives.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Belum ada surat pengajuan.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">No. Surat</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tanggal</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jenis KIB</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Total Aset</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Total Nilai</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archives.map((arc: any) => (
                    <TableRow key={arc.id}>
                      <TableCell className="text-sm font-medium">{arc.nomor_surat}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatTgl(arc.tanggal_surat)}</TableCell>
                      <TableCell className="text-sm">{arc.jenis_kib || "—"}</TableCell>
                      <TableCell className="text-center text-sm">{arc.total_aset}</TableCell>
                      <TableCell className="text-right text-sm font-medium">Rp {Number(arc.total_nilai || 0).toLocaleString("id-ID")}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-chart-3/10 text-chart-3 border-chart-3/30">{arc.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setReprintArc(arc)} title="Cetak Ulang">
                          <Printer className="h-4 w-4 text-primary" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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
        />
      )}

      {reprintArc && (
        <ReprintDialog arc={reprintArc} onClose={() => setReprintArc(null)} />
      )}
    </div>
  );
}

// ─── Wizard Dialog ──────────────────────────────────────
function WizardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
  const [excelFileName, setExcelFileName] = useState("");

  // Step 3
  const [tembusan, setTembusan] = useState([
    "Bapak Bupati Bandung selaku Pemegang Kekuasaan Pengelolaan BMD",
    "Bapak Sekretaris Daerah selaku Pengelola BMD",
    "Kepala Badan Keuangan Daerah",
    "Inspektur Kabupaten Bandung",
  ]);

  const steps = ["Administrasi", "Lampiran Excel", "Tembusan", "Preview & Cetak"];

  // Excel Parser
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws);
        if (json.length === 0) { toast.error("File Excel kosong."); return; }

        // Find kode_barang column
        const keys = Object.keys(json[0]);
        const kodeKey = keys.find(k => k.toLowerCase().includes("kode barang") || k.toLowerCase().includes("kode_barang")) || "";
        const nilaiKey = keys.find(k => k.toLowerCase().includes("nilai") || k.toLowerCase().includes("harga")) || "";

        const kodeList: string[] = [];
        let total = 0;

        // Filter out TOTAL row
        const dataRows = json.filter(row => {
          const namaVal = String(row["Nama Barang"] || row["nama_barang"] || "");
          return !namaVal.toUpperCase().includes("TOTAL");
        });

        const namaKey = keys.find(k => k.toLowerCase().includes("nama barang") || k.toLowerCase().includes("nama_barang")) || "";
        const kondisiKey = keys.find(k => k.toLowerCase().includes("kondisi")) || "";
        const rowsForLampiran: any[] = [];

        dataRows.forEach((row, idx) => {
          if (kodeKey && row[kodeKey]) kodeList.push(String(row[kodeKey]).trim());
          let num = 0;
          if (nilaiKey && row[nilaiKey]) {
            const raw = String(row[nilaiKey]).split(",")[0];
            num = Number(raw.replace(/[^0-9]/g, "")) || 0;
            total += num;
          }
          rowsForLampiran.push({
            no: idx + 1,
            kode_barang: kodeKey ? String(row[kodeKey] || "").trim() : "",
            nama_barang: namaKey ? String(row[namaKey] || "").trim() : "",
            kondisi: kondisiKey ? String(row[kondisiKey] || "").trim() : "",
            nilai_perolehan: num,
          });
        });

        setParsedKodeBarang(kodeList);
        setParsedTotalNilai(total);
        setParsedRowCount(dataRows.length);
        setParsedRows(rowsForLampiran);
        toast.success(`Berhasil membaca ${dataRows.length} baris data.`);
      } catch (err) {
        console.error(err);
        toast.error("Gagal membaca file Excel.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Tutup Periode & Save
  const handleSubmit = async () => {
    if (!companyId) return;
    setSubmitting(true);
    try {
      // 1. Save document archive
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
        data_otorisasi: { nama: namaKadis, nip: nipKadis, jabatan: jabatanKadis, lampiran_data: parsedRows } as any,
        status: "Selesai",
      });
      if (insertErr) throw insertErr;

      // 2. Bulk update assets — set status_usulan to "Menunggu Update SIMDA"
      if (parsedKodeBarang.length > 0) {
        const { data: matchedAssets } = await supabase
          .from("assets")
          .select("id, custom_data")
          .eq("company_id", companyId)
          .in("kode_aset", parsedKodeBarang);

        if (matchedAssets && matchedAssets.length > 0) {
          for (const asset of matchedAssets) {
            const cd = (typeof asset.custom_data === "object" && asset.custom_data) ? asset.custom_data as Record<string, any> : {};
            const newCd = { ...cd, status_usulan: "Menunggu Update SIMDA" };
            await supabase.from("assets").update({ custom_data: newCd }).eq("id", asset.id);
          }
          console.log(`[TutupPeriode] Updated ${matchedAssets.length} assets.`);
        }
      }

      // 3. Invalidate caches
      queryClient.invalidateQueries({ queryKey: ["document-archives"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["rekon-assets-joined"] });

      toast.success("Surat berhasil disimpan & periode ditutup!");

      // 4. Generate PDF via jsPDF
      try {
        await new Promise(r => setTimeout(r, 300));
        await generatePDF("pdf-page-1", "pdf-page-2", `Surat_Pengajuan_BMD_${nomorSurat.replace(/\//g, "-")}.pdf`);
      } catch (pdfErr) {
        console.warn("PDF generation failed:", pdfErr);
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Gagal menyimpan surat.");
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
            Buat Surat Pengajuan Baru
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

        {/* Step 2: Excel Parser */}
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
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Upload Lampiran Excel (.xlsx) <span className="text-destructive">*</span></Label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors flex-1">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{excelFileName || "Klik untuk pilih file..."}</span>
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </div>
            {parsedRowCount > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-chart-3/10 border border-chart-3/30 p-4">
                <CheckCircle2 className="h-5 w-5 text-chart-3 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-chart-3">Berhasil membaca {parsedRowCount} Aset</p>
                  <p className="text-xs text-chart-3/80 mt-0.5">Total Nilai Perolehan: <strong>Rp {parsedTotalNilai.toLocaleString("id-ID")}</strong></p>
                </div>
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
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/30 p-3">
              <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning">Setelah menekan tombol di bawah, <strong>{parsedRowCount} aset</strong> akan ditandai "Menunggu Update SIMDA" dan hilang dari Papan Rekonsiliasi.</p>
            </div>
            <div className="rounded-lg border border-border p-4 space-y-2 bg-muted/20 text-sm">
              <p><strong>Nomor Surat:</strong> {nomorSurat}</p>
              <p><strong>Tanggal Surat:</strong> {tglSuratFormatted}</p>
              <p><strong>Jenis KIB:</strong> {jenisKib}</p>
              <p><strong>Jumlah Aset:</strong> {parsedRowCount} item</p>
              <p><strong>Total Nilai:</strong> Rp {parsedTotalNilai.toLocaleString("id-ID")}</p>
              <p><strong>Kepala Dinas:</strong> {namaKadis} (NIP. {nipKadis})</p>
              <p><strong>Tembusan:</strong> {tembusan.filter(t => t.trim()).length} pihak</p>
            </div>
          </div>
        )}

        {/* ═══ OFF-SCREEN PDF Containers ═══ */}
        {step === 4 && (
          <>
            {/* Page 1: Portrait Surat */}
            <div style={{ position: "fixed", top: "-9999px", left: "-9999px", width: "215mm", fontFamily: "'Times New Roman', Times, serif", fontSize: "13px", lineHeight: "1.6", color: "#000", background: "#fff" }}>
              <div id="pdf-page-1" style={{ padding: "30px 40px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px", borderBottom: "3px solid #000", paddingBottom: "12px", marginBottom: "16px" }}>
                  <div style={{ width: "64px", height: "64px", border: "1px solid #ccc", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", color: "#999", flexShrink: 0 }}>LOGO</div>
                  <div style={{ textAlign: "center", flex: 1 }}>
                    <p style={{ fontWeight: "bold", fontSize: "16px", letterSpacing: "1px" }}>PEMERINTAH KABUPATEN BANDUNG</p>
                    <p style={{ fontWeight: "bold", fontSize: "13px" }}>DINAS PERUMAHAN, KAWASAN PERMUKIMAN DAN PERTANAHAN</p>
                    <p style={{ fontSize: "9px", marginTop: "2px" }}>Jl. Raya Soreang KM 17 Telp. (022) 5893660 Soreang 40911 Kabupaten Bandung Provinsi Jawa Barat,</p>
                    <p style={{ fontSize: "9px" }}>E-mail : disperkimtan@bandungkab.go.id Website : www.bandungkab.go.id</p>
                  </div>
                </div>
                <div style={{ textAlign: "center", marginBottom: "16px" }}>
                  <p style={{ fontWeight: "bold", textDecoration: "underline", fontSize: "14px" }}>SURAT PERNYATAAN PENGAJUAN PERUBAHAN KONDISI BMD</p>
                  <p style={{ fontSize: "13px", marginTop: "4px" }}>Nomor : {nomorSurat}</p>
                </div>
                <p style={{ textAlign: "justify", marginBottom: "16px", textIndent: "32px" }}>Berdasarkan hasil penelusuran fisik BMD yang dilakukan pada <strong>{tglPenelusuranFormatted}</strong>, yang bertanda tangan di bawah ini :</p>
                <table style={{ marginLeft: "32px", marginBottom: "16px", fontSize: "13px" }}><tbody>
                  <tr><td style={{ paddingRight: "16px" }}>Nama</td><td style={{ paddingRight: "8px" }}>:</td><td>{namaKadis}</td></tr>
                  <tr><td style={{ paddingRight: "16px" }}>Nip</td><td style={{ paddingRight: "8px" }}>:</td><td>{nipKadis}</td></tr>
                  <tr><td style={{ paddingRight: "16px" }}>Jabatan</td><td style={{ paddingRight: "8px" }}>:</td><td>{jabatanKadis}</td></tr>
                </tbody></table>
                <p style={{ textAlign: "justify", marginBottom: "16px" }}>Menyatakan dengan sebenarnya bahwa barang dalam penguasaan kami sebagaimana terlampir sudah rusak berat dan tidak dapat dioperasionalkan kembali dalam pelayanan umum untuk mendukungi tugas pokok dan fungsi Perangkat Daerah kami.</p>
                <p style={{ textAlign: "justify", marginBottom: "16px" }}>Untuk itu kami menyatakan pengajuan untuk merubah kondisi barang tersebut.</p>
                <p style={{ textAlign: "justify", marginBottom: "32px" }}>Demikian untuk dapat diketahui, sebagai bahan lebih lanjut.</p>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "48px" }}>
                  <div style={{ textAlign: "center", width: "280px" }}>
                    <p>Soreang, {tglSuratFormatted}</p>
                    <p style={{ marginTop: "4px" }}>{jabatanKadis},</p>
                    <p>Selaku Pengguna BMD,</p>
                    <div style={{ height: "96px" }} />
                    <p style={{ fontWeight: "bold", textDecoration: "underline" }}>{namaKadis.toUpperCase()}</p>
                    <p>Nip. {nipKadis}</p>
                  </div>
                </div>
                <div style={{ fontSize: "11px", marginTop: "16px" }}>
                  <p><strong><u>Tembusan</u></strong>, Kepada Yth :</p>
                  <ol style={{ listStyleType: "decimal", paddingLeft: "20px", marginTop: "4px" }}>
                    {tembusan.filter(t => t.trim()).map((t, i) => <li key={i}>{t};</li>)}
                  </ol>
                </div>
              </div>
            </div>

            {/* Page 2: Landscape Lampiran */}
            {parsedRows.length > 0 && (
              <div style={{ position: "fixed", top: "-9999px", left: "-9999px", width: "330mm", fontFamily: "'Times New Roman', Times, serif", fontSize: "11px", lineHeight: "1.4", color: "#000", background: "#fff" }}>
                <div id="pdf-page-2" style={{ padding: "24px 30px" }}>
                  <div style={{ marginBottom: "8px", fontSize: "11px" }}>
                    <p>Lampiran I (Rubah Kondisi BMD)</p>
                    <p>Nomor : {nomorSurat}</p>
                    <p>Tanggal : {tglSuratFormatted}</p>
                  </div>
                  <p style={{ fontWeight: "bold", textAlign: "center", fontSize: "13px", marginBottom: "4px" }}>DAFTAR BARANG MILIK DAERAH YANG DIUSULKAN PERUBAHAN KONDISI</p>
                  <p style={{ fontWeight: "bold", textAlign: "center", fontSize: "12px", marginBottom: "16px" }}>DINAS PERUMAHAN, KAWASAN PERMUKIMAN DAN PERTANAHAN</p>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                    <thead>
                      <tr>
                        <th style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "center", width: "30px" }}>No</th>
                        <th style={{ border: "1px solid #000", padding: "4px 8px" }}>Kode Barang</th>
                        <th style={{ border: "1px solid #000", padding: "4px 8px" }}>Nama Barang</th>
                        <th style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "center" }}>Kondisi</th>
                        <th style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right" }}>Nilai Perolehan (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((r, i) => (
                        <tr key={i}>
                          <td style={{ border: "1px solid #000", padding: "2px 8px", textAlign: "center" }}>{r.no}</td>
                          <td style={{ border: "1px solid #000", padding: "2px 8px" }}>{r.kode_barang}</td>
                          <td style={{ border: "1px solid #000", padding: "2px 8px" }}>{r.nama_barang}</td>
                          <td style={{ border: "1px solid #000", padding: "2px 8px", textAlign: "center" }}>{r.kondisi}</td>
                          <td style={{ border: "1px solid #000", padding: "2px 8px", textAlign: "right" }}>{r.nilai_perolehan > 0 ? r.nilai_perolehan.toLocaleString("id-ID") : "0"}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={4} style={{ border: "1px solid #000", padding: "4px 8px", fontWeight: "bold", textAlign: "right" }}>TOTAL</td>
                        <td style={{ border: "1px solid #000", padding: "4px 8px", fontWeight: "bold", textAlign: "right" }}>{parsedTotalNilai.toLocaleString("id-ID")}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
                    <div style={{ textAlign: "center", fontSize: "11px", width: "250px" }}>
                      <p>Mengetahui,</p>
                      <p>{jabatanKadis},</p>
                      <div style={{ height: "80px" }} />
                      <p style={{ fontWeight: "bold", textDecoration: "underline" }}>{namaKadis.toUpperCase()}</p>
                      <p>Nip. {nipKadis}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
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
              {submitting ? "Memproses..." : "Generate PDF & Tutup Periode"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reprint Dialog ─────────────────────────────────────
function ReprintDialog({ arc, onClose }: { arc: any; onClose: () => void }) {
  const ot = arc.data_otorisasi || {};
  const lampiran: any[] = ot.lampiran_data || [];
  const tmb: string[] = (arc.tembusan || []).filter((t: string) => t?.trim());
  const tglSurat = arc.tanggal_surat ? new Date(arc.tanggal_surat).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const tglPen = arc.tanggal_penelusuran ? new Date(arc.tanggal_penelusuran).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const [downloading, setDownloading] = useState(false);

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
          <p><strong>No. Surat:</strong> {arc.nomor_surat}</p>
          <p><strong>Tanggal:</strong> {tglSurat}</p>
          <p><strong>Jenis KIB:</strong> {arc.jenis_kib || "—"}</p>
          <p><strong>Jumlah Aset:</strong> {arc.total_aset} item</p>
          <p><strong>Total Nilai:</strong> Rp {Number(arc.total_nilai || 0).toLocaleString("id-ID")}</p>
          <p><strong>Kepala Dinas:</strong> {ot.nama} (NIP. {ot.nip})</p>
        </div>
        <div className="flex justify-end pt-3 border-t border-border">
          <Button onClick={handleDownload} disabled={downloading} className="gap-1.5">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "Memproses..." : "Unduh PDF"}
          </Button>
        </div>
      </DialogContent>

      {/* Off-screen Page 1 */}
      <div style={{ position: "fixed", top: "-9999px", left: "-9999px", width: "215mm", fontFamily: "'Times New Roman', Times, serif", fontSize: "13px", lineHeight: "1.6", color: "#000", background: "#fff" }}>
        <div id="reprint-page-1" style={{ padding: "30px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", borderBottom: "3px solid #000", paddingBottom: "12px", marginBottom: "16px" }}>
            <div style={{ width: "64px", height: "64px", border: "1px solid #ccc", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", color: "#999", flexShrink: 0 }}>LOGO</div>
            <div style={{ textAlign: "center", flex: 1 }}>
              <p style={{ fontWeight: "bold", fontSize: "16px", letterSpacing: "1px" }}>PEMERINTAH KABUPATEN BANDUNG</p>
              <p style={{ fontWeight: "bold", fontSize: "13px" }}>DINAS PERUMAHAN, KAWASAN PERMUKIMAN DAN PERTANAHAN</p>
              <p style={{ fontSize: "9px", marginTop: "2px" }}>Jl. Raya Soreang KM 17 Telp. (022) 5893660 Soreang 40911 Kabupaten Bandung Provinsi Jawa Barat,</p>
              <p style={{ fontSize: "9px" }}>E-mail : disperkimtan@bandungkab.go.id Website : www.bandungkab.go.id</p>
            </div>
          </div>
          <div style={{ textAlign: "center", marginBottom: "16px" }}>
            <p style={{ fontWeight: "bold", textDecoration: "underline", fontSize: "14px" }}>SURAT PERNYATAAN PENGAJUAN PERUBAHAN KONDISI BMD</p>
            <p style={{ fontSize: "13px", marginTop: "4px" }}>Nomor : {arc.nomor_surat}</p>
          </div>
          <p style={{ textAlign: "justify", marginBottom: "16px", textIndent: "32px" }}>Berdasarkan hasil penelusuran fisik BMD yang dilakukan pada <strong>{tglPen}</strong>, yang bertanda tangan di bawah ini :</p>
          <table style={{ marginLeft: "32px", marginBottom: "16px", fontSize: "13px" }}><tbody>
            <tr><td style={{ paddingRight: "16px" }}>Nama</td><td style={{ paddingRight: "8px" }}>:</td><td>{ot.nama}</td></tr>
            <tr><td style={{ paddingRight: "16px" }}>Nip</td><td style={{ paddingRight: "8px" }}>:</td><td>{ot.nip}</td></tr>
            <tr><td style={{ paddingRight: "16px" }}>Jabatan</td><td style={{ paddingRight: "8px" }}>:</td><td>{ot.jabatan}</td></tr>
          </tbody></table>
          <p style={{ textAlign: "justify", marginBottom: "16px" }}>Menyatakan dengan sebenarnya bahwa barang dalam penguasaan kami sebagaimana terlampir sudah rusak berat dan tidak dapat dioperasionalkan kembali dalam pelayanan umum untuk mendukungi tugas pokok dan fungsi Perangkat Daerah kami.</p>
          <p style={{ textAlign: "justify", marginBottom: "16px" }}>Untuk itu kami menyatakan pengajuan untuk merubah kondisi barang tersebut.</p>
          <p style={{ textAlign: "justify", marginBottom: "32px" }}>Demikian untuk dapat diketahui, sebagai bahan lebih lanjut.</p>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "48px" }}>
            <div style={{ textAlign: "center", width: "280px" }}>
              <p>Soreang, {tglSurat}</p>
              <p style={{ marginTop: "4px" }}>{ot.jabatan},</p>
              <p>Selaku Pengguna BMD,</p>
              <div style={{ height: "96px" }} />
              <p style={{ fontWeight: "bold", textDecoration: "underline" }}>{(ot.nama || "").toUpperCase()}</p>
              <p>Nip. {ot.nip}</p>
            </div>
          </div>
          <div style={{ fontSize: "11px", marginTop: "16px" }}>
            <p><strong><u>Tembusan</u></strong>, Kepada Yth :</p>
            <ol style={{ listStyleType: "decimal", paddingLeft: "20px", marginTop: "4px" }}>{tmb.map((t, i) => <li key={i}>{t};</li>)}</ol>
          </div>
        </div>
      </div>

      {/* Off-screen Page 2 */}
      {lampiran.length > 0 && (
        <div style={{ position: "fixed", top: "-9999px", left: "-9999px", width: "330mm", fontFamily: "'Times New Roman', Times, serif", fontSize: "11px", lineHeight: "1.4", color: "#000", background: "#fff" }}>
          <div id="reprint-page-2" style={{ padding: "24px 30px" }}>
            <div style={{ marginBottom: "8px", fontSize: "11px" }}>
              <p>Lampiran I (Rubah Kondisi BMD)</p>
              <p>Nomor : {arc.nomor_surat}</p>
              <p>Tanggal : {tglSurat}</p>
            </div>
            <p style={{ fontWeight: "bold", textAlign: "center", fontSize: "13px", marginBottom: "4px" }}>DAFTAR BARANG MILIK DAERAH YANG DIUSULKAN PERUBAHAN KONDISI</p>
            <p style={{ fontWeight: "bold", textAlign: "center", fontSize: "12px", marginBottom: "16px" }}>DINAS PERUMAHAN, KAWASAN PERMUKIMAN DAN PERTANAHAN</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
              <thead><tr>
                <th style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "center", width: "30px" }}>No</th>
                <th style={{ border: "1px solid #000", padding: "4px 8px" }}>Kode Barang</th>
                <th style={{ border: "1px solid #000", padding: "4px 8px" }}>Nama Barang</th>
                <th style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "center" }}>Kondisi</th>
                <th style={{ border: "1px solid #000", padding: "4px 8px", textAlign: "right" }}>Nilai Perolehan (Rp)</th>
              </tr></thead>
              <tbody>
                {lampiran.map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={{ border: "1px solid #000", padding: "2px 8px", textAlign: "center" }}>{r.no}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 8px" }}>{r.kode_barang}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 8px" }}>{r.nama_barang}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 8px", textAlign: "center" }}>{r.kondisi}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 8px", textAlign: "right" }}>{(r.nilai_perolehan || 0) > 0 ? Number(r.nilai_perolehan).toLocaleString("id-ID") : "0"}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} style={{ border: "1px solid #000", padding: "4px 8px", fontWeight: "bold", textAlign: "right" }}>TOTAL</td>
                  <td style={{ border: "1px solid #000", padding: "4px 8px", fontWeight: "bold", textAlign: "right" }}>{Number(arc.total_nilai || 0).toLocaleString("id-ID")}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
              <div style={{ textAlign: "center", fontSize: "11px", width: "250px" }}>
                <p>Mengetahui,</p>
                <p>{ot.jabatan},</p>
                <div style={{ height: "80px" }} />
                <p style={{ fontWeight: "bold", textDecoration: "underline" }}>{(ot.nama || "").toUpperCase()}</p>
                <p>Nip. {ot.nip}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
