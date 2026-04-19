import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CodedOption {
  label: string;
  code: string;
}

export interface TreeNode {
  label: string;
  code: string;
  children?: TreeNode[];
}

export interface CustomColumn {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "coded_dropdown";
  options?: CodedOption[];
  dropdown_levels?: string[];
  options_tree?: TreeNode[];
}

export interface CodeBlock {
  id: string;
  label: string;
  source: 'divisi' | 'kib' | 'custom_column';
  columnName?: string;
  isVisible: boolean;
  isFixed: boolean;
}

export interface CodeConfiguration {
  separator: '-' | '.' | '/';
  blocks: CodeBlock[];
}

export const DEFAULT_CODE_CONFIG: CodeConfiguration = {
  separator: '.',
  blocks: [
    { id: 'divisi', label: 'Kode Divisi', source: 'divisi', isVisible: true, isFixed: false },
    { id: 'kib', label: 'Kode KIB', source: 'kib', isVisible: true, isFixed: false },
    { id: 'serial', label: 'Nomor Urut', source: 'custom_column', isVisible: true, isFixed: true },
  ],
};

export interface MasterItem {
  id: string;
  label: string;
  code: string;
  code_config?: CodeConfiguration;
}

/** KIB-keyed map: { "KIB A": [...columns], "KIB B": [...columns] } */
export type KibColumnsMap = Record<string, CustomColumn[]>;

interface CustomColumnsContextType {
  /** @deprecated – use kibColumns instead */
  columns: CustomColumn[];
  kibColumns: KibColumnsMap;
  setKibColumns: (update: KibColumnsMap | ((prev: KibColumnsMap) => KibColumnsMap)) => void;
  refreshColumns: () => Promise<void>;
  getColumnsForKib: (kibLabel: string) => CustomColumn[];
  getCodeConfigForKib: (kibLabel: string) => CodeConfiguration;
  masterDivisi: MasterItem[];
  setMasterDivisi: (items: MasterItem[] | ((prev: MasterItem[]) => MasterItem[])) => void;
  masterKib: MasterItem[];
  setMasterKib: (items: MasterItem[] | ((prev: MasterItem[]) => MasterItem[])) => void;
  settingsPin: string;
  setSettingsPin: (pin: string) => void;
  isLoading: boolean;
}

const CustomColumnsContext = createContext<CustomColumnsContextType | undefined>(undefined);

