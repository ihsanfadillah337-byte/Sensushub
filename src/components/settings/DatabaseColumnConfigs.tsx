import { useState, useCallback, useEffect } from "react";
import { Plus, Trash2, Columns3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type AssetColumnConfig = {
  id: string;
  kategori_kib: string;
  column_name: string;
  column_type: string;
  created_at: string;
};

const KIB_OPTIONS = ["KIB A", "KIB B", "KIB C", "KIB D", "KIB E", "KIB F"];
const TYPE_OPTIONS = [
  { value: "Teks Bebas", label: "Teks Bebas" },
  { value: "Dropdown Opsi", label: "Dropdown Opsi" }
];

const kibBadgeColors: Record<string, string> = {
  "KIB A": "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  "KIB B": "bg-blue-500/15 text-blue-600 border-blue-500/30",
  "KIB C": "bg-amber-500/15 text-amber-600 border-amber-500/30",
  "KIB D": "bg-purple-500/15 text-purple-600 border-purple-500/30",
  "KIB E": "bg-rose-500/15 text-rose-600 border-rose-500/30",
  "KIB F": "bg-slate-500/15 text-slate-600 border-slate-500/30",
};

export default function DatabaseColumnConfigs() {
  const { companyId } = useAuth();
  const [columnConfigs, setColumnConfigs] = useState<AssetColumnConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formKategori, setFormKategori] = useState("");
  const [formNama, setFormNama] = useState("");
  const [formTipe, setFormTipe] = useState("");

  const fetchConfigs = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("asset_column_configs")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setColumnConfigs(data || []);
    } catch (error: any) {
      toast.error("Gagal mengambil konfigurasi kolom: " + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleAddColumn = async () => {
    if (!companyId) return;
    if (!formKategori) return toast.error("Silakan pilih Kategori KIB");
    if (!formNama.trim()) return toast.error("Silakan isi nama kolom");
    if (!formTipe) return toast.error("Silakan pilih Tipe Data");

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("asset_column_configs")
        .insert({
          company_id: companyId,
          kategori_kib: formKategori,
          column_name: formNama.trim(),
          column_type: formTipe
        });

      if (error) {
        if (error.code === '23505') {
            throw new Error("Kolom dengan nama ini sudah ada di KIB tersebut.");
        }
        throw error;
      }

      toast.success("Kolom baru berhasil ditambahkan!");
      setFormKategori("");
      setFormNama("");
      setFormTipe("");
      fetchConfigs();
    } catch (error: any) {
      toast.error("Gagal menambahkan: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteColumn = async (id: string, name: string) => {
    if (!window.confirm(`Hapus kolom "${name}" dari konfigurasi?`)) return;
    
    try {
      const { error } = await supabase
        .from("asset_column_configs")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Kolom berhasil dihapus.");
      fetchConfigs();
    } catch (error: any) {
      toast.error("Gagal menghapus: " + error.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Columns3 className="h-5 w-5 text-primary" />
            <CardTitle>Master Kolom KIB (Database)</CardTitle>
          </div>
          <CardDescription>Tambah konfigurasi kolom dinamis yang tersimpan langsung di server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-muted/40 p-4 rounded-lg border border-border">
            <div className="space-y-2">
              <Label>Kategori KIB</Label>
              <Select value={formKategori} onValueChange={setFormKategori}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih KIB" />
                </SelectTrigger>
                <SelectContent>
                  {KIB_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 max-w-sm">
              <Label>Nama Kolom</Label>
              <Input placeholder="Cth: Luas Tanah" value={formNama} onChange={(e) => setFormNama(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tipe Data</Label>
              <Select value={formTipe} onValueChange={setFormTipe}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Tipe" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddColumn} disabled={isSubmitting} className="w-full">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Tambah Kolom
            </Button>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Daftar Kolom Aktif</Label>
            {isLoading ? (
               <div className="flex items-center gap-2 text-muted-foreground justify-center py-6">
                 <Loader2 className="h-5 w-5 animate-spin" /> Memuat data...
               </div>
            ) : columnConfigs.length > 0 ? (
               <div className="divide-y divide-border rounded-md border border-border">
                  {columnConfigs.map(col => (
                    <div key={col.id} className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={kibBadgeColors[col.kategori_kib] || "bg-muted text-muted-foreground"}>
                          {col.kategori_kib}
                        </Badge>
                        <span className="font-medium text-sm">{col.column_name}</span>
                        <span className="text-xs text-muted-foreground uppercase px-2 py-0.5 rounded-sm bg-accent/50">
                          {col.column_type}
                        </span>
                      </div>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => handleDeleteColumn(col.id, col.column_name)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
               </div>
            ) : (
               <div className="text-center py-8 bg-muted/20 border border-dashed border-border rounded-md">
                 <p className="text-sm text-muted-foreground">Belum ada kolom form yang dikonfigurasi.</p>
               </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
