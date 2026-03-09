import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";

interface Hotel {
  id: string;
  name: string;
  city: string;
  rating: number;
  reviews: number;
  price: number;
  image: string | null;
  amenities: string[];
  stars: number;
}

const emptyForm = { name: "", city: "", rating: 0, reviews: 0, price: 0, image: "", stars: 4 };

const AdminHotels = () => {
  const [items, setItems] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Hotel | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [amenitiesInput, setAmenitiesInput] = useState("");
  const [open, setOpen] = useState(false);
  const { formatPrice } = useCurrency();

  const fetchData = async () => {
    const { data } = await supabase.from("hotels").select("*").order("created_at");
    setItems((data as any[])?.map(h => ({ ...h, amenities: Array.isArray(h.amenities) ? h.amenities : [] })) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setAmenitiesInput(""); setOpen(true); };
  const openEdit = (h: Hotel) => { setEditing(h); setForm({ name: h.name, city: h.city, rating: h.rating, reviews: h.reviews, price: h.price, image: h.image || "", stars: h.stars }); setAmenitiesInput(h.amenities.join(", ")); setOpen(true); };

  const save = async () => {
    if (!form.name || !form.city) { toast.error("Fill required fields"); return; }
    const amenities = amenitiesInput.split(",").map(s => s.trim()).filter(Boolean);
    const payload = { ...form, amenities };
    if (editing) {
      const { error } = await supabase.from("hotels").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Hotel updated");
    } else {
      const { error } = await supabase.from("hotels").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Hotel added");
    }
    setOpen(false);
    fetchData();
  };

  const remove = async (id: string) => {
    await supabase.from("hotels").delete().eq("id", id);
    toast.success("Hotel deleted");
    fetchData();
  };

  const updateField = (key: string, value: string | number) => setForm((prev) => ({ ...prev, [key]: value }));

  if (loading) return <AdminLayout><div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">Manage Hotels</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Hotel</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Hotel" : "Add Hotel"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Label>Hotel Name</Label><Input value={form.name} onChange={(e) => updateField("name", e.target.value)} /></div>
                <div><Label>City</Label><Input value={form.city} onChange={(e) => updateField("city", e.target.value)} /></div>
                <div><Label>Stars</Label><Input type="number" min={1} max={5} value={form.stars} onChange={(e) => updateField("stars", +e.target.value)} /></div>
                <div><Label>Price/Night ($)</Label><Input type="number" value={form.price} onChange={(e) => updateField("price", +e.target.value)} /></div>
                <div><Label>Rating</Label><Input type="number" step={0.1} min={0} max={5} value={form.rating} onChange={(e) => updateField("rating", +e.target.value)} /></div>
                <div className="col-span-2"><Label>Amenities (comma-separated)</Label><Input value={amenitiesInput} onChange={(e) => setAmenitiesInput(e.target.value)} placeholder="WiFi, Pool, Spa" /></div>
              </div>
              <Button className="w-full mt-4" onClick={save}>{editing ? "Update" : "Add"} Hotel</Button>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Stars</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Price/Night</TableHead>
                  <TableHead>Amenities</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.name}</TableCell>
                    <TableCell>{h.city}</TableCell>
                    <TableCell>
                      <div className="flex gap-0.5">
                        {Array.from({ length: h.stars }).map((_, i) => (
                          <Star key={i} className="h-3 w-3 fill-warning text-warning" />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{h.rating}</TableCell>
                    <TableCell className="font-semibold">{formatPrice(h.price, "local_inventory")}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{h.amenities.join(", ")}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(h)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(h.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No hotels yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminHotels;
