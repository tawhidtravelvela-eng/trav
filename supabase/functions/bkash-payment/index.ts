import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- Auth check ---
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // --- End auth check ---

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load bKash credentials from api_settings
    const { data: settingsRow } = await supabase
      .from("api_settings")
      .select("settings")
      .eq("provider", "site_payment")
      .maybeSingle();

    const settings = (settingsRow?.settings as Record<string, any>) || {};
    const sandbox = settings.sandbox_mode !== false;
    const baseUrl = sandbox
      ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout"
      : "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout";

    const appKey = settings.bkash_app_key;
    const appSecret = settings.bkash_app_secret;
    const username = settings.bkash_username;
    const password = settings.bkash_password;

    if (!appKey || !appSecret || !username || !password) {
      return new Response(JSON.stringify({ error: "bKash credentials not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // Step 1: Grant Token
    const grantToken = async () => {
      const res = await fetch(`${baseUrl}/token/grant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          username,
          password,
        },
        body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
      });
      const data = await res.json();
      return data;
    };

    if (action === "create") {
      const { amount, bookingId, callbackURL } = body;
      const tokenData = await grantToken();
      if (!tokenData.id_token) {
        return new Response(JSON.stringify({ error: "Token grant failed", details: tokenData }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const createRes = await fetch(`${baseUrl}/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: tokenData.id_token,
          "x-app-key": appKey,
        },
        body: JSON.stringify({
          mode: "0011",
          payerReference: bookingId,
          callbackURL: callbackURL || `${supabaseUrl}/functions/v1/bkash-payment`,
          amount: String(amount),
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: bookingId,
        }),
      });
      const createData = await createRes.json();

      return new Response(JSON.stringify({ success: true, ...createData, id_token: tokenData.id_token }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "execute") {
      const { paymentID, id_token } = body;
      const executeRes = await fetch(`${baseUrl}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: id_token,
          "x-app-key": appKey,
        },
        body: JSON.stringify({ paymentID }),
      });
      const executeData = await executeRes.json();

      return new Response(JSON.stringify({ success: true, ...executeData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "query") {
      const { paymentID, id_token } = body;
      const queryRes = await fetch(`${baseUrl}/payment/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: id_token,
          "x-app-key": appKey,
        },
        body: JSON.stringify({ paymentID }),
      });
      const queryData = await queryRes.json();

      return new Response(JSON.stringify({ success: true, ...queryData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use create, execute, or query." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
