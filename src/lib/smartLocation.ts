// Shared Smart Location resolver — satu sumber kebenaran untuk seluruh aplikasi.
// Prioritas: custom_data.Ruangan → custom_data.Lokasi → custom_data.Alamat → kode_divisi → "-"
// Jika ada field "Lantai", digabungkan sebagai suffix tanpa duplikasi kata "Lantai".

export function getSmartLocation(
  customData: Record<string, unknown> | null | undefined,
  kodeDivisi?: string | null
): string {
  if (!customData) return kodeDivisi || "-";

  const ruangan = customData["Ruangan"] ? String(customData["Ruangan"]) : "";
  const lokasi  = customData["Lokasi"]  ? String(customData["Lokasi"])  : "";
  const alamat  = customData["Alamat"]  ? String(customData["Alamat"])  : "";
  const lantai  = customData["Lantai"]  ? String(customData["Lantai"])  : "";

  const base = ruangan || lokasi || alamat || kodeDivisi || "-";

  if (lantai && base !== "-") {
    // Cegah duplikasi "Lantai Lantai 2" — jika nilai sudah mengandung prefix "Lantai", langsung pakai
    const lantaiStr = /^lantai\s/i.test(lantai) ? lantai : `Lantai ${lantai}`;
    return `${base} - ${lantaiStr}`;
  }

  return base;
}
