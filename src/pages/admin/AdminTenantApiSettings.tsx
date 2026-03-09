import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Save, Loader2, Plane, ShieldCheck, Eye, EyeOff, TestTube, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProviderDef {
  key: string;
  label: string;
  icon: typeof Plane;
  fields: { key: string; label: string; type?: string; placeholder?: string }[];
}

const PROVIDERS: ProviderDef[] = [
  {
    key: "travelport",
    label: "Travelport (UAPI)",
    icon: Plane,
    fields: [
      { key: "target_branch", label: "Target Branch (PCC)", placeholder: "e.g. P7210462" },
      { key: "username", label: "Username", placeholder: "Universal API/uAPI..." },
      { key: "password", label: "Password", type: "password", placeholder: "••••••" },
      { key: "endpoint", label: "Endpoint URL", placeholder: "https://emea.universal-api.travelport.com/B2BGateway/connect/uAPI/AirService" },
    ],
  },
  {
    key: "amadeus",
    label: "Amadeus",
    icon: Plane,
    fields: [
      { key: "api_key", label: "API Key (Client ID)", placeholder: "Your Amadeus API Key" },
      { key: "api_secret", label: "API Secret", type: "password", placeholder: "••••••" },
      { key: "environment", label: "Environment", placeholder: "test or production" },
    ],
  },
];

interface SettingsRow {
  id?: string;
  provider: string;
  is_active: boolean;
  settings: Record<string, any>;
}

