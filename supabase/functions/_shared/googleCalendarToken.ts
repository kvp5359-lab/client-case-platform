/**
 * Shared helper for Google Calendar token management.
 * Аналог googleDriveToken.ts, отдельная таблица google_calendar_tokens.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const BUFFER_MS = 5 * 60 * 1000;

export interface GoogleCalendarTokenData {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export async function ensureValidCalendarToken(
  supabaseAdmin: SupabaseClient,
  tokenData: GoogleCalendarTokenData,
): Promise<string> {
  const tokenExpiresAt = new Date(tokenData.expires_at).getTime();
  const now = Date.now();

  if (tokenExpiresAt > now + BUFFER_MS) {
    return tokenData.access_token;
  }

  const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!googleClientId || !googleClientSecret) {
    throw new Error("Google OAuth credentials not configured");
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
    throw new Error(`Failed to refresh Google Calendar token: ${errorText}`);
  }

  const refreshData = await refreshResponse.json();
  const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000);

  await supabaseAdmin
    .from("google_calendar_tokens")
    .update({
      access_token: refreshData.access_token,
      expires_at: newExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", tokenData.user_id);

  return refreshData.access_token;
}
