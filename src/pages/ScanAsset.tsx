import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ImageIcon, MapPin, Building2, Tag, AlertTriangle, PackageX, ShieldAlert, ChevronRight,
  ClipboardCheck, Eye
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getKondisi, getKondisiStyle } from "@/lib/kondisi";
import { getSmartLocation } from "@/lib/smartLocation";
import type { AppRole } from "@/types/supabase";

export default function ScanAsset() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState({ judul: "", deskripsi: "", nama_pelapor: "", kontak_pelapor: "" });
  const [submitting, setSubmitting] = useState(false);

  // Dual-Scan: Check if current visitor is an authenticated auditor/admin
  const [auditorRole, setAuditorRole] = useState<AppRole | null>(null);
  const [auditorCompanyId, setAuditorCompanyId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("role, company_id")
          .eq("id", session.user.id)
          .maybeSingle();
        if (profile?.role === "auditor" || profile?.role === "super_admin") {
          setAuditorRole(profile.role as AppRole);
          setAuditorCompanyId(profile.company_id);
        }
      } catch { /* silent — public page */ }
    })();
  }, []);

  const { data: asset, isLoading, error } = useQuery({
    queryKey: ["asset", id],
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

  // Check if census is active for the asset's company (must be after asset query)
  const { data: sensusActive } = useQuery({
    queryKey: ["sensus-active-scan", asset?.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("sensus_active")
        .eq("id", asset!.company_id)
        .maybeSingle();
      return data?.sensus_active ?? false;
    },
    enabled: !!asset?.company_id && !!auditorRole,
  });

  // Check if there are open tickets for this asset
  const { data: openTickets } = useQuery({
    queryKey: ["asset-open-tickets", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_reports")
        .select("id, status")
        .eq("asset_id", id!)
        .in("status", ["Menunggu", "Diproses"]);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const handleSubmitReport = async () => {
    if (!reportForm.judul.trim()) {
      toast.error("Judul kendala wajib diisi.");
      return;
    }
    if (!reportForm.nama_pelapor.trim()) {
      toast.error("Nama pelapor wajib diisi.");
      return;
    }
    if (!reportForm.kontak_pelapor.trim()) {
      toast.error("Nomor WhatsApp / Kontak wajib diisi.");
      return;
    }
    setSubmitting(true);
    try {
      // Insert report
      const { error } = await supabase.from("asset_reports").insert({
        asset_id: asset!.id,
        company_id: asset!.company_id,
        judul: reportForm.judul.trim(),
        deskripsi: reportForm.deskripsi.trim() || null,
        nama_pelapor: reportForm.nama_pelapor.trim(),
        kontak_pelapor: reportForm.kontak_pelapor.trim(),
      });
      if (error) throw error;

      // Auto-update asset status to "Dalam Perbaikan"
      const currentCd = (typeof asset!.custom_data === "object" && asset!.custom_data && !Array.isArray(asset!.custom_data))
        ? { ...(asset!.custom_data as Record<string, Json>) }
        : {};
      currentCd["Kondisi"] = "Dalam Perbaikan";
      await supabase.from("assets").update({ custom_data: currentCd }).eq("id", asset!.id);

      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      queryClient.invalidateQueries({ queryKey: ["asset-open-tickets", id] });

      setReportOpen(false);
      setReportForm({ judul: "", deskripsi: "", nama_pelapor: "", kontak_pelapor: "" });
      toast.success("Laporan kendala berhasil dikirim!");
    } catch (err: any) {
      console.error(err);
      toast.error("Gagal mengirim laporan. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  // Parse custom_data safely
  const customEntries: [string, string][] = [];
  if (asset?.custom_data && typeof asset.custom_data === "object" && !Array.isArray(asset.custom_data)) {
    for (const [key, value] of Object.entries(asset.custom_data as Record<string, Json>)) {
      if (value !== null && value !== undefined && value !== "") {
        customEntries.push([key, String(value)]);
      }
    }
  }

  // Determine dynamic status badge
  const getDynamicStatus = () => {
    const cd = asset?.custom_data as Record<string, unknown> | null;
    const kondisi = getKondisi(cd);

    // If marked as deleted
    if (kondisi === "Dihapuskan" || kondisi === "Usul Hapus") {
      return getKondisiStyle(kondisi);
    }

    // If there are open tickets
    if (openTickets && openTickets.length > 0) {
      return getKondisiStyle("Dalam Perbaikan");
    }

    // Otherwise use actual kondisi
    return getKondisiStyle(kondisi);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-md px-4 py-6 space-y-5">
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </div>
      </div>
    );
  }

  if (!asset || error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-5 px-6 max-w-sm mx-auto">
          <div className="mx-auto h-20 w-20 rounded-2xl bg-muted flex items-center justify-center">
            <PackageX className="h-10 w-10 text-muted-foreground/60" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">Aset Tidak Ditemukan</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Data aset ini tidak ada dalam sistem. Aset mungkin telah ditarik, dihapuskan secara resmi dari inventaris, atau diregistrasi ulang dengan kode baru.
            </p>
          </div>
          <div className="pt-2 space-y-2">
            <Button variant="outline" className="w-full gap-2" onClick={() => window.history.back()}>
              ← Kembali
            </Button>
            <p className="text-xs text-muted-foreground">
              Jika Anda yakin aset ini masih aktif, silakan hubungi admin pengelola inventaris.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const companyName = (asset as any).companies?.name ?? "—";
  const smartLocation = getSmartLocation(
    typeof asset.custom_data === "object" && asset.custom_data && !Array.isArray(asset.custom_data)
      ? (asset.custom_data as Record<string, unknown>)
      : null,
    asset.kode_divisi
  );
  const statusStyle = getDynamicStatus();

  // Determine if asset is pending deletion
  const assetCd = typeof asset.custom_data === "object" && asset.custom_data && !Array.isArray(asset.custom_data)
    ? (asset.custom_data as Record<string, unknown>)
    : null;
  const statusAset = assetCd?.["status_aset"] ? String(assetCd["status_aset"]) : "";
  const isUsulHapus = statusAset === "Usul Hapus" || statusAset === "Dihapuskan";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 py-6 space-y-5">

        {/* Usul Hapus Warning Banner */}
        {isUsulHapus && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">Aset Dalam Proses Penghapusan</p>
              <p className="text-xs text-destructive/80 mt-0.5">
                Aset ini telah diusulkan untuk dihapuskan dari inventaris. Pelaporan kendala tidak tersedia.
              </p>
            </div>
          </div>
        )}
        {/* Hero / Photo placeholder */}
        <div className="relative aspect-[4/3] w-full rounded-xl bg-muted flex items-center justify-center overflow-hidden">
          {asset.image_url ? (
            <img src={asset.image_url} alt={asset.nama_aset} className="object-cover w-full h-full" />
          ) : (
            <>
              <ImageIcon className="h-16 w-16 text-muted-foreground/40" />
              <span className="absolute bottom-2 right-2 text-xs text-muted-foreground">Foto Aset</span>
            </>
          )}
        </div>

        {/* Identity */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">{asset.nama_aset}</h1>
          <p className="text-sm font-mono text-muted-foreground">{asset.kode_aset}</p>
          <Badge className={`${statusStyle.bg} ${statusStyle.color} ${statusStyle.border} hover:opacity-90`}>
            {statusStyle.label}
          </Badge>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-border">
            <CardContent className="flex items-start gap-2 p-3">
              <Tag className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground leading-none mb-0.5">Kategori</p>
                <p className="text-sm font-medium text-foreground">{asset.kategori}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="flex items-start gap-2 p-3">
              <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground leading-none mb-0.5">Lokasi</p>
                <p className="text-sm font-medium text-foreground">{smartLocation}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-2 border-border">
            <CardContent className="flex items-start gap-2 p-3">
              <Building2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground leading-none mb-0.5">Perusahaan</p>
                <p className="text-sm font-medium text-foreground">{companyName}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Custom data accordion */}
        {customEntries.length > 0 && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="detail" className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm font-medium text-foreground">
                Detail Tambahan
              </AccordionTrigger>
              <AccordionContent>
                <dl className="space-y-3 text-sm">
                  {customEntries.map(([label, value]) => {
                    const isBreadcrumb = value.includes(" > ");
                    return (
                      <div key={label} className={`flex ${isBreadcrumb ? 'flex-col gap-1.5' : 'justify-between items-start gap-4'}`}>
                        <dt className="text-muted-foreground shrink-0">{label}</dt>
                        <dd className={`font-medium text-foreground break-words w-full sm:w-auto ${isBreadcrumb ? 'text-left' : 'text-right'}`}>
                          {isBreadcrumb ? (
                            <div className="flex flex-wrap gap-1 mt-0.5 justify-start">
                              {value.split(" > ").map((part, idx, arr) => (
                                <div key={idx} className="flex items-center">
                                  <span className="bg-muted/60 text-muted-foreground px-2 py-1 rounded-md text-xs font-medium">
                                    {part.trim()}
                                  </span>
                                  {idx < arr.length - 1 && (
                                    <ChevronRight className="h-3 w-3 text-muted-foreground/50 mx-0.5 shrink-0" />
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="whitespace-pre-wrap">{value}</span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <div className="h-16" />
      </div>

      {/* Dual-Scan: Auditor Banner */}
      {auditorRole && sensusActive && (
        <div className="fixed bottom-16 inset-x-0 px-4 z-20">
          <div className="mx-auto max-w-md">
            <button
              onClick={() => navigate(`/dashboard/census/audit/${asset.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity"
            >
              <div className="h-10 w-10 rounded-lg bg-primary-foreground/15 flex items-center justify-center shrink-0">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold">Masuk Mode Audit Sensus</p>
                <p className="text-xs opacity-80">Anda terdeteksi sebagai {auditorRole === 'super_admin' ? 'Admin' : 'Auditor'}</p>
              </div>
              <ChevronRight className="h-5 w-5 opacity-60" />
            </button>
          </div>
        </div>
      )}

      {/* Dual-Scan: Read-Only mode when census is inactive */}
      {auditorRole && sensusActive === false && (
        <div className="fixed bottom-16 inset-x-0 px-4 z-20">
          <div className="mx-auto max-w-md">
            <div className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-muted border border-border shadow-lg">
              <div className="h-10 w-10 rounded-lg bg-warning/15 flex items-center justify-center shrink-0">
                <Eye className="h-5 w-5 text-warning" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold text-foreground">Mode Hanya-Baca</p>
                <p className="text-xs text-muted-foreground">Periode Sensus sedang tidak aktif.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FAB — hidden if asset is pending deletion */}
      {!isUsulHapus && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
          <div className="mx-auto max-w-md">
            <Button size="lg" variant="destructive" className="w-full gap-2 shadow-lg" onClick={() => setReportOpen(true)}>
              <AlertTriangle className="h-4 w-4" />
              Lapor Kendala
            </Button>
          </div>
        </div>
      )}

      {/* Report dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader><DialogTitle>Lapor Kendala Aset</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nama_pelapor">Nama Pelapor <span className="text-destructive">*</span></Label>
              <Input id="nama_pelapor" placeholder="Nama lengkap Anda" value={reportForm.nama_pelapor} onChange={(e) => setReportForm((p) => ({ ...p, nama_pelapor: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kontak_pelapor">No. WhatsApp / Kontak <span className="text-destructive">*</span></Label>
              <Input id="kontak_pelapor" placeholder="08xxxxxxxxxx" value={reportForm.kontak_pelapor} onChange={(e) => setReportForm((p) => ({ ...p, kontak_pelapor: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="judul">Judul Kendala <span className="text-destructive">*</span></Label>
              <Input id="judul" placeholder="Contoh: Layar retak" value={reportForm.judul} onChange={(e) => setReportForm((p) => ({ ...p, judul: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deskripsi">Deskripsi</Label>
              <Textarea id="deskripsi" placeholder="Jelaskan detail kendala…" rows={4} value={reportForm.deskripsi} onChange={(e) => setReportForm((p) => ({ ...p, deskripsi: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)} disabled={submitting}>Batal</Button>
            <Button onClick={handleSubmitReport} disabled={submitting}>{submitting ? "Mengirim…" : "Kirim Laporan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
