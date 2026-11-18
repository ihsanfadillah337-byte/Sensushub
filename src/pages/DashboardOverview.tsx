import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowUpRight, ArrowDownRight, Minus, Building2, History, MoreHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area,
} from "recharts";
import { useMemo, useState } from "react";
import { getKondisi } from "@/lib/kondisi";

// --- Styles ---
const SOFT_UI_CARD = "bg-white border-none shadow-sm rounded-2xl overflow-hidden";

const PIE_COLORS: Record<string, string> = {
  "Baik": "#10b981", // Emerald-500
  "Rusak Ringan": "#f59e0b", // Amber-500
  "Rusak Berat": "#ef4444", // Red-500
  "Lainnya": "#94a3b8", // Slate-400
  "KIB A - Tanah": "#10b981",
  "KIB B - Peralatan & Mesin": "#3b82f6",
  "KIB C - Gedung & Bangunan": "#8b5cf6",
  "KIB D - Jalan/Irigasi/Jaringan": "#f59e0b",
  "KIB E - Aset Tetap Lainnya": "#14b8a6",
  "KIB Lainnya": "#94a3b8",
};

const STATUS_REKON_META: Record<string, { label: string; cls: string }> = {
  menunggu_bkad: { label: "Menunggu BKAD", cls: "bg-amber-50 text-amber-600" },
  disetujui: { label: "Disetujui", cls: "bg-emerald-50 text-emerald-600" },
  revisi_bkad: { label: "Revisi BKAD", cls: "bg-rose-50 text-rose-600" },
  ditolak: { label: "Ditolak", cls: "bg-red-50 text-red-600" },
};

// Pemetaan status per item bundel (_bkad_status) → kunci STATUS_REKON_META.
const STATUS_FROM_BKAD_ITEM: Record<string, string> = {
  approved: "disetujui",
  rejected: "revisi_bkad",
  pending: "menunggu_bkad",
};

// --- Helpers ---
function formatRupiah(rawNum: number) {
  const num = Math.round(rawNum);
  if (num >= 1_000_000_000) return `Rp ${(num / 1_000_000_000).toFixed(1)}M`;
  if (num >= 1_000_000) return `Rp ${(num / 1_000_000).toFixed(1)}Jt`;
  if (num >= 1_000) return `Rp ${(num / 1_000).toFixed(0)}Rb`;
  return `Rp ${num.toLocaleString("id-ID")}`;
}

