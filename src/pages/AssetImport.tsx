import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCustomColumns } from "@/contexts/CustomColumnsContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, Download, UploadCloud, Info } from "lucide-react";

const STANDARD_HEADERS = [
  "Nama Aset",
  "Kode Aset",
  "No. Register",
  "Kondisi",
  "Tanggal Perolehan",
  "Nilai Aset / Harga"
];

const STANDARD_INSTRUCTIONS = [
  "Wajib (Teks)",
  "Wajib (Sesuai Format)",
  "Wajib (Angka/Teks)",
  "Wajib Pilih: Baik / Rusak Ringan / Rusak Berat",
  "Opsional (YYYY-MM-DD)",
  "Opsional (Angka)"
];

export default function AssetImport() {
  const { companyId } = useAuth();
  const { masterKib } = useCustomColumns();
  const [selectedKib, setSelectedKib] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  const generateTemplate = async () => {
    if (!companyId) return toast.error("Autentikasi gagal. Company ID tidak ditemukan.");
    if (!selectedKib) return toast.error("Silakan pilih Kategori KIB terlebih dahulu.");

    setIsGenerating(true);
    try {
      // 1. Fetch Dynamic Custom Columns for the selected KIB
      const { data: colsData, error } = await supabase
        .from("asset_column_configs")
        .select("column_name, column_type, options")
        .eq("company_id", companyId)
        .eq("kategori_kib", selectedKib)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      // 2. Build Headers and Instructions Rows
      const dynamicHeaders = (colsData || []).map(col => col.column_name);
      const dynamicInstructions = (colsData || []).map(col => {
        if (col.column_type === "coded_dropdown") {
          const opts = col.options as any;
          if (opts?.options_tree) return "Isi Kode Terakhir (Tree)";
          if (opts?.options) {
             const labels = opts.options.map((o: any) => o.label).join(" / ");
             return `Sesuai Opsi Berikut: ${labels}`;
          }
          return "Pilih dari Opsi Dropdown";
        }
        if (col.column_type === "number") return "Opsional (Angka)";
        if (col.column_type === "date") return "Opsional (YYYY-MM-DD)";
        return "Opsional (Teks Bebas)";
      });

      const fullHeaders = [...STANDARD_HEADERS, ...dynamicHeaders];
      const fullInstructions = [...STANDARD_INSTRUCTIONS, ...dynamicInstructions];
      const exampleRow = fullHeaders.map(() => "");

      const rows = [fullHeaders, fullInstructions, exampleRow];

      // 3. Import XLSX and create workbook
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Simple AutoWidth based on headers
      ws["!cols"] = fullHeaders.map(h => ({ wch: Math.min(Math.max(h.length + 5, 20), 50) }));

      XLSX.utils.book_append_sheet(wb, ws, "Template Import");

      // 4. Download
      const formattedKib = selectedKib.replace(/\s+/g, '_');
      const filename = `Template_Import_${formattedKib}_SensusHub.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success("Template Excel berhasil diunduh.");
    } catch (e: any) {
      toast.error("Gagal men-generate template: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Import Data Aset</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gunakan fitur impor ini untuk meregistrasi aset secara massal menggunakan file Excel (.xlsx).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <CardTitle>Langkah 1: Unduh Template</CardTitle>
            </div>
            <CardDescription>
              Setiap KIB memiliki struktur kolom yang unik. Unduh template sesuai dengan kategori yang ingin di-import.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Pilih Kategori KIB</label>
              <Select value={selectedKib} onValueChange={setSelectedKib}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori KIB..." />
                </SelectTrigger>
                <SelectContent>
                  {masterKib.length > 0 ? (
                    masterKib.map((kib) => (
                      <SelectItem key={kib.id} value={kib.label}>
                        {kib.label}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>Belum ada master KIB</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md bg-blue-500/10 p-3 flex gap-2.5 items-start text-sm text-blue-700 dark:text-blue-400">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <p>Template mengandung struktur Header spesifik. Mohon ikuti Petunjuk Pengisian di baris ke-2 file Excel.</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={generateTemplate} disabled={!selectedKib || isGenerating} className="w-full">
              {isGenerating ? "Menyiapkan File..." : "Download Template Excel"}
              <Download className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
        
        <Card className="border-border border-dashed bg-muted/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-muted-foreground">Langkah 2: Unggah File (Akan Datang)</CardTitle>
            </div>
            <CardDescription>
              Fungsionalitas import massal berdasar file template sedang dalam tahap pengembangan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-border rounded-lg bg-card text-muted-foreground">
               <UploadCloud className="h-10 w-10 mb-4 opacity-50" />
               <p className="font-medium">Area Unggah (Drag & Drop)</p>
               <p className="text-xs mt-1 opacity-70">*.xlsx, *.xls maksimal 5MB</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
