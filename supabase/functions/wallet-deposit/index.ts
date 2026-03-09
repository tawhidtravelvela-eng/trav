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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const userId = claimsData.claims.sub as string;
    const body = await req.json();
    const { action, amount, paymentMethod, tenantId, trxID, paymentID, id_token } = body;

    const supabase = createClient(supabaseUrl, serviceKey);

    if (action === "bank_deposit") {
      // Bank transfer: create a PENDING transaction (admin must approve)
      if (!amount || amount <= 0) {
        return new Response(JSON.stringify({ error: "Invalid amount" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase.from("wallet_transactions").insert({
        user_id: userId,
        amount,
        type: "credit",
        status: "pending",
        description: "Wallet deposit via Bank Transfer (Pending verification)",
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "bkash_complete") {
      // Verify bKash payment was actually completed before crediting
      if (!paymentID || !id_token) {
        return new Response(JSON.stringify({ error: "Missing payment details" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Load bKash settings to verify
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

      // Execute the bKash payment
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

      if (executeData.transactionStatus !== "Completed") {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "bKash payment not completed",
          transactionStatus: executeData.transactionStatus 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only credit after verified completion
      const creditAmount = parseFloat(executeData.amount || amount);
      const { error } = await supabase.from("wallet_transactions").insert({
        user_id: userId,
        amount: creditAmount,
        type: "credit",
        status: "completed",
        description: `Wallet deposit via bKash (TrxID: ${executeData.trxID})`,
        reference: executeData.trxID,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        transactionStatus: "Completed",
        trxID: executeData.trxID 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
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
