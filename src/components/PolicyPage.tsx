import { useState, useEffect } from "react";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Loader2 } from "lucide-react";
import DOMPurify from "dompurify";

interface PolicyPageProps {
  providerKey: string;
  pageTitle: string;
  defaultContent: string;
}

const PolicyPage = ({ providerKey, pageTitle, defaultContent }: PolicyPageProps) => {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const { tenant } = useTenant();

  useEffect(() => {
    (async () => {
      let found = false;

      // If tenant, check tenant settings first
      if (tenant) {
        const key = providerKey.replace("site_", "");
        const tenantPolicy = tenant.settings?.[key];
        if (tenantPolicy?.content) {
          setContent(tenantPolicy.content);
          setLastUpdated(tenantPolicy.last_updated || "");
          found = true;
        }
      }

      // Fallback to global api_settings
      if (!found) {
        const { data } = await supabase
          .from("api_settings")
          .select("settings")
          .eq("provider", providerKey)
          .maybeSingle();
        if (data) {
          const s = data.settings as any;
          setContent(s?.content || "");
          setLastUpdated(s?.last_updated || "");
        }
      }

      setLoading(false);
    })();
  }, [providerKey, tenant]);

  const html = content || defaultContent;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-3xl font-bold text-foreground mb-2">{pageTitle}</h1>
        {lastUpdated && (
          <p className="text-sm text-muted-foreground mb-8">Last updated: {lastUpdated}</p>
        )}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-foreground/90"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
          />
        )}
      </div>
    </Layout>
  );
};

export default PolicyPage;
