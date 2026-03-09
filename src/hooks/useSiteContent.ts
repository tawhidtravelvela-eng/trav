import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

export interface SiteContent {
  hero: Record<string, any>;
  stats: Record<string, any>;
  features: Record<string, any>;
  newsletter: Record<string, any>;
  app_download: Record<string, any>;
  homepage: Record<string, any>;
}

const defaults: SiteContent = {
  hero: {},
  stats: {},
  features: {},
  newsletter: {},
  app_download: {},
  homepage: {},
};

let cached: SiteContent | null = null;
let cachedForTenant: string | null = null;

export function useSiteContent() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id || null;

  const [content, setContent] = useState<SiteContent>(
    cached && cachedForTenant === tenantId ? cached : defaults
  );
  const [loading, setLoading] = useState(
    !(cached && cachedForTenant === tenantId)
  );

  useEffect(() => {
    if (cached && cachedForTenant === tenantId) return;

    const load = async () => {
      const result: SiteContent = { ...defaults };

      if (tenant) {
        const ts = tenant.settings;
        const keys: (keyof SiteContent)[] = ["hero", "stats", "features", "newsletter", "app_download", "homepage"];
        keys.forEach((key) => {
          if (ts[key]) result[key] = ts[key];
        });
      } else {
        const { data } = await supabase
          .from("api_settings")
          .select("provider, settings")
          .in("provider", [
            "site_hero", "site_stats", "site_features",
            "site_newsletter", "site_app_download", "site_homepage",
          ]);

        data?.forEach((row) => {
          const key = row.provider.replace("site_", "") as keyof SiteContent;
          if (result[key] !== undefined) {
            result[key] = (row.settings as Record<string, any>) || {};
          }
        });
      }

      cached = result;
      cachedForTenant = tenantId;
      setContent(result);
      setLoading(false);
    };

    load();
  }, [tenant, tenantId]);

  return { content, loading };
}

export function invalidateSiteContentCache() {
  cached = null;
  cachedForTenant = null;
}
