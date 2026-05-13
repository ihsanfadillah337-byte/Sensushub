import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileSignature, Loader2, Save } from "lucide-react";
import type { TenantSettings } from "@/types/supabase";

export default function LetterheadSettings({ isLocked }: { isLocked: boolean }) {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Partial<TenantSettings>>({
    pemda_name: "",
    dinas_name: "",
    dinas_address: "",
    dinas_contact: "",
    font_size_pemda: 28,
    font_size_dinas: 20,
    font_size_address: 14,
    margin_top: 60,
  });

  useEffect(() => {
    if (!companyId) return;

    const fetchSettings = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("tenant_settings")
          .select("*")
          .eq("company_id", companyId)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setSettings(data);
        }
      } catch (err: any) {
        console.error("Error fetching tenant settings:", err);
        toast.error("Gagal memuat pengaturan Kop Surat.");
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [companyId]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        pemda_name: settings.pemda_name || "NAMA PEMERINTAH DAERAH",
        dinas_name: settings.dinas_name || "NAMA DINAS / INSTANSI",
        dinas_address: settings.dinas_address || "Alamat Lengkap Instansi",
        dinas_contact: settings.dinas_contact || "Kontak Instansi (Email/Telepon)",
        font_size_pemda: settings.font_size_pemda || 28,
        font_size_dinas: settings.font_size_dinas || 20,
        font_size_address: settings.font_size_address || 14,
        margin_top: settings.margin_top || 60,
      };

      const { error } = await supabase
        .from("tenant_settings")
        .upsert(payload, { onConflict: "company_id" });

      if (error) throw error;
      toast.success("Pengaturan Kop Surat berhasil disimpan!");
    } catch (err: any) {
      console.error("Error saving tenant settings:", err);
      toast.error("Gagal menyimpan pengaturan: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <FileSignature className="h-4 w-4 text-primary" />
            Teks Identitas Kop Surat
          </h3>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Nama Pemerintah Daerah</Label>
              <Input 
                value={settings.pemda_name} 
                onChange={e => setSettings({ ...settings, pemda_name: e.target.value })}
                placeholder="Contoh: PEMERINTAH KABUPATEN BANDUNG"
                disabled={isLocked}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Nama Dinas / Instansi</Label>
              <Input 
                value={settings.dinas_name} 
                onChange={e => setSettings({ ...settings, dinas_name: e.target.value })}
                placeholder="Contoh: DINAS PERUMAHAN, KAWASAN PERMUKIMAN..."
                disabled={isLocked}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Alamat Instansi</Label>
              <Input 
                value={settings.dinas_address} 
                onChange={e => setSettings({ ...settings, dinas_address: e.target.value })}
                placeholder="Contoh: Jl. Raya Soreang KM 17..."
                disabled={isLocked}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Kontak (Email & Website)</Label>
              <Input 
                value={settings.dinas_contact} 
                onChange={e => setSettings({ ...settings, dinas_contact: e.target.value })}
                placeholder="Contoh: E-mail: dinas@bandungkab.go.id"
                disabled={isLocked}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Pengaturan Ukuran (Pixel)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Ukuran Font Pemda</Label>
              <Input 
                type="number" 
                value={settings.font_size_pemda || ""} 
                onChange={e => setSettings({ ...settings, font_size_pemda: parseInt(e.target.value) || 0 })}
                disabled={isLocked}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Ukuran Font Dinas</Label>
              <Input 
                type="number" 
                value={settings.font_size_dinas || ""} 
                onChange={e => setSettings({ ...settings, font_size_dinas: parseInt(e.target.value) || 0 })}
                disabled={isLocked}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Ukuran Font Alamat</Label>
              <Input 
                type="number" 
                value={settings.font_size_address || ""} 
                onChange={e => setSettings({ ...settings, font_size_address: parseInt(e.target.value) || 0 })}
                disabled={isLocked}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Margin Atas (Spacing)</Label>
              <Input 
                type="number" 
                value={settings.margin_top || ""} 
                onChange={e => setSettings({ ...settings, margin_top: parseInt(e.target.value) || 0 })}
                disabled={isLocked}
              />
            </div>
          </div>
        </div>
      </div>
      
      {!isLocked && (
        <div className="flex justify-end pt-4 border-t border-border">
          <Button onClick={handleSave} disabled={saving || isLocked} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Pengaturan
          </Button>
        </div>
      )}
    </div>
  );
}
