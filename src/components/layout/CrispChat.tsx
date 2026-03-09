import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

declare global {
  interface Window {
    $crisp: any[];
    CRISP_WEBSITE_ID: string;
  }
}

const DEFAULT_CRISP_ID = "7b6ec17d-256a-41e8-9732-17ff58bd51e9";

const CrispChat = () => {
  const { tenant } = useTenant();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadCrisp = async () => {
      let crispId = "";
      let enabled = false;

      // Check tenant-level override first
      if (tenant?.settings) {
        const ts = tenant.settings as Record<string, any>;
        const apps = ts.apps || {};
        enabled = !!apps.crisp_enabled;
        crispId = apps.crisp_website_id || "";
      }

      // Fall back to global settings
      if (!crispId) {
        const { data } = await supabase
          .from("api_settings")
          .select("settings")
          .eq("provider", "site_apps")
          .single();

        if (data?.settings) {
          const settings = data.settings as Record<string, any>;
          enabled = settings.crisp_enabled !== false; // default enabled
          crispId = settings.crisp_website_id || DEFAULT_CRISP_ID;
        } else {
          // No settings saved yet — use default
          enabled = true;
          crispId = DEFAULT_CRISP_ID;
        }
      }

      if (!enabled || !crispId || loaded) return;

      // Inject Crisp SDK
      window.$crisp = [];
      window.CRISP_WEBSITE_ID = crispId;

      const script = document.createElement("script");
      script.src = "https://client.crisp.chat/l.js";
      script.async = true;
      document.head.appendChild(script);
      setLoaded(true);
    };

    loadCrisp();
  }, [tenant, loaded]);

  return null;
};

export default CrispChat;
