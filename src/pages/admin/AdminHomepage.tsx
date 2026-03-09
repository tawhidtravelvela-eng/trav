import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidateSiteContentCache } from "@/hooks/useSiteContent";
import { Save, Loader2, Sparkles, BarChart3, ShieldCheck, Mail, Smartphone, Layout, Plus, Trash2, GripVertical } from "lucide-react";

const providerKeys = ["site_hero", "site_stats", "site_features", "site_newsletter", "site_app_download", "site_homepage"] as const;

const defaultSettings: Record<string, Record<string, any>> = {
  site_hero: {
    heading: "Find & Book Your",
    subtitle: "Search 500+ airlines for the best deals",
    rotating_words: ["Perfect Flight", "Affordable Hotel", "Luxury Tour"],
  },
  site_stats: {
    items: [
      { icon: "Users", value: 2000000, suffix: "+", label: "Happy Travelers" },
      { icon: "Plane", value: 15000, suffix: "+", label: "Flights Daily" },
      { icon: "MapPin", value: 500, suffix: "+", label: "Destinations" },
      { icon: "Award", value: 99, suffix: "%", label: "Satisfaction" },
    ],
  },
  site_features: {
    badge: "Why Choose Us",
    heading: 'Trusted by <span class="text-gradient">Millions</span> of Travelers',
    subtitle: "Here's why travelers choose us over the rest",
    items: [
      { icon: "Wallet", title: "Best Price Guarantee", desc: "We match or beat any competitor's price — no questions asked." },
      { icon: "ShieldCheck", title: "Secure Booking", desc: "Industry-grade encryption keeps your data safe at every step." },
      { icon: "Headphones", title: "24/7 Support", desc: "Our global team is always ready to help, any time zone." },
      { icon: "Clock", title: "Instant Confirmation", desc: "Get instant e-tickets and booking confirmations in seconds." },
      { icon: "Sparkles", title: "Handpicked Deals", desc: "Curated offers from 500+ airlines and 100K+ hotels worldwide." },
      { icon: "Globe", title: "Global Coverage", desc: "Flights, hotels & tours across 190+ countries at your fingertips." },
    ],
  },
  site_newsletter: {
    enabled: true,
    heading: "Get Exclusive Deals",
    subtitle: "Subscribe for curated offers and travel tips.",
    button_text: "Subscribe",
    placeholder: "Your email address",
    success_message: "Thanks for subscribing!",
  },
  site_app_download: {
    enabled: true,
    app_name: "",
    tagline: "Your travel companion",
    heading: "Travel Smarter",
    heading_accent: "With Our App",
    description: "Get exclusive app-only deals, manage bookings on the go, and receive real-time alerts — all from your pocket.",
    perks: [
      "Exclusive app-only deals & flash sales",
      "Real-time flight tracking & gate alerts",
      "Offline access to all your bookings",
      "Instant price drop notifications",
    ],
    app_store_url: "",
    play_store_url: "",
    rating: "4.9",
    review_count: "50K+",
  },
  site_homepage: {
    sections: ["hero", "stats", "offers", "trending", "destinations", "features", "testimonials", "app_download", "blog", "newsletter"],
    hidden_sections: [],
  },
};

const allSections = [
  { id: "hero", label: "Hero / Search" },
  { id: "stats", label: "Stats Bar" },
  { id: "banners", label: "Banners" },
  { id: "offers", label: "Special Offers" },
  { id: "trending", label: "Trending Flights" },
  { id: "destinations", label: "Popular Destinations" },
  { id: "features", label: "Why Choose Us" },
  { id: "testimonials", label: "Testimonials" },
  { id: "app_download", label: "App Download" },
  { id: "blog", label: "Blog Posts" },
  { id: "newsletter", label: "Newsletter" },
];

