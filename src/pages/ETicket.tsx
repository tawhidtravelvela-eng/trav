import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { useFooterData } from "@/hooks/useFooterData";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Printer, ArrowLeft, Plane, Building2, Map, Phone, Mail, Globe, MapPin, Clock, Users, Calendar, CheckCircle2, Armchair, Luggage, UtensilsCrossed } from "lucide-react";

interface AncillaryItem {
  type: string;
  description: string;
  amount: number;
  currency?: string;
}

interface PaxAncillary {
  passenger: string;
  items: AncillaryItem[];
}

interface ConfirmationData {
  galileo_pnr?: string;
  airline_pnr?: string;
  passengers?: { name: string; type: string }[];
  etickets?: string[];
  confirmation_number?: string;
  ancillaries?: PaxAncillary[];
}

interface BookingRecord {
  id: string;
  booking_id: string;
  type: string;
  title: string;
  subtitle: string | null;
  total: number;
  status: string;
  created_at: string;
  details: { label: string; value: string }[];
  confirmation_number: string | null;
  confirmation_data: ConfirmationData | null;
}

const statusLabels: Record<string, string> = {
  Confirmed: "CONFIRMED",
  Paid: "AWAITING CONFIRMATION",
  Pending: "PAYMENT PENDING",
  Cancelled: "CANCELLED",
  "Needs Payment": "NEEDS PAYMENT",
};

const statusBg: Record<string, string> = {
  Confirmed: "#ecfdf5",
  Paid: "#eff6ff",
  Pending: "#fffbeb",
  Cancelled: "#fef2f2",
  "Needs Payment": "#fff7ed",
};

const statusFg: Record<string, string> = {
  Confirmed: "#059669",
  Paid: "#2563eb",
  Pending: "#d97706",
  Cancelled: "#dc2626",
  "Needs Payment": "#ea580c",
};

