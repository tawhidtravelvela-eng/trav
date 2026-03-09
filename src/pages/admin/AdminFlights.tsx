import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";

interface Flight {
  id: string;
  airline: string;
  from_city: string;
  to_city: string;
  departure: string;
  arrival: string;
  duration: string;
  price: number;
  stops: number;
  class: string;
  seats: number;
}

const emptyForm = { airline: "", from_city: "", to_city: "", departure: "", arrival: "", duration: "", price: 0, stops: 0, class: "Economy", seats: 100, markup_percentage: 0 };

const AdminFlights = () => {
  const [items, setItems] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Flight | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const { formatPrice } = useCurrency();

  const fetchData = async () => {
    const { data } = await supabase.from("flights").select("*").order("created_at");
    setItems((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (f: Flight) => { setEditing(f); setForm({ airline: f.airline, from_city: f.from_city, to_city: f.to_city, departure: f.departure, arrival: f.arrival, duration: f.duration, price: f.price, stops: f.stops, class: f.class, seats: f.seats, markup_percentage: (f as any).markup_percentage || 0 }); setOpen(true); };

  const save = async () => {
    if (!form.airline || !form.from_city || !form.to_city) { toast.error("Fill required fields"); return; }
    if (editing) {
      const { error } = await supabase.from("flights").update(form).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Flight updated");
    } else {
      const { error } = await supabase.from("flights").insert(form);
      if (error) { toast.error(error.message); return; }
      toast.success("Flight added");
    }
    setOpen(false);
    fetchData();
  };

  const remove = async (id: string) => {
    await supabase.from("flights").delete().eq("id", id);
    toast.success("Flight deleted");
    fetchData();
  };

  const updateField = (key: string, value: string | number) => setForm((prev) => ({ ...prev, [key]: value }));

  if (loading) return <AdminLayout><div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">Manage Flights</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Add Flight</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Flight" : "Add Flight"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Airline</Label><Input value={form.airline} onChange={(e) => updateField("airline", e.target.value)} /></div>
                <div><Label>Class</Label><Input value={form.class} onChange={(e) => updateField("class", e.target.value)} /></div>
                <div><Label>From</Label><Input value={form.from_city} onChange={(e) => updateField("from_city", e.target.value)} /></div>
                <div><Label>To</Label><Input value={form.to_city} onChange={(e) => updateField("to_city", e.target.value)} /></div>
                <div><Label>Departure</Label><Input value={form.departure} onChange={(e) => updateField("departure", e.target.value)} /></div>
                <div><Label>Arrival</Label><Input value={form.arrival} onChange={(e) => updateField("arrival", e.target.value)} /></div>
                <div><Label>Duration</Label><Input value={form.duration} onChange={(e) => updateField("duration", e.target.value)} /></div>
                <div><Label>Stops</Label><Input type="number" value={form.stops} onChange={(e) => updateField("stops", +e.target.value)} /></div>
                <div><Label>Price ($)</Label><Input type="number" value={form.price} onChange={(e) => updateField("price", +e.target.value)} /></div>
                <div><Label>Markup (%)</Label><Input type="number" value={form.markup_percentage} onChange={(e) => updateField("markup_percentage", +e.target.value)} placeholder="e.g. 10" /></div>
                <div><Label>Seats</Label><Input type="number" value={form.seats} onChange={(e) => updateField("seats", +e.target.value)} /></div>
              </div>
              <Button className="w-full mt-4" onClick={save}>{editing ? "Update" : "Add"} Flight</Button>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Airline</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Duration</TableHead>
                    <TableHead>Base Price</TableHead>
                    <TableHead>Markup</TableHead>
                    <TableHead>Final Price</TableHead>
                    <TableHead>Seats</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.airline}</TableCell>
                    <TableCell>{f.from_city} → {f.to_city}</TableCell>
                    <TableCell>{f.departure} - {f.arrival}</TableCell>
                    <TableCell>{f.duration}</TableCell>
                    <TableCell>{formatPrice(f.price, "local_inventory")}</TableCell>
                    <TableCell>{(f as any).markup_percentage || 0}%</TableCell>
                    <TableCell className="font-semibold">{formatPrice(Math.round(f.price * (1 + ((f as any).markup_percentage || 0) / 100) * 100) / 100, "local_inventory")}</TableCell>
                    <TableCell>{f.seats}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(f.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No flights yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminFlights;
