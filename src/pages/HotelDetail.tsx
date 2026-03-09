import { useState, useEffect } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { getImage } from "@/utils/images";
import { Star, MapPin, CheckCircle, Loader2, BedDouble, ChevronLeft, ChevronRight, Utensils, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import { trackHotelInteraction } from "@/utils/hotelTracking";

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
  source?: string;
  images?: string[];
  country?: string;
  propertyType?: string;
  availableRooms?: any[];
  searchId?: string;
  description?: string;
}

const defaultRoomTypes = [
  { name: "Standard Room", desc: "1 Queen bed, City view", price: 1.0 },
  { name: "Deluxe Room", desc: "1 King bed, Partial sea view", price: 1.4 },
  { name: "Suite", desc: "Separate living area, Full sea view", price: 2.0 },
];

const HotelDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const { formatPrice } = useCurrency();
  const [apiMarkup, setApiMarkup] = useState(0);

  const isTravelvelaHotel = id?.startsWith("tv-");
  const isTripjackHotel = id?.startsWith("tj-");
  const isAgodaHotel = id?.startsWith("agoda-");
  const stateData = location.state as any;
  const stateHotel = stateData?.hotel as Hotel | undefined;
  const searchCheckin = stateData?.checkin || "";
  const searchCheckout = stateData?.checkout || "";
  const searchAdults = stateData?.adults || 1;
  const searchChildren = stateData?.children || 0;
  const searchRooms = stateData?.rooms || 1;

  // Fetch API markup
  useEffect(() => {
    supabase.from("api_settings").select("settings")
      .eq("provider", "api_markup").maybeSingle()
      .then(({ data }) => {
        if (data?.settings) {
          setApiMarkup((data.settings as any)?.markup_percentage || 0);
        }
      });
  }, []);

  const applyMarkup = (price: number) => Math.round(price * (1 + apiMarkup / 100));

  useEffect(() => {
    if (isTripjackHotel && stateHotel) {
      // For Tripjack, we have basic data from search — fetch details from API
      setHotel(stateHotel);
      setLoading(true);
      const tripjackId = id?.replace("tj-", "") || "";
      trackHotelInteraction({
        hotelId: tripjackId,
        hotelName: stateHotel.name,
        hotelCity: stateHotel.city,
        hotelStars: stateHotel.stars,
        action: "view",
      });
      // Fetch full details from Tripjack
      supabase.functions.invoke("tripjack-hotel-search", {
        body: { action: "detail", hotelId: tripjackId },
      }).then(({ data, error }) => {
        if (!error && data?.success && data.hotel) {
          const detail = data.hotel;
          // Map Tripjack detail options to availableRooms format (with markup)
          const rooms = (detail.options || []).flatMap((opt: any) => 
            (opt.rooms || []).map((r: any) => ({
              optionId: opt.optionId,
              room_category: r.roomCategory || "Room",
              room_type: r.roomType || "",
              meal_info: r.mealBasis || "Room Only",
              price: applyMarkup(r.totalPrice || opt.totalPrice || 0),
              adult: r.adults || 1,
              child: r.children || 0,
              isOnRequest: opt.isOnRequest || false,
              amenities: opt.amenities || [],
              source: "tripjack",
            }))
          );
          setHotel(prev => prev ? {
            ...prev,
            images: detail.images?.length ? detail.images : prev.images,
            amenities: detail.options?.[0]?.amenities || prev.amenities,
            description: detail.description || prev.description,
            availableRooms: rooms.length > 0 ? rooms : prev.availableRooms,
          } : prev);
        }
        setLoading(false);
      });
    } else if (isAgodaHotel && stateHotel) {
      setHotel(stateHotel);
      setLoading(false);
      trackHotelInteraction({
        hotelId: stateHotel.id,
        hotelName: stateHotel.name,
        hotelCity: stateHotel.city,
        hotelStars: stateHotel.stars,
        action: "view",
      });
    } else if (isTravelvelaHotel && stateHotel) {
      setHotel(stateHotel);
      setLoading(false);
      trackHotelInteraction({
        hotelId: stateHotel.id,
        hotelName: stateHotel.name,
        hotelCity: stateHotel.city,
        hotelStars: stateHotel.stars,
        action: "view",
      });
    } else if (!isTravelvelaHotel && !isTripjackHotel && !isAgodaHotel) {
      supabase.from("hotels").select("*").eq("id", id).maybeSingle().then(({ data }) => {
        if (data) setHotel({ ...data, amenities: Array.isArray((data as any).amenities) ? (data as any).amenities : [] } as any);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [id, isTravelvelaHotel, isTripjackHotel, isAgodaHotel, stateHotel, apiMarkup]);

  if (loading) return <Layout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  if (!hotel) return (
    <Layout>
      <div className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-foreground">Hotel not found</h2>
        <p className="text-muted-foreground mt-2">This hotel may no longer be available.</p>
        <Button className="mt-4" onClick={() => navigate("/hotels")}>Back to Hotels</Button>
      </div>
    </Layout>
  );

  // Build gallery images array
  const allImages: string[] = [];
  if (hotel.images && hotel.images.length > 0) {
    allImages.push(...hotel.images);
  } else if (hotel.image) {
    const img = (hotel.source === "travelvela" || hotel.source === "tripjack") ? hotel.image : getImage(hotel.image);
    allImages.push(img);
  }
  if (allImages.length === 0) allImages.push(getImage(""));

  const heroImage = allImages[activeImageIndex] || allImages[0];
  const hasMultipleImages = allImages.length > 1;

  const prevImage = () => setActiveImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
  const nextImage = () => setActiveImageIndex((prev) => (prev + 1) % allImages.length);

  // Build room list from API data or fallback to defaults
  const apiRooms = hotel.availableRooms || (hotel as any).availableRooms || [];
  const hasApiRooms = apiRooms.length > 0;

  return (
    <Layout>
      {/* Hero Image with Gallery */}
      <div className="relative h-72 md:h-96 overflow-hidden bg-muted">
        <img src={heroImage} alt={hotel.name} className="w-full h-full object-cover transition-opacity duration-300" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />

        {/* Navigation arrows */}
        {hasMultipleImages && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Image counter */}
        {hasMultipleImages && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full">
            <ImageIcon className="w-3.5 h-3.5" />
            {activeImageIndex + 1} / {allImages.length}
          </div>
        )}

        {/* Dot indicators */}
        {hasMultipleImages && allImages.length <= 10 && (
          <div className="absolute bottom-20 md:bottom-24 left-1/2 -translate-x-1/2 flex gap-1.5">
            {allImages.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveImageIndex(i)}
                className={`w-2 h-2 rounded-full transition-all ${i === activeImageIndex ? "bg-white w-4" : "bg-white/50 hover:bg-white/70"}`}
              />
            ))}
          </div>
        )}

        {/* Hotel info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
          <div className="container mx-auto">
            <Link to="/hotels" className="text-white/70 hover:text-white text-sm mb-2 inline-flex items-center gap-1 transition-colors">
              <ChevronLeft className="w-3 h-3" /> Back to Hotels
            </Link>
            <h1 className="text-2xl md:text-4xl font-bold text-white drop-shadow-lg">{hotel.name}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {hotel.stars > 0 && (
                <div className="flex items-center gap-0.5 bg-black/30 backdrop-blur-sm rounded-full px-2.5 py-1">
                  {Array.from({ length: hotel.stars }).map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}
                </div>
              )}
              <Badge className="bg-black/30 backdrop-blur-sm text-white border-0 hover:bg-black/40">
                <MapPin className="w-3 h-3 mr-1" />{hotel.city}{hotel.country ? `, ${hotel.country}` : ""}
              </Badge>
              {hotel.rating > 0 && (
                <Badge className="bg-black/30 backdrop-blur-sm text-white border-0 hover:bg-black/40">
                  <Star className="w-3 h-3 mr-1 fill-amber-400 text-amber-400" />{hotel.rating}{hotel.reviews > 0 ? ` (${hotel.reviews})` : ""}
                </Badge>
              )}
              {hotel.propertyType && hotel.propertyType !== "Hotel" && hotel.propertyType !== "HOTEL" && (
                <Badge className="bg-black/30 backdrop-blur-sm text-white border-0">{hotel.propertyType}</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Thumbnail strip */}
      {hasMultipleImages && (
        <div className="container mx-auto px-4 py-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {allImages.slice(0, 8).map((img, i) => (
              <button
                key={i}
                onClick={() => setActiveImageIndex(i)}
                className={`flex-shrink-0 rounded-lg overflow-hidden transition-all ${i === activeImageIndex ? "ring-2 ring-primary opacity-100" : "opacity-60 hover:opacity-90"}`}
              >
                <img src={img} alt={`${hotel.name} ${i + 1}`} className="h-16 w-24 md:h-20 md:w-32 object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Amenities */}
            {hotel.amenities.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardHeader><CardTitle>Amenities</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      {hotel.amenities.map((a) => (
                        <div key={a} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50">
                          <CheckCircle className="w-4 h-4 text-success" />
                          <span className="text-sm text-foreground">{a}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Rooms */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BedDouble className="w-5 h-5" /> Available Rooms</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {hasApiRooms ? (
                    apiRooms.map((roomOption: any, ri: number) => {
                      const roomList = roomOption.room || roomOption.rooms || [roomOption];
                      return roomList.map((room: any, rj: number) => {
                        const roomPrice = room.price || room.total_price || room.rate || roomOption.price || 0;
                        const roomCategory = room.room_category || room.name || room.room_name || `Room ${ri + 1}`;
                        const mealInfo = room.meal_info || room.board || room.meal_plan || "";
                        const roomImage = room.room_image || null;

                        return (
                          <div key={`${ri}-${rj}`} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg border border-border hover:border-primary/50 transition-colors gap-4">
                            <div className="flex gap-3 items-start flex-1">
                              {roomImage && (
                                <img src={roomImage} alt={roomCategory} className="w-20 h-14 object-cover rounded-md flex-shrink-0" loading="lazy" />
                              )}
                              <div>
                                <p className="font-semibold text-foreground text-sm">{roomCategory}</p>
                                {mealInfo && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                    <Utensils className="w-3 h-3" /> {mealInfo}
                                  </p>
                                )}
                                {room.description && <p className="text-xs text-muted-foreground mt-0.5">{room.description}</p>}
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {room.adult || 1} Adult{(room.adult || 1) > 1 ? "s" : ""}
                                  {room.child > 0 ? `, ${room.child} Child${room.child > 1 ? "ren" : ""}` : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-lg font-bold text-primary">{formatPrice(Math.round(Number(roomPrice)), hotel.source === "tripjack" ? "tripjack" : "travelvela")}</p>
                                <p className="text-xs text-muted-foreground">/ night</p>
                                {room.discount_price && Number(room.discount_price) > 0 && Number(room.discount_price) !== Number(roomPrice) && (
                                  <p className="text-xs text-muted-foreground line-through">{formatPrice(Math.round(Number(room.discount_price)), hotel.source === "tripjack" ? "tripjack" : "travelvela")}</p>
                                )}
                              </div>
                              <Button size="sm" onClick={() => navigate(`/hotels/${id}/book?room=${encodeURIComponent(roomCategory)}&price=${roomPrice}&checkin=${searchCheckin}&checkout=${searchCheckout}&adults=${searchAdults}&children=${searchChildren}&rooms=${searchRooms}${room.optionId ? `&optionId=${room.optionId}` : ''}`, { state: { hotel: { id: hotel.id, name: hotel.name, city: hotel.city, price: hotel.price, source: hotel.source } } })}>
                                Book
                              </Button>
                            </div>
                          </div>
                        );
                      });
                    })
                  ) : (
                    defaultRoomTypes.map((room) => {
                      const roomPrice = Math.round(Number(hotel.price) * room.price);
                      return (
                        <div key={room.name} className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-primary/50 transition-colors">
                          <div>
                            <p className="font-semibold text-foreground">{room.name}</p>
                            <p className="text-sm text-muted-foreground">{room.desc}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-lg font-bold text-primary">{formatPrice(roomPrice)}</p>
                              <p className="text-xs text-muted-foreground">/ night</p>
                            </div>
                            <Button size="sm" onClick={() => navigate(`/hotels/${hotel.id}/book?room=${encodeURIComponent(room.name)}&price=${roomPrice}&checkin=${searchCheckin}&checkout=${searchCheckout}&adults=${searchAdults}&children=${searchChildren}&rooms=${searchRooms}`, { state: { hotel: { id: hotel.id, name: hotel.name, city: hotel.city, price: hotel.price, source: hotel.source } } })}>Book</Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Policies */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <CardHeader><CardTitle>Hotel Policies</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {["Check-in: 3:00 PM | Check-out: 11:00 AM", "Free cancellation up to 48 hours before check-in", "Children under 12 stay free with existing bedding", "Pets not allowed"].map((p) => (
                    <div key={p} className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-muted-foreground">{p}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div>
            <Card className="sticky top-24">
              <CardHeader><CardTitle>Starting From</CardTitle></CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <span className="text-3xl font-bold text-primary">
                    {formatPrice(Math.round(hotel.price), hotel.source === "tripjack" ? "tripjack" : "travelvela")}
                  </span>
                  <span className="text-muted-foreground"> / night</span>
                </div>
                <Button className="w-full" size="lg" onClick={() => {
                  const firstRoom = hasApiRooms
                    ? (apiRooms[0]?.room?.[0]?.room_category || "Standard Room")
                    : "Standard Room";
                  const firstPrice = hasApiRooms
                    ? (apiRooms[0]?.room?.[0]?.price || apiRooms[0]?.price || hotel.price)
                    : hotel.price;
                  navigate(`/hotels/${id}/book?room=${encodeURIComponent(firstRoom)}&price=${firstPrice}&checkin=${searchCheckin}&checkout=${searchCheckout}&adults=${searchAdults}&children=${searchChildren}&rooms=${searchRooms}`, { state: { hotel: { id: hotel.id, name: hotel.name, city: hotel.city, price: hotel.price, source: hotel.source } } });
                }}>
                  Book Now
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">Best price guarantee</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default HotelDetail;
