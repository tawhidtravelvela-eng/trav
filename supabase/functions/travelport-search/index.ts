import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Simple in-memory rate limiter ──
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // max requests per IP per window
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

interface TravelportSettings {
  target_branch: string;
  username: string;
  password: string;
  endpoint: string;
}

// ── XML Builders ──

function buildAirLeg(from: string, to: string, date: string, cabin: string): string {
  return `
      <air:SearchAirLeg>
        <air:SearchOrigin>
          <com:Airport Code="${from}"/>
        </air:SearchOrigin>
        <air:SearchDestination>
          <com:Airport Code="${to}"/>
        </air:SearchDestination>
        <air:SearchDepTime PreferredTime="${date}"/>
        <air:AirLegModifiers>
          <air:PreferredCabins><com:CabinClass Type="${cabin}"/></air:PreferredCabins>
        </air:AirLegModifiers>
      </air:SearchAirLeg>`;
}

function getCabinCode(cabinClass: string): string {
  const cabinMap: Record<string, string> = {
    Economy: "Economy",
    "Premium Economy": "PremiumEconomy",
    Business: "Business",
    "First Class": "First",
  };
  return cabinMap[cabinClass] || "Economy";
}

function buildLegsXml(from: string, to: string, departDate: string, returnDate: string | null, cabin: string, legs?: { from: string; to: string; date: string }[]): string {
  if (legs && legs.length > 0) {
    return legs.map((leg) => buildAirLeg(leg.from, leg.to, leg.date, cabin)).join("");
  }
  let xml = buildAirLeg(from, to, departDate, cabin);
  if (returnDate) xml += buildAirLeg(to, from, returnDate, cabin);
  return xml;
}

function buildLowFareSearchRequest(settings: TravelportSettings, from: string, to: string, departDate: string, returnDate: string | null, adults: number, cabinClass: string, legs?: { from: string; to: string; date: string }[], options?: { directFlight?: boolean; studentFare?: boolean; children?: number; infants?: number }): string {
  const cabin = getCabinCode(cabinClass);
  const legsXml = buildLegsXml(from, to, departDate, returnDate, cabin, legs);
  const adultCode = options?.studentFare ? "STU" : "ADT";
  const maxConnectionsAttr = options?.directFlight ? ' MaxConnections="0"' : '';
  const childCount = options?.children || 0;
  const infantCount = options?.infants || 0;

  const passengerXml = [
    ...Array(adults).fill(`<com:SearchPassenger Code="${adultCode}"/>`),
    ...Array(childCount).fill(`<com:SearchPassenger Code="CNN" Age="8"/>`),
    ...Array(infantCount).fill(`<com:SearchPassenger Code="INF" Age="1" PricePTCOnly="true"/>`),
  ].join("\n      ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:air="http://www.travelport.com/schema/air_v54_0"
  xmlns:com="http://www.travelport.com/schema/common_v54_0">
  <soap:Body>
    <air:LowFareSearchReq TargetBranch="${settings.target_branch}"
      ReturnBrandedFares="true"
      xmlns:air="http://www.travelport.com/schema/air_v54_0">
      <com:BillingPointOfSaleInfo OriginApplication="UAPI"/>${legsXml}
      <air:AirSearchModifiers MaxSolutions="20" IncludeFlightDetails="true">
        <air:FlightType${maxConnectionsAttr}/>
      </air:AirSearchModifiers>
      ${passengerXml}
      <air:AirPricingModifiers ETicketability="Required" FaresIndicator="PublicAndPrivateFares"/>
    </air:LowFareSearchReq>
  </soap:Body>
</soap:Envelope>`;
}


function buildPingRequest(settings: TravelportSettings): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:sys="http://www.travelport.com/schema/system_v32_0">
  <soap:Body>
    <sys:PingReq>
      <sys:Payload>Test</sys:Payload>
    </sys:PingReq>
  </soap:Body>
</soap:Envelope>`;
}

// ── Shared Parsing Helpers ──

function extractSegments(xmlText: string): Record<string, any> {
  const segFullRegex = /<air:AirSegment\s([^>]*?)(?:\/>|>([\s\S]*?)<\/air:AirSegment>)/g;
  const segments: Record<string, any> = {};
  let segFullMatch;
  while ((segFullMatch = segFullRegex.exec(xmlText)) !== null) {
    const attrs = segFullMatch[1];
    const body = segFullMatch[2] || "";
    const key = attrs.match(/Key="([^"]*)"/)?.[1];
    const origin = attrs.match(/Origin="([^"]*)"/)?.[1];
    const destination = attrs.match(/Destination="([^"]*)"/)?.[1];
    const departure = attrs.match(/DepartureTime="([^"]*)"/)?.[1];
    const arrival = attrs.match(/ArrivalTime="([^"]*)"/)?.[1];
    const carrier = attrs.match(/Carrier="([^"]*)"/)?.[1];
    const flightNumber = attrs.match(/FlightNumber="([^"]*)"/)?.[1];
    const group = attrs.match(/Group="([^"]*)"/)?.[1];
    // Booking class info
    const classOfService = attrs.match(/ClassOfService="([^"]*)"/)?.[1];
    // Extract codeshare / operating carrier info
    const codeshareMatch = body.match(/<air:CodeshareInfo[^>]*OperatingCarrier="([^"]*)"[^>]*(?:OperatingFlightNumber="([^"]*)")?/);
    const operatingCarrier = codeshareMatch?.[1] || undefined;
    const operatingFlightNumber = codeshareMatch?.[2] || undefined;
    // Extract booking code list from body
    const bookingCodes: { code: string; count: string }[] = [];
    const bcRegex = /<air:BookingCodeInfo[^>]*CabinClass="[^"]*"[^>]*BookingCounts="([^"]*)"/g;
    let bcMatch;
    while ((bcMatch = bcRegex.exec(body)) !== null) {
      // BookingCounts format: "Y9|B9|M7|..." 
      const counts = bcMatch[1].split("|");
      for (const c of counts) {
        const code = c.replace(/\d+/g, "");
        const count = c.replace(/[A-Z]/gi, "");
        if (code && count) bookingCodes.push({ code, count });
      }
    }
    if (key && origin && destination) {
      segments[key] = { key, origin, destination, departure, arrival, carrier, flightNumber, group, classOfService, operatingCarrier, operatingFlightNumber, bookingCodes: bookingCodes.length > 0 ? bookingCodes : undefined };
    }
  }
  return segments;
}

