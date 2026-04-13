import { useParams } from "react-router-dom";
import { useState } from "react";
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
  ImageIcon, MapPin, Building2, Tag, AlertTriangle, SearchX,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getKondisi, getKondisiStyle } from "@/lib/kondisi";
import { getSmartLocation } from "@/lib/smartLocation";

export default function ScanAsset() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState({ judul: "", deskripsi: "", nama_pelapor: "", kontak_pelapor: "" });
  const [submitting, setSubmitting] = useState(false);

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
        <div className="text-center space-y-3 px-4">
          <SearchX className="h-16 w-16 mx-auto text-muted-foreground/40" />
          <h1 className="text-xl font-bold text-foreground">Aset Tidak Ditemukan</h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            ID aset yang Anda scan tidak terdaftar dalam sistem. Pastikan QR Code valid.
          </p>
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

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 py-6 space-y-5">
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
                <dl className="space-y-2 text-sm">
                  {customEntries.map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <div className="h-16" />
      </div>

      {/* FAB */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
        <div className="mx-auto max-w-md">
          <Button size="lg" variant="destructive" className="w-full gap-2 shadow-lg" onClick={() => setReportOpen(true)}>
            <AlertTriangle className="h-4 w-4" />
            Lapor Kendala
          </Button>
        </div>
      </div>

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
