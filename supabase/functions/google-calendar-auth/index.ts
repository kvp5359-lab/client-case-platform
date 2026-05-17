/**
 * google-calendar-auth — стартует OAuth-flow для подключения Google Calendar.
 *
 * Аналогично google-drive-auth, но с scope `calendar.readonly` + `userinfo.email`.
 * Возвращает authUrl, который фронт открывает в попапе. После consent
 * Google редиректит на google-calendar-callback, который сохраняет токены
 * в `google_calendar_tokens` и шлёт postMessage обратно в opener.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const redirectUri = `${supabaseUrl}/functions/v1/google-calendar-callback`;

    if (!GOOGLE_CLIENT_ID) {
      throw new Error('GOOGLE_CLIENT_ID is not configured');
    }

    const body = await req.json().catch(() => ({}));
    const rawOrigin = body.origin || '';
    const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((o: string) => o.trim()).filter(Boolean);
    const origin = allowedOrigins.includes(rawOrigin) ? rawOrigin : '';

    const stateToken = crypto.randomUUID();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { error: stateError } = await supabaseAdmin
      .from('oauth_states')
      .insert({
        state_token: stateToken,
        user_id: user.id,
        origin,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

    if (stateError) {
      console.error('Failed to store OAuth state:', stateError);
      throw new Error('Failed to initiate OAuth flow');
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    // calendar — полный доступ (read+write) ко всем календарям юзера
    // calendar.calendarlist.readonly — метаданные списка календарей
    // userinfo.email — чтобы знать какой Google-аккаунт подключили
    authUrl.searchParams.set(
      'scope',
      'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/userinfo.email',
    );
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', stateToken);

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString() }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('Error in google-calendar-auth:', error);
    return new Response(
      JSON.stringify({ error: "Failed to initiate Google Calendar authorization" }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