function findSegmentRefs(body: string, segments: Record<string, any>): any[] {
  const result: any[] = [];
  const seen = new Set<string>();

  // 1) Preferred: Journey keeps provider-intended itinerary for this pricing option
  const orderedJourneyRefs = extractSegmentKeyRefs(body);
  for (const key of orderedJourneyRefs) {
    if (segments[key] && !seen.has(key)) {
      result.push(segments[key]);
      seen.add(key);
    }
  }
  if (result.length > 0) return result;

  // 2) Fallback: BookingInfo SegmentRef inside AirPricingInfo
  const bookingRefRegex = /<air:BookingInfo[^>]*SegmentRef="([^"]*)"/g;
  let bookingRefMatch;
  while ((bookingRefMatch = bookingRefRegex.exec(body)) !== null) {
    const key = bookingRefMatch[1];
    if (segments[key] && !seen.has(key)) {
      result.push(segments[key]);
      seen.add(key);
    }
  }
  if (result.length > 0) return result;

  // 3) Last fallback: any SegmentRef attribute in the pricing body
  const refRegex = /SegmentRef="([^"]*)"/g;
  let refMatch;
  while ((refMatch = refRegex.exec(body)) !== null) {
    const key = refMatch[1];
    if (segments[key] && !seen.has(key)) {
      result.push(segments[key]);
      seen.add(key);
    }
  }

  // 4) Emergency fallback: key lookup
  if (result.length === 0) {
    const keyRegex = /Key="([^"]*)"/g;
    let keyMatch;
    while ((keyMatch = keyRegex.exec(body)) !== null) {
      const key = keyMatch[1];
      if (segments[key] && !seen.has(key)) {
        result.push(segments[key]);
        seen.add(key);
      }
    }
  }

  return result;
}

// Extract per-segment booking codes from BookingInfo elements inside AirPricingInfo
function extractBookingCodes(body: string): Record<string, string> {
  const codes: Record<string, string> = {};
  const regex = /<air:BookingInfo[^>]*BookingCode="([^"]*)"[^>]*SegmentRef="([^"]*)"/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    if (!codes[match[2]]) codes[match[2]] = match[1]; // first match wins per segment
  }
  return codes;
}

