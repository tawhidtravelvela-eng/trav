import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAdminTenantFilter } from "@/hooks/useAdminTenantFilter";

type Banner = Tables<"banners">;
type Offer = Tables<"offers">;
type Testimonial = Tables<"testimonials">;

const AdminContent = () => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const { adminTenantId } = useAdminTenantFilter();

  // Banner form
  const [bannerOpen, setBannerOpen] = useState(false);
  const [editBanner, setEditBanner] = useState<Banner | null>(null);
  const [bannerForm, setBannerForm] = useState({ title: "", subtitle: "", image_url: "", link_url: "", is_active: true, sort_order: 0 });

  // Offer form
  const [offerOpen, setOfferOpen] = useState(false);
  const [editOffer, setEditOffer] = useState<Offer | null>(null);
  const [offerForm, setOfferForm] = useState({ title: "", description: "", discount: "", color: "primary", is_active: true });

  // Testimonial form
  const [testimonialOpen, setTestimonialOpen] = useState(false);
  const [editTestimonial, setEditTestimonial] = useState<Testimonial | null>(null);
  const [testimonialForm, setTestimonialForm] = useState({ name: "", role: "", text: "", rating: 5, avatar: "", is_active: true });

  const fetchAll = async () => {
    setLoading(true);
    let bannersQ = supabase.from("banners").select("*").order("sort_order");
    let offersQ = supabase.from("offers").select("*").order("created_at");
    let testimonialsQ = supabase.from("testimonials").select("*").order("created_at");
    
    if (adminTenantId) {
      bannersQ = bannersQ.eq("tenant_id", adminTenantId);
      offersQ = offersQ.eq("tenant_id", adminTenantId);
      testimonialsQ = testimonialsQ.eq("tenant_id", adminTenantId);
    }

    const [b, o, t] = await Promise.all([bannersQ, offersQ, testimonialsQ]);
    setBanners(b.data || []);
    setOffers(o.data || []);
    setTestimonials(t.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Banner CRUD
  const openNewBanner = () => { setEditBanner(null); setBannerForm({ title: "", subtitle: "", image_url: "", link_url: "", is_active: true, sort_order: 0 }); setBannerOpen(true); };
  const openEditBanner = (b: Banner) => { setEditBanner(b); setBannerForm({ title: b.title, subtitle: b.subtitle || "", image_url: b.image_url || "", link_url: b.link_url || "", is_active: b.is_active, sort_order: b.sort_order }); setBannerOpen(true); };
  const saveBanner = async () => {
    if (!bannerForm.title) { toast.error("Title required"); return; }
    if (editBanner) {
      const { error } = await supabase.from("banners").update(bannerForm).eq("id", editBanner.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Banner updated");
    } else {
      const payload = { ...bannerForm, ...(adminTenantId ? { tenant_id: adminTenantId } : {}) };
      const { error } = await supabase.from("banners").insert(payload as TablesInsert<"banners">);
      if (error) { toast.error(error.message); return; }
      toast.success("Banner added");
    }
    setBannerOpen(false);
    fetchAll();
  };
  const deleteBanner = async (id: string) => { await supabase.from("banners").delete().eq("id", id); toast.success("Deleted"); fetchAll(); };

  // Offer CRUD
  const openNewOffer = () => { setEditOffer(null); setOfferForm({ title: "", description: "", discount: "", color: "primary", is_active: true }); setOfferOpen(true); };
  const openEditOffer = (o: Offer) => { setEditOffer(o); setOfferForm({ title: o.title, description: o.description || "", discount: o.discount || "", color: o.color, is_active: o.is_active }); setOfferOpen(true); };
  const saveOffer = async () => {
    if (!offerForm.title) { toast.error("Title required"); return; }
    if (editOffer) {
      const { error } = await supabase.from("offers").update(offerForm).eq("id", editOffer.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Offer updated");
    } else {
      const payload = { ...offerForm, ...(adminTenantId ? { tenant_id: adminTenantId } : {}) };
      const { error } = await supabase.from("offers").insert(payload as TablesInsert<"offers">);
      if (error) { toast.error(error.message); return; }
      toast.success("Offer added");
    }
    setOfferOpen(false);
    fetchAll();
  };
  const deleteOffer = async (id: string) => { await supabase.from("offers").delete().eq("id", id); toast.success("Deleted"); fetchAll(); };

  // Testimonial CRUD
  const openNewTestimonial = () => { setEditTestimonial(null); setTestimonialForm({ name: "", role: "", text: "", rating: 5, avatar: "", is_active: true }); setTestimonialOpen(true); };
  const openEditTestimonial = (t: Testimonial) => { setEditTestimonial(t); setTestimonialForm({ name: t.name, role: t.role || "", text: t.text, rating: t.rating, avatar: t.avatar || "", is_active: t.is_active }); setTestimonialOpen(true); };
  const saveTestimonial = async () => {
    if (!testimonialForm.name || !testimonialForm.text) { toast.error("Name and text required"); return; }
    if (editTestimonial) {
      const { error } = await supabase.from("testimonials").update(testimonialForm).eq("id", editTestimonial.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Testimonial updated");
    } else {
      const payload = { ...testimonialForm, ...(adminTenantId ? { tenant_id: adminTenantId } : {}) };
      const { error } = await supabase.from("testimonials").insert(payload as TablesInsert<"testimonials">);
      if (error) { toast.error(error.message); return; }
      toast.success("Testimonial added");
    }
    setTestimonialOpen(false);
    fetchAll();
  };
  const deleteTestimonial = async (id: string) => { await supabase.from("testimonials").delete().eq("id", id); toast.success("Deleted"); fetchAll(); };

  if (loading) return <AdminLayout><div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">Content Management</h2>

        <Tabs defaultValue="banners">
          <TabsList>
            <TabsTrigger value="banners">Banners</TabsTrigger>
            <TabsTrigger value="offers">Offers</TabsTrigger>
            <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
          </TabsList>

          {/* BANNERS */}
          <TabsContent value="banners">
            <div className="flex justify-end mb-4">
              <Dialog open={bannerOpen} onOpenChange={setBannerOpen}>
                <DialogTrigger asChild><Button onClick={openNewBanner}><Plus className="mr-2 h-4 w-4" /> Add Banner</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editBanner ? "Edit" : "Add"} Banner</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Title</Label><Input value={bannerForm.title} onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })} /></div>
                    <div><Label>Subtitle</Label><Input value={bannerForm.subtitle} onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })} /></div>
                    <div><Label>Image URL</Label><Input value={bannerForm.image_url} onChange={(e) => setBannerForm({ ...bannerForm, image_url: e.target.value })} /></div>
                    <div><Label>Link URL</Label><Input value={bannerForm.link_url} onChange={(e) => setBannerForm({ ...bannerForm, link_url: e.target.value })} /></div>
                    <div className="flex items-center gap-2"><Label>Active</Label><Switch checked={bannerForm.is_active} onCheckedChange={(v) => setBannerForm({ ...bannerForm, is_active: v })} /></div>
                    <div><Label>Sort Order</Label><Input type="number" value={bannerForm.sort_order} onChange={(e) => setBannerForm({ ...bannerForm, sort_order: +e.target.value })} /></div>
                    <Button className="w-full" onClick={saveBanner}>Save</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Subtitle</TableHead><TableHead>Active</TableHead><TableHead>Order</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {banners.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.title}</TableCell>
                      <TableCell className="text-muted-foreground">{b.subtitle}</TableCell>
                      <TableCell>{b.is_active ? "✅" : "❌"}</TableCell>
                      <TableCell>{b.sort_order}</TableCell>
                      <TableCell><div className="flex gap-2">
                        <Button size="icon" variant="ghost" onClick={() => openEditBanner(b)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteBanner(b.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div></TableCell>
                    </TableRow>
                  ))}
                  {banners.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No banners yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          {/* OFFERS */}
          <TabsContent value="offers">
            <div className="flex justify-end mb-4">
              <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
                <DialogTrigger asChild><Button onClick={openNewOffer}><Plus className="mr-2 h-4 w-4" /> Add Offer</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editOffer ? "Edit" : "Add"} Offer</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Title</Label><Input value={offerForm.title} onChange={(e) => setOfferForm({ ...offerForm, title: e.target.value })} /></div>
                    <div><Label>Description</Label><Input value={offerForm.description} onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })} /></div>
                    <div><Label>Discount Label</Label><Input value={offerForm.discount} onChange={(e) => setOfferForm({ ...offerForm, discount: e.target.value })} placeholder="40% OFF" /></div>
                    <div><Label>Color</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={offerForm.color} onChange={(e) => setOfferForm({ ...offerForm, color: e.target.value })}>
                        <option value="primary">Primary</option><option value="accent">Accent</option><option value="success">Success</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2"><Label>Active</Label><Switch checked={offerForm.is_active} onCheckedChange={(v) => setOfferForm({ ...offerForm, is_active: v })} /></div>
                    <Button className="w-full" onClick={saveOffer}>Save</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Discount</TableHead><TableHead>Color</TableHead><TableHead>Active</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {offers.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.title}</TableCell>
                      <TableCell>{o.discount}</TableCell>
                      <TableCell>{o.color}</TableCell>
                      <TableCell>{o.is_active ? "✅" : "❌"}</TableCell>
                      <TableCell><div className="flex gap-2">
                        <Button size="icon" variant="ghost" onClick={() => openEditOffer(o)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteOffer(o.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div></TableCell>
                    </TableRow>
                  ))}
                  {offers.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No offers yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          {/* TESTIMONIALS */}
          <TabsContent value="testimonials">
            <div className="flex justify-end mb-4">
              <Dialog open={testimonialOpen} onOpenChange={setTestimonialOpen}>
                <DialogTrigger asChild><Button onClick={openNewTestimonial}><Plus className="mr-2 h-4 w-4" /> Add Testimonial</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editTestimonial ? "Edit" : "Add"} Testimonial</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Name</Label><Input value={testimonialForm.name} onChange={(e) => setTestimonialForm({ ...testimonialForm, name: e.target.value })} /></div>
                    <div><Label>Role</Label><Input value={testimonialForm.role} onChange={(e) => setTestimonialForm({ ...testimonialForm, role: e.target.value })} /></div>
                    <div><Label>Text</Label><Input value={testimonialForm.text} onChange={(e) => setTestimonialForm({ ...testimonialForm, text: e.target.value })} /></div>
                    <div><Label>Rating (1-5)</Label><Input type="number" min={1} max={5} value={testimonialForm.rating} onChange={(e) => setTestimonialForm({ ...testimonialForm, rating: +e.target.value })} /></div>
                    <div><Label>Avatar Initials</Label><Input value={testimonialForm.avatar} onChange={(e) => setTestimonialForm({ ...testimonialForm, avatar: e.target.value })} placeholder="JD" /></div>
                    <div className="flex items-center gap-2"><Label>Active</Label><Switch checked={testimonialForm.is_active} onCheckedChange={(v) => setTestimonialForm({ ...testimonialForm, is_active: v })} /></div>
                    <Button className="w-full" onClick={saveTestimonial}>Save</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Rating</TableHead><TableHead>Active</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {testimonials.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.role}</TableCell>
                      <TableCell>{"⭐".repeat(t.rating)}</TableCell>
                      <TableCell>{t.is_active ? "✅" : "❌"}</TableCell>
                      <TableCell><div className="flex gap-2">
                        <Button size="icon" variant="ghost" onClick={() => openEditTestimonial(t)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteTestimonial(t.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div></TableCell>
                    </TableRow>
                  ))}
                  {testimonials.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No testimonials yet</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminContent;
