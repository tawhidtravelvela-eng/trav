import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  universal_endpoint?: string;
}

interface Passenger {
  title: string;
  firstName: string;
  lastName: string;
  dob?: string;
  nationality?: string;
  passportNumber?: string;
  passportCountry?: string;
  passportExpiry?: string;
  type: "ADT" | "CNN" | "INF";
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Normalize Travelport response namespace prefixes to match our envelope declarations.
 * Response uses air_v54_0:, common_v54_0:, universal_v54_0: etc.
 * We need air:, com:, univ: to match our xmlns declarations.
 */
function normalizeNamespaces(xml: string): string {
  return xml
    .replace(/air_v\d+_\d+:/g, "air:")
    .replace(/common_v\d+_\d+:/g, "com:")
    .replace(/universal_v\d+_\d+:/g, "univ:")
    // Also handle closing tags with these prefixes
    .replace(/<\/air_v\d+_\d+:/g, "</air:")
    .replace(/<\/common_v\d+_\d+:/g, "</com:")
    .replace(/<\/universal_v\d+_\d+:/g, "</univ:")
    // Remove standalone xmlns declarations that conflict with envelope
    .replace(/\s+xmlns:air_v\d+_\d+="[^"]*"/g, "")
    .replace(/\s+xmlns:common_v\d+_\d+="[^"]*"/g, "")
    .replace(/\s+xmlns:universal_v\d+_\d+="[^"]*"/g, "")
    .replace(/\s+xmlns:air="[^"]*"/g, "")
    .replace(/\s+xmlns:com="[^"]*"/g, "")
    .replace(/\s+xmlns:univ="[^"]*"/g, "");
}

const COUNTRY_CODE_MAP: Record<string, string> = {
  bangladesh: "BD",
  india: "IN",
  pakistan: "PK",
  china: "CN",
  japan: "JP",
  thailand: "TH",
  singapore: "SG",
  malaysia: "MY",
  indonesia: "ID",
  nepal: "NP",
  "sri lanka": "LK",
  "united states": "US",
  usa: "US",
  uk: "GB",
  "united kingdom": "GB",
};

function normalizeCountryCode(value?: string): string {
  if (!value) return "XX";
  const trimmed = value.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return COUNTRY_CODE_MAP[trimmed.toLowerCase()] || "XX";
}

function formatDocsDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const mon = months[d.getUTCMonth()] || "JAN";
  const yr = String(d.getUTCFullYear()).slice(-2);
  return `${day}${mon}${yr}`;
}

function buildDocsSsrFreeText(pax: Passenger, genderCode: "M" | "F"): string | null {
  if (!pax.passportNumber) return null;

  const issuingCountry = normalizeCountryCode(pax.passportCountry);
  const nationality = normalizeCountryCode(pax.nationality || pax.passportCountry);
  const passportNo = pax.passportNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const dob = formatDocsDate(pax.dob);
  const expiry = formatDocsDate(pax.passportExpiry);
  const last = pax.lastName.replace(/[\/]/g, "").toUpperCase();
  const first = pax.firstName.replace(/[\/]/g, "").toUpperCase();

  if (!passportNo || !dob || !expiry || !last || !first) return null;

  // DOCS format: P/ISSUING_COUNTRY/PASSPORT_NO/NATIONALITY/DOB/GENDER/EXPIRY/LAST/FIRST
  return `P/${issuingCountry}/${passportNo}/${nationality}/${dob}/${genderCode}/${expiry}/${last}/${first}`;
}

