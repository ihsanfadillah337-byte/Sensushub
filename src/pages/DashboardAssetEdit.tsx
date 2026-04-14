import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, ImagePlus, Save, Package, X, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useCustomColumns } from "@/contexts/CustomColumnsContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Json } from "@/integrations/supabase/types";
import { getSmartLocation } from "@/lib/smartLocation";
import CascadingDropdown, { getTreeCodeValue, getTreeLabelChain } from "@/components/CascadingDropdown";

const KONDISI_OPTIONS = ["Baik", "Rusak Ringan", "Rusak Berat"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function DashboardAssetEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { getColumnsForKib, masterDivisi, masterKib } = useCustomColumns();
  const { companyId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Classification
  const [selectedDivisi, setSelectedDivisi] = useState("");
  const [selectedKib, setSelectedKib] = useState("");

  // Base fields
  const [namaAset, setNamaAset] = useState("");
  const [kondisi, setKondisi] = useState("");
  const [tanggalPerolehan, setTanggalPerolehan] = useState("");
  const [nilaiAset, setNilaiAset] = useState("");

  // Custom & media
  const [customData, setCustomData] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Derive KIB label and dynamic columns
  const selectedKibItem = masterKib.find((k) => k.code === selectedKib);
  const kibLabel = selectedKibItem?.label || "";
  const customColumns = getColumnsForKib(kibLabel);

  const { data: asset, isLoading } = useQuery({
    queryKey: ["asset", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Pre-fill form when data loads
  useEffect(() => {
    if (!asset) return;
    setNamaAset(asset.nama_aset);
    setImageUrl(asset.image_url ?? null);
    setPreviewUrl(asset.image_url ?? null);

    // Map kode_divisi (label) back to code
    if (asset.kode_divisi) {
      const divItem = masterDivisi.find((d) => d.label === asset.kode_divisi);
      if (divItem) setSelectedDivisi(divItem.code);
    }

    // Map kib (e.g. "02 - Peralatan") back to code
    if (asset.kib) {
      const kibCode = asset.kib.split(" - ")[0]?.trim();
      const kibItem = masterKib.find((k) => k.code === kibCode);
      if (kibItem) setSelectedKib(kibItem.code);
    }

    // Extract base fields from custom_data
    const cd = asset.custom_data as Record<string, Json> | null;
    if (cd && typeof cd === "object" && !Array.isArray(cd)) {
      setKondisi(String(cd["Kondisi"] || "") || "");
      setTanggalPerolehan(String(cd["Tanggal Perolehan"] || "") || "");
      setNilaiAset(cd["Nilai Aset"] !== undefined && cd["Nilai Aset"] !== null ? String(cd["Nilai Aset"]) : "");

      // Map all custom_data values
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(cd)) {
        if (v !== null && v !== undefined) mapped[k] = String(v);
      }
      setCustomData(mapped);
    }
  }, [asset, masterDivisi, masterKib]);

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
      setPreviewUrl(asset?.image_url ?? null);
      setImageUrl(asset?.image_url ?? null);
    } finally {
      setIsUploading(false);
    }
  };

  const removePhoto = () => {
    setImageUrl(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!selectedDivisi && masterDivisi.length > 0) { toast.error("Divisi / Satuan Kerja wajib dipilih."); return; }
    if (!selectedKib && masterKib.length > 0) { toast.error("KIB wajib dipilih."); return; }
    if (!namaAset.trim()) { toast.error("Nama Aset wajib diisi."); return; }
    if (!kondisi) { toast.error("Kondisi wajib dipilih."); return; }

    setIsSubmitting(true);
    try {
      // Build custom_data ONLY from current KIB columns + base fields
      const customDataJson: Record<string, string | number | null> = {};

      for (const col of customColumns) {
        const val = customData[col.name];
        if (val !== undefined && val !== "") {
          if (col.type === "coded_dropdown") {
            if (col.options_tree) {
              const labelStr = getTreeLabelChain(col, val);
              customDataJson[col.name] = labelStr;
            } else {
              const selectedOpt = col.options?.find((o) => o.code === val);
              customDataJson[col.name] = selectedOpt ? selectedOpt.label : val;
            }
          } else {
            customDataJson[col.name] = col.type === "number" ? Number(val) : val;
          }
        }
      }

      // Store base fields in custom_data
      if (kondisi) customDataJson["Kondisi"] = kondisi;
      if (tanggalPerolehan) customDataJson["Tanggal Perolehan"] = tanggalPerolehan;
      if (nilaiAset) customDataJson["Nilai Aset"] = Number(nilaiAset);

      const divisiItem = masterDivisi.find((d) => d.code === selectedDivisi);
      const kibItem = masterKib.find((k) => k.code === selectedKib);
      const kodeDivisiLabel = divisiItem ? divisiItem.label : asset?.kode_divisi || null;
      const kibLabelFull = kibItem ? `${kibItem.code} - ${kibItem.label}` : asset?.kib || null;

      const { error } = await supabase
        .from("assets")
        .update({
          nama_aset: namaAset.trim(),
          kategori: kibItem ? kibItem.label : asset?.kategori || "Lainnya",
          lokasi_ruangan: getSmartLocation(customDataJson as Record<string, unknown>, kodeDivisiLabel),
          custom_data: customDataJson,
          image_url: imageUrl,
          kode_divisi: kodeDivisiLabel,
          kib: kibLabelFull,
        })
        .eq("id", id!);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      await queryClient.invalidateQueries({ queryKey: ["asset", id] });
      toast.success("Aset berhasil diperbarui!");
      navigate("/dashboard/assets");
    } catch (err: any) {
      toast.error(err.message || "Gagal memperbarui aset.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm font-medium">Aset tidak ditemukan.</p>
        <Button variant="link" onClick={() => navigate("/dashboard/assets")}>Kembali</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0" onClick={() => navigate("/dashboard/assets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Edit Aset</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Perbarui informasi aset.</p>
        </div>
      </div>

      {/* Kode Aset (read-only) */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-medium">Kode Aset:</span>
        <span className="font-mono text-sm font-bold text-primary">{asset.kode_aset}</span>
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
                    {masterDivisi.map((d) => (
                      <SelectItem key={d.id} value={d.code}>
                        <span className="font-mono text-muted-foreground mr-2">{d.code}</span>{d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {masterKib.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">KIB <span className="text-destructive">*</span></Label>
                <Select value={selectedKib} onValueChange={(v) => { setSelectedKib(v); setCustomData((prev) => {
                  // Keep base fields, clear KIB-specific custom
                  const kept: Record<string, string> = {};
                  if (prev["Kondisi"]) kept["Kondisi"] = prev["Kondisi"];
                  if (prev["Tanggal Perolehan"]) kept["Tanggal Perolehan"] = prev["Tanggal Perolehan"];
                  if (prev["Nilai Aset"]) kept["Nilai Aset"] = prev["Nilai Aset"];
                  return kept;
                }); }}>
                  <SelectTrigger><SelectValue placeholder="Pilih KIB" /></SelectTrigger>
                  <SelectContent>
                    {masterKib.map((k) => (
                      <SelectItem key={k.id} value={k.code}>
                        <span className="font-mono text-muted-foreground mr-2">{k.code}</span>{k.label}
                      </SelectItem>
                    ))}
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
            <Input value={namaAset} onChange={(e) => setNamaAset(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Kondisi <span className="text-destructive">*</span></Label>
            <Select value={kondisi} onValueChange={setKondisi}>
              <SelectTrigger><SelectValue placeholder="Pilih kondisi" /></SelectTrigger>
              <SelectContent>{KONDISI_OPTIONS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Tanggal Perolehan</Label>
            <Input type="date" value={tanggalPerolehan} onChange={(e) => setTanggalPerolehan(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Nilai Aset / Harga</Label>
            <Input type="number" placeholder="0" value={nilaiAset} onChange={(e) => setNilaiAset(e.target.value)} />
          </div>
        </div>
      </section>

      {/* Dynamic Custom Columns based on KIB */}
      {selectedKib && customColumns.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
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
                  <Select
                    value={customData[col.name] || ""}
                    onValueChange={(v) => setCustomData((p) => ({ ...p, [col.name]: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder={`Pilih ${col.name.toLowerCase()}`} /></SelectTrigger>
                    <SelectContent>
                      {col.options.map((o) => (
                        <SelectItem key={o.code} value={o.code}>
                          <span className="font-mono text-muted-foreground mr-2">{o.code}</span>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
                    value={customData[col.name] || ""}
                    onChange={(e) => setCustomData((p) => ({ ...p, [col.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Media */}
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Upload className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Foto Aset</h2>
        </div>
        <div className="p-5">
          {previewUrl ? (
            <div className="relative rounded-lg border border-border bg-muted/30 p-3 flex items-center gap-4">
              <img src={previewUrl} alt="Preview" className="h-24 w-24 rounded-md object-cover border border-border" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">Foto aset</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={removePhoto} disabled={isUploading}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="relative rounded-lg border-2 border-dashed border-border hover:border-primary/40 transition-colors bg-muted/30 cursor-pointer group">
              <input ref={fileInputRef} type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileUpload} disabled={isUploading} />
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground group-hover:text-foreground/60 transition-colors">
                {isUploading ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-xs font-medium">Mengunggah...</p>
                  </>
                ) : (
                  <>
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center"><ImagePlus className="h-5 w-5" /></div>
                    <p className="text-xs font-medium">Pilih foto baru</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 pb-4">
        <Button variant="outline" onClick={() => navigate("/dashboard/assets")} disabled={isSubmitting}>Batal</Button>
        <Button className="gap-1.5" onClick={handleSubmit} disabled={isSubmitting}>
          <Save className="h-4 w-4" />
          {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
        </Button>
      </div>
    </div>
  );
}