function extractPenalties(body: string, type: string): any {
  const penalties: any[] = [];
  const seen = new Set<string>();

  // Match both self-closing and regular penalty elements
  const re = new RegExp(
    `<air:${type}\\s[^>]*PenaltyApplies="([^"]*)"[^>]*(?:\\/>|>([\\s\\S]*?)<\\/air:${type}>)`,
    "g"
  );
  let m;
  while ((m = re.exec(body)) !== null) {
    const applies = m[1];
    const inner = m[2] || "";
    const amountMatch = inner.match(/<air:Amount>([^<]*)<\/air:Amount>/);
    const percentMatch = inner.match(/<air:Percentage>([\d.]+)<\/air:Percentage>/);
    const amount = amountMatch ? amountMatch[1] : null;
    const percentage = percentMatch ? `${percentMatch[1]}%` : null;
    // Deduplicate across multiple AirPricingInfo blocks
    const key = `${applies}|${amount}|${percentage}`;
    if (seen.has(key)) continue;
    seen.add(key);
    penalties.push({ applies, amount, percentage });
  }
  return penalties.length > 0 ? penalties : null;
}

function extractSegmentKeyRefs(solutionBody: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();

  const journeyRegex = /<air:Journey[^>]*>([\s\S]*?)<\/air:Journey>/g;
  let journeyMatch;
  while ((journeyMatch = journeyRegex.exec(solutionBody)) !== null) {
    const journeyBody = journeyMatch[1];
    const refRegex = /<air:AirSegmentRef[^>]*Key="([^"]*)"/g;
    let refMatch;
    while ((refMatch = refRegex.exec(journeyBody)) !== null) {
      const key = refMatch[1];
      if (!seen.has(key)) {
        refs.push(key);
        seen.add(key);
      }
    }
  }

  if (refs.length === 0) {
    const attrRefRegex = /SegmentRef="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrRefRegex.exec(solutionBody)) !== null) {
      const key = attrMatch[1];
      if (!seen.has(key)) {
        refs.push(key);
        seen.add(key);
      }
    }
  }

  return refs;
}

function buildRoutesFromParsedSegments(rawSegments: any[]): any[][] {
  if (rawSegments.length === 0) return [];

  const orderedSegments = rawSegments.map((seg) => ({ ...seg }));
  const routes: any[][] = [];
  let currentRoute: any[] = [orderedSegments[0]];

  for (let i = 1; i < orderedSegments.length; i++) {
    const prev = currentRoute[currentRoute.length - 1];
    const next = orderedSegments[i];
    const groupChanged = String(next.group ?? "") !== String(prev.group ?? "");
    const disconnected = prev.destination !== next.origin;

    if (groupChanged || disconnected) {
      routes.push(currentRoute);
      currentRoute = [next];
    } else {
      currentRoute.push(next);
    }
  }

  if (currentRoute.length > 0) routes.push(currentRoute);
  return routes;
}

// Helper: parse weight from text like "30K", "23KG", "23 KG", "23 Kg"
function parseWeightFromText(text: string): string | null {
  const m = text.match(/(\d+)\s*K(?:G|g)?(?:\s|$|<)/i);
  return m ? `${m[1]} Kg` : null;
}

// Extract BaggageAllowances section from inside AirPricingInfo blocks
function extractBaggageAllowancesSection(body: string): string {
  // First try: explicit <air:BaggageAllowances> wrapper inside AirPricingInfo
  const baggageAllowancesRegex = /<air:BaggageAllowances>([\s\S]*?)<\/air:BaggageAllowances>/g;
  const sections: string[] = [];
  let m;
  while ((m = baggageAllowancesRegex.exec(body)) !== null) {
    sections.push(m[1]);
  }
  if (sections.length > 0) return sections.join("\n");

  // Fallback: look inside AirPricingInfo blocks directly
  const pricingInfoRegex = /<air:AirPricingInfo[^>]*>([\s\S]*?)<\/air:AirPricingInfo>/g;
  const pricingBodies: string[] = [];
  while ((m = pricingInfoRegex.exec(body)) !== null) {
    pricingBodies.push(m[1]);
  }
  return pricingBodies.length > 0 ? pricingBodies.join("\n") : body;
}

function getPieceCountFromCheckedLabels(labels: string[]): number | null {
  let maxPiece = 0;
  for (const label of labels) {
    const match = label.match(/(\d+)(?:st|nd|rd|th)?checked/i);
    if (match) {
      maxPiece = Math.max(maxPiece, parseInt(match[1], 10));
    }
  }
  return maxPiece > 0 ? maxPiece : null;
}

