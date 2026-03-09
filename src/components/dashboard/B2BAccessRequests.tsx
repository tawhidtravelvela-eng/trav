import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Globe, Key, Loader2, Plus } from "lucide-react";
import { format } from "date-fns";

interface AccessRequest {
  id: string;
  request_type: string;
  status: string;
  company_name: string;
  domain_requested: string;
  business_justification: string;
  admin_notes: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const B2BAccessRequests = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    request_type: "whitelabel",
    company_name: "",
    domain_requested: "",
    business_justification: "",
  });

  useEffect(() => {
    if (user) fetchRequests();
  }, [user]);

  const fetchRequests = async () => {
    const { data } = await (supabase as any)
      .from("b2b_access_requests")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    setRequests(data || []);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!form.company_name.trim()) {
      toast.error("Company name is required");
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase as any).from("b2b_access_requests").insert({
      user_id: user!.id,
      request_type: form.request_type,
      company_name: form.company_name,
      domain_requested: form.domain_requested,
      business_justification: form.business_justification,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Access request submitted! Our team will review it shortly.");
      setDialogOpen(false);
      setForm({ request_type: "whitelabel", company_name: "", domain_requested: "", business_justification: "" });
      fetchRequests();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Access Requests</h3>
          <p className="text-sm text-muted-foreground">Request White-Label or BYOK access for your agency</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Request</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Access</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Access Type</Label>
                <Select value={form.request_type} onValueChange={(v) => setForm((p) => ({ ...p, request_type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whitelabel">
                      <span className="flex items-center gap-2"><Globe className="h-4 w-4" /> White-Label Access</span>
                    </SelectItem>
                    <SelectItem value="byok">
                      <span className="flex items-center gap-2"><Key className="h-4 w-4" /> BYOK (Own API Keys)</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Company / Agency Name</Label>
                <Input value={form.company_name} onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))} placeholder="Your agency name" />
              </div>
              {form.request_type === "whitelabel" && (
                <div>
                  <Label>Preferred Domain</Label>
                  <Input value={form.domain_requested} onChange={(e) => setForm((p) => ({ ...p, domain_requested: e.target.value }))} placeholder="flights.youragency.com" />
                </div>
              )}
              <div>
                <Label>Business Justification</Label>
                <Textarea value={form.business_justification} onChange={(e) => setForm((p) => ({ ...p, business_justification: e.target.value }))} placeholder="Tell us about your business and why you need this access..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No access requests yet. Request White-Label or BYOK access to expand your business.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {r.request_type === "whitelabel" ? <Globe className="h-5 w-5 text-primary" /> : <Key className="h-5 w-5 text-primary" />}
                    <div>
                      <p className="font-medium">{r.request_type === "whitelabel" ? "White-Label Access" : "BYOK Access"}</p>
                      <p className="text-xs text-muted-foreground">{r.company_name} • {format(new Date(r.created_at), "PP")}</p>
                      {r.domain_requested && <p className="text-xs text-muted-foreground">Domain: {r.domain_requested}</p>}
                    </div>
                  </div>
                  <Badge className={statusColors[r.status] || ""}>{r.status}</Badge>
                </div>
                {r.admin_notes && r.status !== "pending" && (
                  <div className="mt-3 p-2 bg-muted rounded-md text-sm">
                    <span className="text-muted-foreground">Admin notes:</span> {r.admin_notes}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default B2BAccessRequests;
