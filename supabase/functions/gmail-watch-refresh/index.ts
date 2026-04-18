/**
 * Edge Function: gmail-watch-refresh
 * Called by pg_cron daily. Renews Gmail push watch for all active accounts.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { ensureValidGmailToken, type GmailAccountData } from "../_shared/gmailToken.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.includes(SUPABASE_SERVICE_ROLE_KEY)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const googleCloudProject = Deno.env.get("GOOGLE_CLOUD_PROJECT") || "doc-manage-480916";

    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: accounts, error } = await serviceClient
      .from("email_accounts")
      .select("id, user_id, email, access_token, refresh_token, token_expires_at, last_history_id, watch_expires_at")
      .eq("is_active", true)
      .or(`watch_expires_at.is.null,watch_expires_at.lt.${twoDaysFromNow}`);

    if (error) {
      console.error("[gmail-watch-refresh] Failed to fetch accounts:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch accounts" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!accounts || accounts.length === 0) {
      console.log("[gmail-watch-refresh] No accounts need refresh");
      return new Response(
        JSON.stringify({ refreshed: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[gmail-watch-refresh] Refreshing ${accounts.length} accounts`);

    let refreshed = 0;
    let failed = 0;

    for (const account of accounts) {
      try {
        const accessToken = await ensureValidGmailToken(
          serviceClient,
          account as GmailAccountData,
        );

        const watchResponse = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/watch",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
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
          const watchExpiresAt = new Date(Number(watchData.expiration)).toISOString();

          await serviceClient
            .from("email_accounts")
            .update({
              watch_expires_at: watchExpiresAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", account.id);

          console.log(`[gmail-watch-refresh] Refreshed: ${account.email} -> expires ${watchExpiresAt}`);
          refreshed++;
        } else {
          const errText = await watchResponse.text();
          console.error(`[gmail-watch-refresh] Watch failed for ${account.email}:`, errText);
          failed++;
        }
      } catch (err) {
        console.error(`[gmail-watch-refresh] Error for ${account.email}:`, err);
        failed++;
      }
    }

    console.log(`[gmail-watch-refresh] Done: ${refreshed} refreshed, ${failed} failed`);

    return new Response(
      JSON.stringify({ refreshed, failed, total: accounts.length }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[gmail-watch-refresh] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});