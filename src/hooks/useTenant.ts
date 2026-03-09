import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Tenant {
  id: string;
  domain: string;
  name: string;
  is_active: boolean;
  settings: Record<string, any>;
}

let cachedTenant: Tenant | null | undefined = undefined; // undefined = not yet resolved

/**
 * Resolves the current tenant from window.location.hostname.
 * Returns null when no tenant matches (falls back to global/default).
 */
export function useTenant() {
  const [tenant, setTenant] = useState<Tenant | null>(
    cachedTenant === undefined ? null : cachedTenant
  );
  const [loading, setLoading] = useState(cachedTenant === undefined);

  useEffect(() => {
    if (cachedTenant !== undefined) {
      setTenant(cachedTenant);
      setLoading(false);
      return;
    }

    const hostname = window.location.hostname;

    // Skip tenant resolution for localhost / lovable preview domains
    const isDefault =
      hostname === "localhost" ||
      hostname.endsWith(".lovable.app") ||
      hostname === "127.0.0.1";

    if (isDefault) {
      cachedTenant = null;
      setTenant(null);
      setLoading(false);
      return;
    }

    supabase
      .from("tenants")
      .select("*")
      .eq("domain", hostname)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        const resolved = data
          ? ({
              id: data.id,
              domain: data.domain,
              name: data.name,
              is_active: data.is_active,
              settings: (data.settings as Record<string, any>) || {},
            } as Tenant)
          : null;
        cachedTenant = resolved;
        setTenant(resolved);
        setLoading(false);
      });
  }, []);

  return { tenant, loading, isTenant: !!tenant };
}

/** Call after admin edits a tenant to bust the cache */
export function invalidateTenantCache() {
  cachedTenant = undefined;
}
