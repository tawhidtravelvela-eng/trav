import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Save, Loader2, Plus, Pencil, Trash2, Globe, ExternalLink, UserPlus, X, ShieldCheck, Network, Settings2, Key, Copy, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

interface Tenant {
  id: string;
  domain: string;
  name: string;
  is_active: boolean;
  settings: Record<string, any>;
  created_at: string;
  provider_group_id: string | null;
}

interface TenantAdmin {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
}

interface ProviderGroup {
  id: string;
  name: string;
  description: string;
  providers: Record<string, boolean>;
}

const ALL_PROVIDERS = [
  { key: "travelport", label: "Travelport (UAPI)" },
  { key: "amadeus", label: "Amadeus" },
  { key: "travelvela", label: "TravelVela" },
  { key: "tripjack", label: "Tripjack" },
];

const emptyTenant = {
  domain: "",
  name: "",
  is_active: true,
  provider_group_id: null as string | null,
  settings: {
    site_name: "",
    logo_url: "",
    favicon_url: "",
    primary_color: "#0092ff",
    color_primary: "",
    color_accent: "",
    color_background: "",
    color_foreground: "",
    business_model: "reseller" as "reseller" | "commission",
    commission_percentage: 0,
  },
};

const emptyGroup = {
  name: "",
  description: "",
  providers: { travelport: false, amadeus: false, travelvela: false, tripjack: false } as Record<string, boolean>,
};

