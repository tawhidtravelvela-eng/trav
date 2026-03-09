import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

interface Tour {
  id: string; name: string; destination: string; duration: string; price: number;
}

const TourInquiry = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tour, setTour] = useState<Tour | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  const [form, setForm] = useState({ name: "", email: "", phone: "", travelers: "2", preferredDate: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    supabase.from("tours").select("id, name, destination, duration, price").eq("id", id).maybeSingle().then(({ data }) => {
      setTour(data as any);
      setPageLoading(false);
    });
  }, [id]);

  if (pageLoading) return <Layout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  if (!tour) return <Layout><div className="container mx-auto px-4 py-20 text-center"><h2 className="text-2xl font-bold">Tour not found</h2></div></Layout>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) { toast.error("Please fill all required fields"); return; }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      toast.success("Inquiry sent successfully!");
    }, 1000);
  };

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  if (submitted) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 max-w-lg text-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-success" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Inquiry Sent!</h1>
            <p className="text-muted-foreground mb-6">Our team will review your inquiry about <strong>{tour.name}</strong> and get back to you within 24 hours.</p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate(`/tours/${tour.id}`)}>Back to Tour</Button>
              <Button onClick={() => navigate("/tours")}>Browse Tours</Button>
            </div>
          </motion.div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-hero-gradient py-8">
        <div className="container mx-auto px-4">
          <Link to={`/tours/${tour.id}`} className="text-primary-foreground/70 hover:text-primary-foreground text-sm mb-2 inline-block">← Back to Tour</Link>
          <h1 className="text-2xl font-bold text-primary-foreground">Inquire: {tour.name}</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> Send Inquiry to Admin</CardTitle>
            <p className="text-sm text-muted-foreground">Have questions about this tour? Fill out the form below and our team will respond within 24 hours.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>Full Name *</Label><Input value={form.name} onChange={(e) => update("name", e.target.value)} required /></div>
                <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => update("phone", e.target.value)} /></div>
                <div><Label>Number of Travelers</Label><Input type="number" min={1} max={20} value={form.travelers} onChange={(e) => update("travelers", e.target.value)} /></div>
                <div className="sm:col-span-2"><Label>Preferred Travel Date</Label><Input type="date" value={form.preferredDate} onChange={(e) => update("preferredDate", e.target.value)} /></div>
              </div>
              <div>
                <Label>Your Message *</Label>
                <Textarea value={form.message} onChange={(e) => update("message", e.target.value)} placeholder="Tell us about your travel plans, questions about the itinerary, special requirements, etc." rows={5} required />
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm font-medium text-foreground mb-1">Tour: {tour.name}</p>
                <p className="text-sm text-muted-foreground">{tour.destination} • {tour.duration} • From ${tour.price}/person</p>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send Inquiry"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default TourInquiry;
