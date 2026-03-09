import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldBan, ShieldCheck, Loader2, Check, X, Building2, Briefcase, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency, CURRENCIES, type CurrencyCode } from "@/contexts/CurrencyContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminTenantFilter } from "@/hooks/useAdminTenantFilter";
import { useAuth } from "@/contexts/AuthContext";

interface UserRow {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  is_blocked: boolean;
  user_type: string;
  company_name: string;
  approval_status: string;
  billing_currency: string;
  bookingCount: number;
  totalSpent: number;
}

const userTypeLabels: Record<string, { label: string; icon: typeof User }> = {
  b2c: { label: "B2C", icon: User },
  corporate: { label: "Corporate", icon: Building2 },
  b2b_agent: { label: "B2B Agent", icon: Briefcase },
};

const approvalColors: Record<string, string> = {
  approved: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  rejected: "bg-red-100 text-red-800",
};

const AdminUsers = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { formatPrice } = useCurrency();
  const { adminTenantId } = useAdminTenantFilter();
  const { user: currentUser } = useAuth();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    let profilesQuery = supabase.from("profiles").select("*");
    let bookingsQuery = supabase.from("bookings").select("user_id, total");

    if (adminTenantId) {
      profilesQuery = profilesQuery.eq("tenant_id", adminTenantId);
      bookingsQuery = bookingsQuery.eq("tenant_id", adminTenantId);
    }

    const [profilesRes, bookingsRes] = await Promise.all([profilesQuery, bookingsQuery]);

    const profiles = profilesRes.data || [];
    const bookings = bookingsRes.data || [];

    const bookingMap = new Map<string, { count: number; spent: number }>();
    bookings.forEach((b) => {
      const entry = bookingMap.get(b.user_id) || { count: 0, spent: 0 };
      entry.count += 1;
      entry.spent += Number(b.total);
      bookingMap.set(b.user_id, entry);
    });

    setUsers(
      profiles.map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        created_at: p.created_at,
        is_blocked: p.is_blocked ?? false,
        user_type: p.user_type || "b2c",
        company_name: p.company_name || "",
        approval_status: p.approval_status || "approved",
        billing_currency: p.billing_currency || "USD",
        bookingCount: bookingMap.get(p.user_id)?.count || 0,
        totalSpent: bookingMap.get(p.user_id)?.spent || 0,
      }))
    );
    setLoading(false);
  };

  const toggleBlock = async (userId: string) => {
    const user = users.find((u) => u.user_id === userId);
    if (!user) return;
    const newBlocked = !user.is_blocked;

    const { error } = await supabase
      .from("profiles")
      .update({ is_blocked: newBlocked } as any)
      .eq("user_id", userId);

    if (error) {
      toast.error("Failed to update user");
      return;
    }

    setUsers((prev) =>
      prev.map((u) => (u.user_id === userId ? { ...u, is_blocked: newBlocked } : u))
    );
    toast.success(`${user.full_name || user.email} ${newBlocked ? "blocked" : "unblocked"}`);
  };

  const handleApproval = async (profileId: string, action: "approved" | "rejected") => {
    const { error } = await (supabase as any)
      .from("profiles")
      .update({
        approval_status: action,
        is_approved: action === "approved",
        approved_by: currentUser?.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`User ${action}`);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === profileId ? { ...u, approval_status: action } : u
        )
      );
    }
  };

  const handleCurrencyChange = async (userId: string, newCurrency: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ billing_currency: newCurrency } as any)
      .eq("user_id", userId);
    if (error) {
      toast.error("Failed to update currency");
      return;
    }
    setUsers((prev) =>
      prev.map((u) => (u.user_id === userId ? { ...u, billing_currency: newCurrency } : u))
    );
    toast.success("Billing currency updated");
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">User Management</h2>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No users found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Bookings</TableHead>
                    <TableHead>Spent</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const typeInfo = userTypeLabels[u.user_type] || userTypeLabels.b2c;
                    const TypeIcon = typeInfo.icon;
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{u.full_name || "—"}</p>
                            {u.company_name && <p className="text-xs text-muted-foreground">{u.company_name}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1 text-xs">
                            <TypeIcon className="h-3 w-3" />
                            {typeInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{u.email || "—"}</TableCell>
                        <TableCell className="text-sm">{u.created_at.slice(0, 10)}</TableCell>
                        <TableCell>
                          <Select value={u.billing_currency} onValueChange={(v) => handleCurrencyChange(u.user_id, v)}>
                            <SelectTrigger className="h-8 w-[100px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.values(CURRENCIES).map((c) => (
                                <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{u.bookingCount}</TableCell>
                        <TableCell className="font-semibold">{formatPrice(u.totalSpent)}</TableCell>
                        <TableCell>
                          {u.user_type !== "b2c" ? (
                            <Badge className={`text-xs ${approvalColors[u.approval_status] || ""}`}>
                              {u.approval_status}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={!u.is_blocked ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}>
                            {u.is_blocked ? "Blocked" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            {u.user_type !== "b2c" && u.approval_status === "pending" && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-green-600"
                                  onClick={() => handleApproval(u.id, "approved")}
                                  title="Approve"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-red-600"
                                  onClick={() => handleApproval(u.id, "rejected")}
                                  title="Reject"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => toggleBlock(u.user_id)}
                              title={u.is_blocked ? "Unblock" : "Block"}
                            >
                              {u.is_blocked ? (
                                <ShieldCheck className="h-4 w-4 text-success" />
                              ) : (
                                <ShieldBan className="h-4 w-4 text-warning" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminUsers;
