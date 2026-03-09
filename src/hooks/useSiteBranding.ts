import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

interface SiteBranding {
  site_name: string;
  logo_url: string;
  favicon_url: string;
  footer_text: string;
  primary_color: string;
}

const defaults: SiteBranding = {
  site_name: "Travel Vela",
  logo_url: "",
  favicon_url: "",
  footer_text: "",
  primary_color: "#2563eb",
};

let cachedBranding: SiteBranding | null = null;
let cachedForTenant: string | null = null;

export function useSiteBranding() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id || null;

  const [branding, setBranding] = useState<SiteBranding>(
    cachedBranding && cachedForTenant === tenantId ? cachedBranding : defaults
  );
  const [loading, setLoading] = useState(
    !(cachedBranding && cachedForTenant === tenantId)
  );

  useEffect(() => {
    if (cachedBranding && cachedForTenant === tenantId) {
      updateFavicon(cachedBranding.favicon_url);
      return;
    }

    const load = async () => {
      try {
        // If tenant exists, use tenant settings for branding
        if (tenant) {
          const ts = tenant.settings;
          const merged: SiteBranding = {
            ...defaults,
            site_name: ts.site_name || tenant.name || defaults.site_name,
            logo_url: ts.logo_url || defaults.logo_url,
            favicon_url: ts.favicon_url || defaults.favicon_url,
            footer_text: ts.footer_text || defaults.footer_text,
            primary_color: ts.primary_color || defaults.primary_color,
          };
          cachedBranding = merged;
          cachedForTenant = tenantId;
          setBranding(merged);
          updateFavicon(merged.favicon_url);
          setLoading(false);
          return;
        }

        // Global: fetch from api_settings
        const [brandingRes, generalRes] = await Promise.all([
          supabase.from("api_settings").select("settings").eq("provider", "site_branding").maybeSingle(),
          supabase.from("api_settings").select("settings").eq("provider", "site_general").maybeSingle(),
        ]);

        const b = (brandingRes.data?.settings as Record<string, any>) || {};
        const g = (generalRes.data?.settings as Record<string, any>) || {};

        const merged: SiteBranding = {
          ...defaults,
          ...b,
          site_name: g.site_name || b.site_name || defaults.site_name,
        };

        cachedBranding = merged;
        cachedForTenant = tenantId;
        setBranding(merged);
        updateFavicon(merged.favicon_url);
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tenant, tenantId]);

  return { branding, loading };
}

function updateFavicon(url: string) {
  if (!url) return;
  let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}
