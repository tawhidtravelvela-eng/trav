import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Briefcase, Plane } from "lucide-react";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { useTenant } from "@/hooks/useTenant";

const RegisterAgent = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { branding } = useSiteBranding();
  const { tenant } = useTenant();
  const siteName = branding.site_name || "TravelGo";
  const nameParts = siteName.length > 3 ? [siteName.slice(0, -2), siteName.slice(-2)] : [siteName, ""];

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    companyName: "",
    companyAddress: "",
    tradeLicense: "",
  });

  const update = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.fullName,
          user_type: "b2b_agent",
          company_name: form.companyName,
          trade_license: form.tradeLicense,
          phone: form.phone,
          ...(tenant ? { tenant_id: tenant.id } : {}),
        },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Registration submitted! Please verify your email. Your account will be reviewed by our team.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <Link to="/" className="flex items-center justify-center gap-2 mb-4">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt={siteName} className="h-9 w-auto object-contain" />
            ) : (
              <>
                <Plane className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold text-foreground">
                  {nameParts[0]}<span className="text-primary">{nameParts[1]}</span>
                </span>
              </>
            )}
          </Link>
          <div className="flex items-center justify-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            <CardTitle>B2B Agent Registration</CardTitle>
          </div>
          <CardDescription>
            Join as a travel agent to access wholesale rates, commission controls, and white-label options.
            Requires admin approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Contact Person</Label>
                <Input value={form.fullName} onChange={(e) => update("fullName", e.target.value)} required placeholder="John Doe" />
              </div>
              <div>
                <Label>Phone Number</Label>
                <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} required placeholder="+880..." />
              </div>
            </div>
            <div>
              <Label>Agency / Company Name</Label>
              <Input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} required placeholder="Travel Agency Ltd." />
            </div>
            <div>
              <Label>Company Address</Label>
              <Input value={form.companyAddress} onChange={(e) => update("companyAddress", e.target.value)} placeholder="456 Travel Blvd..." />
            </div>
            <div>
              <Label>Trade License Number</Label>
              <Input value={form.tradeLicense} onChange={(e) => update("tradeLicense", e.target.value)} required placeholder="TL-XXXXXXX" />
            </div>
            <div>
              <Label>Business Email</Label>
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required placeholder="agent@agency.com" />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Submitting..." : "Submit Registration"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Already have an account? <Link to="/auth" className="text-primary hover:underline">Sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default RegisterAgent;