function nilaiAsetOf(a: any): number {
  const cd = typeof a?.custom_data === "object" && a?.custom_data ? (a.custom_data as any) : {};
  const raw = cd["Nilai Aset"] ?? cd["Nilai"] ?? cd["Nilai Perolehan"] ?? cd["nilai_perolehan"] ?? 0;
  if (typeof raw === "number") return isFinite(raw) ? raw : 0;
  if (raw === null || raw === undefined) return 0;
  const cleaned = String(raw).split(",")[0].replace(/[^0-9]/g, "");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

function flattenOtorisasi(data: any): any[] {
  const out: any[] = [];
  try {
    if (Array.isArray(data)) out.push(...data);
    else if (data && typeof data === "object") {
      if (Array.isArray(data.aset_detail)) out.push(...data.aset_detail);
      if (Array.isArray(data.assets)) out.push(...data.assets);
    }
  } catch {}
  return out;
}

// Normalisasi label KIB agar tidak muncul "KIB TAK TERDEFINISI".
const KIB_BY_CODE: Record<string, string> = {
  "01": "KIB A - Tanah",
  "02": "KIB B - Peralatan & Mesin",
  "03": "KIB C - Gedung & Bangunan",
  "04": "KIB D - Jalan/Irigasi/Jaringan",
  "05": "KIB E - Aset Tetap Lainnya",
};
const KIB_BY_LETTER: Record<string, string> = {
  a: "KIB A - Tanah",
  b: "KIB B - Peralatan & Mesin",
  c: "KIB C - Gedung & Bangunan",
  d: "KIB D - Jalan/Irigasi/Jaringan",
  e: "KIB E - Aset Tetap Lainnya",
};
const KIB_FALLBACK = "KIB Lainnya";

function normalizeKibLabel(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return KIB_FALLBACK;
  const lower = s.toLowerCase();
  const containsLainnya = lower.includes("aset lainnya") || lower.includes("ekstrakomptabel");
  // Pengecualian lebih dulu: label "Aset Lainnya"/"Ekstrakomptabel" TANPA awalan kode 01/02/03/05
  // (mis. "04 - Aset Lainnya") dipastikan KIB Lainnya — bukan KIB D (Jalan/Irigasi/Jaringan).
  const startsWithOtherKibCode = /^\s*0[1235]/.test(s);
  if (containsLainnya && !startsWithOtherKibCode) return KIB_FALLBACK;
  // Pencocokan kode 01–05: awalan tanpa \b agar kode_aset seperti "02030101001" tetap terbaca.
  const code = s.match(/^(0[1-5])/)?.[1] || s.match(/\b(0[1-5])\b/)?.[1];
  if (code && KIB_BY_CODE[code]) return KIB_BY_CODE[code];
  // Setelah kode 01–05 tidak cocok → baru cek label "aset lainnya"/"ekstrakomptabel".
  if (containsLainnya) return KIB_FALLBACK;
  const letter = s.match(/kib\s*[-.]?\s*([a-e])/i)?.[1];
  if (letter && KIB_BY_LETTER[letter.toLowerCase()]) return KIB_BY_LETTER[letter.toLowerCase()];
  return KIB_FALLBACK;
}

// --- Agregasi berbasis waktu (6 bulan terakhir) ---
type Granularity = "Bulan" | "Kuartal" | "Tahun";
const GRANULARITIES: Granularity[] = ["Bulan", "Kuartal", "Tahun"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function last6Months(): { year: number; month: number }[] {
  const now = new Date();
  const out: { year: number; month: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  return out;
}

function monthIndexOf(iso: string | null | undefined, months: { year: number; month: number }[]): number {
  if (!iso) return -1;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return -1;
  return months.findIndex((m) => m.year === d.getFullYear() && m.month === d.getMonth());
}

function monthlyCount6(rows: any[], getDate: (r: any) => string | null | undefined): number[] {
  const months = last6Months();
  const out = new Array(6).fill(0);
  rows.forEach((r) => {
    const i = monthIndexOf(getDate(r), months);
    if (i >= 0) out[i]++;
  });
  return out;
}

function monthlySum6(rows: any[], getDate: (r: any) => string | null | undefined, getValue: (r: any) => number): number[] {
  const months = last6Months();
  const out = new Array(6).fill(0);
  rows.forEach((r) => {
    const i = monthIndexOf(getDate(r), months);
    if (i >= 0) out[i] += getValue(r) || 0;
  });
  return out;
}

function monthlyUnique6(rows: any[], getDate: (r: any) => string | null | undefined, getKey: (r: any) => string): number[] {
  const months = last6Months();
  const sets: Set<string>[] = months.map(() => new Set<string>());
  rows.forEach((r) => {
    const i = monthIndexOf(getDate(r), months);
    if (i >= 0) sets[i].add(getKey(r));
  });
  return sets.map((s) => s.size);
}

function toSpark(values: number[]): { v: number }[] {
  return values.map((v) => ({ v }));
}

// Deret tren untuk AreaChart sesuai toggle Bulan / Kuartal / Tahun.
function buildTrendSeries(dates: (string | null | undefined)[], g: Granularity): { label: string; value: number }[] {
  const now = new Date();
  const buckets: { key: string; label: string }[] = [];
  if (g === "Bulan") {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_SHORT[d.getMonth()] });
    }
  } else if (g === "Kuartal") {
    const cur = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
    for (let i = 3; i >= 0; i--) {
      const t = cur - i;
      const y = Math.floor(t / 4);
      const q = (t % 4) + 1;
      buckets.push({ key: `${y}-Q${q}`, label: `Q${q} ${y}` });
    }
  } else {
    for (let i = 4; i >= 0; i--) {
      const y = now.getFullYear() - i;
      buckets.push({ key: `${y}`, label: `${y}` });
    }
  }
  const counts = new Map<string, number>();
  buckets.forEach((b) => counts.set(b.key, 0));
  dates.forEach((iso) => {
    if (!iso) return;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return;
    const key =
      g === "Bulan"
        ? `${d.getFullYear()}-${d.getMonth()}`
        : g === "Kuartal"
        ? `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
        : `${d.getFullYear()}`;
    if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
  });
  return buckets.map((b) => ({ label: b.label, value: counts.get(b.key) || 0 }));
}

// Anti NaN% / Infinity%: bila periode sebelumnya 0, tampilkan selisih mentah.
type Delta = { dir: "up" | "down" | "flat"; pct: number | null; delta: number };

function computeDelta(current: number, previous: number): Delta {
  const delta = current - previous;
  if (previous === 0) {
    if (delta === 0) return { dir: "flat", pct: null, delta: 0 };
    return { dir: delta > 0 ? "up" : "down", pct: null, delta };
  }
  const pct = Math.round((delta / previous) * 100);
  return { dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat", pct, delta };
}

function deltaFromSeries(series: number[]): Delta {
  const cur = series[series.length - 1] || 0;
  const prev = series[series.length - 2] || 0;
  return computeDelta(cur, prev);
}

// --- Soft-UI Components ---

const StatCard = ({ label, value, trend, sparklineData, hint, formatDelta, delayClass }: any) => {
  const dir = trend?.dir ?? "flat";
  const trendCls =
    dir === "up" ? "bg-emerald-50 text-emerald-600" : dir === "down" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500";
  const deltaText =
    formatDelta && trend?.pct === null
      ? formatDelta(Math.abs(trend?.delta ?? 0))
      : `${Math.abs(trend?.delta ?? 0)}`;
  const trendText = !trend
    ? ""
    : trend.pct !== null
    ? `${Math.abs(trend.pct)}%`
    : trend.delta !== 0
    ? `${trend.delta > 0 ? "+" : "-"}${deltaText} baru`
    : "0%";
  const sparkColor = dir === "down" ? "#ef4444" : "#10b981";

  return (
    <Card className={`${SOFT_UI_CARD} animate-soft-in soft-card-interactive ${delayClass || ""}`}>
      <CardContent className="p-6 relative">
        <div className="flex justify-between items-start mb-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-slate-700 tracking-tight">{value}</p>
            {hint && <p className="text-[10px] font-medium text-slate-400">{hint}</p>}
          </div>
          {trend && (
            <div className={`flex items-center whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full ${trendCls}`}>
              {dir === "up" ? (
                <ArrowUpRight size={12} className="mr-0.5" />
              ) : dir === "down" ? (
                <ArrowDownRight size={12} className="mr-0.5" />
              ) : (
                <Minus size={12} className="mr-0.5" />
              )}
              {trendText}
            </div>
          )}
        </div>

        {/* Sparkline real-time dari agregasi 6 bulan terakhir */}
        <div className="absolute bottom-0 left-0 w-full h-10 opacity-30 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%" debounce={100}>
            <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Area type="monotone" dataKey="v" stroke={sparkColor} fill={sparkColor} strokeWidth={2} fillOpacity={0.4} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

const AreaChartCard = ({ title, data, dataKey, xKey = "label", color, filter, setFilter }: any) => {
  return (
    <Card className={`${SOFT_UI_CARD} animate-soft-in col-span-1 xl:col-span-2`}>
      <CardHeader className="flex flex-row items-center justify-between pb-0 pt-6 px-6">
        <CardTitle className="text-sm font-bold text-slate-600">{title}</CardTitle>
        <div className="flex bg-slate-50 p-1 rounded-xl">
          {GRANULARITIES.map((f) => (
            <button
              key={f}
              onClick={() => setFilter?.(f)}
              className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${filter === f ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="h-[300px] p-6 pt-2">
        <ResponsiveContainer width="100%" height="100%" debounce={100}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey={xKey}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fontWeight: "bold", fill: "#94a3b8" }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fontWeight: "bold", fill: "#94a3b8" }}
            />
            <Tooltip
              cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "4 4" }}
              contentStyle={{ borderRadius: "1rem", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", fontSize: "12px", fontWeight: "bold" }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={4}
              fill={`url(#grad-${color})`}
              dot={{ r: 4, fill: color, strokeWidth: 2, stroke: "#fff" }}
              activeDot={{ r: 6, strokeWidth: 0 }}
              isAnimationActive={true}
              animationDuration={450}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

const DonutChartCard = ({ title, data, total }: any) => {
  return (
    <Card className={`${SOFT_UI_CARD} animate-soft-in`}>
      <CardHeader>
        <CardTitle className="text-sm font-bold text-slate-600">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <div className="relative w-full h-[220px]">
          <ResponsiveContainer width="100%" height="100%" debounce={100}>
            <PieChart>
              <Pie
                data={data}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
                isAnimationActive={true}
                animationDuration={450}
                animationEasing="ease-out"
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

const ListCard = ({ title, items, renderItem, emptyText }: any) => {
  return (
    <Card className={SOFT_UI_CARD}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold text-slate-600">{title}</CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
          <MoreHorizontal size={16} />
        </Button>
      </CardHeader>
      <CardContent className="p-0 px-6 pb-6">
        {items.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">{emptyText || "Belum ada data."}</div>
        ) : (
          <div className="space-y-4">
            {items.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                {renderItem(item)}
              </div>
            ))}
          </div>
        )}
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
  const isBKAD = role === "staf_bkad";

  // --- Common Queries ---
  const { data: assets = [], isLoading: loadingAssets } = useQuery({
    queryKey: ["assets-overview", companyId, role],
    queryFn: async () => {
      let query = supabase
        .from("assets")
        .select("id, kode_aset, nama_aset, kategori, lokasi_ruangan, kib, custom_data, created_at, company_id");

      if (!isBKAD) query = query.eq("company_id", companyId!);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId || isBKAD,
  });

  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ["reports-overview", companyId, role],
    queryFn: async () => {
      let query = supabase.from("asset_reports").select("id, status, created_at, company_id");
      if (!isBKAD) query = query.eq("company_id", companyId!);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId || isBKAD,
  });

  const { data: archives = [], isLoading: loadingArchives } = useQuery({
    queryKey: ["archives-overview", companyId, role],
    queryFn: async () => {
      let query = supabase
        .from("document_archives")
        .select("id, status_approval, status, created_at, approved_at, tanggal_surat, jenis_kib, total_aset, total_nilai, company_id, data_otorisasi");

      if (!isBKAD) query = query.eq("company_id", companyId!);

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId || isBKAD,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-overview", role],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: isBKAD,
  });

  const isLoading = loadingAssets || loadingReports || loadingArchives;

  if (isLoading) return <DashboardSkeleton />;

  return isBKAD ? (
    <DashboardBKAD assets={assets} reports={reports} archives={archives} companies={companies} />
  ) : (
    <DashboardSKPD assets={assets} reports={reports} archives={archives} />
  );
}

// --- Dashboard SKPD (Operator) ---
function DashboardSKPD({ assets, reports, archives }: any) {
  const [filter, setFilter] = useState<Granularity>("Bulan");

  const stats = useMemo(() => {
    const isReclassified = (a: any) => a.kib === "04 - Aset Lainnya";
    const activeAssets = assets.filter((a: any) => !isReclassified(a));
    const reclassifiedAssets = assets.filter(isReclassified);

    let totalNilai = 0;
    const kondisiCount: any = { "Baik": 0, "Rusak Ringan": 0, "Rusak Berat": 0 };

    assets.forEach((a: any) => {
      totalNilai += nilaiAsetOf(a);
      const k = getKondisi(a.custom_data || {});
      if (kondisiCount[k] !== undefined) kondisiCount[k]++;
      else kondisiCount["Lainnya"] = (kondisiCount["Lainnya"] || 0) + 1;
    });

    const donutData = Object.entries(kondisiCount).map(([name, value]: any) => ({
      name,
      value,
      percent: assets.length ? Math.round((value / assets.length) * 100) : 0,
    }));

    // Sparkline & indikator tren dari agregasi 6 bulan terakhir
    const sparkActive = monthlyCount6(activeAssets, (a: any) => a.created_at);
    const sparkNilai = monthlySum6(assets, (a: any) => a.created_at, nilaiAsetOf);
    const sparkReports = monthlyCount6(reports, (r: any) => r.created_at);

    // Aset yang sah direklasifikasi = item di dalam bundel archives berstatus "disetujui",
    // diukur memakai tanggal pengajuan/persetujuan mutasi (bukan assets.created_at).
    const reklasRows = archives
      .filter((a: any) => a.status_approval === "disetujui")
      .flatMap((a: any) =>
        flattenOtorisasi(a.data_otorisasi).map(() => ({ approved_at: a.approved_at, created_at: a.created_at })),
      );
    const sparkReklas = monthlyCount6(reklasRows, (r: any) => r.approved_at || r.created_at);

    // Tren laporan kendala & kerusakan: hanya dari asset_reports agar sinkron
    // dengan kartu KPI Laporan Kendala (tidak digabung dengan baris asset_audits sensus massal).
    const trendDates = reports.map((r: any) => r.created_at);

    // Status mutasi terakhir: ambil dari bundel archives milik SKPD ini (urut tanggal
    // pengajuan/persetujuan terbaru), lalu pecah item asetnya — agar tanggal yang tampil
    // adalah tanggal mutasi, bukan assets.created_at.
    const sortedArchives = [...archives].sort(
      (a: any, b: any) =>
        new Date(b.approved_at || b.created_at || 0).getTime() -
        new Date(a.approved_at || a.created_at || 0).getTime(),
    );
    const mutasiList: any[] = [];
    for (const doc of sortedArchives) {
      const items = flattenOtorisasi((doc as any).data_otorisasi);
      const docStatus = String((doc as any).status_approval || "");
      for (const it of items) {
        const rawBkadStatus = String(it?._bkad_status || "");
        // Bundel ditolak: item yang ditolak → "Revisi BKAD", sisa item → "Ditolak".
        // Jangan tampilkan badge "Disetujui" pada item di dalam bundel yang ditolak.
        const itemStatus =
          docStatus === "ditolak"
            ? rawBkadStatus === "rejected"
              ? "revisi_bkad"
              : "ditolak"
            : STATUS_FROM_BKAD_ITEM[rawBkadStatus] || docStatus;
        const meta = STATUS_REKON_META[itemStatus];
        if (!meta) continue;
        mutasiList.push({
          namaAset:
            it?.nama_barang || it?.nama_aset || it?.assetData?.nama_barang || it?.assetData?.nama_aset ||
            "Nama tidak tersedia",
          kodeAset:
            it?.kode_barang || it?.kode_aset || it?.assetData?.kode_aset || it?.asset_id || it?.id || "—",
          tanggal: (doc as any).approved_at || (doc as any).created_at || null,
          statusKey: itemStatus,
        });
        if (mutasiList.length >= 5) break;
      }
      if (mutasiList.length >= 5) break;
    }

    return {
      totalActive: activeAssets.length,
      totalNilai,
      reclassified: reclassifiedAssets.length,
      reportsCount: reports.length,
      donutData,
      trendDates,
      mutasiList,
      sparkActive,
      sparkNilai,
      sparkReklas,
      sparkReports,
    };
  }, [assets, reports, archives]);

  const trendData = useMemo(() => buildTrendSeries(stats.trendDates, filter), [stats.trendDates, filter]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Total Aset Aktif" value={stats.totalActive} trend={deltaFromSeries(stats.sparkActive)} sparklineData={toSpark(stats.sparkActive)} delayClass="soft-delay-1" />
        <StatCard label="Nilai Kapital" value={formatRupiah(stats.totalNilai)} trend={deltaFromSeries(stats.sparkNilai)} sparklineData={toSpark(stats.sparkNilai)} formatDelta={formatRupiah} delayClass="soft-delay-2" />
        <StatCard label="Aset Reklasifikasi" value={stats.reclassified} trend={deltaFromSeries(stats.sparkReklas)} sparklineData={toSpark(stats.sparkReklas)} delayClass="soft-delay-3" />
        <StatCard label="Laporan Kendala" value={stats.reportsCount} trend={deltaFromSeries(stats.sparkReports)} sparklineData={toSpark(stats.sparkReports)} delayClass="soft-delay-4" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <AreaChartCard
          title="Tren Laporan Kendala Lapangan"
          data={trendData}
          dataKey="value"
          xKey="label"
          color="#0ea5e9"
          filter={filter}
          setFilter={setFilter}
        />
        <DonutChartCard title="Kondisi Aset" data={stats.donutData} total={assets.length} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ListCard
          title="Status Mutasi Terakhir"
          items={stats.mutasiList}
          emptyText="Belum ada aset yang masuk proses mutasi/reklasifikasi."
          renderItem={(item: any) => {
            const meta = STATUS_REKON_META[String(item.statusKey || "")];
            return (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-slate-50 rounded-lg text-slate-400 shrink-0">
                    <History size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate max-w-[220px]">{item.namaAset}</p>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">
                      {item.kodeAset} · {item.tanggal ? new Date(item.tanggal).toLocaleDateString("id-ID") : "—"}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-none shrink-0 ${meta?.cls || "bg-slate-100 text-slate-500"}`}>
                  {meta?.label || "—"}
                </Badge>
              </>
            );
          }}
        />
      </div>
    </div>
  );
}

// --- Dashboard BKAD (Konsolidator) ---
function DashboardBKAD({ assets, reports, archives, companies }: any) {
  const [filter, setFilter] = useState<Granularity>("Bulan");

  const stats = useMemo(() => {
    const isReclassified = (a: any) => a.kib === "04 - Aset Lainnya";
    const reclassifiedAssets = assets.filter(isReclassified);

    const nonDraft = archives.filter((a: any) => a.status_approval !== "draft");
    const approved = archives.filter((a: any) => a.status_approval === "disetujui");
    const queueDocs = archives.filter((a: any) => a.status_approval === "menunggu_bkad");
    const queue = queueDocs.length;
    const mutationValue = approved.reduce((s: number, a: any) => s + (a.total_nilai || 0), 0);

    // KPI SKPD melapor: bulan berjalan, fallback total SKPD aktif melapor
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const reportingThisMonth = new Set(
      nonDraft
        .filter((a: any) => a.created_at && new Date(a.created_at).getTime() >= monthStart)
        .map((a: any) => a.company_id)
    );
    let skpdReporting = reportingThisMonth.size;
    let skpdReportingHint = "Bulan berjalan";
    if (skpdReporting === 0) {
      skpdReporting = new Set(nonDraft.map((a: any) => a.company_id)).size;
      skpdReportingHint = skpdReporting > 0 ? "Total SKPD aktif melapor" : "Belum ada SKPD melapor";
    }

    // Komposisi mutasi per KIB (asal KIB dari snapshot bundel yang disetujui)
    const kibMap: Record<string, number> = {};
    const bump = (label: string) => { kibMap[label] = (kibMap[label] || 0) + 1; };
    if (approved.length > 0) {
      approved.forEach((doc: any) => {
        flattenOtorisasi(doc.data_otorisasi).forEach((it: any) => {
          const raw = it?.kib || it?.assetData?.kib || it?.jenis_kib || doc.jenis_kib || it?.kode_barang || it?.kode_aset || "";
          bump(normalizeKibLabel(String(raw)));
        });
      });
    } else {
      assets
        .filter((a: any) => String((a.custom_data as any)?.status_rekon || "") === "disetujui")
        .forEach((a: any) => {
          const cd = typeof a.custom_data === "object" && a.custom_data ? (a.custom_data as any) : {};
          const raw = cd["OriginalKIB"] || cd["kib_asal"] || cd["KIB Asal"] || a.kib || a.kode_aset || "";
          bump(normalizeKibLabel(String(raw)));
        });
    }
    const donutTotal = Object.values(kibMap).reduce((s, n) => s + n, 0);
    const donutData = Object.entries(kibMap).map(([name, value]) => ({
      name,
      value,
      percent: donutTotal ? Math.round((value / donutTotal) * 100) : 0,
    }));

    // Tren pengajuan mutasi daerah (bundel non-draft)
    const trendDates = nonDraft.map((a: any) => a.tanggal_surat || a.created_at);

    // Top 5 SKPD pengaju mutasi — join document_archives x companies
    const nameById = new Map<string, string>();
    companies.forEach((c: any) => nameById.set(c.id, c.name));
    const agg = new Map<string, { docs: number; aset: number }>();
    nonDraft.forEach((a: any) => {
      const cur = agg.get(a.company_id) || { docs: 0, aset: 0 };
      cur.docs += 1;
      cur.aset += a.total_aset || 0;
      agg.set(a.company_id, cur);
    });
    const ranked = Array.from(agg.entries())
      .map(([cid, v]) => ({ name: nameById.get(cid) || "SKPD Tanpa Nama", count: v.docs, aset: v.aset }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const maxCount = ranked[0]?.count || 0;
    const topSKPD = ranked.map((r) => ({ ...r, progress: maxCount ? Math.round((r.count / maxCount) * 100) : 0 }));

    // Sparkline dinamis
    const sparkQueue = monthlyCount6(queueDocs, (a: any) => a.created_at);
    // Aset sah direklasifikasi dihitung dari item bundel "disetujui" memakai tanggal mutasi.
    // Tanggal diparsing SEKALI per bundel (bukan per item) agar new Date() tidak diulang
    // di dalam loop bertingkat — tiap item hanya menambah hitungan sejumlah asetnya.
    const reklasMonths = last6Months();
    const sparkReklas = new Array(6).fill(0);
    approved.forEach((a: any) => {
      const items = flattenOtorisasi(a.data_otorisasi);
      if (!items.length) return;
      const i = monthIndexOf(a.approved_at || a.created_at, reklasMonths);
      if (i >= 0) sparkReklas[i] += items.length;
    });
    const sparkMutasi = monthlySum6(approved, (a: any) => a.approved_at || a.created_at, (a: any) => a.total_nilai || 0);
    const sparkSkpd = monthlyUnique6(nonDraft, (a: any) => a.created_at, (a: any) => String(a.company_id || ""));

    return {
      queue,
      reclassified: reclassifiedAssets.length,
      mutationValue,
      skpdReporting,
      skpdReportingHint,
      donutData,
      donutTotal,
      trendDates,
      topSKPD,
      sparkQueue,
      sparkReklas,
      sparkMutasi,
      sparkSkpd,
    };
  }, [assets, reports, archives, companies]);

  const trendData = useMemo(() => buildTrendSeries(stats.trendDates, filter), [stats.trendDates, filter]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard label="Antrean Verifikasi" value={stats.queue} trend={deltaFromSeries(stats.sparkQueue)} sparklineData={toSpark(stats.sparkQueue)} delayClass="soft-delay-1" />
        <StatCard label="Aset Reklasifikasi" value={stats.reclassified} trend={deltaFromSeries(stats.sparkReklas)} sparklineData={toSpark(stats.sparkReklas)} delayClass="soft-delay-2" />
        <StatCard label="Nilai Mutasi" value={formatRupiah(stats.mutationValue)} trend={deltaFromSeries(stats.sparkMutasi)} sparklineData={toSpark(stats.sparkMutasi)} formatDelta={formatRupiah} delayClass="soft-delay-3" />
        <StatCard label="SKPD Melapor" value={stats.skpdReporting} trend={deltaFromSeries(stats.sparkSkpd)} sparklineData={toSpark(stats.sparkSkpd)} hint={stats.skpdReportingHint} delayClass="soft-delay-4" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <AreaChartCard
          title="Tren Pengajuan Mutasi Daerah"
          data={trendData}
          dataKey="value"
          xKey="label"
          color="#8b5cf6"
          filter={filter}
          setFilter={setFilter}
        />
        <DonutChartCard title="Komposisi Mutasi per KIB" data={stats.donutData} total={stats.donutTotal} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ListCard
          title="Top 5 SKPD Pengaju Mutasi"
          items={stats.topSKPD}
          emptyText="Belum ada data pengajuan mutasi dari SKPD"
          renderItem={(item: any) => (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-slate-50 rounded-lg text-slate-400 shrink-0">
                  <Building2 size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700 truncate max-w-[200px]">{item.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">
                    {item.count} Dokumen · {item.aset} Aset
                  </p>
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
