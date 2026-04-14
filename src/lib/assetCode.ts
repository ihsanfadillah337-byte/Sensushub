// Asset code generation utility — builds kode_aset from CodeConfiguration
import type { CodeConfiguration } from "@/contexts/CustomColumnsContext";

/**
 * Build a value map from form selections for use with buildAssetCode.
 * Keys: 'divisi', 'kib', or custom column names.
 */
export type CodeValueMap = Record<string, string>;

/**
 * Build the code prefix (all visible blocks EXCEPT serial number).
 * Used for DB prefix matching when calculating the next serial number.
 */
export function buildCodePrefix(
  config: CodeConfiguration,
  valueMap: CodeValueMap
): string {
  const parts: string[] = [];

  for (const block of config.blocks) {
    if (block.isFixed) continue; // Skip serial number
    if (!block.isVisible) continue; // Unseen Code — skip
    const key = block.source === 'divisi' ? 'divisi'
              : block.source === 'kib' ? 'kib'
              : block.columnName || block.id;
    const val = valueMap[key];
    if (val) parts.push(val);
  }

  return parts.join(config.separator);
}

/**
 * Build the complete asset code with serial number.
 * Example: IT.02.LT1.001
 */
export function buildAssetCode(
  config: CodeConfiguration,
  valueMap: CodeValueMap,
  serialNumber: number,
  serialPadding: number = 3
): string {
  const prefix = buildCodePrefix(config, valueMap);
  const serial = String(serialNumber).padStart(serialPadding, "0");

  if (prefix) {
    return `${prefix}${config.separator}${serial}`;
  }
  return serial;
}

/**
 * Build a preview string with placeholder values for the code builder UI.
 * Uses sample values to show the format.
 */
export function buildCodePreview(
  config: CodeConfiguration,
  sampleMap: CodeValueMap
): string {
  const parts: string[] = [];

  for (const block of config.blocks) {
    if (!block.isVisible) continue;
    if (block.isFixed) {
      parts.push("001");
      continue;
    }
    const key = block.source === 'divisi' ? 'divisi'
              : block.source === 'kib' ? 'kib'
              : block.columnName || block.id;
    const val = sampleMap[key] || '??';
    parts.push(val);
  }

  return parts.length > 0 ? parts.join(config.separator) : "—";
}
