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
}

function buildQueueListRequest(settings: TravelportSettings, queueNumber: string, pcc?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:gds="http://www.travelport.com/schema/gdsQueue_v54_0"
  xmlns:com="http://www.travelport.com/schema/common_v54_0">
  <soap:Body>
    <gds:GdsQueueListReq TargetBranch="${settings.target_branch}">
      <com:BillingPointOfSaleInfo OriginApplication="UAPI"/>
      <gds:GdsQueueSelector Queue="${queueNumber}" PseudoCityCode="${pcc || settings.target_branch}" ProviderCode="1G"/>
    </gds:GdsQueueListReq>
  </soap:Body>
</soap:Envelope>`;
}

function buildQueuePlaceRequest(settings: TravelportSettings, pnr: string, queueNumber: string, pcc?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:gds="http://www.travelport.com/schema/gdsQueue_v54_0"
  xmlns:com="http://www.travelport.com/schema/common_v54_0">
  <soap:Body>
    <gds:GdsQueuePlaceReq TargetBranch="${settings.target_branch}">
      <com:BillingPointOfSaleInfo OriginApplication="UAPI"/>
      <gds:GdsQueueSelector Queue="${queueNumber}" PseudoCityCode="${pcc || settings.target_branch}" ProviderCode="1G"/>
      <com:UniversalRecordLocatorCode>${pnr}</com:UniversalRecordLocatorCode>
    </gds:GdsQueuePlaceReq>
  </soap:Body>
</soap:Envelope>`;
}

function buildQueueRemoveRequest(settings: TravelportSettings, pnr: string, queueNumber: string, pcc?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:gds="http://www.travelport.com/schema/gdsQueue_v54_0"
  xmlns:com="http://www.travelport.com/schema/common_v54_0">
  <soap:Body>
    <gds:GdsQueueRemoveReq TargetBranch="${settings.target_branch}">
      <com:BillingPointOfSaleInfo OriginApplication="UAPI"/>
      <gds:GdsQueueSelector Queue="${queueNumber}" PseudoCityCode="${pcc || settings.target_branch}" ProviderCode="1G"/>
      <com:UniversalRecordLocatorCode>${pnr}</com:UniversalRecordLocatorCode>
    </gds:GdsQueueRemoveReq>
  </soap:Body>
</soap:Envelope>`;
}

function buildQueueCountRequest(settings: TravelportSettings, pcc?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:gds="http://www.travelport.com/schema/gdsQueue_v54_0"
  xmlns:com="http://www.travelport.com/schema/common_v54_0">
  <soap:Body>
    <gds:GdsQueueCountReq TargetBranch="${settings.target_branch}">
      <com:BillingPointOfSaleInfo OriginApplication="UAPI"/>
      <gds:GdsQueueSelector PseudoCityCode="${pcc || settings.target_branch}" ProviderCode="1G"/>
    </gds:GdsQueueCountReq>
  </soap:Body>
</soap:Envelope>`;
}

interface QueueEntry {
  pnr: string;
  universalLocator?: string;
  dateQueued?: string;
  passengerName?: string;
}

function parseQueueListResponse(xmlText: string): QueueEntry[] {
  const entries: QueueEntry[] = [];
  const entryRegex = /LocatorCode="([A-Z0-9]{6})"/g;
  const seen = new Set<string>();
  let match;

  while ((match = entryRegex.exec(xmlText)) !== null) {
    const pnr = match[1];
    if (!seen.has(pnr)) {
      seen.add(pnr);
      entries.push({ pnr });
    }
  }

  return entries;
}

interface QueueCount {
  queue: string;
  count: number;
  category?: string;
}

function parseQueueCountResponse(xmlText: string): QueueCount[] {
  const counts: QueueCount[] = [];
  const queueRegex = /<gds:QueueCount Queue="(\d+)"[^>]*Count="(\d+)"[^>]*/g;
  let match;

  while ((match = queueRegex.exec(xmlText)) !== null) {
    counts.push({
      queue: match[1],
      count: parseInt(match[2]),
    });
  }

  return counts;
}

async function callTravelport(endpoint: string, credentials: string, xml: string): Promise<{ ok: boolean; text: string; status: number }> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml;charset=UTF-8",
      Authorization: `Basic ${credentials}`,
      SOAPAction: "",
    },
    body: xml,
  });
  return { ok: response.ok, text: await response.text(), status: response.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseKey);

    // Require authentication and admin role for queue operations
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
    const body = await req.json();
    const { action, queueNumber, pnr, pcc } = body;

    const queueEndpoint = settings.endpoint.replace("/AirService", "/GdsQueueService");
    const credentials = btoa(`${settings.username}:${settings.password}`);

    switch (action) {
      case "list": {
        if (!queueNumber) {
          return new Response(
            JSON.stringify({ success: false, error: "Queue number required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const xml = buildQueueListRequest(settings, queueNumber, pcc);
        const res = await callTravelport(queueEndpoint, credentials, xml);
        if (!res.ok) {
          const fault = res.text.match(/<faultstring>(.*?)<\/faultstring>/);
          return new Response(
            JSON.stringify({ success: false, error: fault?.[1] || `Error ${res.status}` }),
            { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const entries = parseQueueListResponse(res.text);
        return new Response(
          JSON.stringify({ success: true, entries, count: entries.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "place": {
        if (!queueNumber || !pnr) {
          return new Response(
            JSON.stringify({ success: false, error: "Queue number and PNR required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const xml = buildQueuePlaceRequest(settings, pnr, queueNumber, pcc);
        const res = await callTravelport(queueEndpoint, credentials, xml);
        if (!res.ok) {
          const fault = res.text.match(/<faultstring>(.*?)<\/faultstring>/);
          return new Response(
            JSON.stringify({ success: false, error: fault?.[1] || `Error ${res.status}` }),
            { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ success: true, message: `PNR ${pnr} placed on queue ${queueNumber}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "remove": {
        if (!queueNumber || !pnr) {
          return new Response(
            JSON.stringify({ success: false, error: "Queue number and PNR required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const xml = buildQueueRemoveRequest(settings, pnr, queueNumber, pcc);
        const res = await callTravelport(queueEndpoint, credentials, xml);
        if (!res.ok) {
          const fault = res.text.match(/<faultstring>(.*?)<\/faultstring>/);
          return new Response(
            JSON.stringify({ success: false, error: fault?.[1] || `Error ${res.status}` }),
            { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ success: true, message: `PNR ${pnr} removed from queue ${queueNumber}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "count": {
        const xml = buildQueueCountRequest(settings, pcc);
        const res = await callTravelport(queueEndpoint, credentials, xml);
        if (!res.ok) {
          const fault = res.text.match(/<faultstring>(.*?)<\/faultstring>/);
          return new Response(
            JSON.stringify({ success: false, error: fault?.[1] || `Error ${res.status}` }),
            { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const counts = parseQueueCountResponse(res.text);
        return new Response(
          JSON.stringify({ success: true, queues: counts }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: "Invalid action. Use: list, place, remove, count" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    console.error("Travelport queue error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
