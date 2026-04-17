import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getKondisi, getKondisiStyle } from "@/lib/kondisi";
import { getSmartLocation } from "@/lib/smartLocation";
import {
  ClipboardCheck, ArrowLeft, MapPin, Tag, Building2, Camera, Upload,
  Loader2, PackageX, CheckCircle2, ImageIcon
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export default function CensusAuditForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, companyId } = useAuth();

  const [kondisi, setKondisi] = useState("");
  const [tindakLanjut, setTindakLanjut] = useState("");
  const [catatan, setCatatan] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Fetch asset data
  const { data: asset, isLoading, error } = useQuery({
    queryKey: ["census-audit-asset", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*, companies(name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Handle photo selection
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files).slice(0, 3 - photos.length); // Max 3 photos
    setPhotos((prev) => [...prev, ...newFiles]);

    // Generate previews
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotoPreview((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreview((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit audit
  const handleSubmit = async () => {
    if (!kondisi) {
      toast.error("Pilih kondisi aset terlebih dahulu.");
      return;
    }
    if (!tindakLanjut) {
      toast.error("Pilih tindak lanjut terlebih dahulu.");
      return;
    }

    setSubmitting(true);
    try {
      // Update asset's custom_data with audit info
      const currentCd = (typeof asset!.custom_data === "object" && asset!.custom_data && !Array.isArray(asset!.custom_data))
        ? { ...(asset!.custom_data as Record<string, Json>) }
        : {};

      currentCd["Kondisi"] = kondisi;
      currentCd["Tindak Lanjut Sensus"] = tindakLanjut;
      currentCd["Catatan Auditor"] = catatan || null;
      currentCd["Terakhir Diaudit"] = new Date().toISOString().split("T")[0];
      currentCd["Auditor"] = user?.email || "Unknown";

      await supabase
        .from("assets")
        .update({ custom_data: currentCd })
        .eq("id", asset!.id);

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["census-assets"] });
      queryClient.invalidateQueries({ queryKey: ["census-audit-asset", id] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });

      setSubmitted(true);
      toast.success("Audit berhasil disimpan!");
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal menyimpan hasil audit.");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  // Asset not found
  if (!asset || error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <PackageX className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-bold text-foreground">Aset Tidak Ditemukan</h2>
        <p className="text-sm text-muted-foreground mt-1">Data aset tidak tersedia atau telah dihapus.</p>
        <Button variant="outline" className="mt-4 gap-1.5" onClick={() => navigate("/dashboard/census")}>
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Sensus
        </Button>
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="h-20 w-20 rounded-2xl bg-chart-3/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-10 w-10 text-chart-3" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Audit Berhasil Disimpan</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Kondisi aset <strong>{asset.nama_aset}</strong> telah diperbarui menjadi <Badge className="ml-1">{kondisi}</Badge>
        </p>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="gap-1.5" onClick={() => navigate("/dashboard/census")}>
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar
          </Button>
          <Button className="gap-1.5" onClick={() => {
            setSubmitted(false);
            setKondisi("");
            setTindakLanjut("");
            setCatatan("");
            setPhotos([]);
            setPhotoPreview([]);
          }}>
            Audit Aset Lain
          </Button>
        </div>
      </div>
    );
  }

  const companyName = (asset as any).companies?.name ?? "—";
  const cd = typeof asset.custom_data === "object" && asset.custom_data && !Array.isArray(asset.custom_data)
    ? (asset.custom_data as Record<string, unknown>) : null;
  const smartLocation = getSmartLocation(cd, asset.kode_divisi);
  const currentKondisi = getKondisi(cd);
  const currentKondisiStyle = getKondisiStyle(currentKondisi);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard/census")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Formulir Audit
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Catat kondisi aktual aset di lapangan</p>
        </div>
      </div>

      {/* Asset Summary Card */}
      <Card className="border-border/60 overflow-hidden">
        <div className="bg-muted/30 border-b border-border/40 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ringkasan Aset</p>
        </div>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <h2 className="text-lg font-bold text-foreground truncate">{asset.nama_aset}</h2>
              <p className="text-sm font-mono text-muted-foreground">{asset.kode_aset}</p>
            </div>
            <Badge className={`${currentKondisiStyle.bg} ${currentKondisiStyle.color} ${currentKondisiStyle.border} shrink-0`}>
              {currentKondisiStyle.label}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Tag className="h-4 w-4 text-primary shrink-0" />
              <span className="text-muted-foreground">KIB:</span>
              <span className="font-medium text-foreground truncate">{asset.kib || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <span className="text-muted-foreground">Lokasi:</span>
              <span className="font-medium text-foreground truncate">{smartLocation}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-primary shrink-0" />
              <span className="text-muted-foreground">Instansi:</span>
              <span className="font-medium text-foreground truncate">{companyName}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Form */}
      <Card className="border-border/60">
        <div className="bg-primary/5 border-b border-primary/10 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Data Audit Lapangan</p>
        </div>
        <CardContent className="p-5 space-y-5">
          {/* Kondisi Terkini */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Kondisi Terkini <span className="text-destructive">*</span>
            </Label>
            <Select value={kondisi} onValueChange={setKondisi}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih kondisi aset…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Baik">✅ Baik</SelectItem>
                <SelectItem value="Rusak Ringan">⚠️ Rusak Ringan</SelectItem>
                <SelectItem value="Rusak Berat">❌ Rusak Berat</SelectItem>
                <SelectItem value="Tidak Ditemukan">🔍 Tidak Ditemukan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tindak Lanjut */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Tindak Lanjut <span className="text-destructive">*</span>
            </Label>
            <Select value={tindakLanjut} onValueChange={setTindakLanjut}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih rekomendasi tindak lanjut…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pertahankan">Pertahankan (Layak Pakai)</SelectItem>
                <SelectItem value="Perbaikan">Perlu Perbaikan</SelectItem>
                <SelectItem value="Mutasi">Mutasi / Relokasi</SelectItem>
                <SelectItem value="Usul Hapus">Usul Hapus / Disposal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Catatan Auditor */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Catatan Auditor</Label>
            <Textarea
              placeholder="Tulis catatan temuan di lapangan…"
              rows={3}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>

          {/* Photo Upload Area */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Foto Bukti Audit (maks. 3)</Label>
            <div className="grid grid-cols-3 gap-3">
              {photoPreview.map((src, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted group">
                  <img src={src} alt={`Foto ${idx + 1}`} className="object-cover w-full h-full" />
                  <button
                    type="button"
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removePhoto(idx)}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {photos.length < 3 && (
                <label className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 hover:bg-muted/60 flex flex-col items-center justify-center cursor-pointer transition-colors">
                  <Camera className="h-6 w-6 text-muted-foreground mb-1" />
                  <span className="text-[10px] text-muted-foreground">Tambah Foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Submit */}
          <Button
            className="w-full gap-2 mt-2"
            size="lg"
            disabled={submitting || !kondisi || !tindakLanjut}
            onClick={handleSubmit}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ClipboardCheck className="h-4 w-4" />
            )}
            {submitting ? "Menyimpan…" : "Simpan Hasil Audit"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
