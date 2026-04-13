import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Package, DollarSign, AlertTriangle, Wrench, TrendingUp, BarChart3, PieChart as PieChartIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, CartesianGrid,
} from "recharts";
import { useMemo } from "react";
import { getKondisi } from "@/lib/kondisi";
import type { Json } from "@/integrations/supabase/types";

const PIE_COLORS: Record<string, string> = {
  "Baik": "#10b981",
  "Rusak Ringan": "#f59e0b",
  "Rusak Berat": "#f97316",
  "Dalam Perbaikan": "#3b82f6",
  "Usul Hapus": "#f43f5e",
  "Dihapuskan": "#94a3b8",
};
const BAR_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#06b6d4", "#14b8a6", "#f59e0b", "#f43f5e", "#ec4899"];

function formatRupiah(num: number) {
  if (num >= 1_000_000_000) return `Rp ${(num / 1_000_000_000).toFixed(1)}M`;
  if (num >= 1_000_000) return `Rp ${(num / 1_000_000).toFixed(1)}Jt`;
  if (num >= 1_000) return `Rp ${(num / 1_000).toFixed(0)}Rb`;
  return `Rp ${num.toLocaleString("id-ID")}`;
}

export default function DashboardOverview() {
  const { companyId } = useAuth();

  const { data: assets, isLoading: loadingAssets } = useQuery({
    queryKey: ["assets-overview", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("id, nama_aset, kategori, lokasi_ruangan, kode_divisi, kib, custom_data, created_at")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const { data: reports, isLoading: loadingReports } = useQuery({
    queryKey: ["reports-overview", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_reports")
        .select("id, status, created_at, resolusi")
        .eq("company_id", companyId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const isLoading = loadingAssets || loadingReports;

  const stats = useMemo(() => {
    if (!assets || !reports) return null;

    const totalAssets = assets.length;
    let totalNilai = 0;
    const kondisiMap: Record<string, number> = {};
    const divisiMap: Record<string, number> = {};

    assets.forEach((a) => {
      const cd = a.custom_data as Record<string, Json> | null;
      // Sum nilai
      const nilai = cd?.["Nilai Aset"] ?? cd?.["Nilai/Harga"] ?? cd?.["Nilai"] ?? cd?.["Harga"] ?? cd?.["nilai"] ?? 0;
      const numVal = typeof nilai === "number" ? nilai : parseFloat(String(nilai)) || 0;
      totalNilai += numVal;

      // Kondisi
      const kondisi = getKondisi(cd as Record<string, unknown> | null);
      kondisiMap[kondisi] = (kondisiMap[kondisi] || 0) + 1;

      // Divisi / KIB
      const divisi = a.kib || a.kode_divisi || "Lainnya";
      divisiMap[divisi] = (divisiMap[divisi] || 0) + 1;
    });

    const totalReports = reports.length;
    let totalBiaya = 0;
    reports.forEach((r) => {
      const res = r.resolusi as Record<string, Json> | null;
      if (res?.biaya) {
        const b = typeof res.biaya === "number" ? res.biaya : parseFloat(String(res.biaya)) || 0;
        totalBiaya += b;
      }
    });

    // Kondisi pie data
    const kondisiData = Object.entries(kondisiMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Divisi bar data
    const divisiData = Object.entries(divisiMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Monthly trend
    const monthMap: Record<string, number> = {};
    reports.forEach((r) => {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap[key] = (monthMap[key] || 0) + 1;
    });
    const trendData = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, count]) => {
        const [y, m] = month.split("-");
        const label = new Date(Number(y), Number(m) - 1).toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
        return { month: label, laporan: count };
      });

    return { totalAssets, totalNilai, totalReports, totalBiaya, kondisiData, divisiData, trendData };
  }, [assets, reports]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (!stats) return null;

  const summaryCards = [
    { label: "Total Aset", value: stats.totalAssets.toLocaleString("id-ID"), icon: Package, iconBg: "bg-chart-1/10", iconColor: "text-chart-1" },
    { label: "Estimasi Nilai Kapital", value: formatRupiah(stats.totalNilai), icon: DollarSign, iconBg: "bg-chart-2/10", iconColor: "text-chart-2" },
    { label: "Total Laporan Kendala", value: stats.totalReports.toLocaleString("id-ID"), icon: AlertTriangle, iconBg: "bg-warning/10", iconColor: "text-warning" },
    { label: "Biaya Pemeliharaan", value: formatRupiah(stats.totalBiaya), icon: Wrench, iconBg: "bg-destructive/10", iconColor: "text-destructive" },
  ];

  const EmptyChart = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground">
      <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Ringkasan kesehatan aset dan aktivitas pemeliharaan.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((s) => (
          <Card key={s.label} className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <p className="text-2xl font-bold text-foreground tracking-tight">{s.value}</p>
                </div>
                <div className={`h-10 w-10 rounded-lg ${s.iconBg} flex items-center justify-center`}>
                  <s.icon className={`h-5 w-5 ${s.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie - Kondisi Aset */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold text-foreground">Kondisi Aset</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {stats.kondisiData.length === 0 ? (
              <EmptyChart message="Belum ada data kondisi aset" />
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={stats.kondisiData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {stats.kondisiData.map((entry) => (
                        <Cell key={entry.name} fill={PIE_COLORS[entry.name] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: "0.75rem", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                      formatter={(value: number, name: string) => [`${value} aset`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs sm:flex-col">
                  {stats.kondisiData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[d.name] || "#94a3b8" }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="font-semibold text-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bar - Sebaran per Divisi/KIB */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold text-foreground">Sebaran Aset per Kategori</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {stats.divisiData.length === 0 ? (
              <EmptyChart message="Belum ada data kategori" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.divisiData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: "0.75rem", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    formatter={(value: number) => [`${value} aset`]}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
                    {stats.divisiData.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold text-foreground">Tren Laporan Kendala Bulanan</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {stats.trendData.length === 0 ? (
            <EmptyChart message="Belum ada data laporan untuk divisualisasikan" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradLaporan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ borderRadius: "0.75rem", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                  formatter={(value: number) => [`${value} laporan`]}
                />
                <Area type="monotone" dataKey="laporan" stroke="#3b82f6" strokeWidth={2} fill="url(#gradLaporan)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
