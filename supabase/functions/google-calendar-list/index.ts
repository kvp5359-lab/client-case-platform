/**
 * google-calendar-list — возвращает список Google-календарей пользователя.
 * Используется UI настроек: показать «у вас N календарей в Google,
 * какие добавить в наш сервис».
 *
 * Auth: Bearer JWT пользователя. Берёт его google_calendar_tokens,
 * вызывает Calendar API calendarList.list.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";
import { ensureValidCalendarToken, type GoogleCalendarTokenData } from "../_shared/googleCalendarToken.ts";

interface GoogleCalendarListItem {
  id: string;
  summary: string;
  summaryOverride?: string;
  description?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeadersFor(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' } },
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
        { status: 401, headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('google_calendar_tokens')
      .select('user_id, access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: 'Google Calendar not connected' }),
        { status: 404, headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' } },
      );
    }

    const accessToken = await ensureValidCalendarToken(supabaseAdmin, tokenData as GoogleCalendarTokenData);

    const listRes = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error('calendarList.list failed:', errText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch calendar list', details: errText }),
        { status: 500, headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' } },
      );
    }

    const data = await listRes.json();
    const items = (data.items as GoogleCalendarListItem[] | undefined) ?? [];

    const calendars = items.map((c) => ({
      id: c.id,
      name: c.summaryOverride || c.summary || c.id,
      description: c.description ?? null,
      color: c.backgroundColor ?? '#3b82f6',
      primary: Boolean(c.primary),
      access_role: c.accessRole,
    }));

    return new Response(
      JSON.stringify({ calendars }),
      { headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    console.error('Error in google-calendar-list:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to list calendars' }),
      { status: 500, headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' } },
    );
  }
});
