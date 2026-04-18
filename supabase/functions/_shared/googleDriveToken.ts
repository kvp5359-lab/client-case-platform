/**
 * Shared helper for Google Drive token management.
 * Reads token from DB, refreshes if expired (with 5-min buffer), and persists new token.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export interface GoogleDriveTokenData {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

/**
 * Ensures a valid Google Drive access token for the given user.
 * Refreshes automatically if expired or within 5 minutes of expiration.
 *
 * @param supabaseAdmin - Supabase client with service role (bypasses RLS)
 * @param tokenData - Token data row from google_drive_tokens table
 * @returns Valid access token string
 * @throws Error if refresh fails or credentials are missing
 */
export async function ensureValidAccessToken(
  supabaseAdmin: SupabaseClient,
  tokenData: GoogleDriveTokenData,
): Promise<string> {
  const tokenExpiresAt = new Date(tokenData.expires_at).getTime();
  const now = Date.now();

  // Token still valid (with buffer)
  if (tokenExpiresAt > now + BUFFER_MS) {
    return tokenData.access_token;
  }

  // Need to refresh
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
      refresh_token: tokenData.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text();
    console.error("[googleDriveToken] Token refresh failed:", errorText);
    // Google returns "invalid_grant" when refresh_token is revoked or expired
    // (e.g. app in "Testing" status — tokens expire after 7 days)
    if (errorText.includes("invalid_grant")) {
      throw new Error("Google Drive token expired");
    }
    throw new Error("Failed to refresh Google Drive token");
  }

  const refreshData = await refreshResponse.json();
  const newAccessToken = refreshData.access_token;

  // Persist new token
  const { error: updateError } = await supabaseAdmin
    .from("google_drive_tokens")
    .update({
      access_token: newAccessToken,
      expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
    })
    .eq("user_id", tokenData.user_id);

  if (updateError) {
    console.error("[googleDriveToken] Failed to persist refreshed token:", updateError);
  }

  return newAccessToken;
}

/**
 * Reads token from DB for a specific user and ensures it's valid.
 *
 * @returns Valid access token string
 * @throws Error if no token found or refresh fails
 */
export async function getValidAccessTokenForUser(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: tokenData, error: tokenError } = await supabaseAdmin
    .from("google_drive_tokens")
    .select("user_id, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (tokenError || !tokenData) {
    throw new Error("Google Drive not connected");
  }

  return ensureValidAccessToken(supabaseAdmin, tokenData);
}
