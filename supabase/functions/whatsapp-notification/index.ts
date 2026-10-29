import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pkr(amount: number) {
  return new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: "Supabase function secrets are not configured" }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Sign in is required" }, 401);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData.user) {
    return jsonResponse({ error: "Invalid session" }, 401);
  }

  let repaymentId: string;
  try {
    const body = await request.json() as { repayment_id?: unknown };
    if (typeof body.repayment_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.repayment_id)) {
      return jsonResponse({ error: "A valid repayment_id is required" }, 400);
    }
    repaymentId = body.repayment_id;
  } catch {
    return jsonResponse({ error: "A valid JSON request body is required" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: repayment, error: repaymentError } = await admin
    .from("repayments")
    .select("id, payer, payee, amount, method, status")
    .eq("id", repaymentId)
    .maybeSingle();
  if (repaymentError) {
    console.error("Could not load repayment for WhatsApp notification", repaymentError.message);
    return jsonResponse({ error: "Could not load repayment" }, 500);
  }
  if (!repayment || repayment.payer !== userData.user.id) {
    return jsonResponse({ error: "Repayment not found or not authorized" }, 404);
  }
  if (repayment.status !== "pending") {
    return jsonResponse({ status: "skipped", message: "Repayment is no longer awaiting confirmation" });
  }

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, display_name, whatsapp_phone, whatsapp_opted_in_at")
    .in("id", [repayment.payer, repayment.payee]);
  if (profilesError) {
    console.error("Could not load WhatsApp recipient profile", profilesError.message);
    return jsonResponse({ error: "Could not load recipient details" }, 500);
  }
  const payer = profiles?.find((profile) => profile.id === repayment.payer);
  const payee = profiles?.find((profile) => profile.id === repayment.payee);
  if (!payer || !payee) return jsonResponse({ error: "Repayment profiles were not found" }, 500);

  const phone = payee.whatsapp_phone;
  const { data: claim, error: claimError } = await admin.rpc("claim_whatsapp_notification", {
    _repayment_id: repayment.id,
    _recipient_phone: phone,
  });
  if (claimError) {
    console.error("Could not claim WhatsApp notification", claimError.message);
    return jsonResponse({ error: "Could not start WhatsApp notification" }, 500);
  }
  const claimResult = claim as {
    claimed?: boolean;
    status?: string;
    notification_id?: string;
    attempt_id?: string;
  };
  if (!claimResult.claimed) {
    return jsonResponse({
      status: claimResult.status ?? "unknown",
      message: "A notification attempt already exists; no duplicate was sent.",
    });
  }

  const finish = async (
    status: "accepted" | "failed" | "not_configured" | "unknown",
    error: string | null = null,
    providerMessageId: string | null = null,
  ) => {
    const { error: completionError } = await admin.rpc("complete_whatsapp_notification", {
      _notification_id: claimResult.notification_id!,
      _attempt_id: claimResult.attempt_id!,
      _status: status,
      _error: error ?? "",
      _provider_message_id: providerMessageId ?? "",
    });
    if (completionError) {
      console.error("Could not save WhatsApp notification outcome", completionError.message);
      return jsonResponse({
        status: "unknown",
        message: "WhatsApp response could not be recorded; delivery is not confirmed.",
      });
    }
    return jsonResponse({
      status,
      message: status === "accepted"
        ? "WhatsApp accepted the notification; delivery has not been confirmed."
        : error ?? "WhatsApp notification was not sent.",
    });
  };

  if (!phone || !/^\+923\d{9}$/.test(phone)) {
    return await finish("failed", "The recipient's WhatsApp number is missing or invalid.");
  }
  if (!payee.whatsapp_opted_in_at) {
    return await finish(
      "not_configured",
      "The recipient has not opted in to WhatsApp repayment notifications.",
    );
  }

  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME");
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE");
  const appUrl = Deno.env.get("APP_URL");
  const missing = [
    ["WHATSAPP_API_VERSION", apiVersion],
    ["WHATSAPP_PHONE_NUMBER_ID", phoneNumberId],
    ["WHATSAPP_ACCESS_TOKEN", accessToken],
    ["WHATSAPP_TEMPLATE_NAME", templateName],
    ["WHATSAPP_TEMPLATE_LANGUAGE", templateLanguage],
    ["APP_URL", appUrl],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    return await finish("not_configured", `Missing server configuration: ${missing.join(", ")}`);
  }

  const method = repayment.method === "bank_transfer" ? "Bank Transfer" : "Cash";
  const templatePayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone.slice(1),
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: payer.display_name },
          { type: "text", text: pkr(Number(repayment.amount)) },
          { type: "text", text: payee.display_name },
          { type: "text", text: method },
          { type: "text", text: appUrl },
        ],
      }],
    },
  };

  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(templatePayload),
      },
    );
  } catch {
    return await finish(
      "unknown",
      "Could not determine whether WhatsApp accepted the request. Automatic retry is disabled to prevent duplicates.",
    );
  }

  let providerBody: {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; code?: number };
  };
  try {
    providerBody = await response.json();
  } catch {
    return await finish(
      "unknown",
      "WhatsApp returned an unreadable response. Automatic retry is disabled to prevent duplicates.",
    );
  }

  if (!response.ok) {
    const details = providerBody.error?.message ?? `WhatsApp API returned HTTP ${response.status}`;
    if (response.status >= 500) {
      return await finish(
        "unknown",
        `${details}. Automatic retry is disabled because provider acceptance is uncertain.`,
      );
    }
    console.error("WhatsApp API rejected notification", {
      status: response.status,
      code: providerBody.error?.code,
      message: details,
    });
    return await finish("failed", details);
  }

  const messageId = providerBody.messages?.[0]?.id;
  if (!messageId) {
    return await finish(
      "unknown",
      "WhatsApp response did not contain a message ID. Delivery cannot be confirmed.",
    );
  }
  return await finish("accepted", null, messageId);
});
