import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns the admin's tenant_id for scoping queries.
 * - null means super admin → see all data
 * - UUID means tenant admin → filter by that tenant_id
 */
export function useAdminTenantFilter() {
  const { adminTenantId } = useAuth();
  
  /**
   * Apply tenant filter to a Supabase query builder.
   * Super admins see everything; tenant admins see only their tenant's data.
   */
  const applyTenantFilter = <T extends { eq: (col: string, val: string) => T }>(
    query: T,
    column: string = "tenant_id"
  ): T => {
    if (adminTenantId) {
      return query.eq(column, adminTenantId);
    }
    return query;
  };

  return { adminTenantId, isSuperAdmin: !adminTenantId, applyTenantFilter };
}
