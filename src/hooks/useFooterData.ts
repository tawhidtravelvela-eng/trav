import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

interface FooterData {
  footer: Record<string, any>;
  contact: Record<string, any>;
  social: Record<string, any>;
}

const defaults: FooterData = { footer: {}, contact: {}, social: {} };
let cached: FooterData | null = null;
let cachedForTenant: string | null = null;

export function useFooterData() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id || null;

  const [data, setData] = useState<FooterData>(
    cached && cachedForTenant === tenantId ? cached : defaults
  );

  useEffect(() => {
    if (cached && cachedForTenant === tenantId) return;

    const load = async () => {
      try {
        const result: FooterData = { ...defaults };

        if (tenant) {
          // Pull footer/contact/social from tenant settings
          const ts = tenant.settings;
          if (ts.footer) result.footer = ts.footer;
          if (ts.contact) result.contact = ts.contact;
          if (ts.social) result.social = ts.social;
        } else {
          // Global: fetch from api_settings
          const { data: rows } = await supabase
            .from("api_settings")
            .select("provider, settings")
            .in("provider", ["site_footer", "site_contact", "site_social"]);

          rows?.forEach((row) => {
            const key = row.provider.replace("site_", "") as keyof FooterData;
            if (result[key] !== undefined) {
              result[key] = (row.settings as Record<string, any>) || {};
            }
          });
        }

        cached = result;
        cachedForTenant = tenantId;
        setData(result);
      } catch {
        // use defaults
      }
    };
    load();
  }, [tenant, tenantId]);

  return data;
}
