const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { country, countryCode } = await req.json();

    if (!country) {
      return new Response(
        JSON.stringify({ success: false, error: "Country is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `You are a flight travel expert. Generate the 6 most popular flight routes from ${country} (country code: ${countryCode || "unknown"}).

For each route provide:
- from_code: IATA airport code of the origin (main airport in ${country})
- to_code: IATA airport code of the destination
- from_city: city name of the origin
- to_city: city name of the destination  
- airline: 2-letter IATA airline code of the most common carrier on this route
- duration: estimated flight duration (e.g. "5h 30m")
- stops: number of stops (0 for non-stop)
- lowest_price: approximate lowest one-way fare in BDT (Bangladeshi Taka)

Focus on the most commonly searched routes from ${country} - a mix of domestic (if applicable) and international destinations. Use realistic current market prices in BDT.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: "You are a flight data assistant. Return only valid JSON." },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_routes",
                description: "Return popular flight routes",
                parameters: {
                  type: "object",
                  properties: {
                    routes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          from_code: { type: "string" },
                          to_code: { type: "string" },
                          from_city: { type: "string" },
                          to_city: { type: "string" },
                          airline: { type: "string" },
                          duration: { type: "string" },
                          stops: { type: "number" },
                          lowest_price: { type: "number" },
                        },
                        required: [
                          "from_code", "to_code", "from_city", "to_city",
                          "airline", "duration", "stops", "lowest_price",
                        ],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["routes"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_routes" } },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limited" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "Credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(
        JSON.stringify({ success: false, error: "AI error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ success: false, error: "Invalid AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const routes = (parsed.routes || []).slice(0, 6).map((r: any) => ({
      from_code: r.from_code,
      to_code: r.to_code,
      from_city: r.from_city,
      to_city: r.to_city,
      airline: r.airline,
      duration: r.duration,
      stops: r.stops ?? 0,
      lowest_price: r.lowest_price ?? 0,
      currency: "BDT",
      search_count: 0,
      ai_suggested: true,
    }));

    return new Response(
      JSON.stringify({ success: true, routes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("suggest-popular-routes error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
