import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TaxSettings {
  taxPercentage: number;
  convenienceFeePercentage: number;
  serviceFee: number;
}

const defaults: TaxSettings = { taxPercentage: 0, convenienceFeePercentage: 0, serviceFee: 0 };
let cached: TaxSettings | null = null;

export const useTaxSettings = () => {
  const [settings, setSettings] = useState<TaxSettings>(cached || defaults);

  useEffect(() => {
    if (cached) return;
    supabase
      .from("api_settings")
      .select("settings")
      .eq("provider", "taxes_fees")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.settings) {
          const s = data.settings as any;
          const resolved: TaxSettings = {
            taxPercentage: s.tax_percentage ?? defaults.taxPercentage,
            convenienceFeePercentage: s.convenience_fee_percentage ?? defaults.convenienceFeePercentage,
            serviceFee: s.service_fee ?? defaults.serviceFee,
          };
          cached = resolved;
          setSettings(resolved);
        }
      });
  }, []);

  return settings;
};
