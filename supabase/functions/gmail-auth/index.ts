/**
 * Gmail OAuth: initiate authorization flow.
 * Pattern identical to google-drive-auth.
 *
 * POST /gmail-auth
 * Authorization: Bearer {supabase_jwt}
 * Body: { origin: string, workspaceId: string }
 * → Returns { authUrl: string }
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Verify user authorization
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

    // Verify user token
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

    if (!supabaseServiceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    }

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const redirectUri = `${supabaseUrl}/functions/v1/gmail-callback`;

    if (!GOOGLE_CLIENT_ID) {
      throw new Error("GOOGLE_CLIENT_ID is not configured");
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const rawOrigin = body.origin || "";
    const workspaceId = body.workspaceId || "";

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: "workspaceId is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Validate origin against ALLOWED_ORIGINS whitelist
    const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
      .split(",").map((o: string) => o.trim()).filter(Boolean);
    const origin = allowedOrigins.includes(rawOrigin) ? rawOrigin : "";

    // Generate state token with user + workspace binding
    const stateToken = crypto.randomUUID();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { error: stateError } = await supabaseAdmin
      .from("oauth_states")
      .insert({
        state_token: stateToken,
        user_id: user.id,
        origin,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

    if (stateError) {
      console.error("[gmail-auth] Failed to store OAuth state:", stateError);
      throw new Error("Failed to initiate OAuth flow");
    }

    // Format: stateToken:workspaceId (callback will parse it)
    const stateWithWorkspace = `${stateToken}:${workspaceId}`;

    // Gmail OAuth URL
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
    ].join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", stateWithWorkspace);

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString() }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("[gmail-auth] Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to initiate Gmail authorization" }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});