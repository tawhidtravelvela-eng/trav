import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Star, Clock, MapPin, Check, CalendarDays, Users, CheckCircle, Loader2, ExternalLink, Shield, XCircle, ChevronLeft, ChevronRight, Minus, Plus, ImageIcon, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";


const ViatorTourDetail = () => {
  const { productCode } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [travelers, setTravelers] = useState(2);
  const { formatPrice } = useCurrency();

  useEffect(() => {
    if (!productCode) return;
    const fetchProduct = async () => {
      try {
        const { data, error: err } = await supabase.functions.invoke("viator-search", {
          body: { action: "product", productCode },
        });
        if (err) throw err;
        if (data?.success) {
          setProduct(data.product);
        } else {
          setError(data?.error || "Product not found");
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [productCode]);


  if (loading) return <Layout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  if (error || !product) return (
    <Layout>
      <div className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-foreground">{error || "Tour not found"}</h2>
        <Button className="mt-4" onClick={() => navigate("/tours")}>Back to Tours</Button>
      </div>
    </Layout>
  );

  // Extract data
  const images = (product.images || []).map((img: any) => {
    const variants = img.variants || [];
    const best = variants.reduce((a: any, b: any) => ((b.width || 0) > (a.width || 0) ? b : a), variants[0] || {});
    return best.url || "";
  }).filter(Boolean);

  const heroImage = images[0] || "";
  const pricing = product.pricing || {};
  const price = pricing.summary?.fromPrice || pricing.fromPrice || pricing.bookingQuestions?.fromPrice || 0;
  const currency = pricing.currency || "USD";
  const reviewSummary = product.reviews || {};
  const rating = reviewSummary.combinedAverageRating || 0;
  const reviewCount = reviewSummary.totalReviews || 0;
  const cancellation = product.cancellationPolicy || {};
  const inclusions = product.inclusions || [];
  const exclusions = product.exclusions || [];
  const tags = (product.tags || []).map((t: any) => t.tagName || t.name || "").filter((t: string) => t && isNaN(Number(t)));
  const highlights = product.highlights || [];
  const itinerary = product.itinerary || {};
  const bookingUrl = product.productUrl || "";

  // Duration
  let duration = "";
  const dur = product.duration || itinerary.duration || {};
  if (dur.fixedDurationInMinutes) {
    const h = Math.floor(dur.fixedDurationInMinutes / 60);
    const m = dur.fixedDurationInMinutes % 60;
    duration = h > 0 ? `${h} hours${m > 0 ? ` ${m} min` : ""}` : `${m} min`;
  } else if (dur.variableDurationFromMinutes) {
    const fromH = Math.floor(dur.variableDurationFromMinutes / 60);
    const toH = Math.floor((dur.variableDurationToMinutes || dur.variableDurationFromMinutes) / 60);
    duration = `${fromH}-${toH} hours`;
  }

  const destination = product.destination?.name || product.location?.address?.city || "";


  const nextImage = () => setCurrentImageIdx((prev) => (prev + 1) % Math.max(images.length, 1));
  const prevImage = () => setCurrentImageIdx((prev) => (prev - 1 + images.length) % Math.max(images.length, 1));

  return (
    <Layout>
      {/* Hero Image Carousel */}
      <div className="relative h-72 md:h-96 overflow-hidden bg-muted">
        {images.length > 0 ? (
          <img src={images[currentImageIdx]} alt={`${product.title} - ${currentImageIdx + 1}`} className="w-full h-full object-cover transition-opacity duration-300" />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center"><MapPin className="w-12 h-12 text-muted-foreground" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />

        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <button onClick={prevImage} className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={nextImage} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Image counter */}
        {images.length > 1 && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full">
            <ImageIcon className="w-3.5 h-3.5" />
            {currentImageIdx + 1} / {images.length}
          </div>
        )}

        {/* Dot indicators */}
        {images.length > 1 && images.length <= 10 && (
          <div className="absolute bottom-20 md:bottom-24 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, idx) => (
              <button key={idx} onClick={() => setCurrentImageIdx(idx)} className={`w-2 h-2 rounded-full transition-all ${idx === currentImageIdx ? "bg-white w-4" : "bg-white/50 hover:bg-white/70"}`} />
            ))}
          </div>
        )}

        {/* Info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
          <div className="container mx-auto">
            <Link to="/tours" className="text-white/70 hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors">
              <ChevronLeft className="w-3 h-3" /> Back to Tours
            </Link>
            <h1 className="text-2xl md:text-4xl font-bold text-white drop-shadow-lg">{product.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {destination && <Badge className="bg-black/30 backdrop-blur-sm text-white border-0 hover:bg-black/40"><MapPin className="w-3 h-3 mr-1" />{destination}</Badge>}
              {duration && <Badge className="bg-black/30 backdrop-blur-sm text-white border-0 hover:bg-black/40"><Clock className="w-3 h-3 mr-1" />{duration}</Badge>}
              <Badge className="bg-black/30 backdrop-blur-sm text-white border-0 hover:bg-black/40"><Star className="w-3 h-3 mr-1 fill-amber-400 text-amber-400" />{rating.toFixed(1)} ({reviewCount})</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="container mx-auto px-4 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.slice(0, 8).map((img, i) => (
              <button
                key={i}
                onClick={() => setCurrentImageIdx(i)}
                className={`flex-shrink-0 rounded-lg overflow-hidden transition-all ${i === currentImageIdx ? "ring-2 ring-primary opacity-100" : "opacity-60 hover:opacity-90"}`}
              >
                <img src={img} alt={`${product.title} ${i + 1}`} className="h-16 w-24 md:h-20 md:w-32 object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader><CardTitle>About This Tour</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{product.description}</p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Highlights */}
            {highlights.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <Card>
                  <CardHeader><CardTitle>Highlights</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {highlights.map((h: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <Check className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <Card>
                  <CardHeader><CardTitle>Tags</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Inclusions & Exclusions */}
            {(inclusions.length > 0 || exclusions.length > 0) && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card>
                  <CardHeader><CardTitle>What's Included</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {inclusions.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-foreground">Included</h4>
                          {inclusions.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-2">
                              <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-muted-foreground">
                                {typeof item === "string" ? item : item.otherDescription || item.typeDescription || "Included"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {exclusions.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-foreground">Not Included</h4>
                          {exclusions.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-2">
                              <XCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-muted-foreground">
                                {typeof item === "string" ? item : item.otherDescription || item.typeDescription || "Not included"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Itinerary */}
            {itinerary.itineraryType === "STANDARD" && itinerary.itineraryItems?.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <Card>
                  <CardHeader><CardTitle>Itinerary</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {itinerary.itineraryItems.map((item: any, idx: number) => (
                      <div key={idx} className="flex gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-primary">{idx + 1}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{item.pointOfInterestLocation?.location?.name || `Stop ${idx + 1}`}</p>
                          <p className="text-sm text-muted-foreground">{item.description || ""}</p>
                          {item.duration?.fixedDurationInMinutes && (
                            <p className="text-xs text-muted-foreground mt-1">Duration: {item.duration.fixedDurationInMinutes} min</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Multi-day itinerary */}
            {itinerary.itineraryType === "MULTI_DAY_TOUR" && itinerary.days?.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <Card>
                  <CardHeader><CardTitle>Day-by-Day Itinerary</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                    {itinerary.days.map((day: any) => (
                      <div key={day.dayNumber} className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-primary">{day.dayNumber}</span>
                          </div>
                          <h4 className="font-semibold text-foreground">{day.title}</h4>
                        </div>
                        {day.items?.map((item: any, idx: number) => (
                          <p key={idx} className="text-sm text-muted-foreground ml-[52px]">{item.description}</p>
                        ))}
                        {day.accommodations?.map((acc: any, idx: number) => (
                          <p key={idx} className="text-xs text-muted-foreground ml-[52px] italic">🏨 {acc.description}</p>
                        ))}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Unstructured itinerary */}
            {itinerary.itineraryType === "UNSTRUCTURED" && (itinerary.unstructuredDescription || itinerary.unstructuredItinerary) && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <Card>
                  <CardHeader><CardTitle>What to Expect</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">
                      {itinerary.unstructuredItinerary || itinerary.unstructuredDescription}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Rating Summary */}
            {(rating > 0 || reviewCount > 0) && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" />
                      Traveler Rating
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="text-4xl font-bold text-primary">{rating.toFixed(1)}</div>
                      <div>
                        <div className="flex mb-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star key={s} className={`w-5 h-5 ${s <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted"}`} />
                          ))}
                        </div>
                        <p className="text-sm text-muted-foreground">Based on {reviewCount.toLocaleString()} reviews</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="sticky top-24 space-y-6">
              <Card>
                <CardHeader><CardTitle>Book This Tour</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <span className="text-xs text-muted-foreground">From</span>
                    <div>
                      <span className="text-3xl font-bold text-primary">{formatPrice(price)}</span>
                      <span className="text-muted-foreground"> / person</span>
                    </div>
                  </div>

                  <div className="space-y-3 mb-4 text-sm">
                    {duration && <div className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="w-4 h-4" /> {duration}</div>}
                    {destination && <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="w-4 h-4" /> {destination}</div>}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-muted-foreground"><Users className="w-4 h-4" /> Travelers</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setTravelers(Math.max(1, travelers - 1))} className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors" disabled={travelers <= 1}>
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-semibold text-foreground">{travelers}</span>
                        <button onClick={() => setTravelers(Math.min(15, travelers + 1))} className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors" disabled={travelers >= 15}>
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3 mb-4 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{formatPrice(price)} × {travelers}</span>
                      <span className="font-semibold text-foreground">{formatPrice(price * travelers)}</span>
                    </div>
                  </div>

                  <Button className="w-full" size="lg" onClick={() => navigate(`/tours/viator/${productCode}/book`, { state: { product, travelers } })}>
                    Book Now
                  </Button>
                
                </CardContent>
              </Card>

              {/* Cancellation Policy */}
              {cancellation.description && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="w-4 h-4" /> Cancellation Policy</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{cancellation.description}</p>
                  </CardContent>
                </Card>
              )}

            </motion.div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ViatorTourDetail;
