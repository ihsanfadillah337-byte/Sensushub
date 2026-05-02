import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle, CheckCircle2, Wrench, Users, ClipboardCheck,
  ExternalLink, PartyPopper, MessageCircle, Shield
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────
interface AnomalyItem {
  assetId: string;
  kodeAset: string;
  namaAset: string;
  source: "keluhan" | "sensus" | "both";
  kondisi: string;
  deskripsi: string;
  reportCount: number;
  latestDate: string;
  reporterContact?: string;
}

// ─── Component ──────────────────────────────────────────
export default function PapanRekonsiliasi() {
  const { companyId } = useAuth();

  // Fetch assets
  const { data: assets = [], isLoading: isLoadingAssets } = useQuery({
    queryKey: ["rekon-assets", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("id, kode_aset, nama_aset")
        .eq("company_id", companyId!)
        .order("kode_aset", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch open/in-progress reports (tiket publik yang belum selesai)
  const { data: reports = [], isLoading: isLoadingReports } = useQuery({
    queryKey: ["rekon-reports", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_reports")
        .select("asset_id, judul, deskripsi, status, actual_condition, issue_category, reporter_contact, created_at")
        .eq("company_id", companyId!)
        .in("status", ["Menunggu", "Diproses"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch latest audits with bad condition
  const { data: audits = [], isLoading: isLoadingAudits } = useQuery({
    queryKey: ["rekon-audits", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_audits")
        .select("asset_id, kondisi, tindak_lanjut, catatan, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Build anomaly list
  const anomalies = useMemo(() => {
    const assetMap = new Map(assets.map(a => [a.id, a]));
    const companyAssetIds = new Set(assets.map(a => a.id));

    // Reports grouped by asset_id
    const reportsByAsset = new Map<string, typeof reports>();
    reports.forEach(r => {
      if (!companyAssetIds.has(r.asset_id)) return;
      const arr = reportsByAsset.get(r.asset_id) || [];
      arr.push(r);
      reportsByAsset.set(r.asset_id, arr);
    });

    // Latest audit per asset (only damaged ones)
    const damagedAudits = new Map<string, (typeof audits)[0]>();
    audits.forEach(a => {
      if (!companyAssetIds.has(a.asset_id)) return;
      if (damagedAudits.has(a.asset_id)) return; // already have latest
      if (a.kondisi === "Rusak Ringan" || a.kondisi === "Rusak Berat" || a.kondisi === "Dalam Perbaikan") {
        damagedAudits.set(a.asset_id, a);
      }
    });

    // Merge into anomalies
    const anomalyIds = new Set([...reportsByAsset.keys(), ...damagedAudits.keys()]);
    const result: AnomalyItem[] = [];

    anomalyIds.forEach(assetId => {
      const asset = assetMap.get(assetId);
      if (!asset) return;

      const reps = reportsByAsset.get(assetId);
      const audit = damagedAudits.get(assetId);

      const hasReport = !!reps && reps.length > 0;
      const hasAudit = !!audit;

      let source: AnomalyItem["source"] = "keluhan";
      if (hasReport && hasAudit) source = "both";
      else if (hasAudit) source = "sensus";

      // Determine kondisi & description
      let kondisi = "—";
      let deskripsi = "";
      let latestDate = "";
      let reporterContact: string | undefined;

      if (hasReport) {
        const latest = reps![0];
        kondisi = latest.actual_condition || latest.issue_category || "Dilaporkan";
        deskripsi = latest.judul || latest.deskripsi || "";
        latestDate = latest.created_at;
        reporterContact = latest.reporter_contact || undefined;
      }

      if (hasAudit) {
        // Audit kondisi takes priority for severity
        kondisi = audit!.kondisi;
        if (!deskripsi) deskripsi = audit!.tindak_lanjut || audit!.catatan || "";
        if (!latestDate || new Date(audit!.created_at) > new Date(latestDate)) {
          latestDate = audit!.created_at;
        }
      }

      result.push({
        assetId,
        kodeAset: asset.kode_aset,
        namaAset: asset.nama_aset,
        source,
        kondisi,
        deskripsi,
        reportCount: reps?.length ?? 0,
        latestDate,
        reporterContact,
      });
    });

    // Sort by severity: Rusak Berat first, then both sources, then date
    result.sort((a, b) => {
      const sevOrder = (k: string) => k === "Rusak Berat" ? 0 : k === "Rusak Ringan" ? 1 : k === "Dalam Perbaikan" ? 2 : 3;
      const srcOrder = (s: string) => s === "both" ? 0 : s === "keluhan" ? 1 : 2;
      const sevDiff = sevOrder(a.kondisi) - sevOrder(b.kondisi);
      if (sevDiff !== 0) return sevDiff;
      const srcDiff = srcOrder(a.source) - srcOrder(b.source);
      if (srcDiff !== 0) return srcDiff;
      return new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime();
    });

    return result;
  }, [assets, reports, audits]);

  const isLoading = isLoadingAssets || isLoadingReports || isLoadingAudits;

  // ─── Stats ────────────────────────────────────────────
  const statsData = useMemo(() => {
    const total = anomalies.length;
    const rusakBerat = anomalies.filter(a => a.kondisi === "Rusak Berat").length;
    const fromPublic = anomalies.filter(a => a.source === "keluhan" || a.source === "both").length;
    const fromCensus = anomalies.filter(a => a.source === "sensus" || a.source === "both").length;
    return { total, rusakBerat, fromPublic, fromCensus };
  }, [anomalies]);

  // ─── Badge Helpers ────────────────────────────────────
  function sourceLabel(source: AnomalyItem["source"]) {
    switch (source) {
      case "keluhan": return { text: "Keluhan Publik", icon: Users, class: "bg-primary/10 text-primary border-primary/30" };
      case "sensus": return { text: "Temuan Sensus", icon: ClipboardCheck, class: "bg-chart-3/10 text-chart-3 border-chart-3/30" };
      case "both": return { text: "Keduanya", icon: AlertTriangle, class: "bg-destructive/10 text-destructive border-destructive/30" };
    }
  }

  function kondisiBadge(kondisi: string) {
    switch (kondisi) {
      case "Rusak Berat": return "bg-destructive/10 text-destructive border-destructive/30";
      case "Rusak Ringan": return "bg-warning/10 text-warning border-warning/30";
      case "Dalam Perbaikan": return "bg-chart-3/10 text-chart-3 border-chart-3/30";
      default: return "bg-muted text-muted-foreground";
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return "—"; }
  }

  // ─── Render ───────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : anomalies.length === 0 ? (
          /* ───── Empty State ───── */
          <Card className="border-chart-3/20 bg-chart-3/5">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-20 w-20 rounded-2xl bg-chart-3/10 flex items-center justify-center mb-5">
                <PartyPopper className="h-10 w-10 text-chart-3" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Luar biasa! Semua Aset Aman 🎉</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Tidak ada aset yang bermasalah saat ini. Semua data rekonsiliasi antara laporan publik,
                temuan sensus, dan data master SIMDA sudah selaras.
              </p>
              <div className="flex items-center gap-2 mt-5">
                <Shield className="h-4 w-4 text-chart-3" />
                <span className="text-xs text-chart-3 font-medium">0 anomali terdeteksi</span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{statsData.total}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total Anomali</p>
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-destructive">{statsData.rusakBerat}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Rusak Berat</p>
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Users className="h-4.5 w-4.5 text-primary" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{statsData.fromPublic}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Dari Keluhan Publik</p>
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-9 w-9 rounded-lg bg-chart-3/10 flex items-center justify-center">
                      <ClipboardCheck className="h-4.5 w-4.5 text-chart-3" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{statsData.fromCensus}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Dari Temuan Sensus</p>
                </CardContent>
              </Card>
            </div>

            {/* Anomaly Table */}
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aset</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sumber</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kondisi</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Keterangan</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Terakhir</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anomalies.map((item) => {
                      const src = sourceLabel(item.source);
                      return (
                        <TableRow key={item.assetId}>
                          <TableCell>
                            <div className="max-w-[140px] sm:max-w-[180px]">
                              <p className="text-sm font-medium text-foreground truncate">{item.namaAset}</p>
                              <p className="text-xs font-mono text-muted-foreground truncate">{item.kodeAset}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${src.class}`}>
                                <src.icon className="h-3 w-3 mr-1" />
                                {src.text}
                              </Badge>
                              {item.reportCount > 1 && (
                                <Badge variant="destructive" className="h-5 px-1.5 min-w-[20px] flex items-center justify-center text-[10px] rounded-full">
                                  {item.reportCount}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={kondisiBadge(item.kondisi)}>
                              {item.kondisi}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">{item.deskripsi || "—"}</p>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(item.latestDate)}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 text-xs"
                                    onClick={() => toast.info("Fitur pembuatan Berita Acara sedang dikembangkan.")}
                                  >
                                    <Wrench className="h-3.5 w-3.5" />
                                    Tindak Lanjuti
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Buat Berita Acara Rekonsiliasi</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    onClick={() => window.open(`/scan/${item.assetId}`, "_blank")}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Lihat Profil Aset</TooltipContent>
                              </Tooltip>
                              {item.reporterContact && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-chart-1 hover:text-primary hover:bg-accent"
                                      onClick={() => {
                                        let num = item.reporterContact!.replace(/\D/g, "");
                                        if (num.startsWith("0")) num = "62" + num.slice(1);
                                        if (!num.startsWith("62")) num = "62" + num;
                                        window.open(`https://wa.me/${num}`, "_blank");
                                      }}
                                    >
                                      <MessageCircle className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Chat WhatsApp Pelapor</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
