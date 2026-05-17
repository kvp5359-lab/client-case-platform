/**
 * google-calendar-write — write-back в Google Calendar.
 *
 * Поддерживает три операции (action):
 *   - create: POST   /calendars/{id}/events
 *   - update: PATCH  /calendars/{id}/events/{eventId}
 *   - delete: DELETE /calendars/{id}/events/{eventId}
 *
 * Требует JWT пользователя. Calendar по `calendar_id` (наш UUID) должен
 * принадлежать этому юзеру (owner_user_id = auth.uid()), иначе 403.
 * После записи апсёртит/удаляет запись в external_calendar_events, чтобы
 * UI обновился без ожидания следующего sync-цикла.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { ensureValidCalendarToken, type GoogleCalendarTokenData } from "../_shared/googleCalendarToken.ts";

interface WriteBody {
  action: 'create' | 'update' | 'delete';
  calendar_id: string;       // наш UUID
  external_id?: string;      // Google event id (для update/delete)
  title?: string;
  description?: string | null;
  start_at?: string;         // ISO
  end_at?: string;           // ISO
  location?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as WriteBody;
    if (!body.action || !body.calendar_id) {
      return new Response(JSON.stringify({ error: "action and calendar_id are required" }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Найти наш календарь и проверить, что юзер — owner.
    const { data: cal, error: calError } = await supabaseAdmin
      .from('calendars')
      .select('id, source, google_calendar_id, owner_user_id, google_account_user_id')
      .eq('id', body.calendar_id)
      .maybeSingle();

    if (calError || !cal) {
      return new Response(JSON.stringify({ error: "Calendar not found" }), {
        status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    if (cal.source !== 'google' || !cal.google_calendar_id) {
      return new Response(JSON.stringify({ error: "Not a Google calendar" }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    if (cal.owner_user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Токен берём от google_account_user_id (это и есть owner).
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('google_calendar_tokens')
      .select('user_id, access_token, refresh_token, expires_at')
      .eq('user_id', cal.google_account_user_id)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(JSON.stringify({ error: "Google account not connected" }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await ensureValidCalendarToken(supabaseAdmin, tokenData as GoogleCalendarTokenData);
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.google_calendar_id)}/events`;

    if (body.action === 'delete') {
      if (!body.external_id) {
        return new Response(JSON.stringify({ error: "external_id required for delete" }), {
          status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
      const res = await fetch(`${baseUrl}/${encodeURIComponent(body.external_id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok && res.status !== 410) {
        const txt = await res.text();
        return new Response(JSON.stringify({ error: `Google delete failed: ${res.status} — ${txt.slice(0, 200)}` }), {
          status: 502, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
      await supabaseAdmin
        .from('external_calendar_events')
        .delete()
        .eq('calendar_id', cal.id)
        .eq('external_id', body.external_id);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // create / update: payload Google
    if (!body.start_at || !body.end_at) {
      return new Response(JSON.stringify({ error: "start_at/end_at required" }), {
        status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const payload: Record<string, unknown> = {
      start: { dateTime: body.start_at },
      end: { dateTime: body.end_at },
    };
    if (body.title !== undefined) payload.summary = body.title;
    if (body.description !== undefined) payload.description = body.description;
    if (body.location !== undefined) payload.location = body.location;

    let res: Response;
    if (body.action === 'create') {
      res = await fetch(baseUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      // update
      if (!body.external_id) {
        return new Response(JSON.stringify({ error: "external_id required for update" }), {
          status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
      res = await fetch(`${baseUrl}/${encodeURIComponent(body.external_id)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) {
      const txt = await res.text();
      return new Response(JSON.stringify({ error: `Google ${body.action} failed: ${res.status} — ${txt.slice(0, 300)}` }), {
        status: 502, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const ev = await res.json();
    const startRaw = ev.start?.dateTime || ev.start?.date;
    const endRaw = ev.end?.dateTime || ev.end?.date;

    // Зеркалим в external_calendar_events.
    if (startRaw && endRaw) {
      await supabaseAdmin
        .from('external_calendar_events')
        .upsert({
          calendar_id: cal.id,
          external_id: ev.id,
          title: ev.summary || '(без названия)',
          description: ev.description ?? null,
          start_at: startRaw,
          end_at: endRaw,
          all_day: !ev.start?.dateTime,
          location: ev.location ?? null,
          html_link: ev.htmlLink ?? null,
          updated_at_external: ev.updated ?? null,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'calendar_id,external_id' });
    }

    return new Response(JSON.stringify({ event: ev }), {
      status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in google-calendar-write:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Write failed' }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