function parseCheckedAllowance(wrapper: string): string | null {
  const texts: string[] = [];
  const textTagRegex = /<air:Text>([^<]*)<\/air:Text>/gi;
  let textTagMatch;
  while ((textTagMatch = textTagRegex.exec(wrapper)) !== null) {
    texts.push(textTagMatch[1].trim());
  }

  const pieceFromText = texts
    .map((t) => t.match(/^(\d+)\s*P$/i)?.[1])
    .find(Boolean);
  const pieceCountFromText = pieceFromText ? parseInt(pieceFromText, 10) : null;

  const weightFromText = texts.map((t) => parseWeightFromText(`${t} `)).find(Boolean) || null;

  const checkedLabels: string[] = [];
  const detailWeights: string[] = [];
  const bagDetailsRegex = /<air:BagDetails[^>]*ApplicableBags="([^"]*)"[^>]*>([\s\S]*?)<\/air:BagDetails>|<air:BagDetails[^>]*ApplicableBags="([^"]*)"[^>]*\/>/gi;
  let bagDetailMatch;
  while ((bagDetailMatch = bagDetailsRegex.exec(wrapper)) !== null) {
    const label = (bagDetailMatch[1] || bagDetailMatch[3] || "").trim();
    if (!label.toLowerCase().includes("checked")) continue;
    checkedLabels.push(label);

    const detailBody = bagDetailMatch[2] || "";
    const detailTexts: string[] = [];
    const detailTextRegex = /<air:Text>([^<]*)<\/air:Text>/gi;
    let dtm;
    while ((dtm = detailTextRegex.exec(detailBody)) !== null) {
      detailTexts.push(dtm[1]);
    }
    const w = detailTexts.map((t) => parseWeightFromText(`${t} `)).find(Boolean);
    if (w) detailWeights.push(w);
  }

  const pieceCountFromLabels = getPieceCountFromCheckedLabels(checkedLabels);

  // Important: if fare is weight-concept (e.g. 30K), do NOT infer piece count from labels.
  const pieceCount = pieceCountFromText ?? (weightFromText ? null : pieceCountFromLabels);

  const uniqueDetailWeights = Array.from(new Set(detailWeights));
  const perPieceWeight = uniqueDetailWeights.length === 1 ? uniqueDetailWeights[0] : null;

  if (pieceCount && perPieceWeight) {
    return `${pieceCount} Piece${pieceCount > 1 ? "s" : ""} (${perPieceWeight} each)`;
  }

  if (pieceCount && weightFromText) {
    return pieceCount === 1
      ? `1 Piece (${weightFromText})`
      : `${pieceCount} Pieces (${weightFromText} total)`;
  }

  if (pieceCount) {
    return `${pieceCount} Piece${pieceCount > 1 ? "s" : ""}`;
  }

  if (weightFromText) {
    return weightFromText;
  }

  const piecesTagMatch = wrapper.match(/<air:NumberOfPieces>(\d+)<\/air:NumberOfPieces>/i);
  if (piecesTagMatch) {
    const n = parseInt(piecesTagMatch[1], 10);
    return `${n} Piece${n > 1 ? "s" : ""}`;
  }

  const weightMatch = wrapper.match(/<air:MaxWeight[^>]*Value="([\d.]+)"[^>]*Unit="([^"]*)"/i);
  if (weightMatch) {
    return `${weightMatch[1]} ${weightMatch[2] || "Kg"}`;
  }

  return null;
}

