/**
 * google-calendar-mirror-task — one-way mirror задачи сервиса в Google Calendar.
 *
 * Зовётся БД-триггером AFTER INSERT/UPDATE на project_threads (через
 * dispatch_send_http) и при изменении project_thread_members. На вход:
 * { thread_id }. Аутентификация — только x-internal-secret.
 *
 * Логика:
 *  1. Найти тред (workspace_id, created_by, owner_user_id, start_at, end_at,
 *     is_deleted, name, description).
 *  2. Собрать «релевантных» юзеров: created_by + owner_user_id + все
 *     project_thread_members → participants.user_id.
 *  3. Для каждого юзера: если у него есть mirror_settings(enabled=true) в
 *     этом воркспейсе → определить целевой Google calendar, токен.
 *  4. Решение:
 *     - thread.is_deleted ИЛИ start_at IS NULL ИЛИ end_at IS NULL
 *       → если запись в task_google_event_map есть → DELETE из Google + delete row;
 *       → иначе skip.
 *     - Иначе → если запись есть → PATCH; нет → POST. Upsert в map.
 *
 * Идемпотентно. Ошибки одного юзера не валят остальных.
 */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { ensureValidCalendarToken, type GoogleCalendarTokenData } from "../_shared/googleCalendarToken.ts";

interface MirrorBody { thread_id: string }

