import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getKondisi, getKondisiStyle } from "@/lib/kondisi";
import { getSmartLocation } from "@/lib/smartLocation";
import {
  ClipboardCheck, ArrowLeft, MapPin, Tag, Building2, Camera,
  Loader2, PackageX, CheckCircle2, MapPinned, AlertTriangle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

/** Compress an image File to a JPEG data-URL with max dimension and quality */
function formatTanggal(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}
function compressImage(file: File, maxDim = 1280, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

export default function CensusAuditForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Form state
  const [kondisi, setKondisi] = useState("");
  const [tindakLanjut, setTindakLanjut] = useState("");
  const [catatan, setCatatan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [revisionMode, setRevisionMode] = useState(false);

  // Photo state (native camera capture)
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // GPS state
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

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

  // Auto-request GPS on mount
  useEffect(() => {
    requestGPS();
  }, []);

  const requestGPS = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation tidak didukung browser ini.");
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.message === "User denied Geolocation" ? "Izin lokasi ditolak." : "Gagal mendapatkan lokasi.");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Native camera capture handler
  const handleNativeCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be re-selected
    e.target.value = "";

    if (capturedPhotos.length >= 3) {
      toast.error("Maksimal 3 foto.");
      return;
    }

    try {
      const compressed = await compressImage(file, 1280, 0.7);
      setCapturedPhotos((prev) => [...prev, compressed]);
      toast.success(`Foto ${capturedPhotos.length + 1} berhasil ditambahkan!`);
    } catch {
      toast.error("Gagal memproses foto. Coba lagi.");
    }
  };

  const removePhoto = (index: number) => {
    setCapturedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit audit to asset_audits table + sync master
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
      // 1. Insert into asset_audits (history table)
      const { error: insertError } = await supabase.from("asset_audits").insert({
        asset_id: asset!.id,
        auditor_id: user?.id || null,
        kondisi,
        tindak_lanjut: tindakLanjut,
        catatan: catatan || null,
        foto_url: capturedPhotos.length > 0 ? capturedPhotos[0] : null,
        latitude: gpsCoords?.lat || null,
        longitude: gpsCoords?.lng || null,
      });

      if (insertError) throw insertError;

      // 2. Sync master asset status — update Kondisi in assets.custom_data
      const currentCd = (typeof asset!.custom_data === "object" && asset!.custom_data && !Array.isArray(asset!.custom_data))
        ? { ...(asset!.custom_data as Record<string, unknown>) }
        : {};
      currentCd["Kondisi"] = kondisi;
      currentCd["Tindak Lanjut Sensus"] = tindakLanjut;
      currentCd["Terakhir Diaudit"] = new Date().toISOString().split("T")[0];
      currentCd["Auditor"] = user?.email || "Unknown";

      await supabase
        .from("assets")
        .update({ custom_data: currentCd as any })
        .eq("id", asset!.id);

      // 3. Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["census-assets"] });
      queryClient.invalidateQueries({ queryKey: ["census-audit-asset", id] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });

      setSubmitted(true);
      toast.success("Audit berhasil disimpan!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Gagal menyimpan hasil audit.");
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
          Kondisi aset <strong>{asset.nama_aset}</strong> tercatat sebagai <Badge className="ml-1">{kondisi}</Badge>
        </p>
        {gpsCoords && (
          <p className="text-xs text-muted-foreground mt-2">
            📍 Lokasi: {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}
          </p>
        )}
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
            setCapturedPhotos([]);
            setGpsCoords(null);
            requestGPS();
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

  // Get audit info for revision guard
  const tglAudit = cd?.["Terakhir Diaudit"] as string | undefined;
  const hasBeenAudited = !!tglAudit;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Revision Guard Alert Dialog */}
      <AlertDialog open={hasBeenAudited && !revisionMode}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Aset Sudah Diaudit
            </AlertDialogTitle>
            <AlertDialogDescription>
              Aset ini sudah diaudit pada <strong>{formatTanggal(tglAudit || null)}</strong>. Apakah Anda ingin merevisi hasil audit sebelumnya?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => navigate("/dashboard/census")}>Kembali</AlertDialogCancel>
            <AlertDialogAction onClick={() => setRevisionMode(true)} className="bg-primary text-primary-foreground">
              Revisi Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden native camera input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleNativeCameraCapture}
      />

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

      {/* Revision Mode Banner */}
      {revisionMode && (
        <div className="bg-warning/10 border border-warning/20 text-warning px-4 py-3 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Mode Revisi Aktif</p>
            <p className="text-xs mt-0.5 text-warning/90">Anda sedang mengubah data audit sebelumnya ({formatTanggal(tglAudit || null)}). Pastikan pembaruan data sudah sesuai.</p>
          </div>
        </div>
      )}

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

      {/* GPS Status */}
      <Card className="border-border/60">
        <CardContent className="p-4 flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${gpsCoords ? 'bg-chart-3/10' : gpsError ? 'bg-destructive/10' : 'bg-warning/10'}`}>
            <MapPinned className={`h-4.5 w-4.5 ${gpsCoords ? 'text-chart-3' : gpsError ? 'text-destructive' : 'text-warning'}`} />
          </div>
          <div className="flex-1 min-w-0">
            {gpsLoading && <p className="text-sm text-muted-foreground">Meminta akses lokasi GPS…</p>}
            {gpsCoords && (
              <p className="text-sm text-foreground font-medium truncate">
                📍 {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}
              </p>
            )}
            {gpsError && <p className="text-sm text-destructive">{gpsError}</p>}
            {!gpsLoading && !gpsCoords && !gpsError && <p className="text-sm text-muted-foreground">GPS belum aktif</p>}
          </div>
          {(gpsError || (!gpsLoading && !gpsCoords)) && (
            <Button size="sm" variant="outline" onClick={requestGPS}>Coba Lagi</Button>
          )}
        </CardContent>
      </Card>

      {/* Audit Form */}
      <Card className="border-border/60">
        <div className="bg-primary/5 border-b border-primary/10 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Data Audit Lapangan</p>
        </div>
        <CardContent className="p-5 space-y-5">
          {/* Kondisi */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Kondisi Terkini <span className="text-destructive">*</span>
            </Label>
            <Select value={kondisi} onValueChange={setKondisi}>
              <SelectTrigger><SelectValue placeholder="Pilih kondisi aset…" /></SelectTrigger>
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
              <SelectTrigger><SelectValue placeholder="Pilih rekomendasi…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pertahankan">Pertahankan (Layak Pakai)</SelectItem>
                <SelectItem value="Perbaikan">Perlu Perbaikan</SelectItem>
                <SelectItem value="Mutasi">Mutasi / Relokasi</SelectItem>
                <SelectItem value="Usul Hapus">Usul Hapus / Disposal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Catatan */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Catatan Auditor</Label>
            <Textarea
              placeholder="Tulis catatan temuan di lapangan…"
              rows={3}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>

          {/* Photo Capture Area — Native Camera */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Foto Bukti Audit (maks. 3)</Label>
            <div className="grid grid-cols-3 gap-3">
              {capturedPhotos.map((src, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted group">
                  <img src={src} alt={`Foto ${idx + 1}`} className="object-cover w-full h-full" />
                  <button
                    type="button"
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removePhoto(idx)}
                  >
                    ✕
                  </button>
                  <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                    #{idx + 1}
                  </span>
                </div>
              ))}

              {/* Native camera trigger button */}
              {capturedPhotos.length < 3 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 hover:bg-muted/60 flex flex-col items-center justify-center cursor-pointer transition-colors active:scale-95"
                >
                  <Camera className="h-6 w-6 text-muted-foreground mb-1" />
                  <span className="text-[10px] text-muted-foreground font-medium">Buka Kamera</span>
                </button>
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