const AdminTenantApiSettings = () => {
  const { adminTenantId, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, SettingsRow>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // Re-auth gate
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [reAuthPassword, setReAuthPassword] = useState("");
  const [reAuthLoading, setReAuthLoading] = useState(false);

  const handleReAuth = async () => {
    if (!user?.email) return;
    setReAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: reAuthPassword });
      if (error) {
        toast.error("Incorrect password. Please try again.");
      } else {
        setIsUnlocked(true);
        setReAuthPassword("");
        toast.success("API settings unlocked for 15 minutes.");
        setTimeout(() => { setIsUnlocked(false); toast.info("API settings locked for security."); }, 15 * 60 * 1000);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally { setReAuthLoading(false); }
  };

  useEffect(() => {
    if (!adminTenantId) {
      setLoading(false);
      return;
    }
    loadSettings();
  }, [adminTenantId]);

  const loadSettings = async () => {
    const { data: rows } = await (supabase as any)
      .from("tenant_api_settings")
      .select("*")
      .eq("tenant_id", adminTenantId);

    const map: Record<string, SettingsRow> = {};
    PROVIDERS.forEach((p) => {
      const existing = (rows || []).find((r: any) => r.provider === p.key);
      map[p.key] = existing
        ? { id: existing.id, provider: p.key, is_active: existing.is_active, settings: existing.settings || {} }
        : { provider: p.key, is_active: false, settings: {} };
    });
    setData(map);
    setLoading(false);
  };

  const updateField = (provider: string, field: string, value: string) => {
    setData((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        settings: { ...prev[provider].settings, [field]: value },
      },
    }));
  };

  const toggleActive = (provider: string) => {
    setData((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], is_active: !prev[provider].is_active },
    }));
  };

  const handleSave = async (providerKey: string) => {
    if (!adminTenantId) return;
    setSaving(providerKey);

    const row = data[providerKey];
    const payload = {
      tenant_id: adminTenantId,
      provider: providerKey,
      is_active: row.is_active,
      settings: row.settings,
    };

    let error;
    if (row.id) {
      ({ error } = await (supabase as any)
        .from("tenant_api_settings")
        .update({ is_active: payload.is_active, settings: payload.settings })
        .eq("id", row.id));
    } else {
      const { data: inserted, error: err } = await (supabase as any)
        .from("tenant_api_settings")
        .insert(payload)
        .select("id")
        .single();
      error = err;
      if (inserted) {
        setData((prev) => ({
          ...prev,
          [providerKey]: { ...prev[providerKey], id: inserted.id },
        }));
      }
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${PROVIDERS.find((p) => p.key === providerKey)?.label} settings saved`);
    }
    setSaving(null);
  };

  const handleTest = async (providerKey: string) => {
    setTesting(providerKey);
    const row = data[providerKey];

    try {
      if (providerKey === "travelport") {
        const { data: result, error } = await supabase.functions.invoke("travelport-search", {
          body: {
            test: true,
            tenantCredentials: row.settings,
          },
        });
        if (error) throw error;
        if (result?.success) {
          toast.success("Travelport connection successful!");
        } else {
          toast.error(result?.error || "Connection failed");
        }
      } else if (providerKey === "amadeus") {
        toast.info("Amadeus test: credentials will be validated on next search");
      }
    } catch (e: any) {
      toast.error(e.message || "Test failed");
    }
    setTesting(null);
  };

  if (!adminTenantId) {
    return (
      <AdminLayout>
        <div className="text-center py-20 text-muted-foreground">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">API Settings are only available for tenant admins</p>
          <p className="text-sm mt-1">Super admins manage global API settings from the main API Settings page.</p>
        </div>
      </AdminLayout>
    );
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!isUnlocked) {
    return (
      <AdminLayout>
        <div className="max-w-md mx-auto mt-20 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">API Settings Locked</h2>
            <p className="text-sm text-muted-foreground">Re-enter your password to view and manage API credentials.</p>
          </div>
          <Card className="border-border/60">
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input value={user?.email || ""} disabled className="h-9 text-sm bg-muted/30" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Password</Label>
                <Input type="password" placeholder="Enter your password" className="h-9 text-sm" value={reAuthPassword} onChange={(e) => setReAuthPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleReAuth()} />
              </div>
              <Button className="w-full" onClick={handleReAuth} disabled={reAuthLoading || !reAuthPassword}>
                {reAuthLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Verify & Unlock
              </Button>
            </CardContent>
          </Card>
          <p className="text-[11px] text-center text-muted-foreground">Access will auto-lock after 15 minutes.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Your API Settings</h1>
            <p className="text-muted-foreground mt-1">
              Configure your own API credentials. When enabled, searches will use your keys instead of the platform's.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setIsUnlocked(false)}>
            <Lock className="w-3.5 h-3.5" /> Lock
          </Button>
        </div>

        {PROVIDERS.map((provider) => {
          const row = data[provider.key];
          const isSaving = saving === provider.key;
          const isTesting = testing === provider.key;
          const showPw = showPasswords[provider.key];

          return (
            <Card key={provider.key} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <provider.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{provider.label}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {row.is_active ? "Active — searches will use your credentials" : "Inactive — platform credentials will be used"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={row.is_active ? "default" : "secondary"}>
                      {row.is_active ? "Active" : "Inactive"}
                    </Badge>
                    <Switch checked={row.is_active} onCheckedChange={() => toggleActive(provider.key)} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {provider.fields.map((field) => (
                    <div key={field.key}>
                      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {field.label}
                      </Label>
                      <div className="flex gap-1 mt-1.5">
                        <Input
                          type={field.type === "password" && !showPw ? "password" : "text"}
                          value={row.settings[field.key] || ""}
                          onChange={(e) => updateField(provider.key, field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="font-mono text-sm"
                        />
                        {field.type === "password" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setShowPasswords((p) => ({ ...p, [provider.key]: !p[provider.key] }))
                            }
                            className="shrink-0"
                          >
                            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                  <Button onClick={() => handleSave(provider.key)} disabled={isSaving} className="gap-2">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                  {provider.key === "travelport" && (
                    <Button variant="outline" onClick={() => handleTest(provider.key)} disabled={isTesting} className="gap-2">
                      {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                      Test Connection
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AdminLayout>
  );
};

export default AdminTenantApiSettings;
