import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getKondisi, getKondisiStyle } from "@/lib/kondisi";
import { getSmartLocation } from "@/lib/smartLocation";
import {
  ClipboardCheck, CheckCircle2, AlertTriangle, XCircle, BarChart3,
  Search, ArrowRight, Package, Clock, Loader2, ScanLine
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";

export default function DashboardCensus() {
  const navigate = useNavigate();
  const { companyId } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch all assets for this company
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["census-assets", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("company_id", companyId!)
        .order("kode_aset", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Compute census statistics from asset data
  const stats = useMemo(() => {
    const total = assets.length;
    let baik = 0, rusakRingan = 0, rusakBerat = 0, belumDicek = 0;

    assets.forEach((asset) => {
      const cd = typeof asset.custom_data === "object" && asset.custom_data && !Array.isArray(asset.custom_data)
        ? (asset.custom_data as Record<string, unknown>) : null;
      const kondisi = getKondisi(cd);

      if (kondisi === "Baik") baik++;
      else if (kondisi === "Rusak Ringan") rusakRingan++;
      else if (kondisi === "Rusak Berat" || kondisi === "Dalam Perbaikan") rusakBerat++;
      else belumDicek++;
    });

    // Census progress: assets that have a kondisi set (not "Belum Dicek")
    const audited = total - belumDicek;
    const progress = total > 0 ? Math.round((audited / total) * 100) : 0;

    return { total, baik, rusakRingan, rusakBerat, belumDicek, audited, progress };
  }, [assets]);

  // Filter assets for the table
  const filteredAssets = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return assets.filter((a) => {
      if (q && !a.nama_aset.toLowerCase().includes(q) && !a.kode_aset.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [assets, searchQuery]);

  // Helper to get asset location
  function assetLocation(a: typeof assets[0]) {
    const cd = typeof a.custom_data === "object" && a.custom_data && !Array.isArray(a.custom_data)
      ? (a.custom_data as Record<string, unknown>) : null;
    return getSmartLocation(cd, a.kode_divisi);
  }

  // Helper to get kondisi info
  function assetKondisi(a: typeof assets[0]) {
    const cd = typeof a.custom_data === "object" && a.custom_data && !Array.isArray(a.custom_data)
      ? (a.custom_data as Record<string, unknown>) : null;
    const kondisi = getKondisi(cd);
    return getKondisiStyle(kondisi);
  }

  const metricCards = [
    {
      title: "Total Aset",
      value: stats.total,
      icon: Package,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Sudah Diaudit",
      value: stats.audited,
      icon: CheckCircle2,
      color: "text-chart-3",
      bgColor: "bg-chart-3/10",
    },
    {
      title: "Belum Dicek",
      value: stats.belumDicek,
      icon: Clock,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Rusak Berat",
      value: stats.rusakBerat,
      icon: XCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Sensus Aset
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Modul audit & sensus 5 tahunan — pantau progres pencatatan kondisi aset di lapangan.
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Overview Sensus
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5">
            <ScanLine className="h-4 w-4" />
            Daftar Aset
          </TabsTrigger>
        </TabsList>

        {/* ========== TAB 1: OVERVIEW ========== */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : (
            <>
              {/* Metric Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {metricCards.map((m) => (
                  <Card key={m.title} className="border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className={`h-9 w-9 rounded-lg ${m.bgColor} flex items-center justify-center`}>
                          <m.icon className={`h-4.5 w-4.5 ${m.color}`} />
                        </div>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{m.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{m.title}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Progress Bar */}
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Progres Sensus</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {stats.audited} dari {stats.total} aset sudah dicatat kondisinya
                    </span>
                    <span className="font-bold text-foreground">{stats.progress}%</span>
                  </div>
                  <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-chart-3 rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${stats.progress}%` }}
                    />
                  </div>

                  {/* Breakdown */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-chart-3" />
                      <span className="text-xs text-muted-foreground">Baik: <strong className="text-foreground">{stats.baik}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-warning" />
                      <span className="text-xs text-muted-foreground">Rusak Ringan: <strong className="text-foreground">{stats.rusakRingan}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-destructive" />
                      <span className="text-xs text-muted-foreground">Rusak Berat: <strong className="text-foreground">{stats.rusakBerat}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
                      <span className="text-xs text-muted-foreground">Belum Dicek: <strong className="text-foreground">{stats.belumDicek}</strong></span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Action */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <ScanLine className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground">Mulai Audit Lapangan</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Scan QR Code pada aset fisik untuk langsung masuk ke formulir audit. Atau pilih aset dari tabel di tab "Daftar Aset".
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ========== TAB 2: DAFTAR ASET ========== */}
        <TabsContent value="list" className="mt-6 space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari kode atau nama aset…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Package className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Tidak ada aset ditemukan</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kode Aset</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nama Aset</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Lokasi</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kondisi</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssets.map((asset) => {
                      const kondisiStyle = assetKondisi(asset);
                      return (
                        <TableRow key={asset.id}>
                          <TableCell className="font-mono text-sm font-medium text-foreground">{asset.kode_aset}</TableCell>
                          <TableCell className="text-sm text-foreground">{asset.nama_aset}</TableCell>
                          <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{assetLocation(asset)}</TableCell>
                          <TableCell>
                            <Badge className={`${kondisiStyle.bg} ${kondisiStyle.color} ${kondisiStyle.border} text-xs`}>
                              {kondisiStyle.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => navigate(`/dashboard/census/audit/${asset.id}`)}
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                              Audit
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
