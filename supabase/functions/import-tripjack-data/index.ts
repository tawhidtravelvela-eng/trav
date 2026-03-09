import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseCSVLine(line: string, delimiter = ";"): string[] {
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
      else if (ch === delimiter) { result.push(current); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseKey);

    const { type, data } = await req.json();

    if (type === "cities") {
      const lines = data.split("\n").filter((l: string) => l.trim());
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 5) continue;
        rows.push({
          id: parseInt(cols[0]),
          city_name: cols[1] || "",
          country_name: cols[2] || "",
          type: cols[3] || "CITY",
          full_region_name: cols[4] || "",
          created_at: cols[5] || new Date().toISOString(),
        });
      }

      const BATCH = 500;
      let upserted = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await adminClient.from("tripjack_cities").upsert(batch, { onConflict: "id", ignoreDuplicates: true });
        if (error) console.error("Cities batch error:", error.message);
        else upserted += batch.length;
      }

      return new Response(JSON.stringify({ success: true, type: "cities", total: rows.length, upserted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "hotels") {
      const lines = data.split("\n").filter((l: string) => l.trim());
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 16) continue;
        rows.push({
          tj_hotel_id: parseInt(cols[0]),
          unica_id: parseInt(cols[1]) || null,
          name: cols[2] || "",
          rating: parseInt(cols[3]) || 0,
          property_type: cols[4] || "Hotel",
          city_name: cols[5] || "",
          city_code: cols[6] || "",
          state_name: cols[7] || "",
          country_name: cols[8] || "",
          country_code: cols[9] || "",
          latitude: cols[10] ? parseFloat(cols[10]) : null,
          longitude: cols[11] ? parseFloat(cols[11]) : null,
          address: cols[12] || "",
          postal_code: cols[13] || "",
          image_url: cols[14] || "",
          is_deleted: cols[15] === "true",
          created_at: cols[16] || new Date().toISOString(),
        });
      }

      const BATCH = 500;
      let upserted = 0;
      let errors = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await adminClient.from("tripjack_hotels").upsert(batch, { onConflict: "tj_hotel_id", ignoreDuplicates: true });
        if (error) { console.error("Hotels batch error:", error.message); errors++; }
        else upserted += batch.length;
      }

      return new Response(JSON.stringify({ success: true, type: "hotels", total: rows.length, upserted, errors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid type. Use 'cities' or 'hotels'" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
