import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Package, DollarSign, AlertTriangle, Wrench, TrendingUp, BarChart3, PieChart as PieChartIcon,
  ArrowUpRight, ArrowDownRight, Building2, ClipboardCheck, History, MoreHorizontal
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area,
} from "recharts";
import { useMemo } from "react";
import { getKondisi } from "@/lib/kondisi";
import type { Json } from "@/integrations/supabase/types";

// --- Styles ---
const SOFT_UI_CARD = "bg-white border-none shadow-sm rounded-2xl overflow-hidden";
const PIE_COLORS: Record<string, string> = {
  "Baik": "#10b981", // Emerald-500
  "Rusak Ringan": "#f59e0b", // Amber-500
  "Rusak Berat": "#ef4444", // Red-500
  "Lainnya": "#94a3b8", // Slate-400
};

// --- Helpers ---
function formatRupiah(rawNum: number) {
  const num = Math.round(rawNum);
  if (num >= 1_000_000_000) return `Rp ${(num / 1_000_000_000).toFixed(1)}M`;
  if (num >= 1_000_000) return `Rp ${(num / 1_000_000).toFixed(1)}Jt`;
  if (num >= 1_000) return `Rp ${(num / 1_000).toFixed(0)}Rb`;
  return `Rp ${num.toLocaleString("id-ID")}`;
}

// --- Soft-UI Components ---