// ── Step 1: Build AirPriceReq ──
function buildAirPriceRequest(
  settings: TravelportSettings,
  segments: any[],
  passengers: Passenger[],
  cabinClass: string
): string {
  const cabinMap: Record<string, string> = {
    Economy: "Economy",
    "Premium Economy": "PremiumEconomy",
    Business: "Business",
    "First Class": "First",
  };
  const cabin = cabinMap[cabinClass] || "Economy";

  const getSegKey = (seg: any): string =>
    seg?.key ?? seg?.segmentKey ?? seg?.Key ?? seg?.airSegmentKey ?? `seg${Math.random()}`;

  const segmentXml = segments
    .map(
      (seg: any) => `
      <air:AirSegment Key="${escapeXml(getSegKey(seg))}" Group="${seg.group || "0"}"
        Carrier="${seg.carrier}" FlightNumber="${seg.flightNumber}"
        Origin="${seg.origin}" Destination="${seg.destination}"
        DepartureTime="${seg.departure}" ArrivalTime="${seg.arrival}"
        ClassOfService="${seg.bookingCode || "Y"}"
        ProviderCode="1G">
      </air:AirSegment>`
    )
    .join("");

  // Use "trav{i}" keys to match BookingTraveler keys in reservation request
  let paxIdx = 0;
  const paxXml: string[] = [];
  for (const p of passengers) {
    const age = p.type === "CNN" ? ' Age="10"' : p.type === "INF" ? ' Age="1"' : "";
    paxXml.push(`<com:SearchPassenger Key="trav${paxIdx}" Code="${p.type}"${age}/>`);
    paxIdx++;
  }

  const platingCarrier = segments[0]?.carrier || "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:air="http://www.travelport.com/schema/air_v54_0"
  xmlns:com="http://www.travelport.com/schema/common_v54_0">
  <soap:Body>
    <air:AirPriceReq TargetBranch="${settings.target_branch}" AuthorizedBy="user">
      <com:BillingPointOfSaleInfo OriginApplication="UAPI"/>
      <air:AirItinerary>${segmentXml}
      </air:AirItinerary>
      <air:AirPricingModifiers${platingCarrier ? ` PlatingCarrier="${platingCarrier}"` : ""}>
        <air:PermittedCabins><com:CabinClass Type="${cabin}"/></air:PermittedCabins>
      </air:AirPricingModifiers>
      ${paxXml.join("\n      ")}
      <air:AirPricingCommand/>
    </air:AirPriceReq>
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Extract AirPricingSolution from AirPriceRsp, replacing AirSegmentRef with
 * full AirSegment elements. Handles both air: and air_v54_0: namespace prefixes.
 * Also extracts and embeds HostTokens INSIDE the AirPricingSolution.
 */
function extractAirPricingSolution(xmlText: string): string | null {
  // First normalize all namespaces
  const normalized = normalizeNamespaces(xmlText);

  // Extract all AirSegment definitions from AirItinerary
  const segmentDefs: Record<string, string> = {};
  const segRegex = /<air:AirSegment\s[^>]*Key="([^"]*)"[^]*?<\/air:AirSegment>/g;
  let segMatch;
  while ((segMatch = segRegex.exec(normalized)) !== null) {
    segmentDefs[segMatch[1]] = segMatch[0];
  }

  // Extract HostTokens from the response (they may be inside AirPriceResult or AirPricingSolution)
  const hostTokens: string[] = [];
  const htRegex = /<(?:com:|air:)?HostToken[^>]*>[^<]*<\/(?:com:|air:)?HostToken>/g;
  let htMatch;
  while ((htMatch = htRegex.exec(normalized)) !== null) {
    hostTokens.push(htMatch[0]);
  }
  console.log("HostTokens extracted:", hostTokens.length);

  // Match the first AirPricingSolution block
  const solMatch = normalized.match(/<air:AirPricingSolution[\s\S]*?<\/air:AirPricingSolution>/);
  if (!solMatch) return null;

  let solution = solMatch[0];

  // Replace each AirSegmentRef with the full AirSegment definition
  solution = solution.replace(
    /<air:AirSegmentRef\s+Key="([^"]*)"\s*\/>/g,
    (_match, key) => segmentDefs[key] || _match
  );

  // Inject HostTokens inside AirPricingSolution if they're not already there
  if (hostTokens.length > 0 && !solution.includes("<air:HostToken") && !solution.includes("<com:HostToken")) {
    // Insert HostTokens right after the opening AirPricingSolution tag
    const insertPoint = solution.indexOf(">") + 1;
    solution = solution.slice(0, insertPoint) + "\n" + hostTokens.join("\n") + solution.slice(insertPoint);
  }

  return solution;
}

function extractCarrierCodesFromPricingSolution(airPricingSolutionXml: string): string[] {
  const carriers = new Set<string>();
  const carrierRegex = /<air:AirSegment[^>]+Carrier="([^"]+)"/g;
  let match;
  while ((match = carrierRegex.exec(airPricingSolutionXml)) !== null) {
    const carrier = (match[1] || "").trim().toUpperCase();
    if (carrier) carriers.add(carrier);
  }
  return Array.from(carriers);
}

