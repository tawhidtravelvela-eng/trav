import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  /** null = super admin (sees all), UUID = tenant-scoped admin */
  adminTenantId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isAdmin: false,
  adminTenantId: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTenantId, setAdminTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAdmin = async (userId: string) => {
    try {
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      const isUserAdmin = !!data;
      setIsAdmin(isUserAdmin);

      if (isUserAdmin) {
        const { data: tenantId } = await supabase.rpc("get_admin_tenant_id", { _user_id: userId });
        setAdminTenantId(tenantId || null);
      } else {
        setAdminTenantId(null);
      }
    } catch (error) {
      console.error("checkAdmin failed:", error);
      setIsAdmin(false);
      setAdminTenantId(null);
    }
  };

  useEffect(() => {
    const applySession = (nextSession: Session | null) => {
      setSession(nextSession);
      const nextUser = nextSession?.user ?? null;
      setUser(nextUser);

      if (nextUser) {
        void checkAdmin(nextUser.id);
      } else {
        setIsAdmin(false);
        setAdminTenantId(null);
      }

      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Keep callback synchronous to avoid auth event deadlocks
      applySession(nextSession);
    });

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      applySession(initialSession);
    }).catch((error) => {
      console.error("getSession failed:", error);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setAdminTenantId(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, adminTenantId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
