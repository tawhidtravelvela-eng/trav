import { useState, useRef, useEffect } from "react";
import { useSiteContent } from "@/hooks/useSiteContent";

const formatLocalDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { Plane, Hotel, Search, CalendarDays, Users, MapPin, ArrowLeftRight, Minus, Plus, Globe, ChevronDown, PlusCircle, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion, useScroll, useTransform } from "framer-motion";
import { getImage } from "@/utils/images";
import AirportPicker, { type Airport } from "./AirportPicker";
import HotelLocationPicker, { type HotelLocation } from "./HotelLocationPicker";
import TourLocationPicker from "./TourLocationPicker";

type SearchTab = "flights" | "hotels" | "tours";
type TripType = "one-way" | "round-trip" | "multi-city";

interface MultiCityLeg {
  from: Airport | null;
  to: Airport | null;
  date?: Date;
}

const tabs = [
  { id: "flights" as const, label: "Flights", icon: Plane },
  { id: "hotels" as const, label: "Hotels", icon: Hotel },
  { id: "tours" as const, label: "Tours", icon: Globe },
];

const defaultRotatingWords = ["Perfect Flight", "Affordable Hotel", "Luxury Tour"];

const RotatingText = ({ words }: { words: string[] }) => {
  const rotatingWords = words.length ? words : defaultRotatingWords;
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % rotatingWords.length);
        setVisible(true);
      }, 400);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Calculate max width by rendering all words invisibly
  const maxWord = rotatingWords.reduce((a, b) => (a.length > b.length ? a : b), "");

  return (
    <span className="inline-grid">
      {/* Invisible sizer to reserve max width */}
      <span className="invisible col-start-1 row-start-1">{maxWord}</span>
      <span
        className={`col-start-1 row-start-1 text-accent transition-all duration-400 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
      >
        {rotatingWords[index]}
      </span>
    </span>
  );
};

const HeroSection = () => {
  const { content } = useSiteContent();
  const heroCfg = content.hero;
  const heroHeading = heroCfg.heading || "Find & Book Your";
  const heroSubtitle = heroCfg.subtitle || "Search 500+ airlines for the best deals";
  const heroWords: string[] = heroCfg.rotating_words?.length ? heroCfg.rotating_words : defaultRotatingWords;
  const [activeTab, setActiveTab] = useState<SearchTab>("flights");
  const [tripType, setTripType] = useState<TripType>("one-way");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [fromAirport, setFromAirport] = useState<Airport | null>(null);
  const [toAirport, setToAirport] = useState<Airport | null>(null);
  const [infants, setInfants] = useState(0);
  const [flightClass, setFlightClass] = useState("Economy");
  const [departDate, setDepartDate] = useState<Date>();
  const [returnDate, setReturnDate] = useState<Date>();
  const [departPopoverOpen, setDepartPopoverOpen] = useState(false);
  const [returnPopoverOpen, setReturnPopoverOpen] = useState(false);
  const [multiCityLegs, setMultiCityLegs] = useState<MultiCityLeg[]>([
    { from: null, to: null },
    { from: null, to: null },
  ]);
  const [regularFare, setRegularFare] = useState(true);
  const [directFlight, setDirectFlight] = useState(false);
  const [studentFare, setStudentFare] = useState(false);
  const [complexBookingOpen, setComplexBookingOpen] = useState(false);
  const navigate = useNavigate();

   // Hotel search state
  const [hotelLocation, setHotelLocation] = useState<HotelLocation | null>(null);
  const [hotelCheckin, setHotelCheckin] = useState<Date>();
  const [hotelCheckout, setHotelCheckout] = useState<Date>();
  const [hotelCheckinOpen, setHotelCheckinOpen] = useState(false);
  const [hotelCheckoutOpen, setHotelCheckoutOpen] = useState(false);
  const [hotelAdults, setHotelAdults] = useState(2);
  const [hotelChildren, setHotelChildren] = useState(0);
  const [hotelRooms, setHotelRooms] = useState(1);
  const [hotelGuestsOpen, setHotelGuestsOpen] = useState(false);

  // Tour search state
  const [tourDestination, setTourDestination] = useState("");
  const [tourDate, setTourDate] = useState<Date>();
  const [tourDateOpen, setTourDateOpen] = useState(false);
  const [tourTravelers, setTourTravelers] = useState(2);

  // Enforce pax limits
  const maxAdultPlusChild = 9;
  const adultChildTotal = adults + children;

  const handleSetAdults = (v: number) => {
    if (v + children > maxAdultPlusChild) return;
    setAdults(v);
    // Infants can't exceed adults
    if (infants > v) setInfants(v);
  };
  const handleSetChildren = (v: number) => {
    if (adults + v > maxAdultPlusChild) return;
    setChildren(v);
  };
  const handleSetInfants = (v: number) => {
    if (v > adults) return;
    setInfants(v);
  };

  const updateMultiCityLeg = (index: number, field: keyof MultiCityLeg, value: any) => {
    setMultiCityLegs(prev => prev.map((leg, i) => i === index ? { ...leg, [field]: value } : leg));
  };

  const addMultiCityLeg = () => {
    if (multiCityLegs.length < 5) {
      setMultiCityLegs(prev => [...prev, { from: null, to: null }]);
    }
  };

  const removeMultiCityLeg = (index: number) => {
    if (multiCityLegs.length > 2) {
      setMultiCityLegs(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleSearch = () => {
    // Validate pax limits
    if (adults + children > 9 || infants > adults) {
      setComplexBookingOpen(true);
      return;
    }
    if (activeTab === "flights") {
      const params = new URLSearchParams();
      if (tripType === "multi-city") {
        // Encode legs as comma-separated "FROM-TO-DATE" strings
        const legsStr = multiCityLegs
          .filter(l => l.from && l.to)
          .map(l => `${l.from!.code}_${l.to!.code}_${l.date ? formatLocalDate(l.date) : ""}`)
          .join(",");
        params.set("legs", legsStr);
        params.set("tripType", "multi-city");
      } else {
        if (fromAirport) params.set("from", fromAirport.code);
        if (toAirport) params.set("to", toAirport.code);
        if (departDate) params.set("date", formatLocalDate(departDate));
        if (tripType === "round-trip" && returnDate) {
          params.set("returnDate", formatLocalDate(returnDate));
        }
      }
      params.set("adults", String(adults));
      if (!studentFare && children > 0) params.set("children", String(children));
      if (!studentFare && infants > 0) params.set("infants", String(infants));
      params.set("class", flightClass);
      if (directFlight) params.set("direct", "true");
      if (studentFare) params.set("studentFare", "true");
      navigate(`/flights?${params.toString()}`);
    } else if (activeTab === "hotels") {
      const params = new URLSearchParams();
      if (hotelLocation) {
        params.set("city", hotelLocation.city_name);
        params.set("locationId", String(hotelLocation.location_id));
      }
      if (hotelCheckin) params.set("checkin", formatLocalDate(hotelCheckin));
      if (hotelCheckout) params.set("checkout", formatLocalDate(hotelCheckout));
      params.set("adults", String(hotelAdults));
      if (hotelChildren > 0) params.set("children", String(hotelChildren));
      params.set("rooms", String(hotelRooms));
      navigate(`/hotels?${params.toString()}`);
    } else if (activeTab === "tours") {
      const params = new URLSearchParams();
      if (tourDestination) params.set("q", tourDestination);
      if (tourDate) params.set("date", formatLocalDate(tourDate));
      params.set("travelers", String(tourTravelers));
      navigate(`/tours?${params.toString()}`);
    }
  };

  const travelerLabel = `${adults} Adult - ${children} Child`;

  useEffect(() => {
    setRegularFare(!studentFare);
    if (studentFare) {
      setChildren(0);
      setInfants(0);
    }
  }, [studentFare]);

  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const bgScale = useTransform(scrollYProgress, [0, 1], [1.1, 1.25]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 1], [0.75, 0.9]);

  return (
    <>
    <section ref={sectionRef} className="relative min-h-[480px] sm:min-h-[560px] lg:min-h-[680px] flex items-center overflow-hidden">
      {/* Parallax background */}
      <motion.div className="absolute inset-0" style={{ y: bgY }}>
        <motion.img src={getImage("hero-beach")} alt="Beautiful tropical destination" className="w-full h-full object-cover" style={{ scale: bgScale }} />
        <motion.div className="absolute inset-0 bg-gradient-to-b from-[hsl(213,90%,20%)] via-[hsl(213,90%,30%)] to-[hsl(213,90%,20%)]" style={{ opacity: overlayOpacity }} />
      </motion.div>

      <div className="container mx-auto px-4 relative z-10 py-8 sm:py-14 md:py-20">
        {/* Hero text */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="text-center mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-[4rem] font-extrabold text-primary-foreground mb-2 sm:mb-4 leading-[1.1] tracking-tight">
            {heroHeading}<br />
            <RotatingText words={heroWords} />
          </h1>
          <p className="text-xs sm:text-base text-primary-foreground/50 max-w-md mx-auto">
            {heroSubtitle}
          </p>
        </motion.div>

        {/* Search box */}
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }} className="max-w-5xl mx-auto">
          {/* Tabs */}
          <div className="flex justify-center relative z-10 mb-[-20px]">
            <div className="inline-flex rounded-full p-1 gap-0.5 shadow-xl glass-light">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 sm:px-8 py-2 sm:py-3 text-[11px] sm:text-sm font-bold transition-all rounded-full whitespace-nowrap",
                    activeTab === tab.id
                      ? "bg-gradient-to-r from-primary to-[hsl(213,80%,55%)] text-primary-foreground shadow-lg shadow-primary/25"
                      : "text-foreground/70 hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Card body */}
          <div className="bg-card rounded-2xl shadow-2xl pt-8 px-3 pb-4 sm:pt-10 sm:px-7 sm:pb-7 md:pt-12 md:px-8 md:pb-8 border border-border/50">
            {activeTab === "flights" && (
              <div>
                {/* Trip type */}
                <div className="flex items-center gap-3 sm:gap-6 mb-4 sm:mb-5 flex-wrap">
                  {(["one-way", "round-trip", "multi-city"] as TripType[]).map((type) => (
                    <button key={type} type="button" onClick={() => setTripType(type)} className="flex items-center gap-1.5 sm:gap-2 cursor-pointer group bg-transparent border-none p-0">
                      <div className={cn(
                        "w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200",
                        tripType === type ? "border-primary bg-primary/5 scale-110" : "border-muted-foreground/30 group-hover:border-muted-foreground"
                      )}>
                        {tripType === type && <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary" />}
                      </div>
                      <span className={cn(
                        "text-[11px] sm:text-sm font-semibold transition-colors",
                        tripType === type ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}>
                        {type === "one-way" ? "One way" : type === "round-trip" ? "Round-trip" : "Multi-city"}
                      </span>
                    </button>
                  ))}
                </div>


                {tripType !== "multi-city" && (
                <div className="relative hidden sm:flex gap-3 mb-3">
                  <div className="flex-1">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Flying from</label>
                    <div className="bg-muted/40 rounded-xl border border-border/70 px-3 py-3 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200">
                      <AirportPicker label="" placeholder="Where from?" selected={fromAirport} onSelect={setFromAirport} excludeCode={toAirport?.code} />
                    </div>
                  </div>
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10" style={{ marginTop: '12px' }}>
                    <button
                      onClick={() => { const t = fromAirport; setFromAirport(toAirport); setToAirport(t); }}
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-[hsl(213,80%,55%)] text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25 hover:shadow-xl hover:scale-110 transition-all duration-200 border-[3px] border-card"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Flying to</label>
                    <div className="bg-muted/40 rounded-xl border border-border/70 px-3 py-3 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200">
                      <AirportPicker label="" placeholder="Where to?" selected={toAirport} onSelect={setToAirport} excludeCode={fromAirport?.code} />
                    </div>
                  </div>
                </div>
                )}

                {/* From / To — Mobile */}
                {tripType !== "multi-city" && (
                <div className="sm:hidden mb-3">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Flying from & to</label>
                  <div className="relative bg-muted/40 rounded-xl border border-border/70 overflow-hidden">
                    <div className="px-3 py-2">
                      <AirportPicker label="" placeholder="Where from?" selected={fromAirport} onSelect={setFromAirport} excludeCode={toAirport?.code} />
                    </div>
                    <div className="relative">
                      <div className="border-t border-dashed border-border" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                        <button
                          onClick={() => { const t = fromAirport; setFromAirport(toAirport); setToAirport(t); }}
                          className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-[hsl(213,80%,55%)] text-primary-foreground flex items-center justify-center shadow-sm active:scale-95 transition-transform"
                        >
                          <ArrowLeftRight className="w-3 h-3 rotate-90" />
                        </button>
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <AirportPicker label="" placeholder="Where to?" selected={toAirport} onSelect={setToAirport} excludeCode={fromAirport?.code} />
                    </div>
                  </div>
                </div>
                )}

                {/* Multi-city legs */}
                {tripType === "multi-city" && (
                  <div className="space-y-2 mb-3">
                    {multiCityLegs.map((leg, idx) => (
                      <div key={idx} className="relative">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Flight {idx + 1}</span>
                          {multiCityLegs.length > 2 && (
                            <button onClick={() => removeMultiCityLeg(idx)} className="ml-auto text-muted-foreground hover:text-destructive transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200">
                            <AirportPicker label="" placeholder="From?" selected={leg.from} onSelect={(a) => updateMultiCityLeg(idx, 'from', a)} excludeCode={leg.to?.code} />
                          </div>
                          <div className="bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200">
                            <AirportPicker label="" placeholder="To?" selected={leg.to} onSelect={(a) => updateMultiCityLeg(idx, 'to', a)} excludeCode={leg.from?.code} />
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                                </div>
                                <span className={cn("text-xs sm:text-sm font-semibold truncate", leg.date ? "text-foreground" : "text-muted-foreground")}>
                                  {leg.date ? format(leg.date, "dd/MM/yyyy") : "Date"}
                                </span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={leg.date}
                                onSelect={(d) => updateMultiCityLeg(idx, 'date', d)}
                                disabled={(date) => date < new Date()}
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    ))}
                    {multiCityLegs.length < 5 && (
                      <button onClick={addMultiCityLeg} className="flex items-center gap-1.5 text-primary text-xs font-bold hover:text-primary/80 transition-colors mt-1">
                        <PlusCircle className="w-3.5 h-3.5" />
                        Add another city
                      </button>
                    )}
                  </div>
                )}

                {/* Row 2: Date / Traveler / Class (for one-way & round-trip) */}
                {tripType !== "multi-city" && (
                <div className={cn("grid grid-cols-1 gap-2 sm:gap-3", tripType === "round-trip" ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
                  <div>
                    <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Departing</label>
                    <Popover open={departPopoverOpen} onOpenChange={setDepartPopoverOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                          </div>
                          <span className={cn("text-xs sm:text-sm font-semibold truncate", departDate ? "text-foreground" : "text-muted-foreground")}>
                            {departDate ? format(departDate, "dd/MM/yyyy") : "Select date"}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={departDate}
                          onSelect={(d) => { setDepartDate(d); setDepartPopoverOpen(false); }}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {tripType === "round-trip" && (
                    <div>
                      <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Returning</label>
                      <Popover open={returnPopoverOpen} onOpenChange={setReturnPopoverOpen}>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                            </div>
                            <span className={cn("text-xs sm:text-sm font-semibold truncate", returnDate ? "text-foreground" : "text-muted-foreground")}>
                              {returnDate ? format(returnDate, "dd/MM/yyyy") : "Select date"}
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={returnDate}
                            onSelect={(d) => { setReturnDate(d); setReturnPopoverOpen(false); }}
                            disabled={(date) => date < (departDate || new Date())}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Traveler</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap truncate">{travelerLabel}</span>
                          <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-4" align="start">
                        <div className="space-y-4">
                          <CounterRow label="Adults" subtitle="Age 12+" value={adults} onChange={handleSetAdults} min={1} max={maxAdultPlusChild - children} />
                          <CounterRow label="Children" subtitle="Age 2–11" value={children} onChange={handleSetChildren} min={0} max={maxAdultPlusChild - adults} disabled={studentFare} />
                          <CounterRow label="Infants" subtitle="Under 2" value={infants} onChange={handleSetInfants} min={0} max={adults} disabled={studentFare} />
                          <p className={cn("text-[10px] text-muted-foreground text-center transition-opacity", adultChildTotal >= 7 ? "opacity-100" : "opacity-0")}>Max 9 passengers (adults + children)</p>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Class</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                            <Plane className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-foreground truncate">{flightClass}</span>
                          <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-44 p-1.5" align="end">
                        {["Economy", "Premium Economy", "Business", "First Class"].map((cls) => (
                          <button
                            key={cls}
                            onClick={() => setFlightClass(cls)}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                              flightClass === cls ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted text-foreground"
                            )}
                          >
                            {cls}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                )}

                {/* Traveler & Class for multi-city */}
                {tripType === "multi-city" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    <div>
                      <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Traveler</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                            </div>
                            <span className="text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap truncate">{travelerLabel}</span>
                            <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-4" align="start">
                          <div className="space-y-4">
                            <CounterRow label="Adults" subtitle="Age 12+" value={adults} onChange={handleSetAdults} min={1} max={maxAdultPlusChild - children} />
                            <CounterRow label="Children" subtitle="Age 2–11" value={children} onChange={handleSetChildren} min={0} max={maxAdultPlusChild - adults} disabled={studentFare} />
                            <CounterRow label="Infants" subtitle="Under 2" value={infants} onChange={handleSetInfants} min={0} max={adults} disabled={studentFare} />
                            <p className={cn("text-[10px] text-muted-foreground text-center transition-opacity", adultChildTotal >= 7 ? "opacity-100" : "opacity-0")}>Max 9 passengers (adults + children)</p>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Class</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                              <Plane className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
                            </div>
                            <span className="text-xs sm:text-sm font-semibold text-foreground truncate">{flightClass}</span>
                            <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-44 p-1.5" align="end">
                          {["Economy", "Premium Economy", "Business", "First Class"].map((cls) => (
                            <button
                              key={cls}
                              onClick={() => setFlightClass(cls)}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                                flightClass === cls ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted text-foreground"
                              )}
                            >
                              {cls}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}

                {/* Fare options + Search button */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5 sm:mt-7">
                  <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
                    {/* Fare type - exclusive toggle */}
                    <div className="flex items-center gap-1 bg-muted/40 rounded-xl border border-border/60 p-1">
                      {([
                        { label: "Regular", active: regularFare, onClick: () => { setStudentFare(false); } },
                        { label: "Student", active: studentFare, onClick: () => { setStudentFare(true); } },
                      ] as const).map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={opt.onClick}
                          className={cn(
                            "relative px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all duration-300",
                            opt.active
                              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* Direct flight - independent switch */}
                    <button
                      type="button"
                      onClick={() => setDirectFlight(!directFlight)}
                      className="flex items-center gap-2 group"
                    >
                      <div className={cn(
                        "w-9 h-5 rounded-full transition-all duration-300 relative",
                        directFlight ? "bg-primary shadow-sm shadow-primary/30" : "bg-muted-foreground/20"
                      )}>
                        <div className={cn(
                          "absolute top-0.5 w-4 h-4 rounded-full bg-card shadow-sm transition-all duration-300",
                          directFlight ? "left-[18px]" : "left-0.5"
                        )} />
                      </div>
                      <span className={cn(
                        "text-[11px] sm:text-xs font-bold transition-colors",
                        directFlight ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}>
                        Direct Only
                      </span>
                    </button>
                  </div>
                  <Button
                    onClick={handleSearch}
                    className="h-11 sm:h-13 px-8 sm:px-14 rounded-full bg-gradient-to-r from-accent to-[hsl(30,90%,48%)] hover:from-accent/90 hover:to-[hsl(30,90%,44%)] text-accent-foreground font-extrabold text-sm shadow-xl shadow-accent/25 hover:shadow-2xl hover:shadow-accent/30 transition-all w-full sm:w-auto"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Search Flights
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "hotels" && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-5">
                  {/* Destination */}
                  <div>
                    <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Destination</label>
                    <HotelLocationPicker
                      selected={hotelLocation}
                      onSelect={setHotelLocation}
                      placeholder="Where are you going?"
                    />
                  </div>

                  {/* Check-in */}
                  <div>
                    <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Check-in</label>
                    <Popover open={hotelCheckinOpen} onOpenChange={setHotelCheckinOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                          </div>
                          <span className={cn("text-xs sm:text-sm font-semibold", hotelCheckin ? "text-foreground" : "text-muted-foreground")}>
                            {hotelCheckin ? format(hotelCheckin, "dd MMM yyyy") : "Select date"}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={hotelCheckin}
                          onSelect={(d) => {
                            setHotelCheckin(d);
                            setHotelCheckinOpen(false);
                            if (d && (!hotelCheckout || hotelCheckout <= d)) {
                              const next = new Date(d);
                              next.setDate(next.getDate() + 1);
                              setHotelCheckout(next);
                            }
                          }}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Check-out */}
                  <div>
                    <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Check-out</label>
                    <Popover open={hotelCheckoutOpen} onOpenChange={setHotelCheckoutOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                          </div>
                          <span className={cn("text-xs sm:text-sm font-semibold", hotelCheckout ? "text-foreground" : "text-muted-foreground")}>
                            {hotelCheckout ? format(hotelCheckout, "dd MMM yyyy") : "Select date"}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={hotelCheckout}
                          onSelect={(d) => {
                            setHotelCheckout(d);
                            setHotelCheckoutOpen(false);
                          }}
                          disabled={(date) => date <= (hotelCheckin || new Date())}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Guests & Rooms */}
                  <div>
                    <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Guests & Rooms</label>
                    <Popover open={hotelGuestsOpen} onOpenChange={setHotelGuestsOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-foreground">
                            {hotelAdults + hotelChildren} Guest{hotelAdults + hotelChildren > 1 ? "s" : ""}, {hotelRooms} Room{hotelRooms > 1 ? "s" : ""}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-4 pointer-events-auto" align="start">
                        <div className="space-y-3">
                          <CounterRow label="Adults" subtitle="18+" value={hotelAdults} onChange={(v) => setHotelAdults(v)} min={1} max={6} />
                          <CounterRow label="Children" subtitle="0-17" value={hotelChildren} onChange={(v) => setHotelChildren(v)} min={0} max={4} />
                          <CounterRow label="Rooms" value={hotelRooms} onChange={(v) => setHotelRooms(v)} min={1} max={4} />
                          <Button size="sm" className="w-full mt-2" onClick={() => setHotelGuestsOpen(false)}>Done</Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="flex justify-center">
                  <Button onClick={handleSearch} className="h-11 sm:h-12 px-8 sm:px-14 rounded-full bg-gradient-to-r from-accent to-[hsl(30,90%,48%)] text-accent-foreground font-extrabold text-sm shadow-xl shadow-accent/25 w-full sm:w-auto">
                    <Search className="w-4 h-4 mr-2" />
                    Search Hotels
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "tours" && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-5">
                  {/* Destination */}
                  <div>
                    <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Destination</label>
                    <TourLocationPicker
                      value={tourDestination}
                      onSelect={setTourDestination}
                      placeholder="City, country or tour name..."
                      variant="button"
                    />
                  </div>

                  {/* Travel Date */}
                  <div>
                    <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Travel Date</label>
                    <Popover open={tourDateOpen} onOpenChange={setTourDateOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                          </div>
                          <span className={cn("text-xs sm:text-sm font-semibold", tourDate ? "text-foreground" : "text-muted-foreground")}>
                            {tourDate ? format(tourDate, "dd MMM yyyy") : "Select date"}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={tourDate}
                          onSelect={(d) => { setTourDate(d); setTourDateOpen(false); }}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Travelers */}
                  <div>
                    <label className="text-[10px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 sm:mb-2 block">Travelers</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-foreground">
                            {tourTravelers} Traveler{tourTravelers > 1 ? "s" : ""}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-4 pointer-events-auto" align="start">
                        <CounterRow label="Travelers" value={tourTravelers} onChange={setTourTravelers} min={1} max={15} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="flex justify-center">
                  <Button onClick={handleSearch} className="h-11 sm:h-12 px-8 sm:px-14 rounded-full bg-gradient-to-r from-accent to-[hsl(30,90%,48%)] text-accent-foreground font-extrabold text-sm shadow-xl shadow-accent/25 w-full sm:w-auto">
                    <Search className="w-4 h-4 mr-2" />
                    Search Tours
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>

    <AlertDialog open={complexBookingOpen} onOpenChange={setComplexBookingOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Complex Booking Scenario</AlertDialogTitle>
          <AlertDialogDescription>
            Your booking scenario is complex. Please contact our customer support for help.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};


const CounterRow = ({ label, subtitle, value, onChange, min, max, disabled }: { label: string; subtitle?: string; value: number; onChange: (v: number) => void; min: number; max?: number; disabled?: boolean }) => (
  <div className={cn("flex items-center justify-between", disabled && "opacity-40 pointer-events-none")}>
    <div>
      <span className="text-sm font-bold text-foreground">{label}</span>
      {subtitle && <span className="text-[11px] text-muted-foreground block">{subtitle}</span>}
    </div>
    <div className="flex items-center gap-2.5">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className={cn(
          "w-7 h-7 rounded-full border flex items-center justify-center transition-all",
          value <= min || disabled ? "border-muted text-muted cursor-not-allowed" : "border-primary/40 text-primary hover:bg-primary/10"
        )}
        disabled={value <= min || disabled}
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="text-sm font-bold w-4 text-center">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        className={cn("w-7 h-7 rounded-full border flex items-center justify-center transition-all", (disabled || (max !== undefined && value >= max)) ? "border-muted text-muted cursor-not-allowed" : "border-primary/40 text-primary hover:bg-primary/10")}
        disabled={disabled || (max !== undefined && value >= max)}
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  </div>
);

export default HeroSection;
