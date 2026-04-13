// Centralized asset condition/status utilities
export const KONDISI_MAP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  "Baik": { label: "Baik", color: "text-chart-1", bg: "bg-chart-1/10", border: "border-chart-1/30" },
  "Rusak Ringan": { label: "Rusak Ringan", color: "text-warning", bg: "bg-warning/10", border: "border-warning/30" },
  "Rusak Berat": { label: "Rusak Berat", color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30" },
  "Dalam Perbaikan": { label: "Dalam Perbaikan", color: "text-chart-3", bg: "bg-chart-3/10", border: "border-chart-3/30" },
  "Usul Hapus": { label: "Usul Hapus", color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30" },
  "Dihapuskan": { label: "Dihapuskan", color: "text-muted-foreground", bg: "bg-muted", border: "border-border" },
};

export function getKondisi(customData: Record<string, unknown> | null): string {
  if (!customData) return "Baik";
  const kondisi = customData["Kondisi"] ?? customData["kondisi"] ?? customData["status_aset"];
  return typeof kondisi === "string" && kondisi ? kondisi : "Baik";
}

export function getKondisiStyle(kondisi: string) {
  return KONDISI_MAP[kondisi] ?? { label: kondisi, color: "text-muted-foreground", bg: "bg-muted", border: "border-border" };
}
