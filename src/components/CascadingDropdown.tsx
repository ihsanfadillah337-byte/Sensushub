import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { CustomColumn, TreeNode } from "@/contexts/CustomColumnsContext";

// Separator used to join codes in stored value: "01>02>03"
const VALUE_SEP = ">";

/**
 * Parse stored value ("01>02>03") into array of codes per level.
 */
function parseValue(val: string | undefined): string[] {
  if (!val) return [];
  return val.split(VALUE_SEP).filter(Boolean);
}

/**
 * Find a node in the tree by code at a given depth.
 */
function findNode(nodes: TreeNode[], code: string): TreeNode | undefined {
  return nodes.find((n) => n.code === code);
}

/**
 * Resolve the chain of selected nodes from the tree.
 */
function resolveChain(tree: TreeNode[], codes: string[]): TreeNode[] {
  const chain: TreeNode[] = [];
  let currentNodes = tree;
  for (const code of codes) {
    const found = findNode(currentNodes, code);
    if (!found) break;
    chain.push(found);
    currentNodes = found.children || [];
  }
  return chain;
}

/**
 * Get the concatenated code string for the Code Builder.
 * Uses sub-separator "." between level codes.
 * e.g. codes=["01","02","03"] → "01.02.03"
 */
export function getTreeCodeValue(value: string | undefined): string {
  const codes = parseValue(value);
  return codes.join(".");
}

/**
 * Get the display label chain for storage.
 * e.g. "Alat Besar > Besar Darat > Traktor"
 */
export function getTreeLabelChain(
  column: CustomColumn,
  value: string | undefined
): string {
  if (!value || !column.options_tree) return "";
  const codes = parseValue(value);
  const chain = resolveChain(column.options_tree, codes);
  return chain.map((n) => n.label).join(" > ");
}

/* ─── Main Component ─── */
interface CascadingDropdownProps {
  column: CustomColumn;
  value: string;
  onChange: (val: string) => void;
}

export default function CascadingDropdown({ column, value, onChange }: CascadingDropdownProps) {
  const levels = column.dropdown_levels || ["Level 1"];
  const tree = column.options_tree || [];
  const selectedCodes = useMemo(() => parseValue(value), [value]);

  // Resolve chain to determine which levels are available
  const chain = useMemo(() => resolveChain(tree, selectedCodes), [tree, selectedCodes]);

  // How many dropdowns to render: selected ones + 1 if more children available
  const visibleLevels = useMemo(() => {
    const count = chain.length;
    // If last selected has children and there's a next level, show one more
    if (count > 0 && chain[count - 1].children && chain[count - 1].children!.length > 0 && count < levels.length) {
      return count + 1;
    }
    if (count === 0) return 1; // Always show at least first level
    // If last selected has no children, show up to current count
    return count;
  }, [chain, levels.length]);

  const handleLevelChange = (levelIndex: number, code: string) => {
    // Build new codes: keep codes up to this level, set this level, clear deeper
    const newCodes = selectedCodes.slice(0, levelIndex);
    newCodes[levelIndex] = code;
    onChange(newCodes.join(VALUE_SEP));
  };

  const getOptionsForLevel = (levelIndex: number): TreeNode[] => {
    if (levelIndex === 0) return tree;
    const parent = chain[levelIndex - 1];
    return parent?.children || [];
  };

  return (
    <div className="space-y-2">
      {Array.from({ length: visibleLevels }, (_, levelIdx) => {
        const options = getOptionsForLevel(levelIdx);
        if (options.length === 0) return null;

        return (
          <div key={levelIdx} className="space-y-1" style={{ paddingLeft: `${levelIdx * 12}px` }}>
            <Label className="text-[10px] font-medium text-muted-foreground/70">
              {levels[levelIdx] || `Level ${levelIdx + 1}`}
            </Label>
            <Select
              value={selectedCodes[levelIdx] || ""}
              onValueChange={(v) => handleLevelChange(levelIdx, v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={`Pilih ${levels[levelIdx] || "opsi"}...`} />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.code} value={opt.code}>
                    <span className="font-mono text-muted-foreground mr-2">{opt.code}</span>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
