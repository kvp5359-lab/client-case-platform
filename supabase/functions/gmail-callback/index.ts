/**
 * Gmail OAuth: handle callback from Google.
 * Pattern identical to google-drive-callback.
 *
 * GET /gmail-callback?code={code}&state={stateToken:workspaceId}
 * → Exchanges code for tokens
 * → Stores in email_accounts
 * → Registers Gmail push notifications (users.watch)
 * → Returns HTML with postMessage to close popup
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

function escapeForJs(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, "\\x3c")
    .replace(/>/g, "\\x3e")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function buildPostMessageHtml(type: string, origin?: string, error?: string): string {
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",").map((o: string) => o.trim()).filter(Boolean);
  const fallbackOrigin = Deno.env.get("APP_URL") || allowedOrigins[0] || "";

  let targetOrigin: string;
  if (origin && allowedOrigins.includes(origin)) {
    targetOrigin = origin;
  } else if (fallbackOrigin) {
    targetOrigin = fallbackOrigin;
  } else {
    return `<html><body><script>window.close();</script></body></html>`;
  }

  const payload = error
    ? `{ type: '${type}', error: '${escapeForJs(error)}' }`
    : `{ type: '${type}' }`;
  return `<html><body><script>window.opener.postMessage(${payload}, '${escapeForJs(targetOrigin)}'); window.close();</script></body></html>`;
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      console.error("[gmail-callback] OAuth error:", error);
      return new Response(
        buildPostMessageHtml("gmail-auth-error", undefined, "Authentication failed"),
        { headers: { "Content-Type": "text/html" }, status: 400 },
      );
    }

    if (!code || !stateParam) {
      return new Response(
        buildPostMessageHtml("gmail-auth-error", undefined, "Missing code or state parameter"),
        { headers: { "Content-Type": "text/html" }, status: 400 },
      );
    }

    // Parse state: "stateToken:workspaceId"
    const colonIdx = stateParam.indexOf(":");
    if (colonIdx === -1) {
      return new Response(
        buildPostMessageHtml("gmail-auth-error", undefined, "Invalid state format"),
        { headers: { "Content-Type": "text/html" }, status: 400 },
      );
    }
    const stateToken = stateParam.substring(0, colonIdx);
    const workspaceId = stateParam.substring(colonIdx + 1);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify state token
    const { data: stateData, error: stateError } = await supabase
      .from("oauth_states")
      .select("user_id, expires_at, origin")
      .eq("state_token", stateToken)
      .maybeSingle();

    if (stateError || !stateData) {
      console.error("[gmail-callback] Invalid state token:", stateError);
      return new Response(
        buildPostMessageHtml("gmail-auth-error", undefined, "Invalid or expired OAuth state"),
        { headers: { "Content-Type": "text/html" }, status: 400 },
      );
    }

    const userId = stateData.user_id;
    const callerOrigin = stateData.origin || undefined;

    // Check expiration
    if (new Date(stateData.expires_at) <= new Date()) {
      await supabase.from("oauth_states").delete().eq("state_token", stateToken);
      return new Response(
        buildPostMessageHtml("gmail-auth-error", callerOrigin, "OAuth state expired, please try again"),
        { headers: { "Content-Type": "text/html" }, status: 400 },
      );
    }

    // Delete used state token (one-time use)
    await supabase.from("oauth_states").delete().eq("state_token", stateToken);

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const redirectUri = `${supabaseUrl}/functions/v1/gmail-callback`;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error("[gmail-callback] Google OAuth credentials not configured");
      return new Response(
        buildPostMessageHtml("gmail-auth-error", callerOrigin, "OAuth configuration error"),
        { headers: { "Content-Type": "text/html" }, status: 500 },
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("[gmail-callback] Token exchange error:", errorData);
      return new Response(
        buildPostMessageHtml("gmail-auth-error", callerOrigin, "Failed to exchange authorization code"),
        { headers: { "Content-Type": "text/html" }, status: 400 },
      );
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokens;
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // Get user's Gmail address
    const profileResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${access_token}` } },
    );

    if (!profileResponse.ok) {
      console.error("[gmail-callback] Failed to get Gmail profile");
      return new Response(
        buildPostMessageHtml("gmail-auth-error", callerOrigin, "Failed to get Gmail profile"),
        { headers: { "Content-Type": "text/html" }, status: 500 },
      );
    }

    const profile = await profileResponse.json();
    const gmailAddress = profile.emailAddress;
    const historyId = profile.historyId;

    // Register Gmail push notifications
    const googleCloudProject = Deno.env.get("GOOGLE_CLOUD_PROJECT") || "doc-manage-480916";
    let watchExpiresAt: string | null = null;

    try {
      const watchResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/watch",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            topicName: `projects/${googleCloudProject}/topics/gmail-notifications`,
            labelIds: ["INBOX"],
          }),
        },
      );

      if (watchResponse.ok) {
        const watchData = await watchResponse.json();
        watchExpiresAt = new Date(Number(watchData.expiration)).toISOString();
        console.log(`[gmail-callback] Watch registered for ${gmailAddress}, expires: ${watchExpiresAt}`);
      } else {
        const watchError = await watchResponse.text();
        console.error("[gmail-callback] Watch registration failed:", watchError);
      }
    } catch (watchErr) {
      console.error("[gmail-callback] Watch registration error:", watchErr);
    }

    // Upsert email_accounts
    const upsertData: Record<string, unknown> = {
      user_id: userId,
      workspace_id: workspaceId,
      email: gmailAddress,
      access_token,
      token_expires_at: tokenExpiresAt,
      last_history_id: String(historyId),
      watch_expires_at: watchExpiresAt,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    if (refresh_token) {
      upsertData.refresh_token = refresh_token;
    }

    const { error: dbError } = await supabase
      .from("email_accounts")
      .upsert(upsertData, { onConflict: "user_id,email" });

    if (dbError) {
      console.error("[gmail-callback] Database error:", dbError);
      return new Response(
        buildPostMessageHtml("gmail-auth-error", callerOrigin, "Failed to store account"),
        { headers: { "Content-Type": "text/html" }, status: 500 },
      );
    }

    console.log(`[gmail-callback] Gmail connected: ${gmailAddress} for user ${userId}`);

    return new Response(
      buildPostMessageHtml("gmail-auth-success", callerOrigin),
      { headers: { "Content-Type": "text/html" }, status: 200 },
    );
  } catch (error) {
    console.error("[gmail-callback] Error:", error);
    return new Response(
      buildPostMessageHtml("gmail-auth-error", undefined, "Authentication failed, please try again"),
      { headers: { "Content-Type": "text/html" }, status: 500 },
    );
  }
});