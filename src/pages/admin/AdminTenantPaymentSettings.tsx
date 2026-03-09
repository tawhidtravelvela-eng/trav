import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Save, Loader2, CreditCard, Smartphone, Eye, EyeOff, ShieldCheck, Wallet } from "lucide-react";
import { useCurrency, CURRENCIES } from "@/contexts/CurrencyContext";

interface ProviderDef {
  key: string;
  label: string;
  icon: typeof CreditCard;
  defaultCurrencies: string[];
  fields: { key: string; label: string; type?: string; placeholder?: string }[];
}

const PAYMENT_PROVIDERS: ProviderDef[] = [
  {
    key: "stripe",
    label: "Stripe",
    icon: CreditCard,
    defaultCurrencies: ["USD", "EUR", "GBP", "AUD", "CAD", "SGD"],
    fields: [
      { key: "publishable_key", label: "Publishable Key", placeholder: "pk_live_..." },
      { key: "secret_key", label: "Secret Key", type: "password", placeholder: "sk_live_..." },
    ],
  },
  {
    key: "bkash",
    label: "bKash",
    icon: Smartphone,
    defaultCurrencies: ["BDT"],
    fields: [
      { key: "app_key", label: "App Key", placeholder: "Your bKash App Key" },
      { key: "app_secret", label: "App Secret", type: "password", placeholder: "••••••" },
      { key: "username", label: "Username", placeholder: "bKash username" },
      { key: "password", label: "Password", type: "password", placeholder: "••••••" },
    ],
  },
  {
    key: "nagad",
    label: "Nagad",
    icon: Smartphone,
    defaultCurrencies: ["BDT"],
    fields: [
      { key: "merchant_id", label: "Merchant ID", placeholder: "Your Nagad Merchant ID" },
      { key: "merchant_private_key", label: "Merchant Private Key", type: "password", placeholder: "••••••" },
      { key: "pg_public_key", label: "PG Public Key", type: "password", placeholder: "••••••" },
    ],
  },
];

const ALL_CURRENCIES = Object.keys(CURRENCIES);

interface SettingsRow {
  id?: string;
  provider: string;
  is_active: boolean;
  supported_currencies: string[];
  credentials: Record<string, any>;
}

