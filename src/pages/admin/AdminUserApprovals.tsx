import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminTenantFilter } from "@/hooks/useAdminTenantFilter";
import { Check, X, Loader2, Clock, Building2, Briefcase, Globe, Key } from "lucide-react";
import { format } from "date-fns";

interface PendingUser {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  user_type: string;
  company_name: string;
  trade_license: string;
  phone: string;
  approval_status: string;
  created_at: string;
}

interface AccessRequest {
  id: string;
  user_id: string;
  request_type: string;
  status: string;
  company_name: string;
  domain_requested: string;
  business_justification: string;
  admin_notes: string;
  created_at: string;
  profile?: { full_name: string | null; email: string | null };
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const userTypeLabels: Record<string, string> = {
  b2c: "B2C",
  corporate: "Corporate",
  b2b_agent: "B2B Agent",
};

const AdminUserApprovals = () => {
  const { user } = useAuth();
  const { adminTenantId } = useAdminTenantFilter();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; item: any; type: "user" | "access" }>({ open: false, item: null, type: "user" });
  const [adminNotes, setAdminNotes] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    let usersQuery = (supabase as any).from("profiles").select("*").in("user_type", ["corporate", "b2b_agent"]).order("created_at", { ascending: false });
    let requestsQuery = (supabase as any).from("b2b_access_requests").select("*").order("created_at", { ascending: false });

    if (adminTenantId) {
      usersQuery = usersQuery.eq("tenant_id", adminTenantId);
      // For access requests, filter by users belonging to this tenant
    }

    const [usersRes, requestsRes] = await Promise.all([usersQuery, requestsQuery]);

    setPendingUsers(usersRes.data || []);

    // Fetch profile info for access requests
    const requests = requestsRes.data || [];
    if (requests.length > 0) {
      const userIds = [...new Set(requests.map((r: any) => r.user_id))] as string[];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds);
      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      requests.forEach((r: any) => {
        r.profile = profileMap.get(r.user_id) || {};
      });
    }
    setAccessRequests(requests);
    setLoading(false);
  };

  const handleApproval = async (profileId: string, userId: string, action: "approved" | "rejected") => {
    setActionLoading(profileId);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({
        approval_status: action,
        is_approved: action === "approved",
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`User ${action}`);
      fetchData();
    }
    setActionLoading(null);
    setReviewDialog({ open: false, item: null, type: "user" });
  };

  const handleAccessRequestAction = async (requestId: string, action: "approved" | "rejected") => {
    setActionLoading(requestId);
    const { error } = await (supabase as any)
      .from("b2b_access_requests")
      .update({
        status: action,
        admin_notes: adminNotes,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Access request ${action}`);
      fetchData();
    }
    setActionLoading(null);
    setAdminNotes("");
    setReviewDialog({ open: false, item: null, type: "access" });
  };

  const pendingCount = pendingUsers.filter((u) => u.approval_status === "pending").length;
  const pendingAccessCount = accessRequests.filter((r) => r.status === "pending").length;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Approvals</h1>
          <p className="text-muted-foreground mt-1">Review and approve Corporate, B2B Agent registrations, and access requests.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pending Registrations</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Globe className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{pendingAccessCount}</p>
                  <p className="text-xs text-muted-foreground">Pending Access Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Check className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{pendingUsers.filter((u) => u.approval_status === "approved").length}</p>
                  <p className="text-xs text-muted-foreground">Approved Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="registrations">
          <TabsList>
            <TabsTrigger value="registrations" className="gap-1">
              Registrations {pendingCount > 0 && <Badge variant="destructive" className="text-xs px-1.5">{pendingCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="access-requests" className="gap-1">
              Access Requests {pendingAccessCount > 0 && <Badge variant="destructive" className="text-xs px-1.5">{pendingAccessCount}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="registrations">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No registrations found</TableCell>
                      </TableRow>
                    ) : (
                      pendingUsers.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{u.full_name || "—"}</p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              {u.user_type === "corporate" ? <Building2 className="h-3 w-3" /> : <Briefcase className="h-3 w-3" />}
                              {userTypeLabels[u.user_type] || u.user_type}
                            </Badge>
                          </TableCell>
                          <TableCell>{u.company_name || "—"}</TableCell>
                          <TableCell>{u.phone || "—"}</TableCell>
                          <TableCell>
                            <Badge className={statusColors[u.approval_status] || ""}>{u.approval_status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{format(new Date(u.created_at), "PP")}</TableCell>
                          <TableCell className="text-right">
                            {u.approval_status === "pending" ? (
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="outline" className="gap-1 text-green-600" onClick={() => handleApproval(u.id, u.user_id, "approved")} disabled={actionLoading === u.id}>
                                  <Check className="h-3 w-3" /> Approve
                                </Button>
                                <Button size="sm" variant="outline" className="gap-1 text-red-600" onClick={() => handleApproval(u.id, u.user_id, "rejected")} disabled={actionLoading === u.id}>
                                  <X className="h-3 w-3" /> Reject
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="access-requests">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accessRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No access requests</TableCell>
                      </TableRow>
                    ) : (
                      accessRequests.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{r.profile?.full_name || "—"}</p>
                              <p className="text-xs text-muted-foreground">{r.profile?.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              {r.request_type === "whitelabel" ? <Globe className="h-3 w-3" /> : <Key className="h-3 w-3" />}
                              {r.request_type === "whitelabel" ? "White-Label" : "BYOK"}
                            </Badge>
                          </TableCell>
                          <TableCell>{r.company_name || "—"}</TableCell>
                          <TableCell>{r.domain_requested || "—"}</TableCell>
                          <TableCell>
                            <Badge className={statusColors[r.status] || ""}>{r.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{format(new Date(r.created_at), "PP")}</TableCell>
                          <TableCell className="text-right">
                            {r.status === "pending" ? (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  onClick={() => {
                                    setReviewDialog({ open: true, item: r, type: "access" });
                                    setAdminNotes("");
                                  }}
                                >
                                  Review
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Review Access Request Dialog */}
        <Dialog open={reviewDialog.open && reviewDialog.type === "access"} onOpenChange={(o) => !o && setReviewDialog({ open: false, item: null, type: "access" })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review Access Request</DialogTitle>
            </DialogHeader>
            {reviewDialog.item && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{reviewDialog.item.request_type === "whitelabel" ? "White-Label" : "BYOK"}</span></div>
                  <div><span className="text-muted-foreground">Company:</span> <span className="font-medium">{reviewDialog.item.company_name}</span></div>
                  {reviewDialog.item.domain_requested && (
                    <div className="col-span-2"><span className="text-muted-foreground">Requested Domain:</span> <span className="font-medium">{reviewDialog.item.domain_requested}</span></div>
                  )}
                </div>
                {reviewDialog.item.business_justification && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Business Justification</Label>
                    <p className="text-sm mt-1 bg-muted p-3 rounded-md">{reviewDialog.item.business_justification}</p>
                  </div>
                )}
                <div>
                  <Label>Admin Notes</Label>
                  <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Add notes about this decision..." />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" className="gap-1 text-red-600" onClick={() => handleAccessRequestAction(reviewDialog.item?.id, "rejected")} disabled={!!actionLoading}>
                <X className="h-4 w-4" /> Reject
              </Button>
              <Button className="gap-1" onClick={() => handleAccessRequestAction(reviewDialog.item?.id, "approved")} disabled={!!actionLoading}>
                <Check className="h-4 w-4" /> Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminUserApprovals;
