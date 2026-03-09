import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OURAIRPORTS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  DE: "Germany", FR: "France", IT: "Italy", ES: "Spain", JP: "Japan",
  CN: "China", IN: "India", BD: "Bangladesh", PK: "Pakistan", LK: "Sri Lanka",
  NP: "Nepal", MM: "Myanmar", TH: "Thailand", VN: "Vietnam", MY: "Malaysia",
  SG: "Singapore", ID: "Indonesia", PH: "Philippines", KR: "South Korea",
  AE: "UAE", SA: "Saudi Arabia", QA: "Qatar", BH: "Bahrain", KW: "Kuwait",
  OM: "Oman", TR: "Turkey", EG: "Egypt", ZA: "South Africa", KE: "Kenya",
  NG: "Nigeria", ET: "Ethiopia", MA: "Morocco", TN: "Tunisia", GH: "Ghana",
  BR: "Brazil", MX: "Mexico", AR: "Argentina", CL: "Chile", CO: "Colombia",
  PE: "Peru", NZ: "New Zealand", FJ: "Fiji", RU: "Russia", UA: "Ukraine",
  PL: "Poland", NL: "Netherlands", BE: "Belgium", CH: "Switzerland",
  AT: "Austria", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
  IE: "Ireland", PT: "Portugal", GR: "Greece", CZ: "Czech Republic",
  HU: "Hungary", RO: "Romania", HR: "Croatia", BG: "Bulgaria",
  RS: "Serbia", IL: "Israel", JO: "Jordan", LB: "Lebanon", IQ: "Iraq",
  IR: "Iran", AF: "Afghanistan", MV: "Maldives", BT: "Bhutan",
  HK: "Hong Kong", TW: "Taiwan", MO: "Macau", KH: "Cambodia", LA: "Laos",
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { result.push(current); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

interface FoundAirport {
  iata_code: string;
  name: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
}

async function searchOurAirports(query: string): Promise<FoundAirport[]> {
  const csvResponse = await fetch(OURAIRPORTS_CSV_URL);
  if (!csvResponse.ok) return [];
  const csvText = await csvResponse.text();

  const lines = csvText.split("\n");
  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]);
  const col: Record<string, number> = {};
  header.forEach((h, i) => { col[h.trim().replace(/"/g, "")] = i; });

  const q = query.toLowerCase();
  const results: FoundAirport[] = [];
  const validTypes = new Set(["large_airport", "medium_airport", "small_airport"]);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);

    const iata = (cols[col["iata_code"]] || "").trim().replace(/"/g, "");
    const type = (cols[col["type"]] || "").trim().replace(/"/g, "");
    const scheduled = (cols[col["scheduled_service"]] || "").trim().replace(/"/g, "");

    if (iata.length !== 3 || !validTypes.has(type)) continue;
    if (type === "small_airport" && scheduled !== "yes") continue;

    const name = (cols[col["name"]] || "").trim().replace(/"/g, "");
    const city = (cols[col["municipality"]] || "").trim().replace(/"/g, "") || name;
    const countryCode = (cols[col["iso_country"]] || "").trim().replace(/"/g, "");

    // Match against query
    if (
      iata.toLowerCase().includes(q) ||
      name.toLowerCase().includes(q) ||
      city.toLowerCase().includes(q)
    ) {
      const lat = cols[col["latitude_deg"]] ? parseFloat(cols[col["latitude_deg"]]) : null;
      const lon = cols[col["longitude_deg"]] ? parseFloat(cols[col["longitude_deg"]]) : null;
      results.push({
        iata_code: iata.toUpperCase(),
        name,
        city,
        country: COUNTRY_NAMES[countryCode] || countryCode,
        latitude: lat && !isNaN(lat) ? lat : null,
        longitude: lon && !isNaN(lon) ? lon : null,
      });
    }
    if (results.length >= 20) break;
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const query = typeof rawBody.query === "string" ? rawBody.query.trim().substring(0, 100) : undefined;
    const code = typeof rawBody.code === "string" ? rawBody.code.trim().substring(0, 10) : undefined;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseKey);

    // Mode 1: Lookup by exact code
    if (code) {
      const { data } = await adminClient
        .from("airports")
        .select("iata_code, name, city, country")
        .eq("iata_code", code.toUpperCase())
        .eq("is_active", true)
        .maybeSingle();

      if (data) {
        return new Response(
          JSON.stringify({ success: true, airports: [data] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Not in DB — try OurAirports
      const external = await searchOurAirports(code.toUpperCase());
      const exact = external.find((a) => a.iata_code === code.toUpperCase());
      if (exact) {
        // Cache in DB
        await adminClient.from("airports").upsert(exact, { onConflict: "iata_code" });
        return new Response(
          JSON.stringify({ success: true, airports: [{ iata_code: exact.iata_code, name: exact.name, city: exact.city, country: exact.country }] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, airports: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mode 2: Search by query string
    if (!query || query.length < 2) {
      // Return popular airports
      const { data } = await adminClient
        .from("airports")
        .select("iata_code, name, city, country")
        .eq("is_active", true)
        .order("city")
        .limit(15);

      return new Response(
        JSON.stringify({ success: true, airports: data || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Search DB using ilike on multiple columns — escape LIKE wildcards to prevent pattern injection
    const sanitized = query.replace(/[%_\\]/g, '\\$&');
    const q = `%${sanitized}%`;
    const { data: dbResults } = await adminClient
      .from("airports")
      .select("iata_code, name, city, country")
      .eq("is_active", true)
      .or(`iata_code.ilike.${q},name.ilike.${q},city.ilike.${q},country.ilike.${q}`)
      .order("city")
      .limit(20);

    if (dbResults && dbResults.length > 0) {
      return new Response(
        JSON.stringify({ success: true, airports: dbResults }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback: search OurAirports CSV and cache results
    // Fallback to OurAirports CSV
    const external = await searchOurAirports(query);

    if (external.length > 0) {
      // Cache all found airports in DB
      await adminClient.from("airports").upsert(external, { onConflict: "iata_code", ignoreDuplicates: true });
      const mapped = external.map((a) => ({ iata_code: a.iata_code, name: a.name, city: a.city, country: a.country }));
      return new Response(
        JSON.stringify({ success: true, airports: mapped, source: "ourairports" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, airports: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Search airports error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