const StatCard = ({ label, value, icon: Icon, trend, color, sparklineData }: any) => {
  return (
    <Card className={SOFT_UI_CARD}>
      <CardContent className="p-6 relative">
        <div className="flex justify-between items-start mb-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-slate-700 tracking-tight">{value}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={`p-2 rounded-xl bg-${color}-50 text-${color}-600`}>
              <Icon size={20} />
            </div>
            {trend !== undefined && (
              <div className={`flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${trend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {trend >= 0 ? <ArrowUpRight size={12} className="mr-0.5" /> : <ArrowDownRight size={12} className="mr-0.5" />}
                {Math.abs(trend)}%
              </div>
            )}
          </div>
        </div>
        
        {/* Sparkline Ornamen */}
        <div className="absolute bottom-0 left-0 w-full h-10 opacity-30 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Area 
                type="monotone" 
                dataKey="v" 
                stroke={trend >= 0 ? "#10b981" : "#ef4444"} 
                fill={trend >= 0 ? "#10b981" : "#ef4444"} 
                strokeWidth={2}
                fillOpacity={0.4}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

const AreaChartCard = ({ title, data, dataKey, color, filter, setFilter }: any) => {
  return (
    <Card className={`${SOFT_UI_CARD} col-span-1 xl:col-span-2`}>
      <CardHeader className="flex flex-row items-center justify-between pb-0 pt-6 px-6">
        <CardTitle className="text-sm font-bold text-slate-600">{title}</CardTitle>
        <div className="flex bg-slate-50 p-1 rounded-xl">
          {['Bulan', 'Kuartal', 'Tahun'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter?.(f)}
              className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${filter === f ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="h-[300px] p-6 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="month" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} 
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} 
            />
            <Tooltip 
              cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 4' }}
              contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontSize: '12px', fontWeight: 'bold' }}
            />
            <Area 
              type="monotone" 
              dataKey={dataKey} 
              stroke={color} 
              strokeWidth={4} 
              fill={`url(#grad-${color})`} 
              dot={{ r: 4, fill: color, strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

const DonutChartCard = ({ title, data, total }: any) => {
  return (
    <Card className={SOFT_UI_CARD}>
      <CardHeader>
        <CardTitle className="text-sm font-bold text-slate-600">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <div className="relative w-full h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name] || PIE_COLORS["Lainnya"]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-slate-700">{total}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Total</span>
          </div>
        </div>
        <div className="w-full mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2">
          {data.map((d: any) => (
            <div key={d.name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[d.name] || PIE_COLORS["Lainnya"] }} />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">{d.name}</span>
                <span className="text-xs font-bold text-slate-700">{d.percent}%</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const ListCard = ({ title, items, renderItem }: any) => {
  return (
    <Card className={SOFT_UI_CARD}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold text-slate-600">{title}</CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
          <MoreHorizontal size={16} />
        </Button>
      </CardHeader>
      <CardContent className="p-0 px-6 pb-6">
        <div className="space-y-4">
          {items.map((item: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              {renderItem(item)}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// --- Skeleton Component ---
const DashboardSkeleton = () => (
  <div className="space-y-6 animate-pulse p-2">
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-slate-100 rounded-2xl shadow-sm border-none" />)}
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 h-[400px] bg-slate-100 rounded-2xl shadow-sm border-none" />
      <div className="h-[400px] bg-slate-100 rounded-2xl shadow-sm border-none" />
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {[...Array(2)].map((_, i) => <div key={i} className="h-[350px] bg-slate-100 rounded-2xl shadow-sm border-none" />)}
    </div>
  </div>
);

export default function DashboardOverview() {
  const { companyId, role } = useAuth();
  const isBKAD = role === 'staf_bkad';

  // --- Common Queries ---
  const { data: assets, isLoading: loadingAssets } = useQuery({
    queryKey: ["assets-overview", companyId, role],
    queryFn: async () => {
      let query = supabase
        .from("assets")
        .select("id, nama_aset, kategori, lokasi_ruangan, kode_divisi, kib, custom_data, created_at");
      
      if (!isBKAD) {
        query = query.eq("company_id", companyId!);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId || isBKAD,
  });

  const { data: reports, isLoading: loadingReports } = useQuery({
    queryKey: ["reports-overview", companyId, role],
    queryFn: async () => {
      let query = supabase
        .from("asset_reports")
        .select("id, status, created_at, resolusi, company_id");
      
      if (!isBKAD) {
        query = query.eq("company_id", companyId!);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId || isBKAD,
  });

  const { data: archives, isLoading: loadingArchives } = useQuery({
    queryKey: ["archives-overview", companyId, role],
    queryFn: async () => {
      let query = supabase
        .from("document_archives")
        .select("id, status_approval, created_at, total_nilai, company_id, data_otorisasi");
      
      if (!isBKAD) {
        query = query.eq("company_id", companyId!);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId || isBKAD,
  });

  const isLoading = loadingAssets || loadingReports || loadingArchives;

  if (isLoading) return <DashboardSkeleton />;

  return isBKAD ? (
    <DashboardBKAD assets={assets} reports={reports} archives={archives} />
  ) : (
    <DashboardSKPD assets={assets} reports={reports} archives={archives} />
  );
}

// --- Dashboard SKPD (Operator) ---
function DashboardSKPD({ assets, reports, archives }: any) {
  const stats = useMemo(() => {
    const totalActive = assets.filter((a: any) => a.kib !== '04 - Aset Lainnya').length;
    const reclassified = assets.filter((a: any) => a.kib === '04 - Aset Lainnya').length;
    let totalNilai = 0;
    const kondisiCount: any = { "Baik": 0, "Rusak Ringan": 0, "Rusak Berat": 0 };

    assets.forEach((a: any) => {
      const cd = a.custom_data || {};
      const nilai = cd["Nilai Aset"] ?? cd["Nilai"] ?? 0;
      totalNilai += typeof nilai === 'number' ? nilai : parseFloat(String(nilai)) || 0;
      
      const k = getKondisi(cd);
      if (kondisiCount[k] !== undefined) kondisiCount[k]++;
      else kondisiCount["Lainnya"] = (kondisiCount["Lainnya"] || 0) + 1;
    });

    const donutData = Object.entries(kondisiCount).map(([name, value]: any) => ({
      name,
      value,
      percent: Math.round((value / assets.length) * 100) || 0
    }));

    // Mock trend reports
    const trendData = [
      { month: 'Jan', count: 12 }, { month: 'Feb', count: 18 }, { month: 'Mar', count: 15 },
      { month: 'Apr', count: 25 }, { month: 'Mei', count: 22 }, { month: 'Jun', count: 30 }
    ];

    return { totalActive, totalNilai, reclassified, reportsCount: reports.length, donutData, trendData };
  }, [assets, reports]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Total Aset Aktif" value={stats.totalActive} icon={Package} color="emerald" trend={12} sparklineData={[{v:10},{v:15},{v:12},{v:18},{v:25}]} />
        <StatCard label="Nilai Kapital" value={formatRupiah(stats.totalNilai)} icon={DollarSign} color="blue" trend={5} sparklineData={[{v:20},{v:22},{v:25},{v:24},{v:28}]} />
        <StatCard label="Aset Reklasifikasi" value={stats.reclassified} icon={AlertTriangle} color="amber" trend={-2} sparklineData={[{v:15},{v:12},{v:14},{v:10},{v:8}]} />
        <StatCard label="Laporan Kendala" value={stats.reportsCount} icon={Wrench} color="red" trend={8} sparklineData={[{v:5},{v:12},{v:8},{v:15},{v:20}]} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <AreaChartCard title="Tren Laporan Kendala & Kerusakan" data={stats.trendData} dataKey="count" color="#0ea5e9" filter="Bulan" />
        <DonutChartCard title="Kondisi Aset" data={stats.donutData} total={assets.length} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ListCard 
          title="Status Mutasi Terakhir" 
          items={archives.slice(0, 5)} 
          renderItem={(item: any) => (
            <>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                  <History size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">ID: {item.id.slice(0, 8)}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(item.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border-none ${
                item.status_approval === 'disetujui' ? 'bg-emerald-50 text-emerald-600' : 
                item.status_approval === 'ditolak' ? 'bg-red-50 text-red-600' : 
                'bg-amber-50 text-amber-600'
              }`}>
                {item.status_approval?.toUpperCase() || 'DRAFT'}
              </Badge>
            </>
          )}
        />
      </div>
    </div>
  );
}

// --- Dashboard BKAD (Konsolidator) ---
function DashboardBKAD({ assets, reports, archives }: any) {
  const stats = useMemo(() => {
    const queue = archives.filter((a: any) => a.status_approval === 'menunggu_bkad').length;
    const reclassified = assets.filter((a: any) => a.kib === '04 - Aset Lainnya').length;
    let mutationValue = 0;
    archives.filter((a: any) => a.status_approval === 'disetujui').forEach((a: any) => mutationValue += a.total_nilai || 0);
    
    const skpdReporting = new Set(reports.map((r: any) => r.company_id)).size;

    const kibMap: any = {};
    assets.filter((a: any) => a.kib === '04 - Aset Lainnya').forEach((a: any) => {
      const originalKib = (a.custom_data?.["OriginalKIB"] as string) || "KIB Tak Terdefinisi";
      kibMap[originalKib] = (kibMap[originalKib] || 0) + 1;
    });

    const donutData = Object.entries(kibMap).map(([name, value]: any) => ({
      name,
      value,
      percent: Math.round((value / reclassified) * 100) || 0
    }));

    // Mock top SKPD
    const topSKPD = [
      { name: 'Dinas Pendidikan', count: 145, progress: 85 },
      { name: 'Dinas Kesehatan', count: 98, progress: 62 },
      { name: 'Sekretariat Daerah', count: 76, progress: 45 },
      { name: 'Dinas Perhubungan', count: 45, progress: 30 },
      { name: 'BKPSDM', count: 32, progress: 20 },
    ];

    const trendData = [
      { month: 'Jan', docs: 5 }, { month: 'Feb', docs: 12 }, { month: 'Mar', docs: 8 },
      { month: 'Apr', docs: 20 }, { month: 'Mei', docs: 35 }, { month: 'Jun', count: 42 }
    ];

    return { queue, reclassified, mutationValue, skpdReporting, donutData, trendData, topSKPD };
  }, [assets, reports, archives]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Antrean Verifikasi" value={stats.queue} icon={ClipboardCheck} color="amber" trend={15} sparklineData={[{v:5},{v:8},{v:12},{v:10},{v:15}]} />
        <StatCard label="Aset Reklasifikasi" value={stats.reclassified} icon={AlertTriangle} color="red" trend={24} sparklineData={[{v:10},{v:25},{v:30},{v:35},{v:42}]} />
        <StatCard label="Nilai Mutasi" value={formatRupiah(stats.mutationValue)} icon={DollarSign} color="emerald" trend={10} sparklineData={[{v:50},{v:60},{v:55},{v:70},{v:85}]} />
        <StatCard label="SKPD Melapor" value={stats.skpdReporting} icon={Building2} color="blue" trend={5} sparklineData={[{v:20},{v:22},{v:25},{v:24},{v:28}]} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <AreaChartCard title="Tren Pengajuan Mutasi Daerah" data={stats.trendData} dataKey="docs" color="#8b5cf6" filter="Bulan" />
        <DonutChartCard title="Komposisi Mutasi per KIB" data={stats.donutData} total={stats.reclassified} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ListCard 
          title="Top 5 SKPD Pengaju Mutasi" 
          items={stats.topSKPD} 
          renderItem={(item: any) => (
            <>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                  <Building2 size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">{item.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">{item.count} Dokumen</p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-32">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${item.progress}%` }} />
                </div>
                <span className="text-xs font-bold text-slate-700">{item.progress}%</span>
              </div>
            </>
          )}
        />
      </div>
    </div>
  );
}