const AdminTenantPaymentSettings = () => {
  const { adminTenantId } = useAuth();
  const { formatPrice } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, SettingsRow>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [walletBalance, setWalletBalance] = useState(0);
  const [allowGlobalFallback, setAllowGlobalFallback] = useState(true);
  const [businessModel, setBusinessModel] = useState<string>("reseller");
  const [commissionPct, setCommissionPct] = useState(0);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (!adminTenantId) { setLoading(false); return; }
    loadSettings();
  }, [adminTenantId]);

  const loadSettings = async () => {
    const [settingsRes, balanceRes, tenantRes] = await Promise.all([
      (supabase as any).from("tenant_payment_settings").select("*").eq("tenant_id", adminTenantId),
      supabase.rpc("get_tenant_wallet_balance", { _tenant_id: adminTenantId }),
      supabase.from("tenants").select("settings").eq("id", adminTenantId!).maybeSingle(),
    ]);

    const map: Record<string, SettingsRow> = {};
    PAYMENT_PROVIDERS.forEach((p) => {
      const existing = (settingsRes.data || []).find((r: any) => r.provider === p.key);
      map[p.key] = existing
        ? { id: existing.id, provider: p.key, is_active: existing.is_active, supported_currencies: existing.supported_currencies || [], credentials: existing.credentials || {} }
        : { provider: p.key, is_active: false, supported_currencies: p.defaultCurrencies, credentials: {} };
    });
    setData(map);
    setWalletBalance(Number(balanceRes.data) || 0);

    const tenantSettings = (tenantRes.data?.settings as Record<string, any>) || {};
    setAllowGlobalFallback(tenantSettings.allow_global_payment_fallback !== false);
    setBusinessModel(tenantSettings.business_model || "reseller");
    setCommissionPct(tenantSettings.commission_percentage || 0);
    setLoading(false);
  };

  const updateField = (provider: string, field: string, value: string) => {
    setData((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], credentials: { ...prev[provider].credentials, [field]: value } },
    }));
  };

  const toggleActive = (provider: string) => {
    setData((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], is_active: !prev[provider].is_active },
    }));
  };

  const toggleCurrency = (provider: string, currency: string) => {
    setData((prev) => {
      const current = prev[provider].supported_currencies;
      const updated = current.includes(currency)
        ? current.filter((c) => c !== currency)
        : [...current, currency];
      return { ...prev, [provider]: { ...prev[provider], supported_currencies: updated } };
    });
  };

  const handleSave = async (providerKey: string) => {
    if (!adminTenantId) return;
    setSaving(providerKey);
    const row = data[providerKey];
    const payload = {
      tenant_id: adminTenantId,
      provider: providerKey,
      is_active: row.is_active,
      supported_currencies: row.supported_currencies,
      credentials: row.credentials,
    };

    let error;
    if (row.id) {
      ({ error } = await (supabase as any)
        .from("tenant_payment_settings")
        .update({ is_active: payload.is_active, supported_currencies: payload.supported_currencies, credentials: payload.credentials })
        .eq("id", row.id));
    } else {
      const { data: inserted, error: err } = await (supabase as any)
        .from("tenant_payment_settings")
        .insert(payload)
        .select("id")
        .single();
      error = err;
      if (inserted) {
        setData((prev) => ({ ...prev, [providerKey]: { ...prev[providerKey], id: inserted.id } }));
      }
    }

    if (error) toast.error(error.message);
    else toast.success(`${PAYMENT_PROVIDERS.find((p) => p.key === providerKey)?.label} settings saved`);
    setSaving(null);
  };

  const handleSavePreferences = async () => {
    if (!adminTenantId) return;
    setSavingPrefs(true);
    const { data: tenantData } = await supabase.from("tenants").select("settings").eq("id", adminTenantId).maybeSingle();
    const currentSettings = (tenantData?.settings as Record<string, any>) || {};
    const updatedSettings = { ...currentSettings, allow_global_payment_fallback: allowGlobalFallback };

    const { error } = await supabase.from("tenants").update({ settings: updatedSettings } as any).eq("id", adminTenantId);
    if (error) toast.error(error.message);
    else toast.success("Preferences saved");
    setSavingPrefs(false);
  };

  if (!adminTenantId) {
    return (
      <AdminLayout>
        <div className="text-center py-20 text-muted-foreground">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Payment Settings are only available for tenant admins</p>
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


  const isCommission = businessModel === "commission";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payment Settings</h1>
          <p className="text-muted-foreground mt-1">
            {isCommission
              ? "Your account operates on a commission model. All payments go through the global platform gateway."
              : "Configure your own payment gateways to accept payments directly to your account."}
          </p>
        </div>

        {/* Commission Mode Banner */}
        {isCommission && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-5">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Commission Model Active</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You earn <span className="font-bold text-primary">{commissionPct}%</span> commission on every booking made through your site.
                    All payments are processed via the global platform gateway — no wallet or payment setup needed.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    To switch to a reseller model (own wallet + payment gateways), contact the platform administrator.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isCommission ? null : (
          <>

        {/* Wallet & Preferences */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Wallet className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Wallet & Preferences</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Your wallet balance and payment fallback settings</CardDescription>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-foreground">{formatPrice(walletBalance)}</p>
                <p className="text-xs text-muted-foreground">Wallet Balance</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium text-sm">Allow Global Payment Fallback</p>
                <p className="text-xs text-muted-foreground">When disabled and your wallet has insufficient balance, customers will see "Request to Book" instead of payment options.</p>
              </div>
              <Switch checked={allowGlobalFallback} onCheckedChange={setAllowGlobalFallback} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium text-sm">How it works</p>
                <p className="text-xs text-muted-foreground">
                  When a customer books, the system checks your payment gateways first. If unavailable for the currency, 
                  it falls back to the global gateway{!allowGlobalFallback && " (currently disabled)"}. 
                  If your wallet balance is less than the booking cost and fallback is off, only "Request to Book" is shown.
                </p>
              </div>
            </div>
            <Button onClick={handleSavePreferences} disabled={savingPrefs} className="gap-2">
              {savingPrefs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Preferences
            </Button>
          </CardContent>
        </Card>

        {/* Payment Providers */}
        {PAYMENT_PROVIDERS.map((provider) => {
          const row = data[provider.key];
          const isSaving = saving === provider.key;
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
                        {row.is_active ? "Active — payments will use your credentials" : "Inactive — global gateway will be used"}
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
                {/* Supported Currencies */}
                <div>
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supported Currencies</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {ALL_CURRENCIES.map((cur) => (
                      <Badge
                        key={cur}
                        variant={row.supported_currencies.includes(cur) ? "default" : "outline"}
                        className="cursor-pointer select-none"
                        onClick={() => toggleCurrency(provider.key, cur)}
                      >
                        {cur}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Credential Fields */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {provider.fields.map((field) => (
                    <div key={field.key}>
                      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</Label>
                      <div className="flex gap-1 mt-1.5">
                        <Input
                          type={field.type === "password" && !showPw ? "password" : "text"}
                          value={row.credentials[field.key] || ""}
                          onChange={(e) => updateField(provider.key, field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="font-mono text-sm"
                        />
                        {field.type === "password" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowPasswords((p) => ({ ...p, [provider.key]: !p[provider.key] }))}
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
                </div>
              </CardContent>
            </Card>
          );
        })}
        </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminTenantPaymentSettings;
