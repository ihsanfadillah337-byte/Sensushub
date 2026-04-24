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
  type: "text" | "number" | "date" | "coded_dropdown" | "dropdown";
  options?: CodedOption[];
  simple_options?: string[];
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

  useEffect(() => {
    if (!companyId) {
      setKibColumnsState({});
      setMasterDivisiState([]);
      setMasterKibState([]);
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from("companies")
        .select("custom_column_schema, master_divisi, master_kib, settings_pin")
        .eq("id", companyId)
        .maybeSingle();

      if (data?.custom_column_schema) {
        if (Array.isArray(data.custom_column_schema)) {
          setKibColumnsState({ __global__: data.custom_column_schema as unknown as CustomColumn[] });
        } else if (typeof data.custom_column_schema === "object") {
          const schema = data.custom_column_schema as Record<string, unknown>;
          // Filter out legacy __code_config__ if present (migrated to per-KIB)
          const { __code_config__, ...kibMap } = schema;
          setKibColumnsState(kibMap as unknown as KibColumnsMap);
        } else {
          setKibColumnsState({});
        }
      } else {
        setKibColumnsState({});
      }

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
      setIsLoading(false);
    };
    load();
  }, [companyId]);

  const persistField = (field: string, value: unknown) => {
    if (companyId) {
      supabase.from("companies").update({ [field]: value } as any).eq("id", companyId).then();
    }
  };

  const setKibColumns = (update: KibColumnsMap | ((prev: KibColumnsMap) => KibColumnsMap)) => {
    setKibColumnsState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      persistField("custom_column_schema", next);
      return next;
    });
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
        // Save both synchronously
        supabase.from("companies").update({
          master_kib: next as any,
          custom_column_schema: nextCols as any
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
    <CustomColumnsContext.Provider value={{ columns, kibColumns, setKibColumns, getColumnsForKib, getCodeConfigForKib, masterDivisi, setMasterDivisi, masterKib, setMasterKib, settingsPin, setSettingsPin: updateSettingsPin, isLoading }}>
      {children}
    </CustomColumnsContext.Provider>
  );
}

export function useCustomColumns() {
  const ctx = useContext(CustomColumnsContext);
  if (!ctx) throw new Error("useCustomColumns must be used within CustomColumnsProvider");
  return ctx;
}
