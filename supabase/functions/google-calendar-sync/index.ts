/**
 * google-calendar-sync — синхронизация событий из Google Calendar в нашу
 * таблицу `external_calendar_events`.
 *
 * Окно sync: [now-30d, now+90d]. Достаточно для типичных календарных
 * представлений (отображение прошлого и планов).
 *
 * Режимы вызова:
 *   1. С Bearer JWT пользователя + body { calendar_id } — sync конкретного
 *      календаря вручную (из UI «обновить»).
 *   2. С x-internal-secret + body { calendar_id } или {} — sync одного
 *      или всех активных google-календарей (вызывается pg_cron).
 *
 * Для каждого события Google делаем upsert в external_calendar_events
 * по (calendar_id, external_id). События, которых больше нет в Google
 * за окном — удаляем (см. ниже про deleted=true / cancelled).
 */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";
import { ensureValidCalendarToken, type GoogleCalendarTokenData } from "../_shared/googleCalendarToken.ts";

interface GoogleEvent {
  id: string;
  status?: string; // 'confirmed' | 'tentative' | 'cancelled'
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  updated?: string;
}

interface SyncResult {
  calendar_id: string;
  upserted: number;
  deleted: number;
  error?: string;
}

const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 90;

async function syncOneCalendar(
  supabaseAdmin: SupabaseClient,
  calendarRow: { id: string; google_calendar_id: string; google_account_user_id: string },
): Promise<SyncResult> {
  const result: SyncResult = { calendar_id: calendarRow.id, upserted: 0, deleted: 0 };

  // Берём токен по google_account_user_id.
  const { data: tokenData, error: tokenError } = await supabaseAdmin
    .from('google_calendar_tokens')
    .select('user_id, access_token, refresh_token, expires_at')
    .eq('user_id', calendarRow.google_account_user_id)
    .maybeSingle();

  if (tokenError || !tokenData) {
    result.error = 'Google account not connected or token revoked';
    return result;
  }

  let accessToken: string;
  try {
    accessToken = await ensureValidCalendarToken(supabaseAdmin, tokenData as GoogleCalendarTokenData);
  } catch (e) {
    result.error = `Token refresh failed: ${e instanceof Error ? e.message : String(e)}`;
    return result;
  }

  const now = Date.now();
  const timeMin = new Date(now - WINDOW_PAST_DAYS * 86400000).toISOString();
  const timeMax = new Date(now + WINDOW_FUTURE_DAYS * 86400000).toISOString();

  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarRow.google_calendar_id)}/events`,
    );
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const txt = await res.text();
      result.error = `events.list failed: HTTP ${res.status} — ${txt.slice(0, 200)}`;
      return result;
    }

    const data = await res.json();
    if (Array.isArray(data.items)) {
      events.push(...data.items);
    }
    pageToken = data.nextPageToken;
    pages++;
    if (pages > 20) break; // sanity (макс 5000 событий за один прогон)
  } while (pageToken);

  // Готовим upsert payload.
  const toUpsert: Array<Record<string, unknown>> = [];
  const externalIdsAlive: string[] = [];

  for (const ev of events) {
    if (ev.status === 'cancelled') continue; // удалённые — пропускаем

    const startRaw = ev.start?.dateTime || ev.start?.date;
    const endRaw = ev.end?.dateTime || ev.end?.date;
    if (!startRaw || !endRaw) continue;

    const allDay = !ev.start?.dateTime;
    // У all-day событий end exclusive (Google: date= следующий день).
    const startAt = startRaw;
    const endAt = endRaw;

    toUpsert.push({
      calendar_id: calendarRow.id,
      external_id: ev.id,
      title: ev.summary || '(без названия)',
      description: ev.description ?? null,
      start_at: startAt,
      end_at: endAt,
      all_day: allDay,
      location: ev.location ?? null,
      html_link: ev.htmlLink ?? null,
      updated_at_external: ev.updated ?? null,
      synced_at: new Date().toISOString(),
    });
    externalIdsAlive.push(ev.id);
  }

  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from('external_calendar_events')
      .upsert(toUpsert, { onConflict: 'calendar_id,external_id' });
    if (upsertError) {
      result.error = `Upsert failed: ${upsertError.message}`;
      return result;
    }
    result.upserted = toUpsert.length;
  }

  // Удаляем events из БД, которых больше нет в Google (в окне sync).
  // Берём всё что в БД для этого calendar_id в окне, исключаем те что пришли.
  const { data: existing } = await supabaseAdmin
    .from('external_calendar_events')
    .select('external_id')
    .eq('calendar_id', calendarRow.id)
    .gte('start_at', timeMin)
    .lte('end_at', timeMax);

  if (existing && existing.length > 0) {
    const alive = new Set(externalIdsAlive);
    const toDelete = existing
      .map((r) => (r as { external_id: string }).external_id)
      .filter((id) => !alive.has(id));

    if (toDelete.length > 0) {
      const { error: delError } = await supabaseAdmin
        .from('external_calendar_events')
        .delete()
        .eq('calendar_id', calendarRow.id)
        .in('external_id', toDelete);
      if (!delError) result.deleted = toDelete.length;
    }
  }

  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeadersFor(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Авторизация: либо JWT пользователя, либо internal secret.
    const authHeader = req.headers.get('Authorization');
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');

    let userId: string | null = null;
    let isInternal = false;

    if (internalSecret && expectedSecret && internalSecret === expectedSecret) {
      isInternal = true;
    } else if (authHeader) {
      const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await supabaseUser.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    } else {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({} as { calendar_id?: string }));
    const targetCalendarId = body.calendar_id as string | undefined;

    // Какие календари синхронизируем.
    let calendarsQuery = supabaseAdmin
      .from('calendars')
      .select('id, google_calendar_id, google_account_user_id, owner_user_id')
      .eq('source', 'google')
      .eq('is_deleted', false);

    if (targetCalendarId) {
      calendarsQuery = calendarsQuery.eq('id', targetCalendarId);
    } else if (!isInternal && userId) {
      // Пользовательский вызов без явного calendar_id — синкаем все его календари.
      calendarsQuery = calendarsQuery.eq('owner_user_id', userId);
    }

    const { data: calendars, error: calError } = await calendarsQuery;
    if (calError) {
      return new Response(JSON.stringify({ error: calError.message }), {
        status: 500,
        headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
      });
    }

    if (!calendars || calendars.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
      });
    }

    const results: SyncResult[] = [];
    for (const cal of calendars) {
      const typed = cal as { id: string; google_calendar_id: string; google_account_user_id: string };
      if (!typed.google_calendar_id || !typed.google_account_user_id) continue;
      // eslint-disable-next-line no-await-in-loop
      const res = await syncOneCalendar(supabaseAdmin, typed);
      results.push(res);
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in google-calendar-sync:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Sync failed' }),
      { status: 500, headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' } },
    );
  }
});
