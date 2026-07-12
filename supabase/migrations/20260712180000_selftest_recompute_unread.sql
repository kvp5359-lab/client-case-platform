-- Поведенческий self-test самой хрупкой функции мессенджера —
-- recompute_thread_unread_for (счётчики непрочитанного). Её многократно
-- ломали правками одного правила, задевая другое (ledger). Тестов не было.
--
-- Как это безопасно: тест создаёт fixture во ВНУТРЕННЕМ треде (без внешнего
-- канала → триггер отправки ничего наружу не шлёт) и весь fixture откатывает
-- через вложенный BEGIN/EXCEPTION (savepoint) — в базе не остаётся следов,
-- даже если тест упал. Возвращает 'PASS' либо текст первого проваленного
-- ассерта. Гоняется раннером scripts/check-recompute-selftest.mjs в CI Ops Checks.
--
-- SECURITY DEFINER (пишет fixture в обход RLS) + service_role only (не anon/
-- public — иначе guard check-db-invariants #3 покраснеет, и правильно).

CREATE OR REPLACE FUNCTION public._selftest_recompute_unread()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ws uuid; v_me uuid; v_other uuid;
  v_tA uuid; v_tB uuid; v_tC uuid; v_tD uuid; v_my_msg uuid;
  g_unread bigint; g_muted bigint;
  result text;
BEGIN
  BEGIN  -- вложенный блок = savepoint; любой RAISE ниже откатит весь fixture
    INSERT INTO workspaces (name) VALUES ('__selftest_recompute_ws') RETURNING id INTO v_ws;
    INSERT INTO participants (workspace_id, name, email)
      VALUES (v_ws,'Me','me_'||gen_random_uuid()||'@selftest.local') RETURNING id INTO v_me;
    INSERT INTO participants (workspace_id, name, email)
      VALUES (v_ws,'Other','ot_'||gen_random_uuid()||'@selftest.local') RETURNING id INTO v_other;

    -- A: базовый unread (подписан, клиентское сообщение от другого) → 1
    INSERT INTO project_threads (workspace_id,name) VALUES (v_ws,'__selftest_thread') RETURNING id INTO v_tA;
    INSERT INTO project_thread_subscriptions (thread_id,participant_id,state) VALUES (v_tA,v_me,'subscribed');
    INSERT INTO project_messages (workspace_id,thread_id,sender_participant_id,sender_name,content,visibility,source)
      VALUES (v_ws,v_tA,v_other,'Other','hi','client','web');
    PERFORM recompute_thread_unread_for(v_me,v_tA);
    SELECT unread_count INTO g_unread FROM thread_unread_state WHERE participant_id=v_me AND thread_id=v_tA;
    IF g_unread IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FAIL A (базовый unread): ждали 1, получили %', g_unread; END IF;

    -- B: own-watermark (моё сообщение позже чужого → чужое считается прочитанным) → 0
    INSERT INTO project_threads (workspace_id,name) VALUES (v_ws,'__selftest_thread') RETURNING id INTO v_tB;
    INSERT INTO project_thread_subscriptions (thread_id,participant_id,state) VALUES (v_tB,v_me,'subscribed');
    INSERT INTO project_messages (workspace_id,thread_id,sender_participant_id,sender_name,content,visibility,source,created_at)
      VALUES (v_ws,v_tB,v_other,'Other','старое','client','web', now()-interval '2 min');
    INSERT INTO project_messages (workspace_id,thread_id,sender_participant_id,sender_name,content,visibility,source,created_at)
      VALUES (v_ws,v_tB,v_me,'Me','мой ответ','client','web', now()-interval '1 min');
    PERFORM recompute_thread_unread_for(v_me,v_tB);
    SELECT unread_count INTO g_unread FROM thread_unread_state WHERE participant_id=v_me AND thread_id=v_tB;
    IF g_unread IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'FAIL B (own-watermark): ждали 0, получили %', g_unread; END IF;

    -- C: mute-архив (заглушён → обычный счётчик 0, архивный 1)
    INSERT INTO project_threads (workspace_id,name) VALUES (v_ws,'__selftest_thread') RETURNING id INTO v_tC;
    INSERT INTO project_thread_subscriptions (thread_id,participant_id,state) VALUES (v_tC,v_me,'muted');
    INSERT INTO project_messages (workspace_id,thread_id,sender_participant_id,sender_name,content,visibility,source)
      VALUES (v_ws,v_tC,v_other,'Other','hi','client','web');
    PERFORM recompute_thread_unread_for(v_me,v_tC);
    SELECT unread_count, muted_unread_count INTO g_unread, g_muted FROM thread_unread_state WHERE participant_id=v_me AND thread_id=v_tC;
    IF g_unread IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'FAIL C (mute обычный): ждали 0, получили %', g_unread; END IF;
    IF g_muted IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FAIL C (mute архив): ждали 1, получили %', g_muted; END IF;

    -- D: mute + priority-пробой (ответ на МОЁ сообщение пробивает заглушку) → 1
    INSERT INTO project_threads (workspace_id,name) VALUES (v_ws,'__selftest_thread') RETURNING id INTO v_tD;
    INSERT INTO project_thread_subscriptions (thread_id,participant_id,state) VALUES (v_tD,v_me,'muted');
    INSERT INTO project_messages (workspace_id,thread_id,sender_participant_id,sender_name,content,visibility,source,created_at)
      VALUES (v_ws,v_tD,v_me,'Me','моё','client','web', now()-interval '2 min') RETURNING id INTO v_my_msg;
    INSERT INTO project_messages (workspace_id,thread_id,sender_participant_id,sender_name,content,visibility,source,created_at,reply_to_message_id)
      VALUES (v_ws,v_tD,v_other,'Other','ответ тебе','client','web', now()-interval '1 min', v_my_msg);
    PERFORM recompute_thread_unread_for(v_me,v_tD);
    SELECT unread_count INTO g_unread FROM thread_unread_state WHERE participant_id=v_me AND thread_id=v_tD;
    IF g_unread IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FAIL D (mute+priority-пробой): ждали 1, получили %', g_unread; END IF;

    RAISE EXCEPTION 'ROLLBACK_FIXTURE';  -- всё прошло → откатываем fixture
  EXCEPTION WHEN OTHERS THEN
    result := CASE WHEN SQLERRM = 'ROLLBACK_FIXTURE' THEN 'PASS' ELSE SQLERRM END;
  END;
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public._selftest_recompute_unread() FROM public;
GRANT EXECUTE ON FUNCTION public._selftest_recompute_unread() TO service_role;