const AdminTenants = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState<typeof emptyTenant>({ ...emptyTenant });

  // Provider groups
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([]);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ProviderGroup | null>(null);
  const [groupForm, setGroupForm] = useState<typeof emptyGroup>({ ...emptyGroup });
  const [savingGroup, setSavingGroup] = useState(false);

  // Admin assignment
  const [adminDialog, setAdminDialog] = useState<Tenant | null>(null);
  const [tenantAdmins, setTenantAdmins] = useState<TenantAdmin[]>([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [assigningAdmin, setAssigningAdmin] = useState(false);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // API keys
  const [apiKeyDialog, setApiKeyDialog] = useState<Tenant | null>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("Default");
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const fetchTenants = async () => {
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });
    setTenants((data as any[]) || []);
    setLoading(false);
  };

  const fetchGroups = async () => {
    const { data } = await supabase
      .from("provider_groups")
      .select("*")
      .order("name");
    setProviderGroups((data as any[]) || []);
  };

  useEffect(() => { fetchTenants(); fetchGroups(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyTenant });
    setDialogOpen(true);
  };

  const openEdit = (t: Tenant) => {
    setEditing(t);
    setForm({
      domain: t.domain,
      name: t.name,
      is_active: t.is_active,
      provider_group_id: t.provider_group_id,
      settings: { ...emptyTenant.settings, ...t.settings },
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.domain || !form.name) {
      toast.error("Domain and name are required");
      return;
    }
    setSaving(true);

    const payload = {
      domain: form.domain.toLowerCase().trim(),
      name: form.name,
      is_active: form.is_active,
      provider_group_id: form.provider_group_id || null,
      settings: form.settings as any,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from("tenants").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("tenants").insert(payload));
    }

    if (error) {
      toast.error(error.message.includes("duplicate") ? "Domain already exists" : error.message);
    } else {
      toast.success(editing ? "Tenant updated" : "Tenant created");
      setDialogOpen(false);
      fetchTenants();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tenant? This cannot be undone.")) return;
    const { error } = await supabase.from("tenants").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Tenant deleted"); fetchTenants(); }
  };

  const updateSetting = (key: string, value: string | number) => {
    setForm((prev) => ({
      ...prev,
      settings: { ...prev.settings, [key]: value },
    }));
  };

  // Provider Group CRUD
  const openCreateGroup = () => {
    setEditingGroup(null);
    setGroupForm({ ...emptyGroup });
    setGroupDialogOpen(true);
  };

  const openEditGroup = (g: ProviderGroup) => {
    setEditingGroup(g);
    setGroupForm({ name: g.name, description: g.description, providers: { ...emptyGroup.providers, ...g.providers } });
    setGroupDialogOpen(true);
  };

  const handleSaveGroup = async () => {
    if (!groupForm.name.trim()) { toast.error("Group name is required"); return; }
    setSavingGroup(true);
    const payload = { name: groupForm.name.trim(), description: groupForm.description, providers: groupForm.providers as any };

    let error;
    if (editingGroup) {
      ({ error } = await supabase.from("provider_groups").update(payload).eq("id", editingGroup.id));
    } else {
      ({ error } = await supabase.from("provider_groups").insert(payload));
    }

    if (error) {
      toast.error(error.message.includes("duplicate") ? "Group name already exists" : error.message);
    } else {
      toast.success(editingGroup ? "Group updated" : "Group created");
      setGroupDialogOpen(false);
      fetchGroups();
    }
    setSavingGroup(false);
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm("Delete this provider group? Tenants using it will lose their API access config.")) return;
    const { error } = await supabase.from("provider_groups").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Group deleted"); fetchGroups(); }
  };

  // Admin assignment functions
  const openAdminDialog = async (t: Tenant) => {
    setAdminDialog(t);
    setAdminEmail("");
    setLoadingAdmins(true);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("id, user_id")
      .eq("role", "admin")
      .eq("tenant_id", t.id);

    if (roles && roles.length > 0) {
      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      setTenantAdmins(roles.map(r => ({
        id: r.id,
        user_id: r.user_id,
        email: profileMap.get(r.user_id)?.email || null,
        full_name: profileMap.get(r.user_id)?.full_name || null,
      })));
    } else {
      setTenantAdmins([]);
    }
    setLoadingAdmins(false);
  };

  const assignAdmin = async () => {
    if (!adminDialog || !adminEmail.trim()) return;
    setAssigningAdmin(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, email, full_name")
      .eq("email", adminEmail.trim().toLowerCase())
      .maybeSingle();

    if (!profile) {
      toast.error("No user found with that email");
      setAssigningAdmin(false);
      return;
    }

    const existing = tenantAdmins.find(a => a.user_id === profile.user_id);
    if (existing) {
      toast.error("This user is already an admin for this tenant");
      setAssigningAdmin(false);
      return;
    }

    const { data: inserted, error } = await supabase
      .from("user_roles")
      .insert({ user_id: profile.user_id, role: "admin" as any, tenant_id: adminDialog.id } as any)
      .select("id")
      .single();

    if (error) {
      toast.error(error.message.includes("duplicate") ? "User already has admin role" : error.message);
    } else {
      setTenantAdmins(prev => [...prev, {
        id: (inserted as any).id,
        user_id: profile.user_id,
        email: profile.email,
        full_name: profile.full_name,
      }]);
      setAdminEmail("");
      toast.success(`${profile.full_name || profile.email} assigned as tenant admin`);
    }
    setAssigningAdmin(false);
  };

  const removeAdmin = async (roleId: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
    if (error) {
      toast.error("Failed to remove admin");
    } else {
      setTenantAdmins(prev => prev.filter(a => a.id !== roleId));
      toast.success("Admin removed from tenant");
    }
  };

  // API key management
  const openApiKeyDialog = async (t: Tenant) => {
    setApiKeyDialog(t);
    setNewKeyName("Default");
    setRevealedKeys(new Set());
    setLoadingKeys(true);
    const { data } = await supabase
      .from("tenant_api_keys" as any)
      .select("*")
      .eq("tenant_id", t.id)
      .order("created_at", { ascending: false });
    setApiKeys((data as any[]) || []);
    setLoadingKeys(false);
  };

  const generateApiKey = async () => {
    if (!apiKeyDialog) return;
    setGeneratingKey(true);

    // Generate key via database function
    const { data: keyVal } = await supabase.rpc("generate_tenant_api_key" as any);
    if (!keyVal) { toast.error("Failed to generate key"); setGeneratingKey(false); return; }

    const { data: inserted, error } = await supabase
      .from("tenant_api_keys" as any)
      .insert({ tenant_id: apiKeyDialog.id, api_key: keyVal, name: newKeyName.trim() || "Default" } as any)
      .select("*")
      .single();

    if (error) {
      toast.error(error.message);
    } else {
      setApiKeys(prev => [inserted as any, ...prev]);
      setRevealedKeys(prev => new Set(prev).add((inserted as any).id));
      setNewKeyName("Default");
      toast.success("API key generated — copy it now, it won't be shown in full again");
    }
    setGeneratingKey(false);
  };

  const toggleApiKey = async (keyId: string, isActive: boolean) => {
    const { error } = await supabase
      .from("tenant_api_keys" as any)
      .update({ is_active: isActive } as any)
      .eq("id", keyId);
    if (error) toast.error(error.message);
    else {
      setApiKeys(prev => prev.map(k => k.id === keyId ? { ...k, is_active: isActive } : k));
      toast.success(isActive ? "Key activated" : "Key deactivated");
    }
  };

  const deleteApiKey = async (keyId: string) => {
    if (!confirm("Delete this API key? Any integrations using it will stop working.")) return;
    const { error } = await supabase.from("tenant_api_keys" as any).delete().eq("id", keyId);
    if (error) toast.error(error.message);
    else {
      setApiKeys(prev => prev.filter(k => k.id !== keyId));
      toast.success("Key deleted");
    }
  };

  const maskKey = (key: string) => key.substring(0, 10) + "••••••••••••••" + key.substring(key.length - 4);

  const getGroupName = (groupId: string | null) => {
    if (!groupId) return null;
    return providerGroups.find(g => g.id === groupId)?.name || null;
  };

  const getGroupProviderBadges = (groupId: string | null) => {
    if (!groupId) return null;
    const group = providerGroups.find(g => g.id === groupId);
    if (!group) return null;
    const enabled = ALL_PROVIDERS.filter(p => group.providers[p.key]);
    return enabled;
  };

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
      <Tabs defaultValue="tenants" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">White-Label Tenants</h1>
            <p className="text-muted-foreground mt-1">Manage tenants and provider access groups</p>
          </div>
          <TabsList>
            <TabsTrigger value="tenants">Tenants</TabsTrigger>
            <TabsTrigger value="groups">Provider Groups</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Tenants Tab ── */}
        <TabsContent value="tenants" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" /> Add Tenant
            </Button>
          </div>

          {tenants.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No tenants yet</p>
                <p className="text-sm mt-1">Create a tenant to enable white-label for a custom domain</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {tenants.map((t) => {
                const groupName = getGroupName(t.provider_group_id);
                const enabledProviders = getGroupProviderBadges(t.provider_group_id);
                return (
                  <Card key={t.id}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Globe className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-foreground">{t.name}</p>
                            <Badge variant={t.is_active ? "default" : "secondary"}>
                              {t.is_active ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {t.settings?.business_model === "commission" ? "Commission" : "Reseller"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            {t.domain}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {groupName ? (
                              <>
                                <Badge variant="outline" className="text-xs gap-1">
                                  <Network className="w-3 h-3" /> {groupName}
                                </Badge>
                                {enabledProviders?.map(p => (
                                  <Badge key={p.key} variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {p.label}
                                  </Badge>
                                ))}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">No provider group — no API access</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openApiKeyDialog(t)} title="API Keys">
                          <Key className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openAdminDialog(t)} title="Manage Admins">
                          <UserPlus className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(t.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Provider Groups Tab ── */}
        <TabsContent value="groups" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Define region-based provider groups. Assign a group to each tenant to control which global APIs they can access.
            </p>
            <Button onClick={openCreateGroup} className="gap-2 shrink-0">
              <Plus className="w-4 h-4" /> Add Group
            </Button>
          </div>

          {providerGroups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Network className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No provider groups yet</p>
                <p className="text-sm mt-1">Create groups like "APAC", "Europe", or "Global" to control API access</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {providerGroups.map((g) => {
                const enabled = ALL_PROVIDERS.filter(p => g.providers[p.key]);
                const usedBy = tenants.filter(t => t.provider_group_id === g.id).length;
                return (
                  <Card key={g.id}>
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Settings2 className="w-4 h-4 text-primary" />
                          <p className="font-semibold text-foreground">{g.name}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditGroup(g)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteGroup(g.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
                      <div className="flex flex-wrap gap-1">
                        {enabled.length > 0 ? enabled.map(p => (
                          <Badge key={p.key} variant="secondary" className="text-xs">{p.label}</Badge>
                        )) : (
                          <span className="text-xs text-muted-foreground italic">No providers enabled</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{usedBy} tenant{usedBy !== 1 ? "s" : ""} using this group</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Tenant Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Tenant" : "Create Tenant"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Domain (CNAME target)</Label>
              <Input
                value={form.domain}
                onChange={(e) => setForm((p) => ({ ...p, domain: e.target.value }))}
                placeholder="client.example.com"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Customer sets a CNAME record pointing their domain to your app</p>
            </div>
            <div>
              <Label>Tenant Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Acme Travel"
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
            </div>

            {/* Provider Group Selection */}
            <div className="border-t border-border pt-4">
              <p className="font-semibold text-sm mb-1">API Provider Access</p>
              <p className="text-xs text-muted-foreground mb-3">
                Select a provider group to define which global APIs this tenant can use. Leave unset for no API access.
              </p>
              <Select
                value={form.provider_group_id || "none"}
                onValueChange={(v) => setForm((p) => ({ ...p, provider_group_id: v === "none" ? null : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No provider group (no API access)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No provider group (no API access)</SelectItem>
                  {providerGroups.map((g) => {
                    const enabled = ALL_PROVIDERS.filter(p => g.providers[p.key]).map(p => p.label);
                    return (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} — {enabled.length > 0 ? enabled.join(", ") : "none"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Business Model */}
            <div className="border-t border-border pt-4">
              <p className="font-semibold text-sm mb-1">Business Model</p>
              <p className="text-xs text-muted-foreground mb-3">
                Commission tenants use global payment & settings and earn a percentage on each booking. Reseller tenants manage their own wallet, payment gateways, and pricing.
              </p>
              <Select
                value={form.settings.business_model || "reseller"}
                onValueChange={(v) => updateSetting("business_model", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reseller">Reseller (Wallet + Own Payment)</SelectItem>
                  <SelectItem value="commission">Commission (Global Payment + Earn %)</SelectItem>
                </SelectContent>
              </Select>
              {(form.settings.business_model === "commission") && (
                <div className="mt-3">
                  <Label className="text-xs">Commission Percentage (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={form.settings.commission_percentage || 0}
                    onChange={(e) => updateSetting("commission_percentage", parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 5"
                    className="mt-1 w-32"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Tenant earns this % on every booking made through their site</p>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <p className="font-semibold text-sm mb-3">Branding Overrides</p>
              <div className="space-y-3">
                <div>
                  <Label>Site Name</Label>
                  <Input value={form.settings.site_name} onChange={(e) => updateSetting("site_name", e.target.value)} placeholder="Uses tenant name if empty" className="mt-1" />
                </div>
                <div>
                  <Label>Logo URL</Label>
                  <Input value={form.settings.logo_url} onChange={(e) => updateSetting("logo_url", e.target.value)} placeholder="https://..." className="mt-1" />
                </div>
                <div>
                  <Label>Favicon URL</Label>
                  <Input value={form.settings.favicon_url} onChange={(e) => updateSetting("favicon_url", e.target.value)} placeholder="https://..." className="mt-1" />
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="font-semibold text-sm mb-3">Theme Color Overrides</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "color_primary", label: "Primary", fallback: "#0092ff" },
                  { key: "color_accent", label: "Accent", fallback: "#ff6b2c" },
                  { key: "color_background", label: "Background", fallback: "#f7fafd" },
                  { key: "color_foreground", label: "Foreground", fallback: "#0a1929" },
                ].map(({ key, label, fallback }) => (
                  <div key={key}>
                    <Label className="text-xs">{label}</Label>
                    <div className="flex gap-2 mt-1">
                      <input type="color" value={form.settings[key] || fallback} onChange={(e) => updateSetting(key, e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
                      <Input value={form.settings[key]} onChange={(e) => updateSetting(key, e.target.value)} placeholder={fallback} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Provider Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Provider Group" : "Create Provider Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Group Name</Label>
              <Input
                value={groupForm.name}
                onChange={(e) => setGroupForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. APAC, Europe, Global"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={groupForm.description}
                onChange={(e) => setGroupForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Short description of this group"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="mb-2 block">Enabled Providers</Label>
              <div className="space-y-3">
                {ALL_PROVIDERS.map(p => (
                  <div key={p.key} className="flex items-center gap-3">
                    <Checkbox
                      id={`grp-${p.key}`}
                      checked={!!groupForm.providers[p.key]}
                      onCheckedChange={(v) =>
                        setGroupForm(prev => ({
                          ...prev,
                          providers: { ...prev.providers, [p.key]: !!v },
                        }))
                      }
                    />
                    <label htmlFor={`grp-${p.key}`} className="text-sm text-foreground cursor-pointer">{p.label}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveGroup} disabled={savingGroup} className="gap-2">
              {savingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingGroup ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Assignment Dialog */}
      <Dialog open={!!adminDialog} onOpenChange={(open) => !open && setAdminDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Manage Admins — {adminDialog?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="Enter user email..."
                onKeyDown={(e) => e.key === "Enter" && assignAdmin()}
              />
              <Button onClick={assignAdmin} disabled={assigningAdmin || !adminEmail.trim()} size="sm" className="gap-1 shrink-0">
                {assigningAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Add
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Assigned Admins</Label>
              {loadingAdmins ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : tenantAdmins.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">No admins assigned yet</p>
              ) : (
                tenantAdmins.map((admin) => (
                  <div key={admin.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">{admin.full_name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">{admin.email}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeAdmin(admin.id)} className="h-7 w-7">
                      <X className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* API Key Management Dialog */}
      <Dialog open={!!apiKeyDialog} onOpenChange={(open) => !open && setApiKeyDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              API Keys — {apiKeyDialog?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground text-sm mb-1">Integration Endpoint</p>
              <code className="text-[11px] break-all">POST {window.location.origin.replace(/:\d+$/, '')}/functions/v1/tenant-api</code>
              <p className="mt-2">Pass <code className="bg-muted px-1 rounded">x-api-key</code> header with the key below.</p>
            </div>

            {/* Generate new key */}
            <div className="flex gap-2">
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name (e.g. Production)"
                className="flex-1"
              />
              <Button onClick={generateApiKey} disabled={generatingKey} size="sm" className="gap-1 shrink-0">
                {generatingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Generate
              </Button>
            </div>

            {/* Key list */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Keys</Label>
              {loadingKeys ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">No API keys yet. Generate one above.</p>
              ) : (
                apiKeys.map((k) => {
                  const isRevealed = revealedKeys.has(k.id);
                  return (
                    <div key={k.id} className="p-3 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{k.name}</p>
                          <Badge variant={k.is_active ? "default" : "secondary"} className="text-[10px]">
                            {k.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            setRevealedKeys(prev => {
                              const next = new Set(prev);
                              isRevealed ? next.delete(k.id) : next.add(k.id);
                              return next;
                            });
                          }}>
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            navigator.clipboard.writeText(k.api_key);
                            toast.success("Key copied to clipboard");
                          }}>
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Switch
                            checked={k.is_active}
                            onCheckedChange={(v) => toggleApiKey(k.id, v)}
                            className="scale-75"
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteApiKey(k.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground break-all">
                        {isRevealed ? k.api_key : maskKey(k.api_key)}
                      </p>
                      {k.last_used_at && (
                        <p className="text-[10px] text-muted-foreground">Last used: {new Date(k.last_used_at).toLocaleString()}</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminTenants;
