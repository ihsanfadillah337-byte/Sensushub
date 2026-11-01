import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Archive, Eye, FileText, Loader2, Package, ExternalLink,
  CheckCircle2, XCircle, AlertTriangle, Users, Download
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Database } from "@/integrations/supabase/types";

type DocumentArchiveRow = Database["public"]["Tables"]["document_archives"]["Row"];

interface OtorisasiAset {
  asset_id?: string;
  id?: string;
  kode_aset?: string;
  nama_aset?: string;
  nama_barang?: string;
  kode_barang?: string;
  rekon_rekomendasi?: string;
  rekomendasi?: string;
  Kondisi?: string;
  kondisi?: string;
  nilai_perolehan?: number;
  "Nilai Perolehan"?: number;
  "Nilai Aset"?: number;
  harga?: number;
  assetData?: {
    nama_barang?: string;
    nama_aset?: string;
    kode_aset?: string;
    kib?: string;
    nilai_perolehan?: number;
    Kondisi?: string;
    "Nilai Aset"?: number;
    "Nilai Perolehan"?: number;
  };
}

function safeNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isFinite(val) ? val : 0;
  const s = String(val).trim();
  if (!s) return 0;
  const cleaned = s.split(",")[0].replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

function flattenOtorisasiArray(doc: DocumentArchiveRow): OtorisasiAset[] {
  const list: OtorisasiAset[] = [];
  try {
    if (Array.isArray(doc.data_otorisasi)) {
      list.push(...(doc.data_otorisasi as OtorisasiAset[]));
    } else if (typeof doc.data_otorisasi === "object" && doc.data_otorisasi !== null) {
      const obj = doc.data_otorisasi as any;
      if (Array.isArray(obj.aset_detail)) list.push(...(obj.aset_detail as OtorisasiAset[]));
      if (Array.isArray(obj.assets)) list.push(...(obj.assets as OtorisasiAset[]));
    }
  } catch {}
  return list;
}

function getNamaAset(item: OtorisasiAset): string {
  return (
    item.nama_barang ||
    item.nama_aset ||
    item.assetData?.nama_barang ||
    item.assetData?.nama_aset ||
    "Nama tidak tersedia"
  );
}

function getNilaiPerolehan(item: OtorisasiAset): number {
  return (
    safeNumber(item["Nilai Aset"]) ||
    safeNumber(item["Nilai Perolehan"]) ||
    safeNumber(item.nilai_perolehan) ||
    safeNumber(item.harga) ||
    safeNumber(item.assetData?.nilai_perolehan) ||
    safeNumber(item.assetData?.["Nilai Aset"]) ||
    safeNumber(item.assetData?.["Nilai Perolehan"]) ||
    0
  );
}

