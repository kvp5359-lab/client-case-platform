// NB: CORS-заголовки не нужны — функция возвращает HTML-страницу (OAuth callback), не JSON API.
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Escapes a string for safe embedding in JavaScript string literals.
 */
function escapeForJs(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function buildPostMessageHtml(type: string, origin?: string, error?: string): string {
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((o: string) => o.trim()).filter(Boolean);
  const fallbackOrigin = Deno.env.get('APP_URL') || allowedOrigins[0] || '';

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
    const code = url.searchParams.get('code');
    const stateToken = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      return new Response(
        buildPostMessageHtml('google-drive-auth-error', undefined, 'Authentication failed'),
        { headers: { 'Content-Type': 'text/html' }, status: 400 }
      );
    }

    if (!code || !stateToken) {
      return new Response(
        buildPostMessageHtml('google-drive-auth-error', undefined, 'Missing code or state parameter'),
        { headers: { 'Content-Type': 'text/html' }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: stateData, error: stateError } = await supabase
      .from('oauth_states')
      .select('user_id, expires_at, origin')
      .eq('state_token', stateToken)
      .maybeSingle();

    if (stateError || !stateData) {
      console.error('Invalid OAuth state token:', stateError);
      return new Response(
        buildPostMessageHtml('google-drive-auth-error', undefined, 'Invalid or expired OAuth state'),
        { headers: { 'Content-Type': 'text/html' }, status: 400 }
      );
    }

    const userId = stateData.user_id;
    const callerOrigin = stateData.origin || undefined;

    if (new Date(stateData.expires_at) <= new Date()) {
      await supabase.from('oauth_states').delete().eq('state_token', stateToken);
      return new Response(
        buildPostMessageHtml('google-drive-auth-error', callerOrigin, 'OAuth state expired, please try again'),
        { headers: { 'Content-Type': 'text/html' }, status: 400 }
      );
    }

    await supabase.from('oauth_states').delete().eq('state_token', stateToken);

    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const redirectUri = `${supabaseUrl}/functions/v1/google-drive-callback`;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('Google OAuth credentials are not configured');
      return new Response(
        buildPostMessageHtml('google-drive-auth-error', callerOrigin, 'OAuth configuration error'),
        { headers: { 'Content-Type': 'text/html' }, status: 500 }
      );
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange error:', errorData);
      return new Response(
        buildPostMessageHtml('google-drive-auth-error', callerOrigin, 'Failed to exchange authorization code'),
        { headers: { 'Content-Type': 'text/html' }, status: 400 }
      );
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokens;

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Build upsert data — only include refresh_token if Google returned one
    // (on re-authorization Google may not return a new refresh_token)
    const upsertData: Record<string, string> = {
      user_id: userId,
      access_token,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (refresh_token) {
      upsertData.refresh_token = refresh_token;
    }

    const { error: dbError } = await supabase
      .from('google_drive_tokens')
      .upsert(upsertData, { onConflict: 'user_id' });

    if (dbError) {
      console.error('Database error:', dbError);
      return new Response(
        buildPostMessageHtml('google-drive-auth-error', callerOrigin, 'Failed to store tokens'),
        { headers: { 'Content-Type': 'text/html' }, status: 500 }
      );
    }

    return new Response(
      buildPostMessageHtml('google-drive-auth-success', callerOrigin),
      { headers: { 'Content-Type': 'text/html' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in google-drive-callback:', error);
    return new Response(
      buildPostMessageHtml('google-drive-auth-error', undefined, 'Authentication failed, please try again'),
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
  }
});