const AdminHomepage = () => {
  const [settings, setSettings] = useState<Record<string, Record<string, any>>>({ ...defaultSettings });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("api_settings")
        .select("provider, settings")
        .in("provider", [...providerKeys]);

      if (data) {
        const merged = { ...defaultSettings };
        data.forEach((row) => {
          if (merged[row.provider]) {
            merged[row.provider] = { ...merged[row.provider], ...(row.settings as Record<string, any>) };
          }
        });
        setSettings(merged);
      }
      setLoading(false);
    };
    load();
  }, []);

  const update = useCallback((provider: string, key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], [key]: value },
    }));
  }, []);

  const handleSave = async (provider: string, label: string) => {
    setSaving(provider);
    const { error } = await supabase
      .from("api_settings")
      .upsert({ provider, settings: settings[provider] as any, is_active: true }, { onConflict: "provider" });

    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success(`${label} saved successfully`);
      invalidateSiteContentCache();
    }
    setSaving(null);
  };

  const SaveButton = ({ provider, label }: { provider: string; label: string }) => (
    <Button onClick={() => handleSave(provider, label)} disabled={saving === provider} size="sm" className="gap-2 mt-4">
      {saving === provider ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {saving === provider ? "Saving..." : `Save ${label}`}
    </Button>
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  const hero = settings.site_hero;
  const stats = settings.site_stats;
  const features = settings.site_features;
  const newsletter = settings.site_newsletter;
  const appDownload = settings.site_app_download;
  const homepage = settings.site_homepage;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Homepage Content</h1>
          <p className="text-muted-foreground mt-1">Manage all homepage sections — fully API-driven for white-label support</p>
        </div>

        {/* Section Order & Visibility */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layout className="w-5 h-5 text-primary" />
              <CardTitle>Section Visibility</CardTitle>
            </div>
            <CardDescription>Toggle which sections appear on the homepage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {allSections.map((section) => {
                const hidden = homepage.hidden_sections || [];
                const isVisible = !hidden.includes(section.id);
                return (
                  <div key={section.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm font-medium">{section.label}</span>
                    <Switch
                      checked={isVisible}
                      onCheckedChange={(checked) => {
                        const newHidden = checked
                          ? hidden.filter((h: string) => h !== section.id)
                          : [...hidden, section.id];
                        update("site_homepage", "hidden_sections", newHidden);
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <SaveButton provider="site_homepage" label="Section Visibility" />
          </CardContent>
        </Card>

        {/* Hero Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <CardTitle>Hero Section</CardTitle>
            </div>
            <CardDescription>Heading, subtitle, and rotating words on the hero banner</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Heading Text</Label>
              <Input value={hero.heading} onChange={(e) => update("site_hero", "heading", e.target.value)} placeholder="Find & Book Your" className="mt-1" />
            </div>
            <div>
              <Label>Subtitle</Label>
              <Input value={hero.subtitle} onChange={(e) => update("site_hero", "subtitle", e.target.value)} placeholder="Search 500+ airlines for the best deals" className="mt-1" />
            </div>
            <div>
              <Label>Rotating Words (one per line)</Label>
              <Textarea
                value={(hero.rotating_words || []).join("\n")}
                onChange={(e) => update("site_hero", "rotating_words", e.target.value.split("\n").filter(Boolean))}
                placeholder={"Perfect Flight\nAffordable Hotel\nLuxury Tour"}
                className="mt-1"
                rows={4}
              />
            </div>
            <SaveButton provider="site_hero" label="Hero" />
          </CardContent>
        </Card>

        {/* Stats Bar */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <CardTitle>Stats Bar</CardTitle>
            </div>
            <CardDescription>The animated statistics below the hero. Available icons: Users, Plane, MapPin, Award</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(stats.items || []).map((item: any, idx: number) => (
              <div key={idx} className="grid grid-cols-4 gap-3 p-3 bg-muted/50 rounded-lg">
                <div>
                  <Label className="text-xs">Icon</Label>
                  <Input value={item.icon} onChange={(e) => {
                    const newItems = [...stats.items];
                    newItems[idx] = { ...item, icon: e.target.value };
                    update("site_stats", "items", newItems);
                  }} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Value</Label>
                  <Input type="number" value={item.value} onChange={(e) => {
                    const newItems = [...stats.items];
                    newItems[idx] = { ...item, value: Number(e.target.value) };
                    update("site_stats", "items", newItems);
                  }} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Suffix</Label>
                  <Input value={item.suffix} onChange={(e) => {
                    const newItems = [...stats.items];
                    newItems[idx] = { ...item, suffix: e.target.value };
                    update("site_stats", "items", newItems);
                  }} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Label</Label>
                  <Input value={item.label} onChange={(e) => {
                    const newItems = [...stats.items];
                    newItems[idx] = { ...item, label: e.target.value };
                    update("site_stats", "items", newItems);
                  }} className="mt-1" />
                </div>
              </div>
            ))}
            <SaveButton provider="site_stats" label="Stats" />
          </CardContent>
        </Card>

        {/* Why Choose Us / Features */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <CardTitle>Why Choose Us</CardTitle>
            </div>
            <CardDescription>Feature cards section. Icons: Wallet, ShieldCheck, Headphones, Clock, Sparkles, Globe</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div>
                <Label>Badge Text</Label>
                <Input value={features.badge} onChange={(e) => update("site_features", "badge", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Heading (HTML allowed)</Label>
                <Input value={features.heading} onChange={(e) => update("site_features", "heading", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Subtitle</Label>
                <Input value={features.subtitle} onChange={(e) => update("site_features", "subtitle", e.target.value)} className="mt-1" />
              </div>
            </div>
            {(features.items || []).map((item: any, idx: number) => (
              <div key={idx} className="grid grid-cols-3 gap-3 p-3 bg-muted/50 rounded-lg">
                <div>
                  <Label className="text-xs">Icon</Label>
                  <Input value={item.icon} onChange={(e) => {
                    const newItems = [...features.items];
                    newItems[idx] = { ...item, icon: e.target.value };
                    update("site_features", "items", newItems);
                  }} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Title</Label>
                  <Input value={item.title} onChange={(e) => {
                    const newItems = [...features.items];
                    newItems[idx] = { ...item, title: e.target.value };
                    update("site_features", "items", newItems);
                  }} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Input value={item.desc} onChange={(e) => {
                    const newItems = [...features.items];
                    newItems[idx] = { ...item, desc: e.target.value };
                    update("site_features", "items", newItems);
                  }} className="mt-1" />
                </div>
              </div>
            ))}
            <SaveButton provider="site_features" label="Features" />
          </CardContent>
        </Card>

        {/* Newsletter */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              <CardTitle>Newsletter Section</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Enabled</Label>
              <Switch checked={newsletter.enabled !== false} onCheckedChange={(v) => update("site_newsletter", "enabled", v)} />
            </div>
            <div><Label>Heading</Label><Input value={newsletter.heading} onChange={(e) => update("site_newsletter", "heading", e.target.value)} className="mt-1" /></div>
            <div><Label>Subtitle</Label><Input value={newsletter.subtitle} onChange={(e) => update("site_newsletter", "subtitle", e.target.value)} className="mt-1" /></div>
            <div><Label>Button Text</Label><Input value={newsletter.button_text} onChange={(e) => update("site_newsletter", "button_text", e.target.value)} className="mt-1" /></div>
            <div><Label>Success Message</Label><Input value={newsletter.success_message} onChange={(e) => update("site_newsletter", "success_message", e.target.value)} className="mt-1" /></div>
            <SaveButton provider="site_newsletter" label="Newsletter" />
          </CardContent>
        </Card>

        {/* App Download */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              <CardTitle>App Download Section</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Enabled</Label>
              <Switch checked={appDownload.enabled !== false} onCheckedChange={(v) => update("site_app_download", "enabled", v)} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div><Label>App Name</Label><Input value={appDownload.app_name} onChange={(e) => update("site_app_download", "app_name", e.target.value)} placeholder="Uses site name if empty" className="mt-1" /></div>
              <div><Label>Tagline</Label><Input value={appDownload.tagline} onChange={(e) => update("site_app_download", "tagline", e.target.value)} className="mt-1" /></div>
              <div><Label>Heading</Label><Input value={appDownload.heading} onChange={(e) => update("site_app_download", "heading", e.target.value)} className="mt-1" /></div>
              <div><Label>Heading Accent</Label><Input value={appDownload.heading_accent} onChange={(e) => update("site_app_download", "heading_accent", e.target.value)} className="mt-1" /></div>
              <div><Label>App Store URL</Label><Input value={appDownload.app_store_url} onChange={(e) => update("site_app_download", "app_store_url", e.target.value)} placeholder="https://apps.apple.com/..." className="mt-1" /></div>
              <div><Label>Play Store URL</Label><Input value={appDownload.play_store_url} onChange={(e) => update("site_app_download", "play_store_url", e.target.value)} placeholder="https://play.google.com/..." className="mt-1" /></div>
              <div><Label>Rating</Label><Input value={appDownload.rating} onChange={(e) => update("site_app_download", "rating", e.target.value)} className="mt-1" /></div>
              <div><Label>Review Count</Label><Input value={appDownload.review_count} onChange={(e) => update("site_app_download", "review_count", e.target.value)} className="mt-1" /></div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={appDownload.description} onChange={(e) => update("site_app_download", "description", e.target.value)} className="mt-1" rows={3} />
            </div>
            <div>
              <Label>Perks (one per line)</Label>
              <Textarea
                value={(appDownload.perks || []).join("\n")}
                onChange={(e) => update("site_app_download", "perks", e.target.value.split("\n").filter(Boolean))}
                className="mt-1"
                rows={5}
              />
            </div>
            <SaveButton provider="site_app_download" label="App Download" />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminHomepage;
