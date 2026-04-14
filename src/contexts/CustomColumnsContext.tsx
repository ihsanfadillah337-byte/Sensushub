import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CodedOption {
  label: string;
  code: string;
}

export interface CustomColumn {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "coded_dropdown";
  options?: CodedOption[];
}

export interface MasterItem {
  id: string;
  label: string;
  code: string;
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

const DEFAULT_CODE_CONFIG: CodeConfiguration = {
  separator: '.',
  blocks: [
    { id: 'divisi', label: 'Kode Divisi', source: 'divisi', isVisible: true, isFixed: false },
    { id: 'kib', label: 'Kode KIB', source: 'kib', isVisible: true, isFixed: false },
    { id: 'serial', label: 'Nomor Urut', source: 'custom_column', isVisible: true, isFixed: true },
  ],
};

/** KIB-keyed map: { "KIB A": [...columns], "KIB B": [...columns] } */
export type KibColumnsMap = Record<string, CustomColumn[]>;

interface CustomColumnsContextType {
  /** @deprecated – use kibColumns instead */
  columns: CustomColumn[];
  kibColumns: KibColumnsMap;
  setKibColumns: (update: KibColumnsMap | ((prev: KibColumnsMap) => KibColumnsMap)) => void;
  getColumnsForKib: (kibLabel: string) => CustomColumn[];
  codeConfig: CodeConfiguration;
  setCodeConfig: (update: CodeConfiguration | ((prev: CodeConfiguration) => CodeConfiguration)) => void;
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
  const [codeConfig, setCodeConfigState] = useState<CodeConfiguration>(DEFAULT_CODE_CONFIG);
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

      // Migrate: if stored as array (old format), convert to map keyed by "__global__"
      if (data?.custom_column_schema) {
        if (Array.isArray(data.custom_column_schema)) {
          // Old format – wrap in global key
          setKibColumnsState({ __global__: data.custom_column_schema as unknown as CustomColumn[] });
        } else if (typeof data.custom_column_schema === "object") {
          const schema = data.custom_column_schema as Record<string, unknown>;
          // Extract code config if present
          if (schema.__code_config__ && typeof schema.__code_config__ === 'object') {
            setCodeConfigState(schema.__code_config__ as unknown as CodeConfiguration);
          }
          // Filter out __code_config__ from kib columns map
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

  const persistSchema = (kibMap: KibColumnsMap, cc: CodeConfiguration) => {
    if (companyId) {
      const merged = { ...kibMap, __code_config__: cc };
      supabase.from("companies").update({ custom_column_schema: merged } as any).eq("id", companyId).then();
    }
  };

  const persistField = (field: string, value: unknown) => {
    if (companyId) {
      supabase.from("companies").update({ [field]: value } as any).eq("id", companyId).then();
    }
  };

  const setKibColumns = (update: KibColumnsMap | ((prev: KibColumnsMap) => KibColumnsMap)) => {
    setKibColumnsState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      persistSchema(next, codeConfig);
      return next;
    });
  };

  const setCodeConfig = (update: CodeConfiguration | ((prev: CodeConfiguration) => CodeConfiguration)) => {
    setCodeConfigState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      persistSchema(kibColumns, next);
      return next;
    });
  };

  const getColumnsForKib = (kibLabel: string): CustomColumn[] => {
    return kibColumns[kibLabel] || [];
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
    setMasterKibState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      persistField("master_kib", next);
      return next;
    });
  };

  const updateSettingsPin = (pin: string) => {
    setSettingsPin(pin);
    persistField("settings_pin", pin);
  };

  return (
    <CustomColumnsContext.Provider value={{ columns, kibColumns, setKibColumns, getColumnsForKib, codeConfig, setCodeConfig, masterDivisi, setMasterDivisi, masterKib, setMasterKib, settingsPin, setSettingsPin: updateSettingsPin, isLoading }}>
      {children}
    </CustomColumnsContext.Provider>
  );
}

export function useCustomColumns() {
  const ctx = useContext(CustomColumnsContext);
  if (!ctx) throw new Error("useCustomColumns must be used within CustomColumnsProvider");
  return ctx;
}
