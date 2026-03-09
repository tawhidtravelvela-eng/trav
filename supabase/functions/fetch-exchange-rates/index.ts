import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Fetch live rates from free API (no key required)
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`);
    const data = await res.json();

    if (data.result !== "success") throw new Error("Failed to fetch exchange rates");

    const liveRates: Record<string, number> = data.rates;

    // Update in Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get existing settings
    const { data: existing } = await supabase
      .from("api_settings")
      .select("*")
      .eq("provider", "currency_rates")
      .maybeSingle();

    const currentSettings = (existing?.settings || {}) as Record<string, unknown>;

    const newSettings = {
      ...currentSettings,
      live_rates: liveRates,
      last_fetched: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase
        .from("api_settings")
        .update({ settings: newSettings })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("api_settings")
        .insert({
          provider: "currency_rates",
          settings: {
            ...newSettings,
            conversion_markup: 2,
            api_source_currencies: {
              travelport: "BDT",
              travelvela: "BDT",
              amadeus: "USD",
              local_inventory: "USD",
            },
          },
          is_active: true,
        });
      if (error) throw error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        rates: liveRates,
        last_fetched: newSettings.last_fetched,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
