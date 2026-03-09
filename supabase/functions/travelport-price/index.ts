import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Currency conversion utilities (same as unified-flight-search) ──
const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, BDT: 110.5, INR: 83, CNY: 7.24,
};

interface ExchangeConfig {
  rates: Record<string, number>;
  markup: number;
  sourceCurrencies: Record<string, string>;
}

async function loadExchangeConfig(sb: any): Promise<ExchangeConfig> {
  const config: ExchangeConfig = {
    rates: { ...DEFAULT_EXCHANGE_RATES },
    markup: 0,
    sourceCurrencies: { travelport: "BDT", tripjack: "INR", amadeus: "USD" },
  };
  try {
    const { data } = await sb
      .from("api_settings")
      .select("settings")
      .eq("provider", "currency_rates")
      .maybeSingle();
    if (data?.settings) {
      const s = data.settings as any;
      if (s.live_rates) config.rates = { ...config.rates, ...s.live_rates };
      if (s.conversion_markup !== undefined) config.markup = s.conversion_markup;
      if (s.api_source_currencies) config.sourceCurrencies = { ...config.sourceCurrencies, ...s.api_source_currencies };
    }
  } catch {}
  return config;
}

function convertAmount(amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>, markup: number): number {
  if (fromCurrency === toCurrency) return Math.round(amount);
  const fromRate = rates[fromCurrency] || 1;
  const toRate = rates[toCurrency] || 1;
  return Math.round((amount / fromRate) * toRate * (1 + markup / 100));
}

/** Convert penalty amounts from their native currency to targetCurrency */
function convertPenalties(penalties: any[] | null, targetCurrency: string, exchangeConfig: ExchangeConfig): any[] | null {
  if (!penalties) return null;
  return penalties.map((p: any) => {
    const converted = { ...p };
    if (p.amount && typeof p.amount === "string") {
      const match = p.amount.match(/^([A-Z]{3})([\d.]+)$/);
      if (match) {
        const penaltyCurrency = match[1];
        const penaltyAmount = parseFloat(match[2]);
        converted.displayAmount = convertAmount(penaltyAmount, penaltyCurrency, targetCurrency, exchangeConfig.rates, exchangeConfig.markup);
        converted.displayCurrency = targetCurrency;
      }
    }
    return converted;
  });
}

