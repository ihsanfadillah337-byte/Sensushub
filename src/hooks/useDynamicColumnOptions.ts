import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useDynamicColumnOptions(companyId: string | undefined, columnName: string) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId || !columnName) {
      setOptions([]);
      return;
    }

    const fetchOptions = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("assets")
          .select("custom_data")
          .eq("company_id", companyId);

        if (error) {
          console.error("Error fetching dynamic options:", error);
          return;
        }

        if (data) {
          const uniqueValues = new Set<string>();
          data.forEach((row) => {
            const val = row.custom_data?.[columnName as keyof typeof row.custom_data];
            if (val && typeof val === "string" && val.trim() !== "") {
              uniqueValues.add(val.trim());
            } else if (val && typeof val === "number") {
              uniqueValues.add(val.toString());
            }
          });

          // Sort alphabetically
          const sortedOptions = Array.from(uniqueValues).sort((a, b) => a.localeCompare(b));
          setOptions(sortedOptions);
        }
      } catch (err) {
        console.error("Failed to fetch dynamic options", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOptions();
  }, [companyId, columnName]);

  return { options, loading };
}
