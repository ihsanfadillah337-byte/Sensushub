import {
  Document,
  Page,
  View,
  Text,
  Image as PDFImage,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Asset } from "@/types/supabase";
import { getSmartLocation } from "@/lib/smartLocation";

const s = StyleSheet.create({
  pageThermal: { width: 283.46, height: 141.73, padding: 0 },
  wrapperThermal: { flex: 1, border: "1.5pt solid #1e293b", margin: 6 },
  pageA4: { padding: 15 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  wrapperA4: { 
    width: "48%", 
    height: 145, 
    border: "0.5pt dashed #94a3b8", 
    padding: 3, 
    marginBottom: 5 
  },
  innerA4: { flex: 1, border: "1.5pt solid #1e293b" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1.5pt solid #1e293b",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  headerLeft: { fontSize: 7, fontWeight: "bold", color: "#0f172a", letterSpacing: 0.5 },
  headerRight: { fontSize: 6.5, color: "#334155", textAlign: "right" },
  body: { flexDirection: "row", flex: 1, padding: 4, gap: 4 },
  colLeft: { width: "25%", alignItems: "center", justifyContent: "center", gap: 3 },
  qr: { width: 48, height: 48 },
  yearText: { fontSize: 6, fontWeight: "bold", color: "#0f172a", textAlign: "center" },
  colRight: { width: "75%", flexDirection: "column", justifyContent: "center", paddingLeft: 2, gap: 1.5 },
  row: { flexDirection: "row", gap: 0, alignItems: "flex-start" },
  labelCell: { fontSize: 6, color: "#64748b", width: 50, flexShrink: 0 },
  sep: { fontSize: 6, color: "#64748b", width: 6, flexShrink: 0 },
  valCell: { fontSize: 6, color: "#0f172a", flex: 1, flexWrap: "wrap", lineHeight: 1.2 },
});

type LabelAsset = Pick<Asset, "id" | "kode_aset" | "nama_aset" | "kategori"> & {
  kode_divisi?: string | null;
  kib?: string | null;
  custom_data?: Record<string, unknown>;
};

interface LabelPDFProps {
  assets: LabelAsset[];
  companyName?: string;
  baseUrl?: string;
  mode?: "thermal" | "a4";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.labelCell}>{label}</Text>
      <Text style={s.sep}>:</Text>
      <Text style={s.valCell}>{value}</Text>
    </View>
  );
}

function getMerkInfo(cd: Record<string, unknown> | undefined): string {
  if (!cd) return "-";
  const m = cd["Merk"] ? String(cd["Merk"]) : "";
  const np = cd["Nomor Polisi"] ? String(cd["Nomor Polisi"]) : "";
  return m || np || "-";
}

function LabelContent({ asset, baseUrl, companyName, year }: { asset: LabelAsset, baseUrl: string, companyName: string, year: string }) {
  const cd = (asset as any).custom_data as Record<string, unknown> | undefined;
  const lokasi = getSmartLocation(cd, asset.kode_divisi);
  const merkInfo = getMerkInfo(cd);

  return (
    <>
      <View style={s.header}>
        <Text style={s.headerLeft}>SENSUS ASET</Text>
        <Text style={s.headerRight} numberOfLines={1}>{companyName}</Text>
      </View>
      <View style={s.body}>
        <View style={s.colLeft}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <PDFImage
            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=1&data=${baseUrl}/scan/${asset.id}`}
            style={s.qr}
          />
          <Text style={s.yearText}>TAHUN {year}</Text>
        </View>
        <View style={s.colRight}>
          <DetailRow label="Satuan Kerja" value={asset.kode_divisi || "-"} />
          <DetailRow label="KIB / Kategori" value={asset.kib || "-"} />
          <DetailRow label="Kode Aset" value={asset.kode_aset || "-"} />
          <DetailRow label="Nama Aset" value={asset.nama_aset || "-"} />
          <DetailRow label="Lokasi" value={lokasi} />
          <DetailRow label="Merk / Info" value={merkInfo} />
        </View>
      </View>
    </>
  );
}

export default function LabelPDF({
  assets,
  companyName = "Instansi Saya",
  baseUrl = "https://app.com",
  mode = "thermal",
}: LabelPDFProps) {
  const year = new Date().getFullYear().toString();

  // Group by KIB
  const grouped: Record<string, LabelAsset[]> = {};
  assets.forEach((a) => {
    const kib = a.kib || "Tanpa Kategori";
    if (!grouped[kib]) grouped[kib] = [];
    grouped[kib].push(a);
  });

  // Sort KIB categories alphabetically
  const sortedKibs = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  
  // Sort assets within each KIB by kode_aset
  sortedKibs.forEach((kib) => {
    grouped[kib].sort((a, b) => (a.kode_aset || "").localeCompare(b.kode_aset || ""));
  });

  return (
    <Document title={`Label-Aset-${mode.toUpperCase()}`} author={companyName}>
      {mode === "thermal" && sortedKibs.flatMap(kib => grouped[kib]).map((asset) => (
        <Page key={asset.id} size={[283.46, 141.73]} style={s.pageThermal}>
          <View style={s.wrapperThermal}>
            <LabelContent asset={asset} baseUrl={baseUrl} companyName={companyName} year={year} />
          </View>
        </Page>
      ))}

      {mode === "a4" && sortedKibs.map((kib) => {
        const items = grouped[kib];
        const chunks: LabelAsset[][] = [];
        for (let i = 0; i < items.length; i += 10) {
          chunks.push(items.slice(i, i + 10));
        }

        return chunks.map((chunk, idx) => (
          <Page key={`page-${kib}-${idx}`} size="A4" orientation="portrait" style={s.pageA4}>
            <View style={s.grid}>
              {chunk.map((asset) => (
                <View key={asset.id} style={s.wrapperA4}>
                  <View style={s.innerA4}>
                    <LabelContent asset={asset} baseUrl={baseUrl} companyName={companyName} year={year} />
                  </View>
                </View>
              ))}
            </View>
          </Page>
        ));
      })}
    </Document>
  );
}
