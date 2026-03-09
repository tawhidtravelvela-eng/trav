import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Eye, EyeOff, Plane, TestTube, Globe, Database, DollarSign, Receipt, RefreshCw, Building2, MapPin, Settings2, ShieldCheck, Lock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";

interface TravelportSettings {
  target_branch: string;
  username: string;
  password: string;
  endpoint: string;
  environment?: string;
}

const TRAVELPORT_ENDPOINTS: Record<string, { label: string; url: string }> = {
  production: { label: "Production", url: "https://apac.universal-api.travelport.com/B2BGateway/connect/uAPI/AirService" },
  preproduction: { label: "Pre-Production", url: "https://apac.universal-api.pp.travelport.com/B2BGateway/connect/uAPI/AirService" },
};

interface AmadeusSettings {
  environment: string;
}

interface ApiProvider {
  id: string;
  provider: string;
  is_active: boolean;
  settings: any;
}

const AdminApiSettings = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState("flights");

  // Re-auth gate
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [reAuthPassword, setReAuthPassword] = useState("");
  const [reAuthLoading, setReAuthLoading] = useState(false);
  const RE_AUTH_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

  const handleReAuth = async () => {
    if (!user?.email) return;
    setReAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: reAuthPassword,
      });
      if (error) {
        toast({ title: "Authentication failed", description: "Incorrect password. Please try again.", variant: "destructive" });
      } else {
        setIsUnlocked(true);
        setReAuthPassword("");
        toast({ title: "Access granted", description: "API settings unlocked for 15 minutes." });
        // Auto-lock after timeout
        setTimeout(() => {
          setIsUnlocked(false);
          toast({ title: "Session locked", description: "API settings locked for security. Re-enter password to continue." });
        }, RE_AUTH_TIMEOUT_MS);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setReAuthLoading(false);
    }
  };

  // Travelport state
  const [tpData, setTpData] = useState<ApiProvider | null>(null);
  const [tpActive, setTpActive] = useState(false);
  const [tpStudentFare, setTpStudentFare] = useState(false);
  const [tpEnv, setTpEnv] = useState("production");
  const [tpSettings, setTpSettings] = useState<TravelportSettings>({
    target_branch: "", username: "", password: "",
    endpoint: TRAVELPORT_ENDPOINTS.production.url,
    environment: "production",
  });

  // Amadeus state
  const [amData, setAmData] = useState<ApiProvider | null>(null);
  const [amActive, setAmActive] = useState(false);
  const [amStudentFare, setAmStudentFare] = useState(false);
  const [amEnv, setAmEnv] = useState("test");

  // Local inventory state
  const [invData, setInvData] = useState<ApiProvider | null>(null);
  const [invActive, setInvActive] = useState(true);

  // TravelVela state
  const [tvData, setTvData] = useState<ApiProvider | null>(null);
  const [tvActive, setTvActive] = useState(false);
  const [tvStudentFare, setTvStudentFare] = useState(false);

  // TravelVela Hotel state
  const [tvhData, setTvhData] = useState<ApiProvider | null>(null);
  const [tvhActive, setTvhActive] = useState(false);

  // Tripjack Hotel state
  const [tjhData, setTjhData] = useState<ApiProvider | null>(null);
  const [tjhActive, setTjhActive] = useState(false);
  const tjhEnv = "production";

  // Tripjack Flight state
  const [tjfData, setTjfData] = useState<ApiProvider | null>(null);
  const [tjfActive, setTjfActive] = useState(false);
  const [tjfStudentFare, setTjfStudentFare] = useState(false);
  const [tjfEnv, setTjfEnv] = useState("test");

  // Currency settings state
  const [currData, setCurrData] = useState<ApiProvider | null>(null);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});
  const [conversionMarkup, setConversionMarkup] = useState(2);
  const [apiSourceCurrencies, setApiSourceCurrencies] = useState<Record<string, string>>({
    travelport: "BDT", travelvela: "BDT", travelvela_hotel: "BDT", amadeus: "USD", local_inventory: "USD", tripjack: "INR",
  });
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [fetchingRates, setFetchingRates] = useState(false);
  const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "BDT", "INR", "AED", "SAR", "MYR", "SGD", "THB", "JPY", "CNY", "AUD", "CAD", "CHF", "PKR", "LKR", "NPR"];

  // Taxes & fees state
  const [taxData, setTaxData] = useState<ApiProvider | null>(null);
  const [taxPercentage, setTaxPercentage] = useState(0);
  const [convenienceFeePercentage, setConvenienceFeePercentage] = useState(0);
  const [serviceFee, setServiceFee] = useState(0);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.from("api_settings").select("*");
      if (error) throw error;
      if (data) {
        const tp = data.find((d: any) => d.provider === "travelport");
        if (tp) {
          setTpData(tp as any);
          setTpActive(tp.is_active);
          const s = tp.settings as unknown as TravelportSettings & { student_fare_enabled?: boolean };
          const env = s.environment || (s.endpoint?.includes('.pp.') ? 'preproduction' : 'production');
          setTpEnv(env);
          setTpSettings({
            target_branch: s.target_branch || "", username: s.username || "", password: s.password || "",
            endpoint: s.endpoint || TRAVELPORT_ENDPOINTS[env]?.url || TRAVELPORT_ENDPOINTS.production.url,
            environment: env,
          });
          setTpStudentFare(s.student_fare_enabled ?? false);
        }
        const am = data.find((d: any) => d.provider === "amadeus");
        if (am) {
          setAmData(am as any);
          setAmActive(am.is_active);
          const s = am.settings as unknown as AmadeusSettings & { student_fare_enabled?: boolean };
          setAmEnv(s.environment || "test");
          setAmStudentFare(s.student_fare_enabled ?? false);
        }
        const inv = data.find((d: any) => d.provider === "local_inventory");
        if (inv) {
          setInvData(inv as any);
          setInvActive(inv.is_active);
        }
        const tv = data.find((d: any) => d.provider === "travelvela");
        if (tv) {
          setTvData(tv as any);
          setTvActive(tv.is_active);
          const tvSettings = tv.settings as any;
          setTvStudentFare(tvSettings?.student_fare_enabled ?? false);
        }
        const tvh = data.find((d: any) => d.provider === "travelvela_hotel");
        if (tvh) {
          setTvhData(tvh as any);
          setTvhActive(tvh.is_active);
        }
        const tjh = data.find((d: any) => d.provider === "tripjack_hotel");
        if (tjh) {
          setTjhData(tjh as any);
          setTjhActive(tjh.is_active);
        }
        const tjf = data.find((d: any) => d.provider === "tripjack_flight");
        if (tjf) {
          setTjfData(tjf as any);
          setTjfActive(tjf.is_active);
          const tjfSettings = tjf.settings as any;
          setTjfEnv(tjfSettings?.environment || "test");
          setTjfStudentFare(tjfSettings?.student_fare_enabled ?? false);
        }
        const curr = data.find((d: any) => d.provider === "currency_rates");
        if (curr) {
          setCurrData(curr as any);
          const s = curr.settings as any;
          if (s.live_rates) setLiveRates(s.live_rates);
          if (s.conversion_markup !== undefined) setConversionMarkup(s.conversion_markup);
          if (s.api_source_currencies) setApiSourceCurrencies(prev => ({ ...prev, ...s.api_source_currencies }));
          if (s.last_fetched) setLastFetched(s.last_fetched);
        }
        const tax = data.find((d: any) => d.provider === "taxes_fees");
        if (tax) {
          setTaxData(tax as any);
          const ts = tax.settings as any;
          setTaxPercentage(ts.tax_percentage || 0);
          setConvenienceFeePercentage(ts.convenience_fee_percentage ?? 0);
          setServiceFee(ts.service_fee || 0);
        }
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- Save handlers ---
  const handleSaveTravelport = async () => {
    if (!tpData) return;
    setSaving("travelport");
    try {
      const { error } = await supabase.from("api_settings").update({ settings: { ...tpSettings, environment: tpEnv, student_fare_enabled: tpStudentFare } as any, is_active: tpActive }).eq("id", tpData.id);
      if (error) throw error;
      toast({ title: "Settings saved", description: "Travelport API settings updated successfully." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(null); }
  };

  const handleSaveAmadeus = async () => {
    if (!amData) return;
    setSaving("amadeus");
    try {
      const { error } = await supabase.from("api_settings").update({ settings: { environment: amEnv, student_fare_enabled: amStudentFare } as any, is_active: amActive }).eq("id", amData.id);
      if (error) throw error;
      toast({ title: "Settings saved", description: "Amadeus API settings updated successfully." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(null); }
  };

  const handleSaveInventory = async () => {
    if (!invData) return;
    setSaving("inventory");
    try {
      const { error } = await supabase.from("api_settings").update({ is_active: invActive }).eq("id", invData.id);
      if (error) throw error;
      toast({ title: "Settings saved", description: "Local inventory settings updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(null); }
  };

  const handleSaveCurrency = async () => {
    setSaving("currency");
    try {
      const payload = {
        live_rates: liveRates, conversion_markup: conversionMarkup,
        api_source_currencies: apiSourceCurrencies, last_fetched: lastFetched,
      };
      if (currData) {
        const { error } = await supabase.from("api_settings").update({ settings: payload as any }).eq("id", currData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("api_settings").insert({ provider: "currency_rates", settings: payload as any, is_active: true });
        if (error) throw error;
      }
      toast({ title: "Settings saved", description: "Currency settings updated successfully." });
      window.dispatchEvent(new Event("currency-rates-updated"));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(null); }
  };

  const handleFetchRates = async () => {
    setFetchingRates(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-exchange-rates");
      if (error) throw error;
      if (data?.success) {
        setLiveRates(data.rates);
        setLastFetched(data.last_fetched);
        toast({ title: "Rates fetched", description: "Live exchange rates updated from API." });
      } else {
        throw new Error(data?.error || "Failed to fetch rates");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setFetchingRates(false); }
  };

  // --- Test handlers ---
  const handleTestTravelport = async () => {
    if (!tpSettings.username || !tpSettings.password || !tpSettings.target_branch) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    setTesting("travelport");
    try {
      const { data, error } = await supabase.functions.invoke("travelport-search", { body: { test: true } });
      if (error) throw error;
      if (data?.success) toast({ title: "Connection successful", description: "Travelport API is reachable." });
      else toast({ title: "Connection failed", description: data?.error || "Could not connect.", variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally { setTesting(null); }
  };

  const handleTestAmadeus = async () => {
    setTesting("amadeus");
    try {
      const { data, error } = await supabase.functions.invoke("amadeus-search", { body: { test: true } });
      if (error) throw error;
      if (data?.success) toast({ title: "Connection successful", description: "Amadeus API credentials are valid." });
      else toast({ title: "Connection failed", description: data?.error || "Could not authenticate.", variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally { setTesting(null); }
  };

  const handleSaveTravelvela = async () => {
    if (!tvData) return;
    setSaving("travelvela");
    try {
      const { error } = await supabase.from("api_settings").update({ settings: { student_fare_enabled: tvStudentFare } as any, is_active: tvActive }).eq("id", tvData.id);
      if (error) throw error;
      toast({ title: "Settings saved", description: "TravelVela settings updated successfully." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(null); }
  };

  const handleTestTravelvela = async () => {
    setTesting("travelvela");
    try {
      const { data, error } = await supabase.functions.invoke("travelvela-search", { body: { test: true } });
      if (error) throw error;
      if (data?.success) toast({ title: "Connection successful", description: "TravelVela API is reachable." });
      else toast({ title: "Connection failed", description: data?.error || "Could not connect.", variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally { setTesting(null); }
  };

  const handleSaveTravelvelaHotel = async () => {
    setSaving("travelvela_hotel");
    try {
      const payload = { provider: "travelvela_hotel", settings: {} as any, is_active: tvhActive };
      if (tvhData) {
        const { error } = await supabase.from("api_settings").update({ is_active: tvhActive }).eq("id", tvhData.id);
        if (error) throw error;
      } else {
        const { data: row, error } = await supabase.from("api_settings").insert(payload).select("*").single();
        if (error) throw error;
        setTvhData(row as any);
      }
      toast({ title: "Settings saved", description: "TravelVela Hotel settings updated successfully." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(null); }
  };

  const handleTestTravelvelaHotel = async () => {
    setTesting("travelvela_hotel");
    try {
      const { data, error } = await supabase.functions.invoke("travelvela-hotel-search", { body: { action: "test" } });
      if (error) throw error;
      if (data?.success) toast({ title: "Connection successful", description: "TravelVela Hotel API is reachable." });
      else toast({ title: "Connection failed", description: data?.error || "Could not connect.", variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally { setTesting(null); }
  };

  const handleSaveTripjackHotel = async () => {
    setSaving("tripjack_hotel");
    try {
      const payload = { environment: tjhEnv };
      if (tjhData) {
        const { error } = await supabase.from("api_settings").update({ settings: payload as any, is_active: tjhActive }).eq("id", tjhData.id);
        if (error) throw error;
      } else {
        const { data: row, error } = await supabase.from("api_settings").insert({ provider: "tripjack_hotel", settings: payload as any, is_active: tjhActive }).select("*").single();
        if (error) throw error;
        setTjhData(row as any);
      }
      toast({ title: "Settings saved", description: "Tripjack Hotel settings updated successfully." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(null); }
  };

  const handleTestTripjackHotel = async () => {
    setTesting("tripjack_hotel");
    try {
      const { data, error } = await supabase.functions.invoke("tripjack-hotel-search", { body: { action: "test" } });
      if (error) throw error;
      if (data?.success) toast({ title: "Connection successful", description: "Tripjack Hotel API is reachable." });
      else toast({ title: "Connection failed", description: data?.error || "Could not connect.", variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally { setTesting(null); }
  };

  // Tripjack Flight handlers
  const handleSaveTripjackFlight = async () => {
    setSaving("tripjack_flight");
    try {
      const payload = { environment: tjfEnv, student_fare_enabled: tjfStudentFare };
      if (tjfData) {
        const { error } = await supabase.from("api_settings").update({ settings: payload as any, is_active: tjfActive }).eq("id", tjfData.id);
        if (error) throw error;
      } else {
        const { data: row, error } = await supabase.from("api_settings").insert({ provider: "tripjack_flight", settings: payload as any, is_active: tjfActive }).select("*").single();
        if (error) throw error;
        setTjfData(row as any);
      }
      toast({ title: "Settings saved", description: "Tripjack Flight settings updated successfully." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(null); }
  };

  const handleTestTripjackFlight = async () => {
    setTesting("tripjack_flight");
    try {
      const { data, error } = await supabase.functions.invoke("tripjack-search", { body: { test: true } });
      if (error) throw error;
      if (data?.success) toast({ title: "Connection successful", description: "Tripjack Air API is reachable." });
      else toast({ title: "Connection failed", description: data?.error || "Could not connect.", variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally { setTesting(null); }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  // --- Active provider counts ---
  const flightCount = [tpActive, amActive, tvActive, invActive, tjfActive].filter(Boolean).length;
  const hotelCount = [tvhActive, tjhActive].filter(Boolean).length;

  // Re-auth gate screen
  if (!isUnlocked) {
    return (
      <AdminLayout>
        <div className="max-w-md mx-auto mt-20 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">API Settings Locked</h2>
            <p className="text-sm text-muted-foreground">
              For security, please re-enter your password to view and manage API keys and integration settings.
            </p>
          </div>
          <Card className="border-border/60">
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reauth_email" className="text-xs">Email</Label>
                <Input id="reauth_email" value={user?.email || ""} disabled className="h-9 text-sm bg-muted/30" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reauth_password" className="text-xs">Password</Label>
                <Input
                  id="reauth_password"
                  type="password"
                  placeholder="Enter your password"
                  className="h-9 text-sm"
                  value={reAuthPassword}
                  onChange={(e) => setReAuthPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleReAuth()}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleReAuth}
                disabled={reAuthLoading || !reAuthPassword}
              >
                {reAuthLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 mr-2" />
                )}
                Verify & Unlock
              </Button>
            </CardContent>
          </Card>
          <p className="text-[11px] text-center text-muted-foreground">
            Access will auto-lock after 15 minutes of inactivity.
          </p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">API & Integrations</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage external API providers, pricing, and currency settings</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setIsUnlocked(false)}>
            <Lock className="w-3.5 h-3.5" /> Lock
          </Button>
        </div>

        {/* Quick status overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Flight APIs", count: flightCount, total: 5, icon: Plane, color: "text-primary" },
            { label: "Hotel APIs", count: hotelCount, total: 2, icon: Building2, color: "text-emerald-500" },
            { label: "Tour APIs", count: 0, total: 0, icon: MapPin, color: "text-amber-500" },
            { label: "General", count: null, total: null, icon: Settings2, color: "text-muted-foreground" },
          ].map(({ label, count, total, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-3.5 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center ${color}`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                {count !== null ? (
                  <p className="text-sm font-bold text-foreground">{count}/{total} active</p>
                ) : (
                  <p className="text-sm font-bold text-foreground">Config</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Tabbed sections */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-4 h-11">
            <TabsTrigger value="flights" className="gap-1.5 text-xs sm:text-sm">
              <Plane className="w-3.5 h-3.5" /> Flights
            </TabsTrigger>
            <TabsTrigger value="hotels" className="gap-1.5 text-xs sm:text-sm">
              <Building2 className="w-3.5 h-3.5" /> Hotels
            </TabsTrigger>
            <TabsTrigger value="tours" className="gap-1.5 text-xs sm:text-sm">
              <MapPin className="w-3.5 h-3.5" /> Tours
            </TabsTrigger>
            <TabsTrigger value="general" className="gap-1.5 text-xs sm:text-sm">
              <Settings2 className="w-3.5 h-3.5" /> General
            </TabsTrigger>
          </TabsList>

          {/* ═══════ FLIGHTS TAB ═══════ */}
          <TabsContent value="flights" className="space-y-5 mt-5">
            <div className="flex items-center gap-2 mb-1">
              <Plane className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Flight API Providers</h3>
              <Badge variant="secondary" className="text-[10px]">{flightCount} active</Badge>
            </div>

            {/* Own Inventory */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                      <Database className="w-4 h-4 text-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Own Flight Inventory</CardTitle>
                      <CardDescription className="text-xs">Manually added flights</CardDescription>
                    </div>
                  </div>
                  <Switch checked={invActive} onCheckedChange={setInvActive} />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground mb-3">When disabled, only external API results will appear in search.</p>
                <Button size="sm" onClick={handleSaveInventory} disabled={saving === "inventory"}>
                  {saving === "inventory" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Save
                </Button>
              </CardContent>
            </Card>

            {/* Travelport */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Plane className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Travelport (UAPI)</CardTitle>
                      <CardDescription className="text-xs">Real-time flight search & fare pricing</CardDescription>
                    </div>
                  </div>
                  <Switch checked={tpActive} onCheckedChange={setTpActive} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Settings2 className="w-3.5 h-3.5 text-primary" />
                    <p className="text-xs font-medium text-primary">Credentials secured via backend secrets</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Username, password, and PCC are stored securely and cannot be viewed from the admin panel.</p>
                </div>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Environment</Label>
                    <Select value={tpEnv} onValueChange={(val) => {
                      setTpEnv(val);
                      const newEndpoint = TRAVELPORT_ENDPOINTS[val]?.url || tpSettings.endpoint;
                      setTpSettings({ ...tpSettings, endpoint: newEndpoint, environment: val });
                    }}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="production">🟢 Production</SelectItem>
                        <SelectItem value="preproduction">🟡 Pre-Production (Testing)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground truncate">{tpSettings.endpoint}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium">Student Fare</p>
                    <p className="text-[11px] text-muted-foreground">Enable this provider for student fare searches</p>
                  </div>
                  <Switch checked={tpStudentFare} onCheckedChange={setTpStudentFare} />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={handleSaveTravelport} disabled={saving === "travelport"}>
                    {saving === "travelport" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleTestTravelport} disabled={testing === "travelport"}>
                    {testing === "travelport" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5 mr-1.5" />}
                    Test
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Amadeus */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center">
                      <Globe className="w-4 h-4 text-accent-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Amadeus Flight Search</CardTitle>
                      <CardDescription className="text-xs">Self-Service API — free tier (2,000 req/mo)</CardDescription>
                    </div>
                  </div>
                  <Switch checked={amActive} onCheckedChange={setAmActive} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-2">
                  <Label className="text-xs">Environment</Label>
                  <div className="flex gap-2">
                    <Button variant={amEnv === "test" ? "default" : "outline"} size="sm" className="text-xs h-8" onClick={() => setAmEnv("test")}>Test</Button>
                    <Button variant={amEnv === "production" ? "default" : "outline"} size="sm" className="text-xs h-8" onClick={() => setAmEnv("production")}>Production</Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Test = free (2,000 req/mo). Production requires a paid plan.</p>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium">Student Fare</p>
                    <p className="text-[11px] text-muted-foreground">Enable this provider for student fare searches</p>
                  </div>
                  <Switch checked={amStudentFare} onCheckedChange={setAmStudentFare} />
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">API Key & Secret are stored securely as backend secrets.</p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={handleSaveAmadeus} disabled={saving === "amadeus"}>
                    {saving === "amadeus" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleTestAmadeus} disabled={testing === "amadeus"}>
                    {testing === "amadeus" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5 mr-1.5" />}
                    Test
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* TravelVela Flight */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Plane className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">TravelVela Flight API</CardTitle>
                      <CardDescription className="text-xs">Real-time search via TravelVela</CardDescription>
                    </div>
                  </div>
                  <Switch checked={tvActive} onCheckedChange={setTvActive} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium">Student Fare</p>
                    <p className="text-[11px] text-muted-foreground">Enable this provider for student fare searches</p>
                  </div>
                  <Switch checked={tvStudentFare} onCheckedChange={setTvStudentFare} />
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Auth token, username & password stored as backend secrets.</p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={handleSaveTravelvela} disabled={saving === "travelvela"}>
                    {saving === "travelvela" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleTestTravelvela} disabled={testing === "travelvela"}>
                    {testing === "travelvela" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5 mr-1.5" />}
                    Test
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Tripjack Flight */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Plane className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Tripjack Flight API</CardTitle>
                      <CardDescription className="text-xs">Real-time search via Tripjack (pre-production)</CardDescription>
                    </div>
                  </div>
                  <Switch checked={tjfActive} onCheckedChange={setTjfActive} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-2">
                  <Label className="text-xs">Environment</Label>
                  <div className="flex gap-2">
                    <Button variant={tjfEnv === "test" ? "default" : "outline"} size="sm" className="text-xs h-8" onClick={() => setTjfEnv("test")}>Pre-Production</Button>
                    <Button variant={tjfEnv === "production" ? "default" : "outline"} size="sm" className="text-xs h-8" onClick={() => setTjfEnv("production")}>Production</Button>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium">Student Fare</p>
                    <p className="text-[11px] text-muted-foreground">Enable this provider for student fare searches</p>
                  </div>
                  <Switch checked={tjfStudentFare} onCheckedChange={setTjfStudentFare} />
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">API key is stored securely on the VPS proxy. Routes through the proxy for IP whitelisting.</p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={handleSaveTripjackFlight} disabled={saving === "tripjack_flight"}>
                    {saving === "tripjack_flight" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleTestTripjackFlight} disabled={testing === "tripjack_flight"}>
                    {testing === "tripjack_flight" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5 mr-1.5" />}
                    Test
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════ HOTELS TAB ═══════ */}
          <TabsContent value="hotels" className="space-y-5 mt-5">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Hotel API Providers</h3>
              <Badge variant="secondary" className="text-[10px]">{hotelCount} active</Badge>
            </div>

            {/* TravelVela Hotel */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">TravelVela Hotel API</CardTitle>
                      <CardDescription className="text-xs">Real-time hotel search & booking</CardDescription>
                    </div>
                  </div>
                  <Switch checked={tvhActive} onCheckedChange={setTvhActive} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Uses same TravelVela credentials as the flight API (auth token, username, password).</p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={handleSaveTravelvelaHotel} disabled={saving === "travelvela_hotel"}>
                    {saving === "travelvela_hotel" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleTestTravelvelaHotel} disabled={testing === "travelvela_hotel"}>
                    {testing === "travelvela_hotel" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5 mr-1.5" />}
                    Test
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Tripjack Hotel */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Tripjack Hotel API</CardTitle>
                      <CardDescription className="text-xs">Search & book hotels via Tripjack</CardDescription>
                    </div>
                  </div>
                  <Switch checked={tjhActive} onCheckedChange={setTjhActive} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="rounded-lg bg-emerald-500/10 px-3 py-2.5">
                  <p className="text-xs font-medium text-emerald-700">Environment: Production (api.tripjack.com)</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">API Key stored securely as backend secret (TRIPJACK_API_KEY). Currency: INR only.</p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={handleSaveTripjackHotel} disabled={saving === "tripjack_hotel"}>
                    {saving === "tripjack_hotel" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleTestTripjackHotel} disabled={testing === "tripjack_hotel"}>
                    {testing === "tripjack_hotel" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5 mr-1.5" />}
                    Test
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Placeholder for future hotel APIs */}
            <div className="rounded-xl border-2 border-dashed border-border/50 p-8 text-center">
              <Building2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">More hotel integrations coming soon</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Booking.com, Agoda, and more</p>
            </div>
          </TabsContent>

          {/* ═══════ TOURS TAB ═══════ */}
          <TabsContent value="tours" className="space-y-5 mt-5">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Tour API Providers</h3>
              <Badge variant="secondary" className="text-[10px]">0 active</Badge>
            </div>

            <div className="rounded-xl border-2 border-dashed border-border/50 p-10 text-center">
              <MapPin className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No tour APIs configured yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Tour integrations like Viator, GetYourGuide will appear here</p>
            </div>
          </TabsContent>

          {/* ═══════ GENERAL TAB ═══════ */}
          <TabsContent value="general" className="space-y-5 mt-5">
            <div className="flex items-center gap-2 mb-1">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Pricing & Currency</h3>
            </div>

            {/* Taxes & Fees */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <Receipt className="w-4 h-4 text-destructive" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">Taxes & Fees</CardTitle>
                    <CardDescription className="text-xs">Applied globally to all bookings</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="tax_percentage" className="text-xs">Tax Rate (%)</Label>
                    <Input id="tax_percentage" type="number" step="0.1" min="0" max="100" className="h-9 text-sm" value={taxPercentage} onChange={(e) => setTaxPercentage(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="convenience_fee" className="text-xs">Convenience Fee (%)</Label>
                    <Input id="convenience_fee" type="number" step="0.1" min="0" max="100" className="h-9 text-sm" value={convenienceFeePercentage} onChange={(e) => setConvenienceFeePercentage(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Tax on subtotal; Convenience fee on (base fare + taxes).</p>
                <Button size="sm" onClick={async () => {
                  if (!taxData) return;
                  setSaving("taxes");
                  try {
                    const { error } = await supabase.from("api_settings").update({ settings: { tax_percentage: taxPercentage, convenience_fee_percentage: convenienceFeePercentage, service_fee: serviceFee } as any }).eq("id", taxData.id);
                    if (error) throw error;
                    toast({ title: "Settings saved", description: "Taxes & fees updated." });
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally { setSaving(null); }
                }} disabled={saving === "taxes"}>
                  {saving === "taxes" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Save
                </Button>
              </CardContent>
            </Card>

            {/* Currency & Conversion */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">Currency & Conversion</CardTitle>
                    <CardDescription className="text-xs">Live exchange rates with configurable markup</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-0">
                {/* Fetch rates */}
                <div className="rounded-lg border border-border p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-foreground">Live Exchange Rates</p>
                      <p className="text-[11px] text-muted-foreground">
                        {lastFetched ? `Last: ${new Date(lastFetched).toLocaleString()}` : "Not yet fetched"}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleFetchRates} disabled={fetchingRates}>
                      {fetchingRates ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                      Fetch
                    </Button>
                  </div>
                  {Object.keys(liveRates).length > 1 && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {["EUR", "GBP", "BDT", "INR", "AED", "SAR"].filter(c => liveRates[c]).map(code => (
                        <div key={code} className="bg-muted/30 rounded-md px-2 py-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase">{code}</p>
                          <p className="text-xs font-semibold text-foreground">{liveRates[code]?.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Markup */}
                <div className="space-y-1.5">
                  <Label htmlFor="conversion_markup" className="text-xs">Conversion Markup (%)</Label>
                  <Input id="conversion_markup" type="number" step="0.1" min="0" max="50" className="max-w-[160px] h-9 text-sm" value={conversionMarkup} onChange={(e) => setConversionMarkup(parseFloat(e.target.value) || 0)} />
                  <p className="text-[11px] text-muted-foreground">Applied on top of live rates when converting. Default 2%.</p>
                </div>

                {/* Per-API source currency */}
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-foreground">API Source Currencies</p>
                  <div className="space-y-1.5">
                    {[
                      { key: "travelport", label: "Travelport", icon: Plane },
                      { key: "travelvela", label: "TravelVela", icon: Plane },
                      { key: "amadeus", label: "Amadeus", icon: Globe },
                      { key: "local_inventory", label: "Own Inventory", icon: Database },
                    ].map(({ key, label, icon: Icon }) => (
                      <div key={key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-foreground">{label}</span>
                        </div>
                        <Select value={apiSourceCurrencies[key] || "USD"} onValueChange={(val) => setApiSourceCurrencies(prev => ({ ...prev, [key]: val }))}>
                          <SelectTrigger className="w-[100px] h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMMON_CURRENCIES.map(c => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                <Button size="sm" onClick={handleSaveCurrency} disabled={saving === "currency"}>
                  {saving === "currency" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Save Currency Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminApiSettings;
