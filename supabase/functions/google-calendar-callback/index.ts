/**
 * google-calendar-callback — обрабатывает OAuth-callback от Google,
 * меняет code → tokens, сохраняет в google_calendar_tokens.
 * Возвращает HTML с postMessage в opener.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    const oauthError = url.searchParams.get('error');

    if (oauthError) {
      console.error('OAuth error:', oauthError);
      return new Response(
        buildPostMessageHtml('google-calendar-auth-error', undefined, 'Authentication failed'),
        { headers: { 'Content-Type': 'text/html' }, status: 400 },
      );
    }

    if (!code || !stateToken) {
      return new Response(
        buildPostMessageHtml('google-calendar-auth-error', undefined, 'Missing code or state parameter'),
        { headers: { 'Content-Type': 'text/html' }, status: 400 },
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
      return new Response(
        buildPostMessageHtml('google-calendar-auth-error', undefined, 'Invalid or expired OAuth state'),
        { headers: { 'Content-Type': 'text/html' }, status: 400 },
      );
    }

    const userId = stateData.user_id;
    const callerOrigin = stateData.origin || undefined;

    if (new Date(stateData.expires_at) <= new Date()) {
      await supabase.from('oauth_states').delete().eq('state_token', stateToken);
      return new Response(
        buildPostMessageHtml('google-calendar-auth-error', callerOrigin, 'OAuth state expired'),
        { headers: { 'Content-Type': 'text/html' }, status: 400 },
      );
    }

    await supabase.from('oauth_states').delete().eq('state_token', stateToken);

    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const redirectUri = `${supabaseUrl}/functions/v1/google-calendar-callback`;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return new Response(
        buildPostMessageHtml('google-calendar-auth-error', callerOrigin, 'OAuth configuration error'),
        { headers: { 'Content-Type': 'text/html' }, status: 500 },
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
        buildPostMessageHtml('google-calendar-auth-error', callerOrigin, 'Failed to exchange authorization code'),
        { headers: { 'Content-Type': 'text/html' }, status: 400 },
      );
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokens;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Узнаём email подключённого Google-аккаунта.
    let googleEmail: string | null = null;
    try {
      const userInfoRes = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${access_token}` } },
      );
      if (userInfoRes.ok) {
        const info = await userInfoRes.json();
        googleEmail = info.email ?? null;
      }
    } catch (e) {
      console.warn('Failed to fetch Google userinfo:', e);
    }

    const upsertData: Record<string, string | null> = {
      user_id: userId,
      access_token,
      expires_at: expiresAt.toISOString(),
      google_email: googleEmail,
      updated_at: new Date().toISOString(),
    };
    if (refresh_token) {
      upsertData.refresh_token = refresh_token;
    }

    const { error: dbError } = await supabase
      .from('google_calendar_tokens')
      .upsert(upsertData, { onConflict: 'user_id' });

    if (dbError) {
      console.error('Database error:', dbError);
      return new Response(
        buildPostMessageHtml('google-calendar-auth-error', callerOrigin, 'Failed to store tokens'),
        { headers: { 'Content-Type': 'text/html' }, status: 500 },
      );
    }

    return new Response(
      buildPostMessageHtml('google-calendar-auth-success', callerOrigin),
      { headers: { 'Content-Type': 'text/html' }, status: 200 },
    );
  } catch (error) {
    console.error('Error in google-calendar-callback:', error);
    return new Response(
      buildPostMessageHtml('google-calendar-auth-error', undefined, 'Authentication failed'),
      { headers: { 'Content-Type': 'text/html' }, status: 500 },
    );
  }
});