function formatTanggal(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function getJumlahAset(doc: DocumentArchiveRow): number {
  if (typeof doc.total_aset === "number" && doc.total_aset > 0) return doc.total_aset;
  try {
    if (Array.isArray(doc.kode_barang_list)) return doc.kode_barang_list.length;
    if (Array.isArray(doc.data_otorisasi)) return (doc.data_otorisasi as any[]).length;
    if (typeof doc.data_otorisasi === "object" && doc.data_otorisasi !== null) {
      const obj = doc.data_otorisasi as any;
      if (Array.isArray(obj.aset_detail)) return obj.aset_detail.length;
      if (Array.isArray(obj.assets)) return obj.assets.length;
    }
  } catch {}
  return 0;
}

function getTotalNilai(doc: DocumentArchiveRow): number {
  if (typeof doc.total_nilai === "number" && doc.total_nilai > 0) return doc.total_nilai;
  const list = flattenOtorisasiArray(doc);
  if (list.length > 0) {
    const sum = list.reduce((acc, it) => acc + getNilaiPerolehan(it), 0);
    if (sum > 0) return sum;
  }
  return 0;
}

function statusMeta(doc: DocumentArchiveRow) {
  const approved = doc.status_approval === "disetujui";
  return approved
    ? { label: doc.status || "Disetujui BKAD", cls: "bg-green-50 text-green-700 border-green-200", Icon: CheckCircle2 }
    : { label: doc.status || "Ditolak BKAD", cls: "bg-red-50 text-red-700 border-red-200", Icon: XCircle };
}

export default function ArsipBKAD() {
  const { companyId, loading } = useAuth();

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentArchiveRow | null>(null);

  const { data: archives = [], isLoading } = useQuery({
    queryKey: ["document-archives-bkad", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_archives")
        .select("*")
        .eq("company_id", companyId!)
        .in("status_approval", ["disetujui", "ditolak"])
        .order("approved_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentArchiveRow[];
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 2,
  });

  const openDetail = (doc: DocumentArchiveRow) => {
    setSelectedDoc(doc);
    setDetailOpen(true);
  };

  const detailAsetList = (() => {
    if (!selectedDoc) return [] as OtorisasiAset[];
    return flattenOtorisasiArray(selectedDoc);
  })();

  const totalDisetujui = archives.filter((a) => a.status_approval === "disetujui").length;
  const totalDitolak = archives.filter((a) => a.status_approval === "ditolak").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Archive className="h-6 w-6 text-blue-700" />
            Arsip BKAD
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Riwayat seluruh pengajuan rekonsiliasi yang telah Anda proses (disetujui maupun ditolak).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className="bg-green-50 text-green-700 border-green-200" variant="outline">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {totalDisetujui} Disetujui
          </Badge>
          <Badge className="bg-red-50 text-red-700 border-red-200" variant="outline">
            <XCircle className="h-3 w-3 mr-1" />
            {totalDitolak} Ditolak
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Lemari Arsip Dokumen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading || isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Memuat arsip dokumen…
            </div>
          ) : archives.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Archive className="h-14 w-14 text-gray-300 mb-3" />
              <p className="font-semibold text-foreground">Arsip Masih Kosong</p>
              <p className="text-sm text-muted-foreground mt-1">
                Belum ada pengajuan yang Anda proses. Arsip akan muncul setelah Anda menyetujui atau menolak pengajuan.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>ID Unik Batch / Nomor Dokumen</TableHead>
                    <TableHead>Tanggal Diproses</TableHead>
                    <TableHead className="text-center">Jumlah Aset</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archives.map((doc) => {
                    const meta = statusMeta(doc);
                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="font-mono text-sm font-semibold text-primary">
                            {doc.nomor_surat}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {doc.jenis_kib ? `KIB: ${doc.jenis_kib} · ` : ""}
                            Nilai: Rp {getTotalNilai(doc).toLocaleString("id-ID")}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatTanggal(doc.approved_at || doc.created_at)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="font-semibold">
                            <Package className="h-3 w-3 mr-1.5" />
                            {getJumlahAset(doc)} aset
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={meta.cls} variant="outline">
                            <meta.Icon className="h-3 w-3 mr-1" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Button size="sm" variant="outline" onClick={() => openDetail(doc)}>
                              <Eye className="h-3.5 w-3.5 mr-1.5" />
                              Detail
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Detail Dialog ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Detail Arsip Dokumen
            </DialogTitle>
            <DialogDescription>
              {selectedDoc && (
                <span>
                  Dokumen <span className="font-mono font-semibold">{selectedDoc.nomor_surat}</span> · {getJumlahAset(selectedDoc)} aset
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {selectedDoc && (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Tanggal Diproses</p>
                    <p className="font-medium">{formatTanggal(selectedDoc.approved_at || selectedDoc.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Jenis KIB</p>
                    <p className="font-medium">{selectedDoc.jenis_kib || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Total Aset</p>
                    <p className="font-medium">{getJumlahAset(selectedDoc)} unit</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Total Nilai</p>
                    <p className="font-medium">Rp {getTotalNilai(selectedDoc).toLocaleString("id-ID")}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Status Keputusan</p>
                    {(() => {
                      const meta = statusMeta(selectedDoc);
                      return (
                        <Badge className={meta.cls} variant="outline">
                          <meta.Icon className="h-3 w-3 mr-1" />
                          {meta.label}
                        </Badge>
                      );
                    })()}
                  </div>
                </div>

                {selectedDoc.status_approval === "ditolak" && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-red-700 flex items-center gap-2 mb-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Catatan Revisi
                    </p>
                    <p className="text-sm text-red-800 whitespace-pre-wrap">
                      {selectedDoc.catatan_bkad || "Tidak ada catatan."}
                    </p>
                  </div>
                )}

                {/* Dokumen fisik & PDF */}
                <div className="rounded-md border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                      <Download className="h-3.5 w-3.5" />
                      Berkas Dokumen
                    </p>
                  </div>
                  <div className="p-4 space-y-2">
                    {[
                      { label: "Scan Surat Pernyataan (ttd basah)", url: selectedDoc.dokumen_url },
                      { label: "PDF Berita Acara", url: selectedDoc.url_berita_acara },
                      { label: "PDF Surat Pernyataan", url: selectedDoc.url_surat_pernyataan },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{item.label}</p>
                          <p className="text-[11px] text-muted-foreground truncate" title={item.url || undefined}>
                            {item.url || "Belum tersedia"}
                          </p>
                        </div>
                        {item.url ? (
                          <Button asChild size="sm" variant="outline" className="shrink-0">
                            <a href={item.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                              Lihat
                            </a>
                          </Button>
                        ) : (
                          <Badge variant="outline" className="shrink-0 text-muted-foreground">—</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tembusan */}
                <div className="rounded-md border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      Tembusan
                    </p>
                  </div>
                  <div className="p-4">
                    {Array.isArray(selectedDoc.tembusan) && selectedDoc.tembusan.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedDoc.tembusan as any[]).map((t, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{String(t)}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">—</p>
                    )}
                  </div>
                </div>

                {/* Daftar Aset */}
                <div className="rounded-md border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                      <Package className="h-3.5 w-3.5" />
                      Daftar Aset Tereklasifikasi
                    </p>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {detailAsetList.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-6 text-center">Data aset tidak tersedia.</p>
                    ) : (
                      <Table>
                        <TableHeader className="bg-gray-50 sticky top-0">
                          <TableRow>
                            <TableHead>Kode Aset</TableHead>
                            <TableHead>Nama Aset</TableHead>
                            <TableHead>Kondisi</TableHead>
                            <TableHead className="text-right">Nilai Perolehan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailAsetList.map((item, i) => {
                            const kodeKey =
                              item.kode_barang || item.kode_aset || item.assetData?.kode_aset ||
                              item.asset_id || item.id || String(i);
                            const kondisi =
                              item.Kondisi || item.kondisi || item.assetData?.Kondisi ||
                              item.rekon_rekomendasi || item.rekomendasi || "—";
                            return (
                              <TableRow key={kodeKey}>
                                <TableCell className="font-mono text-xs">
                                  {item.kode_barang || item.kode_aset || item.assetData?.kode_aset || "—"}
                                </TableCell>
                                <TableCell className="text-xs">{getNamaAset(item)}</TableCell>
                                <TableCell>
                                  <Badge className="text-[11px]" variant="secondary">{kondisi}</Badge>
                                </TableCell>
                                <TableCell className="text-xs text-right font-mono text-muted-foreground">
                                  {getNilaiPerolehan(item) > 0
                                    ? `Rp ${getNilaiPerolehan(item).toLocaleString("id-ID")}`
                                    : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
