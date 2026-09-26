import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck, Eye, CheckCircle2, XCircle, FileText, Clock,
  Package, Users, AlertTriangle, Loader2
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useEffect } from "react";
import { Database } from "@/integrations/supabase/types";

type DocumentArchiveRow = Database["public"]["Tables"]["document_archives"]["Row"];

interface OtorisasiAset {
  asset_id?: string;
  id?: string;
  kode_aset?: string;
  nama_aset?: string;
  kode_barang?: string;
  rekon_rekomendasi?: string;
  Kondisi?: string;
}

function formatTanggal(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function getJumlahAset(doc: DocumentArchiveRow): number {
  if (typeof doc.total_aset === "number" && doc.total_aset > 0) return doc.total_aset;
  try {
    if (Array.isArray(doc.kode_barang_list)) return doc.kode_barang_list.length;
    if (Array.isArray(doc.data_otorisasi)) return (doc.data_otorisasi as any[]).length;
    if (typeof doc.data_otorisasi === "object" && doc.data_otorisasi !== null && Array.isArray((doc.data_otorisasi as any)?.assets)) {
      return (doc.data_otorisasi as any).assets.length;
    }
  } catch {}
  return 0;
}

function extractAssetIdsAndRekomendasi(doc: DocumentArchiveRow): Array<{ asset_id: string; rekomendasi: string }> {
  const results: Array<{ asset_id: string; rekomendasi: string }> = [];
  const seen = new Set<string>();

  // Source 1: data_otorisasi (paling lengkap)
  try {
    if (Array.isArray(doc.data_otorisasi)) {
      (doc.data_otorisasi as OtorisasiAset[]).forEach((item) => {
        const id = item.asset_id || item.id || "";
        if (id && !seen.has(id)) {
          seen.add(id);
          results.push({ asset_id: id, rekomendasi: item.rekon_rekomendasi || "" });
        }
      });
    } else if (typeof doc.data_otorisasi === "object" && doc.data_otorisasi !== null) {
      const obj = doc.data_otorisasi as any;
      if (Array.isArray(obj.assets)) {
        (obj.assets as OtorisasiAset[]).forEach((item) => {
          const id = item.asset_id || item.id || "";
          if (id && !seen.has(id)) {
            seen.add(id);
            results.push({ asset_id: id, rekomendasi: item.rekon_rekomendasi || "" });
          }
        });
      }
    }
  } catch {}

  // Source 2: kode_barang_list (juga bisa berisi asset_id)
  try {
    if (Array.isArray(doc.kode_barang_list)) {
      (doc.kode_barang_list as any[]).forEach((item) => {
        const id = typeof item === "string" ? item : (item.asset_id || item.id || "");
        if (id && !seen.has(id)) {
          seen.add(id);
          const rekom = typeof item === "object" ? (item.rekon_rekomendasi || "") : "";
          results.push({ asset_id: id, rekomendasi: rekom });
        }
      });
    }
  } catch {}

  return results;
}

function rekomendasiToKondisi(rekomendasi: string): "Rusak Berat" | "Rusak Ringan" | "Dalam Perbaikan" {
  const r = (rekomendasi || "").trim().toLowerCase();
  if (r.includes("perubahan kondisi") || r.includes("rusak berat") || r.includes("hapus")) return "Rusak Berat";
  if (r.includes("perbaikan")) return "Rusak Ringan";
  return "Rusak Ringan";
}

export default function VerifikasiBKAD() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, hasRole, companyId } = useAuth();

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentArchiveRow | null>(null);

  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [approveDoc, setApproveDoc] = useState<DocumentArchiveRow | null>(null);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectDoc, setRejectDoc] = useState<DocumentArchiveRow | null>(null);
  const [catatanReject, setCatatanReject] = useState("");

  // RBAC GLOBAL — hanya staf_bkad yang boleh di sini
  useEffect(() => {
    if (!hasRole("staf_bkad")) {
      toast.error("Akses ditolak: Anda tidak memiliki wewenang BKAD.");
      navigate("/dashboard/overview", { replace: true });
    }
  }, [hasRole, navigate]);

  const { data: pendingDocs = [], isLoading } = useQuery({
    queryKey: ["bkad-pending-documents", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("document_archives")
        .select("*")
        .eq("company_id", companyId)
        .eq("status_approval", "menunggu_bkad")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as DocumentArchiveRow[]) || [];
    },
    enabled: !!companyId && hasRole("staf_bkad"),
  });

  // ─────────────────────────────────────────────────────────────────────
  // APPROVE MUTATION — The Final Execution
  //   a. document_archives: status_approval=disetujui, approved_by, approved_at
  //   b. assets: SET custom_data.Kondisi (master mutate!) + status_rekon=disetujui
  // ─────────────────────────────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: async (doc: DocumentArchiveRow) => {
      if (!user?.id) throw new Error("User tidak terautentikasi");

      const assetList = extractAssetIdsAndRekomendasi(doc);
      if (assetList.length === 0) throw new Error("Tidak ada aset yang bisa dieksekusi dalam dokumen ini.");

      // Fetch asset one-by-one untuk dapatkan current custom_data
      const { data: assetRows, error: fetchErr } = await supabase
        .from("assets")
        .select("id, custom_data")
        .in("id", assetList.map(x => x.asset_id));

      if (fetchErr) throw fetchErr;

      const timestamp = new Date().toISOString();

      // Build bulk updates
      let updated = 0;
      for (const row of assetRows || []) {
        const match = assetList.find(x => x.asset_id === row.id);
        if (!match) continue;

        const cd = typeof row.custom_data === "object" && row.custom_data && !Array.isArray(row.custom_data)
          ? { ...(row.custom_data as Record<string, unknown>) }
          : {};

        // FINAL EXECUTION — Master Kondisi diubah di sini saja
        const masterKondisi = rekomendasiToKondisi(match.rekomendasi || (cd.rekon_rekomendasi as string) || "");
        cd["Kondisi"] = masterKondisi;
        cd["status_rekon"] = "disetujui";
        cd["rekon_disetujui_at"] = timestamp;
        cd["rekon_disetujui_by"] = user.id;

        // Juga pertahankan legacy field status_usulan agar sinkron
        if (!cd["status_usulan"]) {
          cd["status_usulan"] = match.rekomendasi || cd.rekon_rekomendasi || masterKondisi;
        }

        const { error: updErr } = await supabase
          .from("assets")
          .update({ custom_data: cd })
          .eq("id", row.id);
        if (updErr) throw new Error(`Gagal update aset ${row.id}: ${updErr.message}`);
        updated++;
      }

      // Akhir: update document_archives
      const { error: docErr } = await supabase
        .from("document_archives")
        .update({
          status_approval: "disetujui",
          status: "Disetujui BKAD",
          approved_by: user.id,
          approved_at: timestamp,
        })
        .eq("id", doc.id);
      if (docErr) throw docErr;

      return { updated };
    },
    onSuccess: ({ updated }) => {
      toast.success(`✅ Persetujuan dieksekusi! Master data ${updated} aset berhasil diupdate.`);
      queryClient.invalidateQueries({ queryKey: ["bkad-pending-documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-archives"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["rekon-assets-joined"] });
      setApproveConfirmOpen(false);
      setApproveDoc(null);
    },
    onError: (err: any) => {
      toast.error("Gagal mengeksekusi persetujuan: " + err.message);
    },
  });

  // ─────────────────────────────────────────────────────────────────────
  // REJECT MUTATION
  //   a. document_archives: status_approval=ditolak, catatan_bkad, approved_by, approved_at
  //   b. assets: status_rekon=ditolak — master Kondisi TETAP AMAN (tidak berubah!)
  // ─────────────────────────────────────────────────────────────────────
  const rejectMutation = useMutation({
    mutationFn: async ({ doc, catatan }: { doc: DocumentArchiveRow; catatan: string }) => {
      if (!user?.id) throw new Error("User tidak terautentikasi");
      if (!catatan.trim()) throw new Error("Catatan penolakan wajib diisi.");

      const assetList = extractAssetIdsAndRekomendasi(doc);
      const timestamp = new Date().toISOString();

      if (assetList.length > 0) {
        const { data: assetRows, error: fetchErr } = await supabase
          .from("assets")
          .select("id, custom_data")
          .in("id", assetList.map(x => x.asset_id));
        if (fetchErr) throw fetchErr;

        for (const row of assetRows || []) {
          const cd = typeof row.custom_data === "object" && row.custom_data && !Array.isArray(row.custom_data)
            ? { ...(row.custom_data as Record<string, unknown>) }
            : {};

          // MASTER KONDISI TIDAK DIUBAH — hanya tandai status_rekon=ditolak
          cd["status_rekon"] = "ditolak";
          cd["rekon_ditolak_at"] = timestamp;
          cd["rekon_ditolak_by"] = user.id;
          cd["rekon_catatan_bkad"] = catatan;

          const { error: updErr } = await supabase
            .from("assets")
            .update({ custom_data: cd })
            .eq("id", row.id);
          if (updErr) throw new Error(`Gagal update status aset ${row.id}: ${updErr.message}`);
        }
      }

      const { error: docErr } = await supabase
        .from("document_archives")
        .update({
          status_approval: "ditolak",
          status: "Ditolak BKAD",
          catatan_bkad: catatan,
          approved_by: user.id,
          approved_at: timestamp,
        })
        .eq("id", doc.id);
      if (docErr) throw docErr;

      return assetList.length;
    },
    onSuccess: () => {
      toast.info("ℹ️ Pengajuan ditolak. Master data aset tetap aman (tidak berubah).");
      queryClient.invalidateQueries({ queryKey: ["bkad-pending-documents"] });
      queryClient.invalidateQueries({ queryKey: ["document-archives"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["rekon-assets-joined"] });
      setRejectDialogOpen(false);
      setRejectDoc(null);
      setCatatanReject("");
    },
    onError: (err: any) => {
      toast.error("Gagal menolak pengajuan: " + err.message);
    },
  });

  // ─────────────────────────────────────────────────────────────────────
  // HANDLERS & RENDERERS
  // ─────────────────────────────────────────────────────────────────────
  const openDetail = (doc: DocumentArchiveRow) => {
    setSelectedDoc(doc);
    setDetailOpen(true);
  };

  const handleApprove = (doc: DocumentArchiveRow) => {
    setApproveDoc(doc);
    setApproveConfirmOpen(true);
  };

  const handleReject = (doc: DocumentArchiveRow) => {
    setRejectDoc(doc);
    setCatatanReject("");
    setRejectDialogOpen(true);
  };

  const detailAsetList = (() => {
    if (!selectedDoc) return [];
    const list: OtorisasiAset[] = [];
    try {
      if (Array.isArray(selectedDoc.data_otorisasi)) {
        list.push(...(selectedDoc.data_otorisasi as OtorisasiAset[]));
      } else if (typeof selectedDoc.data_otorisasi === "object" && selectedDoc.data_otorisasi !== null) {
        const obj = selectedDoc.data_otorisasi as any;
        if (Array.isArray(obj.assets)) list.push(...(obj.assets as OtorisasiAset[]));
      }
    } catch {}
    try {
      if (Array.isArray(selectedDoc.kode_barang_list)) {
        (selectedDoc.kode_barang_list as any[]).forEach((kb) => {
          if (typeof kb === "object" && kb && !list.find(l => l.kode_aset === kb.kode_aset || l.id === kb.id || l.asset_id === kb.asset_id)) {
            list.push(kb as OtorisasiAset);
          } else if (typeof kb === "string") {
            if (!list.find(l => l.kode_aset === kb || l.asset_id === kb)) list.push({ kode_aset: kb });
          }
        });
      }
    } catch {}
    return list;
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-teal-700" />
            Verifikasi BKAD
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Daftar pengajuan rekonsiliasi massal dari Pengurus Barang yang menunggu persetujuan Anda.
          </p>
        </div>
        <Badge className="shrink-0" variant="secondary">
          <Clock className="h-3 w-3 mr-1" />
          {pendingDocs.length} Pengajuan Aktif
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Antrean Pengajuan Menunggu Persetujuan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Memuat daftar pengajuan…
            </div>
          ) : pendingDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="h-14 w-14 text-chart-3/50 mb-3" />
              <p className="font-semibold text-foreground">Tidak Ada Antrean</p>
              <p className="text-sm text-muted-foreground mt-1">
                Semua pengajuan saat ini sudah diproses. Cek kembali nanti.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Nomor Dokumen</TableHead>
                    <TableHead>Tanggal Diajukan</TableHead>
                    <TableHead className="text-center">Jumlah Aset</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingDocs.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="font-mono text-sm font-semibold text-primary">
                          {doc.nomor_surat}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {doc.jenis_kib ? `KIB: ${doc.jenis_kib} · ` : ""}
                          Nilai: {doc.total_nilai?.toLocaleString("id-ID") || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatTanggal(doc.tanggal_surat || doc.created_at)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-semibold">
                          <Package className="h-3 w-3 mr-1.5" />
                          {getJumlahAset(doc)} aset
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-warning/15 text-warning border-warning/30">
                          <Clock className="h-3 w-3 mr-1" />
                          Menunggu BKAD
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => openDetail(doc)}>
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            Detail
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="bg-destructive/90 hover:bg-destructive"
                            onClick={() => handleReject(doc)}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1.5" />
                            Tolak
                          </Button>
                          <Button
                            size="sm"
                            className="bg-chart-3 hover:bg-chart-3/90 text-white"
                            onClick={() => handleApprove(doc)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            Setujui
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
              Detail Pengajuan
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
                    <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Tanggal Diajukan</p>
                    <p className="font-medium">{formatTanggal(selectedDoc.tanggal_surat || selectedDoc.created_at)}</p>
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
                    <p className="font-medium">Rp {(selectedDoc.total_nilai || 0).toLocaleString("id-ID")}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 overflow-hidden">
                  <div className="bg-muted/30 px-4 py-2.5 border-b border-border/40">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
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

                <div className="rounded-xl border border-border/60 overflow-hidden">
                  <div className="bg-muted/30 px-4 py-2.5 border-b border-border/40">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Package className="h-3.5 w-3.5" />
                      Daftar Aset Usulan
                    </p>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {detailAsetList.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-6 text-center">Data aset tidak tersedia.</p>
                    ) : (
                      <Table>
                        <TableHeader className="bg-muted/15 sticky top-0">
                          <TableRow>
                            <TableHead>Kode Aset</TableHead>
                            <TableHead>Nama Aset</TableHead>
                            <TableHead>Rekomendasi Usulan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailAsetList.map((item, i) => (
                            <TableRow key={item.asset_id || item.id || i}>
                              <TableCell className="font-mono text-xs">
                                {item.kode_aset || item.kode_barang || "—"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {item.nama_aset || "—"}
                              </TableCell>
                              <TableCell>
                                <Badge className="text-[11px]" variant="secondary">
                                  {item.rekon_rekomendasi || item.Kondisi || "Usul Perbaikan"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
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

      {/* ─── Approve Confirm AlertDialog ─── */}
      <AlertDialog open={approveConfirmOpen} onOpenChange={setApproveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-chart-3">
              <CheckCircle2 className="h-5 w-5" />
              Konfirmasi Persetujuan Final
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {approveDoc && (
                <>
                  <p>
                    Anda akan <strong>menyetujui secara PERMANEN</strong> dokumen{" "}
                    <span className="font-mono font-semibold">{approveDoc.nomor_surat}</span> yang berisi{" "}
                    <strong>{getJumlahAset(approveDoc)} aset</strong>.
                  </p>
                  <div className="bg-chart-3/10 border border-chart-3/25 rounded-lg p-3 text-sm">
                    <p className="font-semibold text-chart-3 mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      Eksekusi Master Data (Final)
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                      <li>Master <code className="bg-muted px-1 rounded">assets.custom_data.Kondisi</code> diubah sesuai rekomendasi usulan.</li>
                      <li><code className="bg-muted px-1 rounded">status_rekon</code> ditandai <code className="bg-muted px-1 rounded">disetujui</code>.</li>
                      <li>Tindakan ini <strong>tidak dapat dibatalkan</strong>.</li>
                    </ul>
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approveMutation.isPending} onClick={() => { setApproveConfirmOpen(false); setApproveDoc(null); }}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={approveMutation.isPending}
              onClick={() => approveDoc && approveMutation.mutate(approveDoc)}
              className="bg-chart-3 hover:bg-chart-3/90 text-white"
            >
              {approveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Ya, Setujui & Eksekusi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Reject Dialog (wajib catatan) ─── */}
      <Dialog open={rejectDialogOpen} onOpenChange={(o) => { if (!o) { setRejectDialogOpen(false); setRejectDoc(null); setCatatanReject(""); } else { setRejectDialogOpen(true); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Tolak Pengajuan
            </DialogTitle>
            <DialogDescription>
              {rejectDoc && (
                <>
                  Dokumen <span className="font-mono font-semibold">{rejectDoc.nomor_surat}</span> · {getJumlahAset(rejectDoc)} aset
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm">
              <p className="font-semibold text-destructive mb-1">⚠️ Catatan Penting</p>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                <li>Master data kondisi <strong>TETAP AMAN</strong> (tidak diubah).</li>
                <li>Aset yang ditolak ditandai <code className="bg-muted px-1 rounded">status_rekon=ditolak</code>.</li>
                <li>Catatan penolakan akan dikirimkan kembali ke Pengurus Barang.</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="catatan-bkad">
                Alasan Penolakan <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="catatan-bkad"
                rows={4}
                placeholder="Contoh: Kondisi aset perlu dicek ulang, bukti foto tidak lengkap, atau rekomendasi tidak sesuai KIB."
                value={catatanReject}
                onChange={(e) => setCatatanReject(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={rejectMutation.isPending} onClick={() => { setRejectDialogOpen(false); setRejectDoc(null); setCatatanReject(""); }}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending || !catatanReject.trim()}
              onClick={() => rejectDoc && rejectMutation.mutate({ doc: rejectDoc, catatan: catatanReject })}
            >
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Kirim Penolakan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