async function getToken(admin: SupabaseClient, accountUserId: string): Promise<string | null> {
  const { data: tok } = await admin
    .from('google_calendar_tokens')
    .select('user_id, access_token, refresh_token, expires_at')
    .eq('user_id', accountUserId)
    .maybeSingle();
  if (!tok) return null;
  try { return await ensureValidCalendarToken(admin, tok as GoogleCalendarTokenData); }
  catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null);

  const secret = req.headers.get('x-internal-secret');
  const expected = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  if (!secret || !expected || secret !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { thread_id } = await req.json() as MirrorBody;
    if (!thread_id) return new Response(JSON.stringify({ error: 'thread_id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: thread, error: threadErr } = await admin
      .from('project_threads')
      .select('id, workspace_id, name, description, start_at, end_at, is_deleted, created_by, owner_user_id')
      .eq('id', thread_id)
      .maybeSingle();
    if (threadErr || !thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // Собираем релевантных юзеров.
    const userIds = new Set<string>();
    if (thread.created_by) userIds.add(thread.created_by);
    if (thread.owner_user_id) userIds.add(thread.owner_user_id);

    const { data: members } = await admin
      .from('project_thread_members')
      .select('participant_id')
      .eq('thread_id', thread_id);
    if (members && members.length > 0) {
      const partIds = members.map((m) => (m as { participant_id: string }).participant_id);
      const { data: parts } = await admin
        .from('participants')
        .select('user_id')
        .in('id', partIds)
        .not('user_id', 'is', null);
      for (const p of parts ?? []) {
        const uid = (p as { user_id: string | null }).user_id;
        if (uid) userIds.add(uid);
      }
    }

    if (userIds.size === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no users' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Текущие маппинги треда — на случай delete.
    const { data: existingMaps } = await admin
      .from('task_google_event_map')
      .select('user_id, calendar_id, google_event_id')
      .eq('thread_id', thread_id);
    const mapByUser = new Map<string, { calendar_id: string; google_event_id: string }>();
    for (const r of existingMaps ?? []) {
      const row = r as { user_id: string; calendar_id: string; google_event_id: string };
      mapByUser.set(row.user_id, { calendar_id: row.calendar_id, google_event_id: row.google_event_id });
    }

    const shouldDelete = thread.is_deleted === true || !thread.start_at || !thread.end_at;

    const results: Array<{ user_id: string; action: string; error?: string }> = [];

    for (const userId of userIds) {
      // mirror enabled?
      const { data: mirror } = await admin
        .from('user_calendar_mirror_settings')
        .select('target_calendar_id, enabled')
        .eq('user_id', userId)
        .eq('workspace_id', thread.workspace_id)
        .eq('enabled', true)
        .maybeSingle();

      const targetCalendarId = (mirror as { target_calendar_id?: string } | null)?.target_calendar_id;
      const existing = mapByUser.get(userId);

      // Если у юзера выключен mirror, но есть старая запись — удалим из Google и из карты.
      if (!targetCalendarId) {
        if (existing) {
          const { data: cal } = await admin.from('calendars').select('google_calendar_id, google_account_user_id').eq('id', existing.calendar_id).maybeSingle();
          if (cal && (cal as { google_calendar_id: string; google_account_user_id: string }).google_calendar_id) {
            const c = cal as { google_calendar_id: string; google_account_user_id: string };
            const token = await getToken(admin, c.google_account_user_id);
            if (token) {
              await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.google_calendar_id)}/events/${encodeURIComponent(existing.google_event_id)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
            }
          }
          await admin.from('task_google_event_map').delete().eq('thread_id', thread_id).eq('user_id', userId);
          results.push({ user_id: userId, action: 'mirror-off-deleted' });
        }
        continue;
      }

      const { data: cal } = await admin.from('calendars').select('id, google_calendar_id, google_account_user_id, source').eq('id', targetCalendarId).maybeSingle();
      const calRow = cal as { id: string; google_calendar_id: string; google_account_user_id: string; source: string } | null;
      if (!calRow || calRow.source !== 'google' || !calRow.google_calendar_id || !calRow.google_account_user_id) {
        results.push({ user_id: userId, action: 'skip', error: 'invalid target calendar' });
        continue;
      }
      const token = await getToken(admin, calRow.google_account_user_id);
      if (!token) {
        results.push({ user_id: userId, action: 'skip', error: 'no token' });
        continue;
      }

      const apiBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calRow.google_calendar_id)}/events`;

      if (shouldDelete) {
        if (existing) {
          await fetch(`${apiBase}/${encodeURIComponent(existing.google_event_id)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          await admin.from('task_google_event_map').delete().eq('thread_id', thread_id).eq('user_id', userId);
          results.push({ user_id: userId, action: 'deleted' });
        } else {
          results.push({ user_id: userId, action: 'skip-no-times' });
        }
        continue;
      }

      // Upsert event
      const payload = {
        summary: thread.name || '(без названия)',
        description: thread.description || '',
        start: { dateTime: thread.start_at },
        end: { dateTime: thread.end_at },
        // extendedProperties для опознавания «нашего» события (защита от циклов).
        extendedProperties: { private: { clientcase_thread_id: thread_id } },
      };

      let res: Response;
      let eventId = existing?.google_event_id;
      if (existing && existing.calendar_id === calRow.id) {
        res = await fetch(`${apiBase}/${encodeURIComponent(existing.google_event_id)}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.status === 404 || res.status === 410) {
          // событие исчезло — создадим заново
          res = await fetch(apiBase, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (res.ok) eventId = (await res.clone().json()).id;
        }
      } else {
        // Старый mapping был в другой календарь (юзер сменил target) — удалим старое
        if (existing) {
          const { data: oldCal } = await admin.from('calendars').select('google_calendar_id, google_account_user_id').eq('id', existing.calendar_id).maybeSingle();
          if (oldCal) {
            const oc = oldCal as { google_calendar_id: string; google_account_user_id: string };
            const oldToken = await getToken(admin, oc.google_account_user_id);
            if (oldToken) {
              await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(oc.google_calendar_id)}/events/${encodeURIComponent(existing.google_event_id)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${oldToken}` },
              });
            }
          }
        }
        res = await fetch(apiBase, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) eventId = (await res.clone().json()).id;
      }

      if (!res.ok) {
        const txt = await res.text();
        results.push({ user_id: userId, action: 'failed', error: `${res.status} ${txt.slice(0, 150)}` });
        continue;
      }

      if (eventId) {
        await admin.from('task_google_event_map').upsert({
          thread_id, user_id: userId, calendar_id: calRow.id, google_event_id: eventId, last_pushed_at: new Date().toISOString(),
        }, { onConflict: 'thread_id,user_id' });
        results.push({ user_id: userId, action: existing ? 'updated' : 'created' });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('mirror-task error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
