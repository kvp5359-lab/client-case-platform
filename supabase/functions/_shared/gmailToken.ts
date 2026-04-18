import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const BUFFER_MS = 5 * 60 * 1000;

export interface GmailAccountData {
  id: string;
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  last_history_id: string | null;
  watch_expires_at: string | null;
}

export async function ensureValidGmailToken(
  supabaseAdmin: SupabaseClient,
  account: GmailAccountData,
): Promise<string> {
  const tokenExpiresAt = new Date(account.token_expires_at).getTime();
  const now = Date.now();

  if (tokenExpiresAt > now + BUFFER_MS) {
    return account.access_token;
  }

  const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!googleClientId || !googleClientSecret) {
    throw new Error("Google OAuth credentials not configured on server");
  }

  const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text();
    console.error("[gmailToken] Token refresh failed:", errorText);
    if (errorText.includes("invalid_grant")) {
      throw new Error("Gmail token expired");
    }
    throw new Error("Failed to refresh Gmail token");
  }

  const refreshData = await refreshResponse.json();
  const newAccessToken = refreshData.access_token;

  const { error: updateError } = await supabaseAdmin
    .from("email_accounts")
    .update({
      access_token: newAccessToken,
      token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  if (updateError) {
    console.error("[gmailToken] Failed to persist refreshed token:", updateError);
  }

  return newAccessToken;
}

export async function getValidGmailTokenForUser(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<{ accessToken: string; account: GmailAccountData }> {
  const { data: account, error } = await supabaseAdmin
    .from("email_accounts")
    .select("id, user_id, email, access_token, refresh_token, token_expires_at, last_history_id, watch_expires_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !account) {
    throw new Error("Gmail not connected");
  }

  const accessToken = await ensureValidGmailToken(supabaseAdmin, account);
  return { accessToken, account };
}

export async function getValidGmailTokenForAccount(
  supabaseAdmin: SupabaseClient,
  accountId: string,
): Promise<{ accessToken: string; account: GmailAccountData }> {
  const { data: account, error } = await supabaseAdmin
    .from("email_accounts")
    .select("id, user_id, email, access_token, refresh_token, token_expires_at, last_history_id, watch_expires_at")
    .eq("id", accountId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !account) {
    throw new Error("Gmail account not found or inactive");
  }

  const accessToken = await ensureValidGmailToken(supabaseAdmin, account);
  return { accessToken, account };
}
