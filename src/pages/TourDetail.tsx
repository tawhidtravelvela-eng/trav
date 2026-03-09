import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { getImage } from "@/utils/images";
import { Star, Clock, MapPin, Check, CalendarDays, Users, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";

interface Tour {
  id: string; name: string; destination: string; duration: string;
  price: number; category: string; rating: number; image: string | null;
  highlights: string[];
}

const itinerary = [
  { day: 1, title: "Arrival & Welcome", desc: "Airport pickup, hotel check-in, welcome dinner" },
  { day: 2, title: "City Highlights", desc: "Guided tour of major landmarks and attractions" },
  { day: 3, title: "Cultural Experience", desc: "Local markets, traditional cuisine, cultural shows" },
  { day: 4, title: "Adventure Day", desc: "Outdoor activities and scenic excursions" },
  { day: 5, title: "Departure", desc: "Leisure morning, airport transfer" },
];

const TourDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tour, setTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(true);
  const { formatPrice } = useCurrency();

  useEffect(() => {
    supabase.from("tours").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      if (data) setTour({ ...data, highlights: Array.isArray((data as any).highlights) ? (data as any).highlights : [] } as any);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <Layout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  if (!tour) return <Layout><div className="container mx-auto px-4 py-20 text-center"><h2 className="text-2xl font-bold text-foreground">Tour not found</h2><Button className="mt-4" onClick={() => navigate("/tours")}>Back to Tours</Button></div></Layout>;

  return (
    <Layout>
      <div className="relative h-64 md:h-80 overflow-hidden">
        <img src={getImage(tour.image || "")} alt={tour.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        <div className="absolute bottom-6 left-0 container mx-auto px-4">
          <Link to="/tours" className="text-primary-foreground/70 hover:text-primary-foreground text-sm mb-2 inline-block">← Back to Tours</Link>
          <h1 className="text-3xl font-bold text-primary-foreground">{tour.name}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Badge variant="secondary" className="bg-card/80"><MapPin className="w-3 h-3 mr-1" />{tour.destination}</Badge>
            <Badge variant="secondary" className="bg-card/80"><Clock className="w-3 h-3 mr-1" />{tour.duration}</Badge>
            <Badge variant="secondary" className="bg-card/80"><Star className="w-3 h-3 mr-1 fill-accent text-accent" />{tour.rating}</Badge>
            <Badge className="bg-primary text-primary-foreground">{tour.category}</Badge>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader><CardTitle>Tour Highlights</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {tour.highlights.map((h) => (
                      <div key={h} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                        <span className="text-sm text-foreground">{h}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <CardHeader><CardTitle>Sample Itinerary</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {itinerary.map((item) => (
                    <div key={item.day} className="flex gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-primary">{item.day}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{item.title}</p>
                        <p className="text-sm text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <CardHeader><CardTitle>What's Included</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {["Accommodation", "Daily breakfast", "Airport transfers", "Professional guide", "Entrance fees", "Travel insurance"].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-success" />
                        <span className="text-sm text-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="sticky top-24 space-y-6">
              <Card>
                <CardHeader><CardTitle>Book This Tour</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <span className="text-3xl font-bold text-primary">{formatPrice(tour.price)}</span>
                    <span className="text-muted-foreground"> / person</span>
                  </div>
                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="w-4 h-4" /> {tour.duration}</div>
                    <div className="flex items-center gap-2 text-muted-foreground"><Users className="w-4 h-4" /> Max 15 travelers</div>
                    <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="w-4 h-4" /> {tour.destination}</div>
                  </div>
                  <Button className="w-full" size="lg" onClick={() => navigate(`/tours/${tour.id}/book`)}>Book Now</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Have Questions?</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">Send an inquiry to our team and we'll get back to you within 24 hours.</p>
                  <Button variant="outline" className="w-full" onClick={() => navigate(`/tours/${tour.id}/inquiry`)}>Send Inquiry</Button>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default TourDetail;
