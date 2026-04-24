import { useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, ImagePlus, Save, Package, X, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useCustomColumns } from "@/contexts/CustomColumnsContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { getSmartLocation } from "@/lib/smartLocation";
import { buildAssetCode, buildCodePrefix, buildCodePreview, type CodeValueMap } from "@/lib/assetCode";
import CascadingDropdown, { getTreeCodeValue, getTreeLabelChain } from "@/components/CascadingDropdown";

const KONDISI_OPTIONS = ["Baik", "Rusak Ringan", "Rusak Berat"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function DashboardAssetsNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { getColumnsForKib, getCodeConfigForKib, masterDivisi, masterKib } = useCustomColumns();
  const { companyId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [namaAset, setNamaAset] = useState("");
  const [kondisi, setKondisi] = useState("");
  const [tanggalPerolehan, setTanggalPerolehan] = useState("");
  const [nilaiAset, setNilaiAset] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [customData, setCustomData] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [selectedDivisi, setSelectedDivisi] = useState("");
  const [selectedKib, setSelectedKib] = useState("");

  // Get the KIB label for column lookup
  const selectedKibItem = masterKib.find((k) => k.code === selectedKib);
  const kibLabel = selectedKibItem?.label || "";
  const customColumns = getColumnsForKib(kibLabel);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { toast.error("File terlalu besar. Maksimal 5MB."); return; }
    if (!file.type.startsWith("image/")) { toast.error("Hanya file gambar yang diperbolehkan."); return; }
    setIsUploading(true);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Not authenticated");
      const filePath = `${userId}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from("asset-photos").upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("asset-photos").getPublicUrl(filePath);
      setImageUrl(urlData.publicUrl);
      toast.success("Foto berhasil diunggah!");
    } catch (err: any) {
      toast.error(err.message || "Gagal mengunggah foto.");
      setPreviewUrl(null); setImageUrl(null);
    } finally { setIsUploading(false); }
  };

  const removePhoto = () => { setImageUrl(null); setPreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; };

  const handleSubmit = async () => {
    if (!selectedDivisi && masterDivisi.length > 0) { toast.error("Divisi / Satuan Kerja wajib dipilih."); return; }
    if (!selectedKib && masterKib.length > 0) { toast.error("KIB wajib dipilih."); return; }
    if (!namaAset.trim()) { toast.error("Nama Aset wajib diisi."); return; }
    if (!kondisi) { toast.error("Kondisi wajib dipilih."); return; }
    if (quantity < 1 || quantity > 999) { toast.error("Jumlah item harus antara 1–999."); return; }
    if (!companyId) { toast.error("Data perusahaan belum tersedia."); return; }

    setIsSubmitting(true);
    try {
      const customDataJson: Record<string, string | number | null> = {};
      const divisiItem = masterDivisi.find((d) => d.code === selectedDivisi);
      const kibItem = masterKib.find((k) => k.code === selectedKib);

      // Build value map for code generator
      const codeValueMap: CodeValueMap = {};
      if (divisiItem) codeValueMap.divisi = divisiItem.code;
      if (kibItem) codeValueMap.kib = kibItem.code;

      // Follow drag-and-drop order from customColumns (already ordered by KIB)
      for (const col of customColumns) {
        const val = customData[col.name];
        if (val !== undefined && val !== "") {
          if (col.type === "coded_dropdown") {
            if (col.options_tree) {
              // Nested tree: value is "01>02>03", code is "01.02.03", label is chain
              const codeStr = getTreeCodeValue(val);
              const labelStr = getTreeLabelChain(col, val);
              customDataJson[col.name] = labelStr;
              if (codeStr) codeValueMap[col.name] = codeStr;
            } else {
              // Legacy flat dropdown
              const selectedOpt = col.options?.find((o) => o.code === val);
              if (selectedOpt) {
                customDataJson[col.name] = selectedOpt.label;
                codeValueMap[col.name] = selectedOpt.code;
              }
            }
          } else {
            customDataJson[col.name] = col.type === "number" 
              ? Math.round(Number(String(val).replace(/[^0-9.-]+/g, ""))) 
              : val;
          }
        }
      }

      // Store extra base fields in custom_data
      if (kondisi) customDataJson["Kondisi"] = kondisi;
      if (tanggalPerolehan) customDataJson["Tanggal Perolehan"] = tanggalPerolehan;
      if (nilaiAset) customDataJson["Nilai Aset"] = Math.round(Number(String(nilaiAset).replace(/[^0-9.-]+/g, "")));

      const kodeDivisiLabel = divisiItem ? divisiItem.label : null;
      const kibLabelFull = kibItem ? `${kibItem.code} - ${kibItem.label}` : null;

      // Get per-KIB code configuration
      const kibCodeConfig = getCodeConfigForKib(kibLabel);

      // Build code prefix using per-KIB configuration
      const prefixKode = buildCodePrefix(kibCodeConfig, codeValueMap);
      let startNum = 1;

      if (prefixKode) {
        const { data: existing } = await supabase
          .from("assets").select("kode_aset").eq("company_id", companyId)
          .ilike("kode_aset", `${prefixKode}${kibCodeConfig.separator}%`);
        if (existing && existing.length > 0) {
          const numbers = existing.map((a) => {
            const parts = a.kode_aset.split(kibCodeConfig.separator);
            return parseInt(parts[parts.length - 1], 10) || 0;
          });
          startNum = Math.max(...numbers) + 1;
        }
      } else {
        const prefix = namaAset.trim().toUpperCase().replace(/\s+/g, "-");
        const { data: existing } = await supabase
          .from("assets").select("kode_aset").eq("company_id", companyId)
          .ilike("kode_aset", `${prefix}-%`);
        if (existing && existing.length > 0) {
          const numbers = existing.map((a) => { const match = a.kode_aset.match(/-(\d+)$/); return match ? parseInt(match[1], 10) : 0; });
          startNum = Math.max(...numbers) + 1;
        }
      }

      const payload = Array.from({ length: quantity }, (_, i) => {
        const kodeAset = prefixKode
          ? buildAssetCode(kibCodeConfig, codeValueMap, startNum + i)
          : `${namaAset.trim().toUpperCase().replace(/\s+/g, "-")}-${String(startNum + i).padStart(3, "0")}`;
        return {
          company_id: companyId,
          nama_aset: namaAset.trim(),
          kategori: kibItem ? kibItem.label : "Lainnya",
          lokasi_ruangan: getSmartLocation(customDataJson as Record<string, unknown>, kodeDivisiLabel),
          kode_aset: kodeAset,
          custom_data: customDataJson,
          image_url: imageUrl,
          kode_divisi: kodeDivisiLabel,
          kib: kibLabelFull,
        };
      });

      const { error } = await supabase.from("assets").insert(payload);
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(quantity === 1 ? "Berhasil menyimpan 1 aset baru!" : `Berhasil men-generate ${quantity} aset baru!`);
      navigate("/dashboard/assets");
    } catch (err: any) {
      toast.error(err.message || "Gagal menyimpan aset.");
    } finally { setIsSubmitting(false); }
  };

  const codePreview = useMemo(() => {
    const kibCodeConfig = getCodeConfigForKib(kibLabel);
    const codeValueMap: CodeValueMap = {};
    if (selectedDivisi) codeValueMap.divisi = selectedDivisi;
    if (selectedKib) codeValueMap.kib = selectedKib;
    for (const col of customColumns) {
      if (col.type === "coded_dropdown" && customData[col.name]) {
        if (col.options_tree) {
          const codeStr = getTreeCodeValue(customData[col.name]);
          if (codeStr) codeValueMap[col.name] = codeStr;
        } else {
          codeValueMap[col.name] = customData[col.name];
        }
      }
    }
    const preview = buildCodePreview(kibCodeConfig, codeValueMap);
    if (preview !== "—") return preview;
    if (namaAset.trim()) return `${namaAset.trim().toUpperCase().replace(/\s+/g, "-")}-001`;
    return "—";
  }, [selectedDivisi, selectedKib, customData, customColumns, kibLabel, getCodeConfigForKib, namaAset]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0" onClick={() => navigate("/dashboard/assets")}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Tambah Aset Baru</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Isi informasi aset dan simpan ke inventaris.</p>
        </div>
      </div>

      {/* Kode Aset Preview */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-medium">Kode Aset:</span>
        <span className="font-mono text-sm font-bold text-primary">{codePreview}</span>
      </div>

      {/* Klasifikasi Aset */}
      {(masterDivisi.length > 0 || masterKib.length > 0) && (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Klasifikasi Aset</h2>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {masterDivisi.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Divisi / Satuan Kerja <span className="text-destructive">*</span></Label>
                <Select value={selectedDivisi} onValueChange={setSelectedDivisi}>
                  <SelectTrigger><SelectValue placeholder="Pilih Divisi" /></SelectTrigger>
                  <SelectContent>
                    {masterDivisi.filter(d => !!d.code).map((d) => (<SelectItem key={d.id} value={d.code}><span className="font-mono text-muted-foreground mr-2">{d.code}</span>{d.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {masterKib.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">KIB <span className="text-destructive">*</span></Label>
                <Select value={selectedKib} onValueChange={(v) => { setSelectedKib(v); setCustomData({}); }}>
                  <SelectTrigger><SelectValue placeholder="Pilih KIB" /></SelectTrigger>
                  <SelectContent>
                    {masterKib.filter(k => !!k.code).map((k) => (<SelectItem key={k.id} value={k.code}><span className="font-mono text-muted-foreground mr-2">{k.code}</span>{k.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Informasi Dasar */}
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Package className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Informasi Dasar</h2>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-medium text-muted-foreground">Nama Aset <span className="text-destructive">*</span></Label>
            <Input placeholder="cth: Laptop Dell Latitude 5540" value={namaAset} onChange={(e) => setNamaAset(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Kondisi <span className="text-destructive">*</span></Label>
            <Select value={kondisi} onValueChange={setKondisi}>
              <SelectTrigger><SelectValue placeholder="Pilih kondisi" /></SelectTrigger>
              <SelectContent>{KONDISI_OPTIONS.filter(Boolean).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Tanggal Perolehan</Label>
            <Input type="date" value={tanggalPerolehan} onChange={(e) => setTanggalPerolehan(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Nilai Aset / Harga</Label>
            <Input type="number" placeholder="0" value={nilaiAset} onChange={(e) => setNilaiAset(e.target.value)} onWheel={(e) => (e.target as HTMLInputElement).blur()} />
          </div>
        </div>
      </section>

      {/* Dynamic Custom Columns based on KIB */}
      {selectedKib && customColumns.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
            <h2 className="text-sm font-semibold text-foreground">Kolom Custom — {kibLabel}</h2>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {customColumns.map((col) => (
              <div key={col.id} className={`space-y-1.5 ${col.options_tree ? 'sm:col-span-2' : ''}`}>
                <Label className="text-xs font-medium text-muted-foreground">{col.name}</Label>
                {col.type === "coded_dropdown" && col.options_tree ? (
                  <CascadingDropdown
                    column={col}
                    value={customData[col.name] || ""}
                    onChange={(v) => setCustomData((p) => ({ ...p, [col.name]: v }))}
                  />
                ) : col.type === "coded_dropdown" && col.options ? (
                  <Select value={customData[col.name] || ""} onValueChange={(v) => setCustomData((p) => ({ ...p, [col.name]: v }))}>
                    <SelectTrigger><SelectValue placeholder={`Pilih ${col.name.toLowerCase()}`} /></SelectTrigger>
                    <SelectContent>
                      {col.options.filter(o => !!o.code).map((o) => (<SelectItem key={o.code} value={o.code}><span className="font-mono text-muted-foreground mr-2">{o.code}</span>{o.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                ) : col.type === "dropdown" && col.simple_options ? (
                  <Select value={customData[col.name] || ""} onValueChange={(v) => setCustomData((p) => ({ ...p, [col.name]: v }))}>
                    <SelectTrigger><SelectValue placeholder={`Pilih ${col.name.toLowerCase()}`} /></SelectTrigger>
                    <SelectContent>
                      {col.simple_options.filter(Boolean).map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"} placeholder={col.type === "number" ? "0" : `Masukkan ${col.name.toLowerCase()}`} value={customData[col.name] || ""} onChange={(e) => setCustomData((p) => ({ ...p, [col.name]: e.target.value }))} onWheel={(e) => col.type === "number" && (e.target as HTMLInputElement).blur()} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedKib && customColumns.length === 0 && (
        <section className="rounded-lg border border-border bg-card">
          <div className="px-5 py-8 flex flex-col items-center text-muted-foreground">
            <p className="text-xs font-medium">Belum ada kolom custom untuk KIB ini</p>
            <p className="text-[11px] mt-0.5 opacity-70">Tambahkan di <button type="button" className="underline text-primary hover:text-primary/80" onClick={() => navigate("/dashboard/settings")}>Pengaturan</button>.</p>
          </div>
        </section>
      )}

      {/* Media & Quantity */}
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Upload className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Penggandaan & Media</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Jumlah Item (Bulk Insert)</Label>
              <Input type="number" min={1} max={999} value={quantity} onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} onWheel={(e) => (e.target as HTMLInputElement).blur()} />
              <p className="text-[11px] text-muted-foreground">Sistem akan men-generate kode aset otomatis.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Upload Foto Master</Label>
            {previewUrl ? (
              <div className="relative rounded-lg border border-border bg-muted/30 p-3 flex items-center gap-4">
                <img src={previewUrl} alt="Preview" className="h-24 w-24 rounded-md object-cover border border-border" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">Foto berhasil diunggah</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Foto ini akan digunakan untuk semua item.</p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={removePhoto} disabled={isUploading}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <div className="relative rounded-lg border-2 border-dashed border-border hover:border-primary/40 transition-colors bg-muted/30 cursor-pointer group">
                <input ref={fileInputRef} type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileUpload} disabled={isUploading} />
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground group-hover:text-foreground/60 transition-colors">
                  {isUploading ? (<><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-xs font-medium">Mengunggah...</p></>) : (<><div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center"><ImagePlus className="h-5 w-5" /></div><p className="text-xs font-medium">Drag & drop foto, atau <span className="text-primary underline">pilih file</span></p><p className="text-[10px] opacity-60">PNG, JPG, WEBP — Maks. 5MB</p></>)}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 pb-4">
        <Button variant="outline" onClick={() => navigate("/dashboard/assets")} disabled={isSubmitting}>Batal</Button>
        <Button className="gap-1.5" onClick={handleSubmit} disabled={isSubmitting}>
          <Save className="h-4 w-4" />{isSubmitting ? "Menyimpan..." : quantity > 1 ? `Generate ${quantity} Aset` : "Simpan Aset"}
        </Button>
      </div>
    </div>
  );
}