function parseBaggageFromSection(section: string): { cabin?: string; checkin?: string; embargo?: string[] } {
  const baggage: { cabin?: string; checkin?: string; embargo?: string[] } = {};

  // --- CHECKED BAGGAGE from BaggageAllowanceInfo ---
  const checkedRegex = /<air:BaggageAllowanceInfo[^>]*>([\s\S]*?)<\/air:BaggageAllowanceInfo>/g;
  let checkedMatch;
  while ((checkedMatch = checkedRegex.exec(section)) !== null) {
    if (baggage.checkin) continue;
    const wrapper = checkedMatch[0];
    const parsed = parseCheckedAllowance(wrapper);
    if (parsed) baggage.checkin = parsed;
  }

  // --- CARRY-ON from CarryOnAllowanceInfo ---
  const carryOnRegex = /<air:CarryOnAllowanceInfo[^>]*>([\s\S]*?)<\/air:CarryOnAllowanceInfo>/g;
  let carryOnMatch;
  while ((carryOnMatch = carryOnRegex.exec(section)) !== null) {
    if (baggage.cabin) continue;
    const wrapper = carryOnMatch[0];
    const inner = carryOnMatch[1];

    const detailsMatch = inner.match(/<air:CarryOnDetails[^>]*ApplicableCarryOnBags="(\d+)"/);
    if (detailsMatch) {
      const n = parseInt(detailsMatch[1]);
      const allTexts: string[] = [];
      const tr = /<air:Text>([^<]*)<\/air:Text>/gi;
      let tm;
      while ((tm = tr.exec(wrapper)) !== null) allTexts.push(tm[1]);
      const w = allTexts.map(t => parseWeightFromText(t + " ")).find(Boolean);
      baggage.cabin = w ? `${n} Piece${n > 1 ? "s" : ""} (${w})` : `${n} Piece${n > 1 ? "s" : ""}`;
      continue;
    }

    const textPieceMatch = wrapper.match(/<air:Text>(\d+)P<\/air:Text>/);
    if (textPieceMatch) {
      const n = parseInt(textPieceMatch[1]);
      baggage.cabin = `${n} Piece${n > 1 ? "s" : ""}`;
      continue;
    }

    const carryTexts: string[] = [];
    const ctr = /<air:Text>([^<]*)<\/air:Text>/gi;
    let ctm;
    while ((ctm = ctr.exec(wrapper)) !== null) carryTexts.push(ctm[1]);
    const carryWeight = carryTexts.map(t => parseWeightFromText(t + " ")).find(Boolean);
    if (carryWeight) { baggage.cabin = carryWeight; continue; }

    const piecesMatch = wrapper.match(/<air:NumberOfPieces>(\d+)<\/air:NumberOfPieces>/);
    if (piecesMatch) {
      const n = parseInt(piecesMatch[1]);
      baggage.cabin = `${n} Piece${n > 1 ? "s" : ""}`;
      continue;
    }

    const carryWeightMatch = wrapper.match(/<air:MaxWeight[^>]*Value="([\d.]+)"[^>]*Unit="([^"]*)"/);
    if (carryWeightMatch) {
      baggage.cabin = `${carryWeightMatch[1]} ${carryWeightMatch[2] || "Kg"}`;
    }
  }

  // --- EMBARGO from EmbargoInfo ---
  const embargoRegex = /<air:EmbargoInfo[^>]*>([\s\S]*?)<\/air:EmbargoInfo>/g;
  let embargoMatch;
  const embargoes: string[] = [];
  while ((embargoMatch = embargoRegex.exec(section)) !== null) {
    const inner = embargoMatch[1];
    const textMatches = inner.match(/<air:Text>([^<]*)<\/air:Text>/gi);
    if (textMatches) {
      for (const t of textMatches) {
        const val = t.match(/<air:Text>([^<]*)<\/air:Text>/i)?.[1];
        if (val && val.trim()) embargoes.push(val.trim());
      }
    }
  }
  if (embargoes.length > 0) baggage.embargo = embargoes;

  return baggage;
}

function extractBaggage(body: string): { cabin?: string; checkin?: string; embargo?: string[] } | null {
  // Scope to AirPricingInfo > BaggageAllowances path
  const section = extractBaggageAllowancesSection(body);
  const baggage = parseBaggageFromSection(section);
  return baggage.cabin || baggage.checkin ? baggage : null;
}

// Extract per-passenger-type pricing from AirPricingInfo blocks
function extractPaxPricing(body: string, extractAttr: (attrs: string, name: string) => { currency: string; amount: number } | null): Record<string, { base: number; taxes: number; total: number }> | null {
  const paxPricing: Record<string, { base: number; taxes: number; total: number }> = {};
  const pricingInfoRegex = /<air:AirPricingInfo\s([^>]*)>([\s\S]*?)<\/air:AirPricingInfo>/g;
  let m;
  while ((m = pricingInfoRegex.exec(body)) !== null) {
    const attrs = m[1];
    const infoBody = m[2];
    // Get passenger type from PassengerType element inside
    const ptcMatch = infoBody.match(/<air:PassengerType[^>]*Code="([^"]*)"/);
    if (!ptcMatch) continue;
    let ptc = ptcMatch[1]; // ADT, CNN, INF, STU etc
    // Normalize CNN to CHD for frontend consistency
    if (ptc === "CNN") ptc = "CHD";
    
    // Skip if we already have this type (take first occurrence)
    if (paxPricing[ptc]) continue;
    
    const totalParsed = extractAttr(attrs, "TotalPrice");
    const baseParsed = extractAttr(attrs, "BasePrice");
    const taxesParsed = extractAttr(attrs, "Taxes");
    if (!totalParsed) continue;
    
    const total = totalParsed.amount;
    const base = baseParsed ? baseParsed.amount : (taxesParsed ? Math.round(total - taxesParsed.amount) : total);
    const taxes = taxesParsed ? taxesParsed.amount : (baseParsed ? Math.round(total - baseParsed.amount) : 0);
    
    paxPricing[ptc] = { base, taxes, total };
  }
  
  return Object.keys(paxPricing).length > 0 ? paxPricing : null;
}