// ── Step 2: Build AirCreateReservationReq ──
function buildCreateReservationRequest(
  settings: TravelportSettings,
  airPricingSolutionXml: string,
  passengers: Passenger[],
  contactEmail: string,
  contactPhone: string,
  carrierCodes: string[],
  ancillaries?: any[]
): string {
  const bookingTravelerXml = passengers
    .map((pax, i) => {
      const genderCode: "M" | "F" = pax.title === "MR." ? "M" : "F";
      let docXml = "";
      const docsFreeText = buildDocsSsrFreeText(pax, genderCode);
      if (docsFreeText) {
        const ssrCarriers = carrierCodes.length ? carrierCodes : ["YY"];
        docXml = ssrCarriers
          .map(
            (carrier) => `
        <com:SSR Type="DOCS" Carrier="${escapeXml(carrier)}" BookingTravelerRef="trav${i}" FreeText="${escapeXml(docsFreeText)}" />`
          )
          .join("");
      }

      // Add meal SSR if selected for this passenger
      const paxAnc = ancillaries?.[i];
      if (paxAnc?.meal) {
        const mealCarriers = carrierCodes.length ? carrierCodes : ["YY"];
        docXml += mealCarriers
          .map(
            (carrier) => `
        <com:SSR Type="MEAL" Carrier="${escapeXml(carrier)}" BookingTravelerRef="trav${i}" FreeText="${escapeXml(paxAnc.meal.code || paxAnc.meal.description || "MEAL")}" />`
          )
          .join("");
      }

      const dobAttr = pax.dob ? ` DOB="${pax.dob}"` : "";

      return `
      <com:BookingTraveler Key="trav${i}" TravelerType="${pax.type}"
        Gender="${genderCode}"${dobAttr}>
        <com:BookingTravelerName Prefix="${pax.title.replace(".", "")}"
          First="${pax.firstName}" Last="${pax.lastName}"/>
        <com:PhoneNumber Type="Mobile" Number="${contactPhone || "0000000000"}"/>
        <com:Email EmailID="${contactEmail}" Type="Home"/>
        ${docXml}
      </com:BookingTraveler>`;
    })
    .join("");

  // Build OptionalService elements for baggage/seat selections
  let optionalServicesXml = "";
  if (ancillaries?.length) {
    const optItems: string[] = [];
    ancillaries.forEach((anc, paxIdx) => {
      if (!anc) return;
      if (anc.seat) {
        optItems.push(`<air:OptionalService Type="PreReservedSeat" BookingTravelerRef="trav${paxIdx}" />`);
      }
      if (anc.baggage) {
        optItems.push(`<air:OptionalService Type="Baggage" BookingTravelerRef="trav${paxIdx}" ServiceSubCode="${escapeXml(anc.baggage.code)}" />`);
      }
    });
    if (optItems.length > 0) {
      optionalServicesXml = `<air:OptionalServices>${optItems.join("\n      ")}</air:OptionalServices>`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:air="http://www.travelport.com/schema/air_v54_0"
  xmlns:com="http://www.travelport.com/schema/common_v54_0"
  xmlns:univ="http://www.travelport.com/schema/universal_v54_0">
  <soapenv:Header/>
  <soapenv:Body>
    <univ:AirCreateReservationReq AuthorizedBy="user"
      RetainReservation="Both"
      TargetBranch="${settings.target_branch}"
      TraceId="booking-${Date.now()}">
      <com:BillingPointOfSaleInfo OriginApplication="UAPI"/>
      ${bookingTravelerXml}
      ${airPricingSolutionXml}
      ${optionalServicesXml}
      <com:ActionStatus Type="ACTIVE" ProviderCode="1G" />
    </univ:AirCreateReservationReq>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function buildTravelportError(xmlText: string, fallback: string): string {
  const normalized = normalizeNamespaces(xmlText);
  const faultMatch = normalized.match(/<[^>]*faultstring>(.*?)<\/[^>]*faultstring>/i);
  const descMatch = normalized.match(/<[^>]*Description>(.*?)<\/[^>]*Description>/i);
  const responseMessageMatch = normalized.match(/<[^>]*ResponseMessage[^>]*>(.*?)<\/[^>]*ResponseMessage>/i);
  const segmentErrorMatch = normalized.match(/<air:ErrorMessage>(.*?)<\/air:ErrorMessage>/i);
  const txMatch = normalized.match(/<[^>]*TransactionId>(.*?)<\/[^>]*TransactionId>/i);
  const traceMatch = normalized.match(/<[^>]*TraceId>(.*?)<\/[^>]*TraceId>/i);

  const base = faultMatch?.[1] || descMatch?.[1] || responseMessageMatch?.[1] || fallback;
  const segment = segmentErrorMatch?.[1]?.trim();
  const tx = txMatch?.[1]?.trim();
  const trace = traceMatch?.[1]?.trim();

  const parts = [base];
  if (segment) parts.push(segment);
  if (tx) parts.push(`TX:${tx}`);
  if (trace) parts.push(`Trace:${trace}`);
  return parts.join(" | ");
}

function parseBookingResponse(xmlText: string): any {
  const normalized = normalizeNamespaces(xmlText);

  // Extract the ProviderReservationInfo LocatorCode (GDS/CRS PNR)
  const providerLocatorMatch = normalized.match(/ProviderReservationInfo[^>]+LocatorCode="([A-Z0-9]{5,8})"/);
  // Extract AirReservation LocatorCode
  const airLocatorMatch = normalized.match(/AirReservation[^>]+LocatorCode="([A-Z0-9]{5,8})"/);
  // Extract UniversalRecord LocatorCode
  const universalLocatorMatch = normalized.match(/UniversalRecord[^>]+LocatorCode="([A-Z0-9]{5,8})"/);
  // Extract SupplierLocatorCode (airline PNR)
  const supplierLocatorMatch = normalized.match(/SupplierLocatorCode="([A-Z0-9]{5,8})"/);

  // CRS PNR = ProviderReservationInfo locator (the GDS PNR agents use)
  const crsPnr = providerLocatorMatch?.[1] || airLocatorMatch?.[1] || null;

  if (!crsPnr && !universalLocatorMatch) {
    const compactSnippet = xmlText.replace(/\s+/g, " ").slice(0, 240);
    return {
      success: false,
      error: buildTravelportError(xmlText, `Failed to create booking: ${compactSnippet}`),
    };
  }

  const statusMatch = normalized.match(/UniversalRecord[^>]+Status="([^"]*)"/);

  return {
    success: true,
    pnr: crsPnr,
    airlinePnr: supplierLocatorMatch?.[1] || null,
    universalLocator: universalLocatorMatch?.[1] || null,
    status: statusMatch?.[1] || "Confirmed",
  };
}

async function callTravelport(
  endpoint: string,
  credentials: string,
  xmlBody: string,
  maxAttempts = 3
): Promise<{ ok: boolean; status: number; text: string }> {
  let responseText = "";
  let responseStatus = 500;
  let responseOk = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        Authorization: `Basic ${credentials}`,
        SOAPAction: "",
      },
      body: xmlBody,
    });

    responseStatus = response.status;
    responseText = await response.text();
    const isHtmlError = /^\s*<!doctype html/i.test(responseText) || /^\s*<html/i.test(responseText);
    responseOk = response.ok && !isHtmlError;
    if (responseOk) break;

    const isTransient = /connection reset|internal communication error|connect failed/i.test(responseText);
    if (!isTransient || attempt === maxAttempts) break;
    await new Promise((r) => setTimeout(r, attempt * 600));
  }

  return { ok: responseOk, status: responseStatus, text: responseText };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("authorization");
    const body = await req.json();
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { createClient: createAnonClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const anonClient = createAnonClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const {
      segments,
      passengers,
      contactEmail,
      contactPhone = "",
      cabinClass = "Economy",
      ancillaries,
    } = body;

    if (!segments?.length || !passengers?.length || !contactEmail) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required booking parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = btoa(`${settings.username}:${settings.password}`);
    const airServiceEndpoint = settings.endpoint;
    console.log("Endpoint:", airServiceEndpoint);

    // ── Step 1: AirPriceReq ──
    console.log("Step 1: AirPriceReq...");
    const priceXml = buildAirPriceRequest(settings, segments, passengers, cabinClass);
    console.log("AirPriceReq XML (first 1500):", priceXml.slice(0, 1500));

    const priceResult = await callTravelport(airServiceEndpoint, credentials, priceXml);
    console.log("AirPriceRsp status:", priceResult.status);
    console.log("AirPriceRsp (first 3000):", priceResult.text.slice(0, 3000));

    if (!priceResult.ok) {
      const msg = buildTravelportError(priceResult.text, "Failed to price itinerary");
      return new Response(
        JSON.stringify({ success: false, error: `Pricing failed: ${msg}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract AirPricingSolution (with HostTokens embedded inside)
    const airPricingSolution = extractAirPricingSolution(priceResult.text);
    if (!airPricingSolution) {
      console.error("No AirPricingSolution found in response:", priceResult.text.slice(0, 3000));
      return new Response(
        JSON.stringify({ success: false, error: "Could not extract pricing solution" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("AirPricingSolution (first 2000):", airPricingSolution.slice(0, 2000));

    const pricedCarriers = extractCarrierCodesFromPricingSolution(airPricingSolution);
    console.log("SSR carriers (from priced solution):", pricedCarriers);

    // ── Step 2: AirCreateReservationReq ──
    console.log("Step 2: AirCreateReservationReq...");
    const bookXml = buildCreateReservationRequest(
      settings, airPricingSolution, passengers, contactEmail, contactPhone, pricedCarriers, ancillaries
    );
    console.log("BookReq XML (first 3000):", bookXml.slice(0, 3000));

    const bookResult = await callTravelport(airServiceEndpoint, credentials, bookXml);
    console.log("BookRsp status:", bookResult.status);
    console.log("BookRsp (first 3000):", bookResult.text.slice(0, 3000));

    if (!bookResult.ok) {
      const fallback = `API error (${bookResult.status}): ${bookResult.text.replace(/\s+/g, " ").slice(0, 300)}`;
      const message = buildTravelportError(bookResult.text, fallback);
      return new Response(
        JSON.stringify({ success: false, error: message }),
        { status: bookResult.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = parseBookingResponse(bookResult.text);
    if (!result.success) {
      console.error("Booking parse failure:", bookResult.text.slice(0, 3000));
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Travelport booking error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
