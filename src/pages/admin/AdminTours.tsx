import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";

interface Tour {
  id: string;
  name: string;
  destination: string;
  duration: string;
  price: number;
  category: string;
  rating: number;
  image: string | null;
  highlights: string[];
}

const emptyForm = { name: "", destination: "", duration: "", price: 0, category: "International", rating: 0, image: "" };

const AdminTours = () => {
  const [items, setItems] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Tour | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [highlightsInput, setHighlightsInput] = useState("");
  const [open, setOpen] = useState(false);
  const { formatPrice } = useCurrency();

  const fetchData = async () => {
    const { data } = await supabase.from("tours").select("*").order("created_at");
    setItems((data as any[])?.map(t => ({ ...t, highlights: Array.isArray(t.highlights) ? t.highlights : [] })) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setHighlightsInput(""); setOpen(true); };
  const openEdit = (t: Tour) => { setEditing(t); setForm({ name: t.name, destination: t.destination, duration: t.duration, price: t.price, category: t.category, rating: t.rating, image: t.image || "" }); setHighlightsInput(t.highlights.join(", ")); setOpen(true); };

  const save = async () => {
    if (!form.name || !form.destination) { toast.error("Fill required fields"); return; }
    const highlights = highlightsInput.split(",").map(s => s.trim()).filter(Boolean);
    const payload = { ...form, highlights };
    if (editing) {
      const { error } = await supabase.from("tours").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Tour updated");
    } else {
      const { error } = await supabase.from("tours").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Tour added");
    }
    setOpen(false);
    fetchData();
  };

  const remove = async (id: string) => {
    await supabase.from("tours").delete().eq("id", id);
    toast.success("Tour deleted");
    fetchData();
  };

  const updateField = (key: string, value: string | number) => setForm((prev) => ({ ...prev, [key]: value }));

  if (loading) return <AdminLayout><div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">Manage Tours</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Tour</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Tour" : "Add Tour"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Label>Tour Name</Label><Input value={form.name} onChange={(e) => updateField("name", e.target.value)} /></div>
                <div><Label>Destination</Label><Input value={form.destination} onChange={(e) => updateField("destination", e.target.value)} /></div>
                <div><Label>Duration</Label><Input value={form.duration} onChange={(e) => updateField("duration", e.target.value)} placeholder="5 Days" /></div>
                <div><Label>Price ($)</Label><Input type="number" value={form.price} onChange={(e) => updateField("price", +e.target.value)} /></div>
                <div><Label>Category</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.category} onChange={(e) => updateField("category", e.target.value)}>
                    <option>International</option>
                    <option>Domestic</option>
                  </select>
                </div>
                <div className="col-span-2"><Label>Highlights (comma-separated)</Label><Input value={highlightsInput} onChange={(e) => setHighlightsInput(e.target.value)} placeholder="Eiffel Tower, Louvre" /></div>
              </div>
              <Button className="w-full mt-4" onClick={save}>{editing ? "Update" : "Add"} Tour</Button>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.destination}</TableCell>
                    <TableCell>{t.duration}</TableCell>
                    <TableCell><Badge variant={t.category === "International" ? "default" : "secondary"}>{t.category}</Badge></TableCell>
                    <TableCell className="font-semibold">{formatPrice(t.price, "local_inventory")}</TableCell>
                    <TableCell>{t.rating}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No tours yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminTours;
