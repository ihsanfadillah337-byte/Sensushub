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
  page: { width: 250, height: 130, padding: 0 },
  wrapper: { flex: 1, border: "1.5pt solid #1e293b", margin: 4 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1.5pt solid #1e293b",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  headerLeft: { fontSize: 6, fontWeight: "bold", color: "#0f172a", letterSpacing: 0.5 },
  headerRight: { fontSize: 5.5, color: "#334155", textAlign: "right" },
  body: { flexDirection: "row", flex: 1, padding: 3, gap: 3 },
  colLeft: { width: "28%", alignItems: "center", justifyContent: "center", gap: 2 },
  qr: { width: 44, height: 44 },
  yearText: { fontSize: 5.5, fontWeight: "bold", color: "#0f172a", textAlign: "center" },
  colRight: { width: "72%", flexDirection: "column", justifyContent: "center", paddingLeft: 2, gap: 1.5 },
  row: { flexDirection: "row", gap: 0 },
  labelCell: { fontSize: 5.5, color: "#64748b", width: 46 },
  sep: { fontSize: 5.5, color: "#64748b", width: 6 },
  valCell: { fontSize: 5.5, color: "#0f172a", flex: 1 },
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

// getSmartLocation is imported from @/lib/smartLocation

function getMerkInfo(cd: Record<string, unknown> | undefined): string {
  if (!cd) return "-";
  const m = cd["Merk"] ? String(cd["Merk"]) : "";
  const np = cd["Nomor Polisi"] ? String(cd["Nomor Polisi"]) : "";
  return m || np || "-";
}

export default function LabelPDF({
  assets,
  companyName = "Instansi Saya",
  baseUrl = "https://app.com",
}: LabelPDFProps) {
  const year = new Date().getFullYear().toString();

  return (
    <Document title="Label-Aset-BMD" author={companyName}>
      {assets.map((asset) => {
        const cd = (asset as any).custom_data as Record<string, unknown> | undefined;
        const lokasi = getSmartLocation(cd, asset.kode_divisi);
        const merkInfo = getMerkInfo(cd);

        return (
          <Page key={asset.id} size={[250, 130]} style={s.page}>
            <View style={s.wrapper}>
              <View style={s.header}>
                <Text style={s.headerLeft}>SENSUS ASET</Text>
                <Text style={s.headerRight}>{companyName}</Text>
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
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
