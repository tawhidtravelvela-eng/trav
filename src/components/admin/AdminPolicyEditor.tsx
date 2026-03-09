import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import RichTextEditor from "@/components/admin/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";

interface AdminPolicyEditorProps {
  providerKey: string;
  title: string;
  successMessage?: string;
}

const AdminPolicyEditor = ({ providerKey, title, successMessage }: AdminPolicyEditorProps) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("api_settings")
        .select("settings")
        .eq("provider", providerKey)
        .maybeSingle();
      if (data) {
        const s = data.settings as any;
        setContent(s?.content || "");
        setLastUpdated(s?.last_updated || "");
      }
      setLoading(false);
    })();
  }, [providerKey]);

  const handleSave = async () => {
    setSaving(true);
    const now = new Date().toISOString().split("T")[0];
    const settings = { content, last_updated: now };
    const { error } = await supabase
      .from("api_settings")
      .upsert({ provider: providerKey, settings, is_active: true }, { onConflict: "provider" });
    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      setLastUpdated(now);
      toast.success(successMessage || `${title} saved`);
    }
    setSaving(false);
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Edit {title}</CardTitle>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Last Updated Date</Label>
            <Input
              type="date"
              value={lastUpdated}
              onChange={(e) => setLastUpdated(e.target.value)}
              className="mt-1 w-48"
            />
          </div>
          <div>
            <Label>Content</Label>
            <div className="mt-1">
              <RichTextEditor content={content} onChange={setContent} />
            </div>
          </div>
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminPolicyEditor;
