/**
 * Gmail: disconnect account.
 * Stops watch, revokes token, deactivates account.
 *
 * POST /gmail-disconnect
 * Authorization: Bearer {supabase_jwt}
 * Body: { accountId: string }
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { accountId } = body;

    if (!accountId) {
      return new Response(
        JSON.stringify({ error: "accountId is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify account belongs to this user
    const { data: account, error: accountError } = await supabaseAdmin
      .from("email_accounts")
      .select("id, access_token, email")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: "Account not found" }),
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // 1. Stop Gmail watch (best effort)
    try {
      await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/stop",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${account.access_token}` },
        },
      );
    } catch (e) {
      console.error("[gmail-disconnect] Failed to stop watch:", e);
    }

    // 2. Revoke token (best effort)
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${account.access_token}`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
    } catch (e) {
      console.error("[gmail-disconnect] Failed to revoke token:", e);
    }

    // 3. Deactivate account (don't delete — email messages in project_messages remain)
    const { error: updateError } = await supabaseAdmin
      .from("email_accounts")
      .update({
        is_active: false,
        access_token: null,
        refresh_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (updateError) {
      console.error("[gmail-disconnect] DB error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to disconnect account" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    console.log(`[gmail-disconnect] Disconnected: ${account.email} for user ${user.id}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[gmail-disconnect] Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to disconnect Gmail" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});