function buildFlightObj(index: number, currency: string, totalPrice: number | null, routeSegments: any[], refundable: boolean, changePenalties: any, cancelPenalties: any, source: string, basePrice?: number | null, taxesAmount?: number | null, baggage?: { cabin?: string; checkin?: string } | null, paxPricing?: Record<string, { base: number; taxes: number; total: number }> | null): any | null {
  if (routeSegments.length === 0) return null;
  const firstSeg = routeSegments[0];
  const lastSeg = routeSegments[routeSegments.length - 1];
  const depTime = new Date(firstSeg.departure).getTime();
  const arrTime = new Date(lastSeg.arrival).getTime();
  const totalMinutes = Math.round((arrTime - depTime) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // If we have paxPricing, use ADT pricing for the per-adult base/taxes
  const adtPricing = paxPricing?.["ADT"] || paxPricing?.["STU"];
  const effectiveBase = adtPricing ? adtPricing.base : (basePrice ?? null);
  const effectiveTaxes = adtPricing ? adtPricing.taxes : (taxesAmount ?? null);

  return {
    id: `tp-${source}-${index}`,
    airline: firstSeg.carrier,
    flightNumber: `${firstSeg.carrier}${firstSeg.flightNumber}`,
    from_city: firstSeg.origin,
    to_city: lastSeg.destination,
    departure: firstSeg.departure,
    arrival: lastSeg.arrival,
    duration: `${hours}h ${minutes}m`,
    stops: routeSegments.length - 1,
    price: totalPrice,
    currency: currency || null,
    class: "Economy",
    segments: routeSegments,
    seats: 9,
    is_active: true,
    isRefundable: refundable,
    changePenalties,
    cancelPenalties,
    searchSource: source,
    basePrice: effectiveBase,
    taxes: effectiveTaxes,
    baggageAllowance: baggage || null,
    paxPricing: paxPricing || null,
  };
}

// ── Fare Shopping Parser (LowFareSearchRsp) ──

interface SearchCriteria {
  from?: string;
  to?: string;
  returnDate?: string | null;
  legs?: { from: string; to: string; date: string }[];
}

function buildExpectedLegPairs(criteria: SearchCriteria): Array<{ from: string; to: string }> {
  if (criteria.legs && criteria.legs.length > 0) {
    return criteria.legs.map((leg) => ({ from: leg.from, to: leg.to }));
  }

  const pairs: Array<{ from: string; to: string }> = [];
  if (criteria.from && criteria.to) pairs.push({ from: criteria.from, to: criteria.to });
  if (criteria.returnDate && criteria.from && criteria.to) pairs.push({ from: criteria.to, to: criteria.from });
  return pairs;
}

function routeMatchesSearch(route: any[], criteria: SearchCriteria): boolean {
  if (route.length === 0) return false;
  const first = route[0];
  const last = route[route.length - 1];

  const expectedLegs = buildExpectedLegPairs(criteria);
  if (expectedLegs.length === 0) return true;

  return expectedLegs.some((leg) => first.origin === leg.from && last.destination === leg.to);
}

function pickPreferredRoutes(routes: any[][], criteria: SearchCriteria): any[][] {
  if (routes.length === 0) return routes;

  const expectedLegs = buildExpectedLegPairs(criteria);
  if (expectedLegs.length === 0) return routes.slice(0, 1);

  const picked: any[][] = [];
  const seen = new Set<string>();

  for (const leg of expectedLegs) {
    const candidates = routes
      .filter((route) => route.length > 0)
      .filter((route) => route[0].origin === leg.from && route[route.length - 1].destination === leg.to)
      .sort((a, b) => {
        const stopsDiff = (a.length - 1) - (b.length - 1);
        if (stopsDiff !== 0) return stopsDiff;

        const aDuration = new Date(a[a.length - 1].arrival).getTime() - new Date(a[0].departure).getTime();
        const bDuration = new Date(b[b.length - 1].arrival).getTime() - new Date(b[0].departure).getTime();
        if (aDuration !== bDuration) return aDuration - bDuration;

        return new Date(a[0].departure).getTime() - new Date(b[0].departure).getTime();
      });

    const best = candidates[0];
    if (!best) continue;

    const key = `${best[0].key}|${best[best.length - 1].key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(best);
  }

  return picked.length > 0 ? picked : routes.slice(0, 1);
}

function parseFareResults(xmlText: string, criteria: SearchCriteria): any[] {
  const flights: any[] = [];
  const segments = extractSegments(xmlText);
  let index = 0;

  // NO global baggage extraction — each fare must provide its own class-specific baggage

  // Helper: extract price attribute safely
  function extractAttr(attrs: string, name: string): { currency: string; amount: number } | null {
    // Prefer exact attribute first (matches Galileo/booking totals more reliably)
    const exact = new RegExp(`(?:^|\\s)${name}="([A-Z]{3})([\\d.]+)"`).exec(attrs);
    if (exact) return { currency: exact[1], amount: parseFloat(exact[2]) };
    const approx = new RegExp(`Approximate${name}="([A-Z]{3})([\\d.]+)"`).exec(attrs);
    if (approx) return { currency: approx[1], amount: parseFloat(approx[2]) };
    return null;
  }

  function extractApproxAttr(attrs: string, name: string): { currency: string; amount: number } | null {
    const approx = new RegExp(`Approximate${name}="([A-Z]{3})([\\d.]+)"`).exec(attrs);
    if (approx) return { currency: approx[1], amount: parseFloat(approx[2]) };
    const exact = new RegExp(`(?:^|\\s)${name}="([A-Z]{3})([\\d.]+)"`).exec(attrs);
    if (exact) return { currency: exact[1], amount: parseFloat(exact[2]) };
    return null;
  }

  // Strategy 1 (preferred): AirPricingSolution (stable branded-fare structure)
  const solutionRegex = /<air:AirPricingSolution\s([^>]*)>([\s\S]*?)<\/air:AirPricingSolution>/g;
  let solMatch;
  while ((solMatch = solutionRegex.exec(xmlText)) !== null && index < 20) {
    const solAttrs = solMatch[1];
    const solBody = solMatch[2];
    const totalParsed = extractAttr(solAttrs, "TotalPrice");
    if (!totalParsed) continue;
    const currency = totalParsed.currency;
    const totalPrice = totalParsed.amount;
    const refundableMatch = solBody.match(/Refundable="([^"]*)"/);
    const refundable = refundableMatch ? refundableMatch[1] === "true" : false;
    const changePenalties = extractPenalties(solBody, "ChangePenalty");
    const cancelPenalties = extractPenalties(solBody, "CancelPenalty");
    const baseParsed = extractApproxAttr(solAttrs, "BasePrice");
    const taxesParsed = extractApproxAttr(solAttrs, "Taxes");
    const basePrice = baseParsed ? baseParsed.amount : (totalParsed && taxesParsed ? Math.round(totalPrice - taxesParsed.amount) : null);
    const taxesAmount = taxesParsed ? taxesParsed.amount : null;
    const baggage = extractBaggage(solBody);
    const paxPricing = extractPaxPricing(solBody, extractApproxAttr);
    const solutionSegments = findSegmentRefs(solBody, segments);
    const routes = buildRoutesFromParsedSegments(solutionSegments);
    const selectedRoutes = pickPreferredRoutes(routes, criteria);
    const fareBookingCodes = extractBookingCodes(solBody);
    for (const route of selectedRoutes) {
      for (const seg of route) {
        if (fareBookingCodes[seg.key]) seg.bookingCode = fareBookingCodes[seg.key];
      }
      const f = buildFlightObj(index, currency, totalPrice, route, refundable, changePenalties, cancelPenalties, "fare", basePrice, taxesAmount, baggage, paxPricing);
      if (f) { flights.push(f); index++; }
      if (index >= 20) break;
    }
  }

  // Strategy 2 fallback: AirPricePoint
  if (flights.length === 0) {
    const pricePointRegex = /<air:AirPricePoint\s([^>]*)>([\s\S]*?)<\/air:AirPricePoint>/g;
    let ppMatch;
    while ((ppMatch = pricePointRegex.exec(xmlText)) !== null && index < 20) {
      const ppAttrs = ppMatch[1];
      const ppBody = ppMatch[2];
      const totalParsed = extractAttr(ppAttrs, "TotalPrice");
      if (!totalParsed) continue;
      const currency = totalParsed.currency;
      const totalPrice = totalParsed.amount;
      const refundableMatch = ppBody.match(/Refundable="([^"]*)"/);
      const refundable = refundableMatch ? refundableMatch[1] === "true" : false;
      const changePenalties = extractPenalties(ppBody, "ChangePenalty");
      const cancelPenalties = extractPenalties(ppBody, "CancelPenalty");
      const baseParsed = extractApproxAttr(ppAttrs, "BasePrice");
      const taxesParsed = extractApproxAttr(ppAttrs, "Taxes");
      const basePrice = baseParsed ? baseParsed.amount : (totalParsed && taxesParsed ? Math.round(totalPrice - taxesParsed.amount) : null);
      const taxesAmount = taxesParsed ? taxesParsed.amount : null;
      const baggage = extractBaggage(ppBody);
      const paxPricing = extractPaxPricing(ppBody, extractApproxAttr);
      const solutionSegments = findSegmentRefs(ppBody, segments);
      const routes = buildRoutesFromParsedSegments(solutionSegments);
      const selectedRoutes = pickPreferredRoutes(routes, criteria);
      const fareBookingCodes = extractBookingCodes(ppBody);
      for (const route of selectedRoutes) {
        for (const seg of route) {
          if (fareBookingCodes[seg.key]) seg.bookingCode = fareBookingCodes[seg.key];
        }
        const f = buildFlightObj(index, currency, totalPrice, route, refundable, changePenalties, cancelPenalties, "fare", basePrice, taxesAmount, baggage, paxPricing);
        if (f) { flights.push(f); index++; }
        if (index >= 20) break;
      }
    }
  }

  return flights;
}

// ── SOAP caller ──

async function callTravelport(endpoint: string, credentials: string, xmlBody: string): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml;charset=UTF-8",
      Authorization: `Basic ${credentials}`,
      SOAPAction: "",
    },
    body: xmlBody,
  });
  return response.text();
}

// ── Main Handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ success: false, error: "Too many requests. Please try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();

    let settings: TravelportSettings;

    // Check for tenant-provided credentials first
    if (body.tenantCredentials) {
      settings = body.tenantCredentials as TravelportSettings;
    } else {
      // Prioritize secrets (production creds), fall back to DB settings
      const secretUsername = Deno.env.get("TRAVELPORT_USERNAME");
      const secretPassword = Deno.env.get("TRAVELPORT_PASSWORD");
      const secretBranch = Deno.env.get("TRAVELPORT_TARGET_BRANCH");

      if (secretUsername && secretPassword && secretBranch) {
        // Use secrets-based production credentials
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const adminClient = createClient(supabaseUrl, supabaseKey);

        const { data: apiSettings } = await adminClient
          .from("api_settings")
          .select("is_active, settings")
          .eq("provider", "travelport")
          .single();

        if (apiSettings && !apiSettings.is_active) {
          return new Response(
            JSON.stringify({ success: false, error: "Travelport API is disabled." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const dbSettings = (apiSettings?.settings || {}) as any;
        settings = {
          target_branch: secretBranch,
          username: secretUsername,
          password: secretPassword,
          endpoint: dbSettings.endpoint || "https://apac.universal-api.travelport.com/B2BGateway/connect/uAPI/AirService",
        };
      } else {
        // Fall back to global settings from DB
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const adminClient = createClient(supabaseUrl, supabaseKey);

        const { data: apiSettings, error: settingsError } = await adminClient
          .from("api_settings")
          .select("*")
          .eq("provider", "travelport")
          .single();

        if (settingsError || !apiSettings) {
          return new Response(
            JSON.stringify({ success: false, error: "Travelport API not configured" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!apiSettings.is_active) {
          return new Response(
            JSON.stringify({ success: false, error: "Travelport API is disabled." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        settings = apiSettings.settings as unknown as TravelportSettings;
      }
    }

    if (!settings.username || !settings.password || !settings.target_branch) {
      return new Response(
        JSON.stringify({ success: false, error: "Travelport credentials are incomplete" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = btoa(`${settings.username}:${settings.password}`);

    // ── Test mode (ping) ──
    if (body.test) {
      const pingEndpoint = settings.endpoint.replace("/AirService", "/SystemService");
      const pingXml = buildPingRequest(settings);
      const responseText = await callTravelport(pingEndpoint, credentials, pingXml);

      if (responseText.includes("PingRsp")) {
        return new Response(
          JSON.stringify({ success: true, message: "Connection successful" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        const faultMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
        return new Response(
          JSON.stringify({ success: false, error: faultMatch ? faultMatch[1] : "Ping failed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Flight search ──
    const { from, to, departDate, returnDate, adults = 1, children = 0, infants = 0, cabinClass = "Economy", legs, directFlight, studentFare } = body;

    if (!legs?.length && (!from || !to || !departDate)) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required search parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const searchXml = buildLowFareSearchRequest(settings, from, to, departDate, returnDate, adults, cabinClass, legs, { directFlight, studentFare, children, infants });
    const responseText = await callTravelport(settings.endpoint, credentials, searchXml);

    const faultMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
    if (faultMatch) {
      console.warn("Travelport SOAP fault:", faultMatch[1]);
      // Return 200 with empty results so frontend degrades gracefully
      return new Response(
        JSON.stringify({ success: true, flights: [], count: 0, mode: "fare", warning: faultMatch[1] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const flights = parseFareResults(responseText, { from, to, returnDate, legs });

    return new Response(
      JSON.stringify({ success: true, flights, count: flights.length, mode: "fare" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Travelport search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
