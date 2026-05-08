import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCustomColumns } from "@/contexts/CustomColumnsContext";
import * as XLSX from "xlsx";
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

// ─── Main Page ──────────────────────────────────────────
export default function PengajuanSuratPage() {
  const { companyId } = useAuth();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);

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

        dataRows.forEach(row => {
          if (kodeKey && row[kodeKey]) kodeList.push(String(row[kodeKey]).trim());
          if (nilaiKey && row[nilaiKey]) {
            const raw = String(row[nilaiKey]).split(",")[0];
            const num = Number(raw.replace(/[^0-9]/g, ""));
            if (!isNaN(num)) total += num;
          }
        });

        setParsedKodeBarang(kodeList);
        setParsedTotalNilai(total);
        setParsedRowCount(dataRows.length);
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
        data_otorisasi: { nama: namaKadis, nip: nipKadis, jabatan: jabatanKadis } as any,
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

      // 4. Trigger print
      setTimeout(() => {
        window.print();
        onClose();
      }, 300);
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

        {/* Step 4: Preview */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/30 p-3">
              <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning">Setelah menekan tombol di bawah, <strong>{parsedRowCount} aset</strong> akan ditandai "Menunggu Update SIMDA" dan hilang dari Papan Rekonsiliasi.</p>
            </div>

            {/* Print-ready content */}
            <div ref={printRef} className="print-surat border border-border rounded-lg p-6 bg-white text-black text-[13px] leading-relaxed" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
              <div className="text-center mb-6 border-b-2 border-black pb-4">
                <p className="text-[10px] tracking-widest uppercase text-gray-500">Kop Surat Instansi</p>
                <p className="font-bold text-lg mt-1">PEMERINTAH KABUPATEN BANDUNG</p>
                <p className="text-sm">DINAS PERUMAHAN, KAWASAN PERMUKIMAN DAN PERTANAHAN</p>
              </div>

              <div className="flex justify-between mb-4">
                <div><p>Nomor: {nomorSurat}</p><p>Perihal: Pengajuan Perubahan Kondisi BMD</p></div>
                <p>{tglSuratFormatted}</p>
              </div>

              <p className="mb-4">Kepada Yth,<br />Bupati Bandung<br />di Tempat</p>

              <p className="text-justify mb-3">Dengan hormat,</p>
              <p className="text-justify mb-3 indent-8">
                Berdasarkan hasil penelusuran fisik terhadap Barang Milik Daerah (BMD) yang dilaksanakan pada tanggal <strong>{tglPenelusuranFormatted}</strong>, dengan ini kami sampaikan pengajuan perubahan kondisi BMD berupa <strong>{jenisKib}</strong>.
              </p>

              <p className="text-justify mb-3 font-bold">SURAT PERNYATAAN</p>
              <p className="text-justify mb-3 indent-8">
                Yang bertanda tangan di bawah ini, <strong>{namaKadis}</strong>, NIP. {nipKadis}, {jabatanKadis}, menyatakan dengan sebenarnya bahwa barang dalam penguasaan kami sebagaimana terlampir sebanyak <strong>{parsedRowCount} item</strong> senilai <strong>Rp {parsedTotalNilai.toLocaleString("id-ID")}</strong> sudah dalam kondisi rusak berat dan tidak dapat digunakan lagi untuk menunjang tugas pokok dan fungsi.
              </p>
              <p className="text-justify mb-6 indent-8">
                Demikian surat pernyataan ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.
              </p>

              <div className="flex justify-end mb-8">
                <div className="text-center w-64">
                  <p>{jabatanKadis},</p>
                  <div className="h-20" />
                  <p className="font-bold underline">{namaKadis}</p>
                  <p>NIP. {nipKadis}</p>
                </div>
              </div>

              <div className="border-t border-gray-300 pt-3 text-[11px]">
                <p className="font-bold mb-1">Tembusan:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  {tembusan.filter(t => t.trim()).map((t, i) => <li key={i}>{t}</li>)}
                </ol>
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