export function CustomColumnsProvider({ children }: { children: ReactNode }) {
  const { companyId } = useAuth();
  const [kibColumns, setKibColumnsState] = useState<KibColumnsMap>({});
  const [masterDivisi, setMasterDivisiState] = useState<MasterItem[]>([]);
  const [masterKib, setMasterKibState] = useState<MasterItem[]>([]);
  const [settingsPin, setSettingsPin] = useState("123456");
  const [isLoading, setIsLoading] = useState(true);

  const loadConfigs = async () => {
    if (!companyId) return;
    const { data: colData } = await supabase
      .from("asset_column_configs")
      .select("*")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    const nextKibColumns: KibColumnsMap = {};
    if (colData) {
      for (const row of colData) {
        if (!nextKibColumns[row.kategori_kib]) {
          nextKibColumns[row.kategori_kib] = [];
        }
        const opts = (row.options as any) || {};
        nextKibColumns[row.kategori_kib].push({
          id: row.id,
          name: row.column_name,
          type: row.column_type as any,
          options: opts.options,
          dropdown_levels: opts.dropdown_levels,
          options_tree: opts.options_tree
        });
      }
    }
    setKibColumnsState(nextKibColumns);
  };

  const load = async () => {
    if (!companyId) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("companies")
      .select("master_divisi, master_kib, settings_pin")
      .eq("id", companyId)
      .maybeSingle();

    if (data?.master_divisi && Array.isArray(data.master_divisi)) {
      setMasterDivisiState(data.master_divisi as unknown as MasterItem[]);
    } else {
      setMasterDivisiState([]);
    }
    if (data?.master_kib && Array.isArray(data.master_kib)) {
      setMasterKibState(data.master_kib as unknown as MasterItem[]);
    } else {
      setMasterKibState([]);
    }
    setSettingsPin((data?.settings_pin as string) || "123456");

    await loadConfigs();
    setIsLoading(false);
  };

  useEffect(() => {
    if (!companyId) {
      setKibColumnsState({});
      setMasterDivisiState([]);
      setMasterKibState([]);
      setIsLoading(false);
      return;
    }
    load();
  }, [companyId]);

  const persistField = (field: string, value: unknown) => {
    if (companyId) {
      supabase.from("companies").update({ [field]: value } as any).eq("id", companyId).then();
    }
  };

  const setKibColumns = (update: KibColumnsMap | ((prev: KibColumnsMap) => KibColumnsMap)) => {
    setKibColumnsState(update);
    // Note: To persist sorting or changes, the component firing this update
    // should also fire the DB mutation directly.
  };

  const getColumnsForKib = (kibLabel: string): CustomColumn[] => {
    return kibColumns[kibLabel] || [];
  };

  /** Get the code configuration for a specific KIB. Falls back to default if not configured. */
  const getCodeConfigForKib = (kibLabel: string): CodeConfiguration => {
    const kibItem = masterKib.find((k) => k.label === kibLabel);
    return kibItem?.code_config || DEFAULT_CODE_CONFIG;
  };

  // Backward compat: flatten all columns
  const columns = Object.values(kibColumns).flat();

  const setMasterDivisi = (update: MasterItem[] | ((prev: MasterItem[]) => MasterItem[])) => {
    setMasterDivisiState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      persistField("master_divisi", next);
      return next;
    });
  };

  const setMasterKib = (update: MasterItem[] | ((prev: MasterItem[]) => MasterItem[])) => {
    // Evaluate next state outside to avoid nested setState updaters
    const next = typeof update === "function" ? update(masterKib) : update;
    
    const deletedLabels: string[] = [];
    const renamedItems: { oldLabel: string; newLabel: string }[] = [];
    
    for (const p of masterKib) {
      const matchingNext = next.find((n) => n.id === p.id);
      if (!matchingNext) {
        deletedLabels.push(p.label); // KIB was deleted
      } else if (matchingNext.label !== p.label) {
        renamedItems.push({ oldLabel: p.label, newLabel: matchingNext.label }); // KIB was renamed
      }
    }

    if (deletedLabels.length > 0 || renamedItems.length > 0) {
      const nextCols = { ...kibColumns };
      let changed = false;

      // Process deletions
      for (const label of deletedLabels) {
        if (nextCols[label]) {
          delete nextCols[label];
          changed = true;
        }
      }

      // Process renames
      for (const rename of renamedItems) {
        if (nextCols[rename.oldLabel]) {
          nextCols[rename.newLabel] = nextCols[rename.oldLabel];
          delete nextCols[rename.oldLabel];
          changed = true;
        }
      }

      if (changed && companyId) {
        // Save Master KIB synchronously (columns deleted manually or lazily if needed)
        supabase.from("companies").update({
          master_kib: next as any
        }).eq("id", companyId).then();
        
        // Update local states concurrently
        setKibColumnsState(nextCols);
        setMasterKibState(next);
        return;
      }
    }
    
    // Normal update (no schema changes needed)
    persistField("master_kib", next);
    setMasterKibState(next);
  };

  const updateSettingsPin = (pin: string) => {
    setSettingsPin(pin);
    persistField("settings_pin", pin);
  };

  return (
    <CustomColumnsContext.Provider value={{ columns, kibColumns, setKibColumns, getColumnsForKib, getCodeConfigForKib, masterDivisi, setMasterDivisi, masterKib, setMasterKib, settingsPin, setSettingsPin: updateSettingsPin, isLoading, refreshColumns: loadConfigs }}>
      {children}
    </CustomColumnsContext.Provider>
  );
}

export function useCustomColumns() {
  const ctx = useContext(CustomColumnsContext);
  if (!ctx) throw new Error("useCustomColumns must be used within CustomColumnsProvider");
  return ctx;
}
