import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OURAIRPORTS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";

interface AirportRow {
  iata_code: string;
  name: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function parseAirports(csvText: string): AirportRow[] {
  const lines = csvText.split("\n");
  if (lines.length < 2) return [];

  const header = parseCSVLine(lines[0]);
  const colIndex: Record<string, number> = {};
  header.forEach((h, i) => { colIndex[h.trim().replace(/"/g, "")] = i; });

  const iataIdx = colIndex["iata_code"];
  const nameIdx = colIndex["name"];
  const typeIdx = colIndex["type"];
  const municipalityIdx = colIndex["municipality"];
  const countryIdx = colIndex["iso_country"];
  const latIdx = colIndex["latitude_deg"];
  const lonIdx = colIndex["longitude_deg"];
  const scheduledIdx = colIndex["scheduled_service"];

  if (iataIdx === undefined || nameIdx === undefined) {
    return [];
    return [];
  }

  const airports: AirportRow[] = [];
  const validTypes = new Set(["large_airport", "medium_airport", "small_airport"]);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const iata = cols[iataIdx]?.trim().replace(/"/g, "") || "";
    const type = cols[typeIdx]?.trim().replace(/"/g, "") || "";
    const scheduled = cols[scheduledIdx]?.trim().replace(/"/g, "") || "";

    // Only include airports with valid IATA codes, proper types, and scheduled service
    if (
      iata.length !== 3 ||
      iata === "0" ||
      iata.includes("\\") ||
      !validTypes.has(type)
    ) {
      continue;
    }

    // Prefer airports with scheduled service, but also include large/medium without
    if (type === "small_airport" && scheduled !== "yes") continue;

    const name = cols[nameIdx]?.trim().replace(/"/g, "") || "";
    const city = cols[municipalityIdx]?.trim().replace(/"/g, "") || "";
    const country = cols[countryIdx]?.trim().replace(/"/g, "") || "";
    const lat = cols[latIdx] ? parseFloat(cols[latIdx]) : null;
    const lon = cols[lonIdx] ? parseFloat(cols[lonIdx]) : null;

    airports.push({
      iata_code: iata.toUpperCase(),
      name,
      city: city || name, // fallback city to airport name
      country,
      latitude: lat && !isNaN(lat) ? lat : null,
      longitude: lon && !isNaN(lon) ? lon : null,
    });
  }

  // Deduplicate by IATA code (keep first occurrence which is typically the larger airport)
  const seen = new Set<string>();
  return airports.filter((a) => {
    if (seen.has(a.iata_code)) return false;
    seen.add(a.iata_code);
    return true;
  });
}

// Country code to name mapping for common codes
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseKey);

    
    const csvResponse = await fetch(OURAIRPORTS_CSV_URL);
    if (!csvResponse.ok) {
      throw new Error(`Failed to fetch CSV: ${csvResponse.status}`);
    }
    const csvText = await csvResponse.text();
    

    const airports = parseAirports(csvText);
    

    // Map country codes to names
    const enriched = airports.map((a) => ({
      ...a,
      country: COUNTRY_NAMES[a.country] || a.country,
    }));

    // Upsert in batches of 500
    const BATCH = 500;
    let upserted = 0;
    let errors = 0;

    for (let i = 0; i < enriched.length; i += BATCH) {
      const batch = enriched.slice(i, i + BATCH);
      const { error } = await adminClient
        .from("airports")
        .upsert(batch, { onConflict: "iata_code", ignoreDuplicates: false });

      if (error) {
        console.error("Airport sync batch error:", error.message);
        errors++;
      } else {
        upserted += batch.length;
      }
    }

    

    return new Response(
      JSON.stringify({
        success: true,
        total_parsed: airports.length,
        upserted,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Sync airports error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