const ETicket = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { branding } = useSiteBranding();
  const footerData = useFooterData();
  const { formatPrice } = useCurrency();
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState("");
  const [ticketFiles, setTicketFiles] = useState<{ name: string; url: string }[]>([]);

  useEffect(() => {
    let loaded = false;
    const loadBooking = async () => {
      if (loaded) return;
      loaded = true;
      const { data } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
      if (data) {
        setBooking({
          ...data,
          details: (data.details as any) || [],
          confirmation_number: (data as any).confirmation_number || null,
          confirmation_data: (data as any).confirmation_data || null,
        });
        const { data: prof } = await supabase.from("profiles").select("full_name").eq("user_id", data.user_id).maybeSingle();
        setProfileName(prof?.full_name || "");
        // Load ticket files
        const { data: files } = await supabase.storage.from("ticket-files").list(data.id);
        if (files && files.length > 0) {
          setTicketFiles(files.map(f => ({
            name: f.name,
            url: supabase.storage.from("ticket-files").getPublicUrl(`${data.id}/${f.name}`).data.publicUrl,
          })));
        }
      }
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => { if (session) loadBooking(); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (session) loadBooking(); });
    const timeout = setTimeout(() => loadBooking(), 2000);
    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, [id]);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <Loader2 style={{ width: 32, height: 32, animation: "spin 1s linear infinite", color: "#94a3b8" }} />
    </div>
  );

  if (!booking) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8fafc", gap: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>Booking not found</h2>
      <Button onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
    </div>
  );

  const details = Array.isArray(booking.details) ? booking.details : [];
  const cd = booking.confirmation_data || {};
  const isFlight = booking.type === "Flight";
  const isHotel = booking.type === "Hotel";
  const isTour = booking.type === "Tour";

  const contact = footerData.contact || {};
  const companyName = contact.business_name || branding.site_name;
  const companyAddress = contact.address || "";
  const companyPhone = contact.phone || "";
  const companyEmail = contact.email || "";
  const companyWebsite = contact.website || "";
  const civilAviationLicense = contact.civil_aviation_license || "";
  const iataNumber = contact.iata_number || "";

  const getDetail = (label: string) => details.find(d => d.label === label)?.value || "";
  const passengerItems = details.filter(d => /^Passenger \d+$/i.test(d.label));
  const paxDetailItems = details.filter(d => /^Pax \d+/i.test(d.label));
  const paxDetails: Record<number, Record<string, string>> = {};
  paxDetailItems.forEach(d => {
    const match = d.label.match(/^Pax (\d+)\s+(.+)$/i);
    if (match) {
      const idx = parseInt(match[1]);
      if (!paxDetails[idx]) paxDetails[idx] = {};
      paxDetails[idx][match[2].trim()] = d.value;
    }
  });

  const contactEmail = getDetail("Contact Email");
  const contactPhone = getDetail("Contact Phone");
  const departure = getDetail("Departure");
  const arrival = getDetail("Arrival");
  const duration = getDetail("Duration");
  const stops = getDetail("Stops");

  const subtitleParts = booking.subtitle?.split("•").map(s => s.trim()) || [];
  const airlineInfo = subtitleParts[0] || "";
  const cabinClass = subtitleParts[1] || "";

  // Parse flight number from subtitle e.g. "CZ (CZ391)"
  const flightNumberMatch = airlineInfo.match(/\(([^)]+)\)/);
  const flightNumber = flightNumberMatch ? flightNumberMatch[1] : "";
  const airlineName = airlineInfo.replace(/\s*\([^)]*\)/, "").trim();

  // Check if any e-tickets have actual values
  const hasEtickets = cd.etickets?.some(t => t && t.trim() !== "") || false;

  const fmtDate = (d: string) => { try { return new Date(d).toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
  const fmtTime = (d: string) => { try { return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }); } catch { return d; } };
  const issueDate = new Date(booking.created_at).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });

  const fromCity = booking.title.split("→")[0]?.trim() || "";
  const toCity = booking.title.split("→")[1]?.trim() || "";

  const handlePrint = () => window.print();

  const PRIMARY = "#0092ff";
  const PRIMARY_DARK = "#0068b8";
  const PRIMARY_LIGHT = "#0092ff";
  const ACCENT_BG = "#e8f4ff";
  const GOLD = "#b45309";
  const BORDER = "#e2e8f0";
  const TEXT = "#0f172a";
  const TEXT2 = "#475569";
  const TEXT3 = "#94a3b8";

  const TypeIcon = isFlight ? Plane : isHotel ? Building2 : Map;
  const docTitle = isFlight ? "E-TICKET / ITINERARY RECEIPT" : isHotel ? "HOTEL BOOKING CONFIRMATION" : "TOUR BOOKING CONFIRMATION";

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'Plus Jakarta Sans', sans-serif" }} className="print:!bg-white">
      {/* Action bar */}
      <div className="print:hidden" style={{ background: PRIMARY, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} style={{ color: "white" }}>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 6 }} /> Back to Dashboard
          </Button>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" size="sm" onClick={handlePrint} style={{ borderColor: "rgba(255,255,255,0.3)", color: "white", background: "transparent" }}>
              <Printer style={{ width: 14, height: 14, marginRight: 6 }} /> Print
            </Button>
            <Button size="sm" onClick={handlePrint} style={{ background: "white", color: PRIMARY }}>
              <Download style={{ width: 14, height: 14, marginRight: 6 }} /> Download PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Document */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }} className="print:!p-0 print:!max-w-none">
        <div style={{ background: "white", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", position: "relative" }} className="print:!shadow-none print:!rounded-none">

          {/* Watermark for non-confirmed */}
          {booking.status !== "Confirmed" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 5 }}>
              <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: 8, opacity: 0.04, transform: "rotate(-35deg)", color: statusFg[booking.status], whiteSpace: "nowrap", userSelect: "none" }}>
                {statusLabels[booking.status] || booking.status}
              </div>
            </div>
          )}

          {/* ═══════ HEADER BAND ═══════ */}
          <div style={{ background: `linear-gradient(135deg, ${PRIMARY_DARK} 0%, ${PRIMARY} 100%)`, padding: "24px 36px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              {branding.logo_url ? (
                <img src={branding.logo_url} alt={branding.site_name} style={{ height: 44, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Plane style={{ width: 20, height: 20, color: "white" }} />
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 800, color: "white", letterSpacing: -0.5 }}>{branding.site_name}</span>
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 2 }}>{isFlight ? "Electronic Ticket" : "Booking Confirmation"}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: "white", letterSpacing: 1 }}>{booking.booking_id}</div>
            </div>
          </div>

          {/* ═══════ STATUS BANNER ═══════ */}
          <div style={{
            padding: "10px 36px", display: "flex", justifyContent: "space-between", alignItems: "center",
            background: statusBg[booking.status] || ACCENT_BG,
            borderBottom: `2px solid ${statusFg[booking.status] || PRIMARY_LIGHT}20`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: statusFg[booking.status],
                boxShadow: `0 0 6px ${statusFg[booking.status]}60`,
              }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: statusFg[booking.status], letterSpacing: 1.5, textTransform: "uppercase" }}>
                {statusLabels[booking.status] || booking.status}
              </span>
            </div>
            <span style={{ fontSize: 11, color: TEXT2 }}>
              {booking.status === "Confirmed" ? `Issued: ${issueDate}` : `Booked: ${issueDate}`}
            </span>
          </div>

          {/* ═══════ FLIGHT: VISUAL ROUTE CARD ═══════ */}
          {isFlight && (departure || arrival) && (
            <div style={{ padding: "28px 36px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
                {/* FROM */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: TEXT3, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Departure</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{fromCity}</div>
                  {departure && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: PRIMARY }}>{fmtTime(departure)}</div>
                      <div style={{ fontSize: 12, color: TEXT2, marginTop: 2 }}>{fmtDate(departure)}</div>
                    </div>
                  )}
                </div>

                {/* PLANE CONNECTOR */}
                <div style={{ width: 160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 0" }}>
                  <div style={{ fontSize: 10, color: TEXT3, marginBottom: 8 }}>{airlineInfo}</div>
                  <div style={{ display: "flex", alignItems: "center", width: "100%", position: "relative" }}>
                    <div style={{ flex: 1, height: 2, background: `linear-gradient(90deg, ${PRIMARY_LIGHT}40, ${PRIMARY_LIGHT})` }} />
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%", background: PRIMARY_LIGHT,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: `0 2px 12px ${PRIMARY_LIGHT}40`,
                    }}>
                      <Plane style={{ width: 16, height: 16, color: "white", transform: "rotate(0deg)" }} />
                    </div>
                    <div style={{ flex: 1, height: 2, background: `linear-gradient(90deg, ${PRIMARY_LIGHT}, ${PRIMARY_LIGHT}40)` }} />
                  </div>
                  {duration && <div style={{ fontSize: 10, color: TEXT3, marginTop: 8 }}>{duration}</div>}
                  {cabinClass && <div style={{ fontSize: 9, color: PRIMARY_LIGHT, fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: 1 }}>{cabinClass}</div>}
                </div>

                {/* TO */}
                <div style={{ flex: 1, textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: TEXT3, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Arrival</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{toCity}</div>
                  {arrival && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: PRIMARY }}>{fmtTime(arrival)}</div>
                      <div style={{ fontSize: 12, color: TEXT2, marginTop: 2 }}>{fmtDate(arrival)}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════ NON-FLIGHT: TITLE CARD ═══════ */}
          {!isFlight && (
            <div style={{ padding: "24px 36px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: ACCENT_BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <TypeIcon style={{ width: 20, height: 20, color: PRIMARY_LIGHT }} />
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: TEXT }}>{booking.title}</div>
                  {booking.subtitle && <div style={{ fontSize: 12, color: TEXT2, marginTop: 2 }}>{booking.subtitle}</div>}
                </div>
              </div>
            </div>
          )}

          {/* ═══════ PNR / REFERENCE STRIP ═══════ */}
          {isFlight && (cd.galileo_pnr || cd.airline_pnr || booking.confirmation_number) && (
            <div style={{ padding: "14px 36px", borderBottom: `1px solid ${BORDER}`, background: ACCENT_BG, display: "flex", gap: 40 }}>
              {cd.airline_pnr && (
                <InfoChip label="Airline PNR" value={cd.airline_pnr} highlight />
              )}
              {cd.galileo_pnr && (
                <InfoChip label="CRS PNR" value={cd.galileo_pnr} highlight />
              )}
              {!cd.galileo_pnr && !cd.airline_pnr && booking.confirmation_number && (
                <InfoChip label="Confirmation No." value={booking.confirmation_number} highlight />
              )}
              <InfoChip label="Date of Issue" value={issueDate} />
              <InfoChip label="Status" value={statusLabels[booking.status] || booking.status} color={statusFg[booking.status]} />
            </div>
          )}

          {!isFlight && booking.confirmation_number && (
            <div style={{ padding: "14px 36px", borderBottom: `1px solid ${BORDER}`, background: ACCENT_BG, display: "flex", gap: 40 }}>
              <InfoChip label="Confirmation No." value={booking.confirmation_number} highlight />
              <InfoChip label="Date of Issue" value={issueDate} />
            </div>
          )}

          {/* ═══════ PASSENGER TABLE ═══════ */}
          {isFlight && (cd.passengers && cd.passengers.length > 0 ? (
            <div style={{ padding: "20px 36px", borderBottom: `1px solid ${BORDER}` }}>
              <SectionHeader icon={<Users style={{ width: 14, height: 14 }} />} title="Passenger Details" />
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, marginTop: 10, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: PRIMARY }}>
                    <ThNew first>S/N</ThNew>
                    <ThNew>Passenger Name</ThNew>
                    <ThNew>Type</ThNew>
                    {Object.keys(paxDetails).length > 0 && <ThNew>Passport No.</ThNew>}
                    {hasEtickets && <ThNew last>E-Ticket Number</ThNew>}
                  </tr>
                </thead>
                <tbody>
                  {cd.passengers.map((pax, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#f8fafc" }}>
                      <TdNew>{String(i + 1).padStart(2, "0")}</TdNew>
                      <TdNew bold>{pax.name}</TdNew>
                      <TdNew><span style={{ background: pax.type === "Adult" ? "#dbeafe" : pax.type === "Child" ? "#fef3c7" : "#f3e8ff", color: pax.type === "Adult" ? "#1e40af" : pax.type === "Child" ? "#92400e" : "#6b21a8", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{pax.type}</span></TdNew>
                      {Object.keys(paxDetails).length > 0 && <TdNew mono>{paxDetails[i + 1]?.["Passport No."] || "—"}</TdNew>}
                      {hasEtickets && <TdNew mono>{cd.etickets?.[i] || "—"}</TdNew>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : passengerItems.length > 0 ? (
            <div style={{ padding: "20px 36px", borderBottom: `1px solid ${BORDER}` }}>
              <SectionHeader icon={<Users style={{ width: 14, height: 14 }} />} title="Passenger Details" />
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, marginTop: 10, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: PRIMARY }}>
                    <ThNew first>S/N</ThNew>
                    <ThNew>Passenger Name</ThNew>
                    {Object.keys(paxDetails).length > 0 && <ThNew>Passport No.</ThNew>}
                    {hasEtickets && <ThNew last>E-Ticket Number</ThNew>}
                  </tr>
                </thead>
                <tbody>
                  {passengerItems.map((p, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#f8fafc" }}>
                      <TdNew>{String(i + 1).padStart(2, "0")}</TdNew>
                      <TdNew bold>{p.value}</TdNew>
                      {Object.keys(paxDetails).length > 0 && <TdNew mono>{paxDetails[i + 1]?.["Passport No."] || "—"}</TdNew>}
                      {hasEtickets && <TdNew mono>{cd.etickets?.[i] || "—"}</TdNew>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null)}

          {/* ═══════ FLIGHT: ITINERARY TABLE ═══════ */}
          {isFlight && (departure || arrival) && (
            <div style={{ padding: "20px 36px", borderBottom: `1px solid ${BORDER}` }}>
              <SectionHeader icon={<Plane style={{ width: 14, height: 14 }} />} title="Flight Itinerary" />
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, marginTop: 10, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: PRIMARY }}>
                    <ThNew first>Flight</ThNew>
                    <ThNew>Route</ThNew>
                    <ThNew>Departure</ThNew>
                    <ThNew>Arrival</ThNew>
                    <ThNew>Duration</ThNew>
                    <ThNew last>Class / Status</ThNew>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: "white" }}>
                    <TdNew>
                      <div style={{ fontWeight: 700 }}>{airlineName || "—"}</div>
                      {flightNumber && <div style={{ fontSize: 10, color: TEXT3, marginTop: 2 }}>{flightNumber}</div>}
                    </TdNew>
                    <TdNew>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 700 }}>{fromCity}</span>
                        <span style={{ color: TEXT3 }}>→</span>
                        <span style={{ fontWeight: 700 }}>{toCity}</span>
                      </div>
                      {stops && stops !== "0" && (
                        <div style={{ fontSize: 10, color: GOLD, fontWeight: 600, marginTop: 3 }}>
                          {stops === "1" ? "1 Stop" : `${stops} Stops`}
                        </div>
                      )}
                    </TdNew>
                    <TdNew>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{departure ? fmtTime(departure) : "—"}</div>
                      <div style={{ fontSize: 10, color: TEXT3 }}>{departure ? fmtDate(departure) : ""}</div>
                    </TdNew>
                    <TdNew>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{arrival ? fmtTime(arrival) : "—"}</div>
                      <div style={{ fontSize: 10, color: TEXT3 }}>{arrival ? fmtDate(arrival) : ""}</div>
                    </TdNew>
                    <TdNew>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock style={{ width: 12, height: 12, color: TEXT3 }} />
                        <span style={{ fontWeight: 600 }}>{duration || "—"}</span>
                      </div>
                    </TdNew>
                    <TdNew>
                      <div style={{ fontWeight: 600 }}>{cabinClass || "Economy"}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: statusFg[booking.status], marginTop: 3 }}>
                        {statusLabels[booking.status] || booking.status}
                      </div>
                    </TdNew>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ═══════ HOTEL / TOUR: DETAILS ═══════ */}
          {!isFlight && (
            <div style={{ padding: "20px 36px", borderBottom: `1px solid ${BORDER}` }}>
              <SectionHeader icon={<TypeIcon style={{ width: 14, height: 14 }} />} title={isHotel ? "Reservation Details" : "Tour Details"} />
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, marginTop: 10, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
                <tbody>
                  {details
                    .filter(d => !/(Contact Email|Contact Phone|Payment Method)/i.test(d.label))
                    .map((d, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#f8fafc" }}>
                      <TdNew bold style={{ width: "38%" }}>{d.label}</TdNew>
                      <TdNew>{d.value}</TdNew>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══════ ANCILLARY SERVICES ═══════ */}
          {cd.ancillaries && (cd.ancillaries as any[]).length > 0 && (
            <div style={{ padding: "20px 36px", borderBottom: `1px solid ${BORDER}` }}>
              <SectionHeader icon={<Armchair style={{ width: 14, height: 14 }} />} title="Add-on Services" />
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, marginTop: 10, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: PRIMARY }}>
                    <ThNew first>Passenger</ThNew>
                    <ThNew>Service</ThNew>
                    <ThNew>Description</ThNew>
                    <ThNew last>Amount</ThNew>
                  </tr>
                </thead>
                <tbody>
                  {(cd.ancillaries as any[]).flatMap((paxAnc: any, pIdx: number) =>
                    (paxAnc.items || []).map((item: any, iIdx: number) => (
                      <tr key={`${pIdx}-${iIdx}`} style={{ background: (pIdx + iIdx) % 2 === 0 ? "white" : "#f8fafc" }}>
                        <TdNew bold>{iIdx === 0 ? paxAnc.passenger : ""}</TdNew>
                        <TdNew>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {item.type === "Seat" && <Armchair style={{ width: 12, height: 12, color: PRIMARY }} />}
                            {item.type === "Baggage" && <Luggage style={{ width: 12, height: 12, color: PRIMARY }} />}
                            {item.type === "Meal" && <UtensilsCrossed style={{ width: 12, height: 12, color: PRIMARY }} />}
                            <span style={{ fontWeight: 600 }}>{item.type}</span>
                          </div>
                        </TdNew>
                        <TdNew>{item.description}</TdNew>
                        <TdNew>{item.amount > 0 ? `${item.currency || ""} ${item.amount}` : "Included"}</TdNew>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══════ FARE SUMMARY ═══════ */}
          <div style={{ padding: "20px 36px", borderBottom: `1px solid ${BORDER}` }}>
            <SectionHeader icon={<CheckCircle2 style={{ width: 14, height: 14 }} />} title="Payment Summary" />
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, marginTop: 10, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
              <tbody>
                <tr style={{ background: ACCENT_BG }}>
                  <TdNew bold style={{ width: "40%" }}>Total Amount</TdNew>
                  <TdNew bold style={{ fontSize: 16, color: PRIMARY_DARK }}>{formatPrice(booking.total)}</TdNew>
                </tr>
                <tr>
                  <TdNew bold>Payment Status</TdNew>
                  <TdNew>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                      background: statusBg[booking.status], color: statusFg[booking.status],
                      letterSpacing: 0.5,
                    }}>
                      {statusLabels[booking.status] || booking.status}
                    </span>
                  </TdNew>
                </tr>
                <tr style={{ background: ACCENT_BG }}>
                  <TdNew bold>Booked By</TdNew>
                  <TdNew>{profileName || "—"}</TdNew>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ═══════ CONTACT INFO ═══════ */}
          {(contactEmail || contactPhone) && (
            <div style={{ padding: "16px 36px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 32, fontSize: 12 }}>
              {contactEmail && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Mail style={{ width: 14, height: 14, color: TEXT3 }} />
                  <div>
                    <div style={{ fontSize: 9, color: TEXT3, textTransform: "uppercase", letterSpacing: 1 }}>Traveler Email</div>
                    <div style={{ color: TEXT, fontWeight: 500 }}>{contactEmail}</div>
                  </div>
                </div>
              )}
              {contactPhone && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Phone style={{ width: 14, height: 14, color: TEXT3 }} />
                  <div>
                    <div style={{ fontSize: 9, color: TEXT3, textTransform: "uppercase", letterSpacing: 1 }}>Traveler Phone</div>
                    <div style={{ color: TEXT, fontWeight: 500 }}>{contactPhone}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════ IMPORTANT NOTICE ═══════ */}
          {isFlight && (
            <div style={{ padding: "16px 36px", borderBottom: `1px solid ${BORDER}`, background: "#fffbeb" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                ⚠ Important Information
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10, color: "#78350f", lineHeight: 1.8 }}>
                <li>Please arrive at the airport at least <b>3 hours</b> before departure for international flights, <b>2 hours</b> for domestic.</li>
                <li>Carry a <b>printed copy</b> of this e-ticket along with a valid photo ID / passport.</li>
                <li>Baggage allowance and check-in policies are subject to the airline's terms.</li>
                <li>Schedule changes may occur — please reconfirm your flight 24 hours before departure.</li>
              </ul>
            </div>
          )}

          {/* ═══════ COMPANY FOOTER ═══════ */}
          <div style={{ padding: "20px 36px", background: "#f8fafc", borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: TEXT, marginBottom: 6 }}>{companyName}</div>
                <div style={{ fontSize: 10, lineHeight: 1.8, color: TEXT2 }}>
                  {companyAddress && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><MapPin style={{ width: 10, height: 10, flexShrink: 0 }} /> {companyAddress}</div>}
                  {companyPhone && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Phone style={{ width: 10, height: 10, flexShrink: 0 }} /> {companyPhone}</div>}
                  {companyEmail && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Mail style={{ width: 10, height: 10, flexShrink: 0 }} /> {companyEmail}</div>}
                  {companyWebsite && <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Globe style={{ width: 10, height: 10, flexShrink: 0 }} /> {companyWebsite}</div>}
                </div>
                {(civilAviationLicense || iataNumber) && (
                  <div style={{ marginTop: 8, fontSize: 9, color: TEXT3, display: "flex", gap: 20 }}>
                    {civilAviationLicense && <span>Civil Aviation License: <b style={{ color: TEXT2 }}>{civilAviationLicense}</b></span>}
                    {iataNumber && <span>IATA No: <b style={{ color: TEXT2 }}>{iataNumber}</b></span>}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", fontSize: 10, color: TEXT3 }}>
                <div>This is a computer-generated document</div>
                <div>and does not require a signature.</div>
                <div style={{ marginTop: 8, color: TEXT2 }}>© {new Date().getFullYear()} {companyName}. All rights reserved.</div>
              </div>
            </div>
          </div>

          {/* Ticket Files Download Section */}
          {ticketFiles.length > 0 && (
            <div style={{ padding: "20px 32px", borderTop: `1px solid ${BORDER}` }} className="print:hidden">
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
                Ticket Documents
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ticketFiles.map((file) => (
                  <a key={file.name} href={file.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, background: ACCENT_BG, textDecoration: "none", color: PRIMARY, fontSize: 13, fontWeight: 500 }}>
                    <Download style={{ width: 16, height: 16 }} />
                    {file.name}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Decorative bottom bar */}
          <div style={{ height: 4, background: `linear-gradient(90deg, ${PRIMARY}, ${PRIMARY_LIGHT}, ${PRIMARY})` }} />
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:\\!bg-white { background: white !important; }
          .print\\:\\!shadow-none { box-shadow: none !important; }
          .print\\:\\!rounded-none { border-radius: 0 !important; }
          .print\\:\\!p-0 { padding: 0 !important; }
          .print\\:\\!max-w-none { max-width: none !important; }
          @page { margin: 0.35in; size: A4; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

/* ═══════ Sub-components ═══════ */

const SectionHeader = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={{ width: 24, height: 24, borderRadius: 6, background: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#0ea5e9" }}>
      {icon}
    </div>
    <h3 style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</h3>
  </div>
);

const InfoChip = ({ label, value, highlight, color }: { label: string; value: string; highlight?: boolean; color?: string }) => (
  <div>
    <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 2 }}>{label}</div>
    <div style={{
      fontFamily: highlight ? "'JetBrains Mono', monospace" : "inherit",
      fontSize: highlight ? 15 : 13,
      fontWeight: 700,
      color: color || "#0f172a",
      letterSpacing: highlight ? 1 : 0,
    }}>{value}</div>
  </div>
);

const ThNew = ({ children, first, last, style }: { children: React.ReactNode; first?: boolean; last?: boolean; style?: React.CSSProperties }) => (
  <th style={{
    textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 600,
    color: "rgba(255,255,255,0.9)", textTransform: "uppercase", letterSpacing: 1,
    borderBottom: "none",
    ...(first ? { borderTopLeftRadius: 8 } : {}),
    ...(last ? { borderTopRightRadius: 8 } : {}),
    ...style,
  }}>{children}</th>
);

const TdNew = ({ children, bold, mono, style }: { children: React.ReactNode; bold?: boolean; mono?: boolean; style?: React.CSSProperties }) => (
  <td style={{
    padding: "10px 14px", borderBottom: "1px solid #f1f5f9", color: "#0f172a",
    fontWeight: bold ? 600 : 400,
    fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit",
    fontSize: 12, verticalAlign: "middle",
    ...style,
  }}>{children}</td>
);

export default ETicket;