/** Convert fare rule Category 16 penalty amounts embedded in text */
function convertFareRulePenalties(fareRules: any[] | null, targetCurrency: string, exchangeConfig: ExchangeConfig): any[] | null {
  if (!fareRules) return null;
  return fareRules.map((rule: any) => {
    if (!rule.text) return rule;
    // Convert amounts like "CHARGE USD 300" or "CHARGE CNY 1500" in fare rule text
    const convertedText = rule.text.replace(
      /\b([A-Z]{3})\s*([\d,]+(?:\.\d+)?)\b/g,
      (match: string, cur: string, amt: string) => {
        // Only convert known currency codes
        if (!exchangeConfig.rates[cur]) return match;
        const amount = parseFloat(amt.replace(/,/g, ""));
        if (isNaN(amount) || amount === 0) return match;
        const converted = convertAmount(amount, cur, targetCurrency, exchangeConfig.rates, exchangeConfig.markup);
        return `${targetCurrency} ${converted.toLocaleString()}`;
      }
    );
    return { ...rule, text: convertedText };
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TravelportSettings {
  target_branch: string;
  username: string;
  password: string;
  endpoint: string;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildAirPriceRequest(
  settings: TravelportSettings,
  segments: any[],
  adults: number,
  children: number,
  infants: number,
  cabinClass: string,
  studentFare: boolean = false
): string {
  const cabinMap: Record<string, string> = {
    Economy: "Economy",
    "Premium Economy": "PremiumEconomy",
    Business: "Business",
    "First Class": "First",
  };
  const cabin = cabinMap[cabinClass] || "Economy";

  // Group segments by leg: outbound segments share Group="0", return segments share Group="1", etc.
  const segmentXml = segments
    .map(
      (seg: any, i: number) => {
      const keyVal = escapeXml(seg.key || `seg${i}`);
      return `
      <air:AirSegment Key="${keyVal}" Group="${seg.group ?? 0}"
        Carrier="${seg.carrier}" FlightNumber="${seg.flightNumber}"
        Origin="${seg.origin}" Destination="${seg.destination}"
        DepartureTime="${seg.departure}" ArrivalTime="${seg.arrival}"
        ClassOfService="${seg.bookingCode || seg.classOfService || "Y"}"
        ProviderCode="1G">
      </air:AirSegment>`;
      }
    )
    .join("");

  const adultCode = studentFare ? "STU" : "ADT";
  let paxKey = 0;
  const paxXml = [
    ...Array.from({ length: adults }, () => `<com:SearchPassenger Key="pax${paxKey++}" Code="${adultCode}"/>`),
    ...Array.from({ length: children }, () => `<com:SearchPassenger Key="pax${paxKey++}" Code="CNN" Age="10"/>`),
    ...Array.from({ length: infants }, () => `<com:SearchPassenger Key="pax${paxKey++}" Code="INF" Age="1"/>`),
  ].join("\n      ");

  // Determine plating carrier from first segment
  const platingCarrier = segments[0]?.carrier || "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:air="http://www.travelport.com/schema/air_v54_0"
  xmlns:com="http://www.travelport.com/schema/common_v54_0">
  <soap:Body>
    <air:AirPriceReq TargetBranch="${settings.target_branch}" CheckFlightDetails="true" FareRuleType="long">
      <com:BillingPointOfSaleInfo OriginApplication="UAPI"/>
      <air:AirItinerary>${segmentXml}
      </air:AirItinerary>
      <air:AirPricingModifiers${platingCarrier ? ` PlatingCarrier="${platingCarrier}"` : ""}>
        <air:PermittedCabins><com:CabinClass Type="${cabin}"/></air:PermittedCabins>
      </air:AirPricingModifiers>
      ${paxXml}
      <air:AirPricingCommand/>
    </air:AirPriceReq>
  </soap:Body>
</soap:Envelope>`;
}

// Helper: parse weight from text like "30K", "23KG", "23 KG", "23 Kg"
function parseWeightFromText(text: string): string | null {
  const m = text.match(/(\d+)\s*K(?:G|g)?(?:\s|$|<)/i);
  return m ? `${m[1]} Kg` : null;
}

// Extract BaggageAllowances section from inside AirPricingInfo blocks
function extractBaggageAllowancesSection(body: string): string {
  const baggageAllowancesRegex = /<air:BaggageAllowances>([\s\S]*?)<\/air:BaggageAllowances>/g;
  const sections: string[] = [];
  let m;
  while ((m = baggageAllowancesRegex.exec(body)) !== null) {
    sections.push(m[1]);
  }
  if (sections.length > 0) return sections.join("\n");

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

  // Combine piece count from all sources — include label-based count even for weight fares
  const pieceCount = pieceCountFromText ?? pieceCountFromLabels;

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

  // --- CHECKED BAGGAGE ---
  const checkedRegex = /<air:BaggageAllowanceInfo[^>]*>([\s\S]*?)<\/air:BaggageAllowanceInfo>/g;
  let checkedMatch;
  while ((checkedMatch = checkedRegex.exec(section)) !== null) {
    if (baggage.checkin) continue;
    const wrapper = checkedMatch[0];
    const parsed = parseCheckedAllowance(wrapper);
    if (parsed) baggage.checkin = parsed;
  }

  // --- CARRY-ON ---
  const carryOnRegex = /<air:CarryOnAllowanceInfo[^>]*>([\s\S]*?)<\/air:CarryOnAllowanceInfo>/g;
  let carryOnMatch;
  while ((carryOnMatch = carryOnRegex.exec(section)) !== null) {
    if (baggage.cabin) continue;
    const wrapper = carryOnMatch[0];
    const inner = carryOnMatch[1];

    const detailsMatch = inner.match(/<air:CarryOnDetails[^>]*ApplicableCarryOnBags="(\d+)"/);
    if (detailsMatch) {
      const n = parseInt(detailsMatch[1]);
      const carryTexts: string[] = [];
      const tr = /<air:Text>([^<]*)<\/air:Text>/gi;
      let tm;
      while ((tm = tr.exec(wrapper)) !== null) carryTexts.push(tm[1]);
      const w = carryTexts.map(t => parseWeightFromText(t + " ")).find(Boolean);
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

    const piecesMatch = inner.match(/<air:NumberOfPieces>(\d+)<\/air:NumberOfPieces>/);
    if (piecesMatch) {
      baggage.cabin = `${parseInt(piecesMatch[1])} Piece${parseInt(piecesMatch[1]) > 1 ? "s" : ""}`;
    }
  }

  // --- EMBARGO ---
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

function extractBaggageFromPrice(xmlText: string): { cabin?: string; checkin?: string; embargo?: string[] } | null {
  // Scope to AirPricingInfo > BaggageAllowances path
  const section = extractBaggageAllowancesSection(xmlText);
  
  const baggage = parseBaggageFromSection(section);
  return baggage.cabin || baggage.checkin ? baggage : null;
}

function extractPenalties(body: string, type: string): any[] | null {
  const penalties: any[] = [];
  const seen = new Set<string>();
  // Match both regular and self-closing penalty elements
  const re = new RegExp(
    `<air:${type}\\s[^>]*PenaltyApplies="([^"]*)"[^>]*(?:\\/>|>([\\s\\S]*?)<\\/air:${type}>)`,
    "g"
  );
  let m;
  while ((m = re.exec(body)) !== null) {
    const applies = m[1];
    const inner = m[2] || "";
    const amountMatch = inner.match(/<air:Amount>([A-Z]{3})([\d.]+)<\/air:Amount>/);
    const percentMatch = inner.match(/<air:Percentage>([\d.]+)<\/air:Percentage>/);
    const amount = amountMatch ? `${amountMatch[1]}${amountMatch[2]}` : null;
    const percentage = percentMatch ? `${percentMatch[1]}%` : null;
    // Deduplicate: same applies+amount+percentage is a duplicate from multiple AirPricingInfo blocks
    const key = `${applies}|${amount}|${percentage}`;
    if (seen.has(key)) continue;
    seen.add(key);
    penalties.push({ applies, amount, percentage });
  }
  return penalties.length > 0 ? penalties : null;
}

function parsePriceResponse(xmlText: string, segments?: any[]): any {
  

  const faultMatch = xmlText.match(/<faultstring>(.*?)<\/faultstring>/s);
  if (faultMatch) {
    console.error("Travelport AirPriceRsp fault:", faultMatch[1]);
    return { verified: false, error: `Travelport fault: ${faultMatch[1]}` };
  }


  // Prefer exact total first for booking parity; use approximate for base/tax display currency
  const totalMatch = xmlText.match(/(?:^|\s)TotalPrice="([A-Z]{3})([\d.]+)"/m)
    || xmlText.match(/ApproximateTotalPrice="([A-Z]{3})([\d.]+)"/);
  const baseMatch = xmlText.match(/ApproximateBasePrice="([A-Z]{3})([\d.]+)"/)
    || xmlText.match(/(?:^|\s)BasePrice="([A-Z]{3})([\d.]+)"/m);
  const taxMatch = xmlText.match(/ApproximateTaxes="([A-Z]{3})([\d.]+)"/)
    || xmlText.match(/(?:^|\s)Taxes="([A-Z]{3})([\d.]+)"/m);

  if (!totalMatch) {
    return { verified: false, error: "Could not parse pricing response" };
    return { verified: false, error: "Could not parse pricing response" };
  }

  // Extract FareRuleKey elements for use in fare rules requests
  const fareRuleKeys: { fareInfoRef: string; providerCode: string; key: string }[] = [];
  const fareRuleKeyRegex = /<air:FareRuleKey\s[^>]*FareInfoRef="([^"]*)"[^>]*ProviderCode="([^"]*)"[^>]*>([\s\S]*?)<\/air:FareRuleKey>/g;
  let frkMatch;
  while ((frkMatch = fareRuleKeyRegex.exec(xmlText)) !== null) {
    fareRuleKeys.push({ fareInfoRef: frkMatch[1], providerCode: frkMatch[2], key: frkMatch[3].trim() });
  }

  // Extract fare basis codes and segment info for FareRuleLookup approach
  // Try multiple extraction strategies since attribute order varies
  const fareRuleLookups: { origin: string; destination: string; carrier: string; fareBasis: string }[] = [];
  const seenFareBasis = new Set<string>();
  
  // Strategy 1: FareInfo elements (any attribute order)
  const fareInfoTagRegex = /<air:FareInfo\s([^>]+)>/g;
  let fiTagMatch;
  while ((fiTagMatch = fareInfoTagRegex.exec(xmlText)) !== null) {
    const attrs = fiTagMatch[1];
    const fb = attrs.match(/FareBasis="([^"]*)"/);
    const orig = attrs.match(/\bOrigin="([^"]*)"/);
    const dest = attrs.match(/\bDestination="([^"]*)"/);
    const carr = attrs.match(/\bCarrier="([^"]*)"/);
    if (fb && orig && dest && carr) {
      const key = `${fb[1]}|${orig[1]}|${dest[1]}|${carr[1]}`;
      if (!seenFareBasis.has(key)) {
        seenFareBasis.add(key);
        fareRuleLookups.push({ fareBasis: fb[1], origin: orig[1], destination: dest[1], carrier: carr[1] });
      }
    }
  }
  
  // Strategy 2: If no FareInfo found, try BookingInfo elements + segment data
  if (fareRuleLookups.length === 0) {
    const bookingInfoRegex = /<air:BookingInfo[^>]*FareBasis="([^"]*)"[^>]*SegmentRef="([^"]*)"[^>]*>/g;
    let biMatch;
    const fareBases: string[] = [];
    while ((biMatch = bookingInfoRegex.exec(xmlText)) !== null) {
      if (!fareBases.includes(biMatch[1])) fareBases.push(biMatch[1]);
    }
    // Build lookups from fare bases + first/last segment origins/destinations
    if (fareBases.length > 0) {
      // Use the segments from the request body
      const segOrigin = xmlText.match(/Origin="([A-Z]{3})"/);
      const segDest = xmlText.match(/Destination="([A-Z]{3})"/);
      const segCarrier = xmlText.match(/Carrier="([A-Z]{2})"/);
      for (const fb of fareBases) {
        if (segOrigin && segDest && segCarrier) {
          const key = `${fb}|${segOrigin[1]}|${segDest[1]}|${segCarrier[1]}`;
          if (!seenFareBasis.has(key)) {
            seenFareBasis.add(key);
            fareRuleLookups.push({ fareBasis: fb, origin: segOrigin[1], destination: segDest[1], carrier: segCarrier[1] });
          }
        }
      }
    }
  }
  
  // Strategy 3: Build from BookingInfo fare bases + input segments
  if (fareRuleLookups.length === 0 && segments && segments.length > 0) {
    const bookingInfoRegex2 = /FareBasis="([^"]*)"/g;
    let fbMatch;
    const allFareBases: string[] = [];
    while ((fbMatch = bookingInfoRegex2.exec(xmlText)) !== null) {
      if (!allFareBases.includes(fbMatch[1])) allFareBases.push(fbMatch[1]);
    }
    const firstSeg = segments![0];
    const lastSeg = segments![segments!.length - 1];
    for (const fb of allFareBases) {
      fareRuleLookups.push({
        fareBasis: fb,
        origin: firstSeg.origin,
        destination: lastSeg.destination,
        carrier: firstSeg.carrier,
      });
    }
  }
  
  

  const fareInfoRefs: string[] = [];
  const fareInfoRegex = /FareInfoRef Key="([^"]*)"/g;
  let m;
  while ((m = fareInfoRegex.exec(xmlText)) !== null) {
    fareInfoRefs.push(m[1]);
  }

  const isRefundable = xmlText.includes('Refundable="true"');

  // Extract full baggage info from AirPriceRsp
  const baggageAllowance = extractBaggageFromPrice(xmlText);
  

  // Extract change/cancel penalties using robust extraction with deduplication
  const changePenalty = extractPenalties(xmlText, "ChangePenalty");
  const cancelPenalty = extractPenalties(xmlText, "CancelPenalty");
  

  // Extract fare rules directly from AirPriceRsp (FareRuleType="long" includes them)
  const fareRules: { category: number; categoryName: string; text: string }[] = [];
  const categoryNames: Record<number, string> = {
    1: "Eligibility", 2: "Day/Time", 3: "Seasonality", 4: "Flight Application",
    5: "Advance Reservation/Ticketing", 6: "Minimum Stay", 7: "Maximum Stay",
    8: "Stopovers", 9: "Transfers", 10: "Combinations", 11: "Blackout Dates",
    12: "Surcharges", 13: "Accompanied Travel", 14: "Travel Restrictions",
    15: "Sales Restrictions", 16: "Penalties", 18: "Ticket Endorsements",
    19: "Children Discounts", 20: "Tour Conductor Discounts", 21: "Agent Discounts",
    22: "All Other Discounts", 23: "Miscellaneous Provisions", 25: "Fare By Rule",
    26: "Groups", 27: "Tours", 28: "Visit Another Country", 29: "Deposits",
    31: "Voluntary Changes", 33: "Voluntary Refunds", 35: "Negotiated Fares",
    50: "Application and Other",
  };
  // Try FareRuleLong (returned with FareRuleType="long")
  const fareRuleLongRegex = /<air:FareRuleLong[^>]*Category="(\d+)"[^>]*>([\s\S]*?)<\/air:FareRuleLong>/g;
  let frMatch;
  while ((frMatch = fareRuleLongRegex.exec(xmlText)) !== null) {
    const cat = parseInt(frMatch[1]);
    const text = frMatch[2].trim();
    if (text) fareRules.push({ category: cat, categoryName: categoryNames[cat] || `Category ${cat}`, text });
  }
  // Fallback: FareRule > FareRuleText
  if (fareRules.length === 0) {
    const fareRuleRegex = /<air:FareRule[^>]*>[\s\S]*?<\/air:FareRule>/g;
    let frrMatch;
    while ((frrMatch = fareRuleRegex.exec(xmlText)) !== null) {
      const catMatch = frrMatch[0].match(/Category="(\d+)"/);
      const cat = catMatch ? parseInt(catMatch[1]) : 0;
      const textMatch = frrMatch[0].match(/<air:FareRuleText>([\s\S]*?)<\/air:FareRuleText>/);
      const text = textMatch ? textMatch[1].trim() : "";
      if (text) fareRules.push({ category: cat, categoryName: categoryNames[cat] || `Category ${cat}`, text });
    }
  }
  // Fallback: FareRuleShort
  if (fareRules.length === 0) {
    const fareRuleShortRegex = /<air:FareRuleShort[^>]*Category="(\d+)"[^>]*>([\s\S]*?)<\/air:FareRuleShort>/g;
    while ((frMatch = fareRuleShortRegex.exec(xmlText)) !== null) {
      const cat = parseInt(frMatch[1]);
      const text = frMatch[2].trim();
      if (text) fareRules.push({ category: cat, categoryName: categoryNames[cat] || `Category ${cat}`, text });
    }
  }
  

  return {
    verified: true,
    currency: totalMatch[1],
    totalPrice: parseFloat(totalMatch[2]),
    basePrice: baseMatch ? parseFloat(baseMatch[2]) : null,
    taxes: taxMatch ? parseFloat(taxMatch[2]) : null,
    isRefundable,
    baggageAllowance,
    changePenalty,
    cancelPenalty,
    fareInfoRefs,
    fareRuleKeys,
    fareRuleLookups,
    fareRules,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseKey);

    const { data: apiSettings } = await adminClient
      .from("api_settings")
      .select("is_active, settings")
      .eq("provider", "travelport")
      .single();

    if (!apiSettings?.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: "Travelport API not configured or disabled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const secretUsername = Deno.env.get("TRAVELPORT_USERNAME");
    const secretPassword = Deno.env.get("TRAVELPORT_PASSWORD");
    const secretBranch = Deno.env.get("TRAVELPORT_TARGET_BRANCH");
    const dbSettings = (apiSettings.settings || {}) as any;
    const settings: TravelportSettings = (secretUsername && secretPassword && secretBranch)
      ? { target_branch: secretBranch, username: secretUsername, password: secretPassword, endpoint: dbSettings.endpoint || "https://apac.universal-api.travelport.com/B2BGateway/connect/uAPI/AirService" }
      : dbSettings as TravelportSettings;
    const body = await req.json();

    const { segments, adults = 1, children = 0, infants = 0, cabinClass = "Economy", studentFare = false, targetCurrency } = body;

    if (!segments || !segments.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing segments for price verification" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[travelport-price] Segment keys:", segments.map((s: any) => s.key));
    const priceXml = buildAirPriceRequest(settings, segments, adults, children, infants, cabinClass, studentFare);
    console.log("[travelport-price] Request XML (first 500):", priceXml.substring(0, 500));
    const credentials = btoa(`${settings.username}:${settings.password}`);

    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        Authorization: `Basic ${credentials}`,
        SOAPAction: "",
      },
      body: priceXml,
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("[travelport-price] Error response:", responseText.substring(0, 1000));
      const faultMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
      return new Response(
        JSON.stringify({ success: false, error: faultMatch ? faultMatch[1] : `API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = parsePriceResponse(responseText, segments);

    // Convert penalty amounts to target currency if requested
    if (targetCurrency && result.verified) {
      const exchangeConfig = await loadExchangeConfig(adminClient);
      result.changePenalty = convertPenalties(result.changePenalty, targetCurrency, exchangeConfig);
      result.cancelPenalty = convertPenalties(result.cancelPenalty, targetCurrency, exchangeConfig);
      result.fareRules = convertFareRulePenalties(result.fareRules, targetCurrency, exchangeConfig);
      result.penaltyCurrency = targetCurrency;
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Travelport price error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
