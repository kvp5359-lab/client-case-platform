-- Поведенческий self-test общей функции применения шаблона треда.
--
-- resolve_thread_template_binding — ядро: её зовут и создание проектов из
-- шаблона, и приём лид-ботов. Формула «переопределение ?? база» правилась
-- несколько раз (одна ошибка — роли, не следовавшие за access_type, нашлась
-- только сверкой на данных). Тест фиксирует правила машинно.
--
-- Безопасность: fixture живёт внутри вложенного BEGIN...EXCEPTION (savepoint) и
-- откатывается всегда — в базе ноль следов даже при падении. В project_messages
-- не пишем, наружу (в каналы) ничего не уходит.
--
-- Гоняется в CI: scripts/check-db-selftests.mjs (Ops Checks).
CREATE OR REPLACE FUNCTION public._selftest_thread_template_folding()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ws uuid;
  v_int uuid;
  v_tpl uuid;
  v_binding uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_fail text := NULL;
  r record;
BEGIN
  BEGIN
    SELECT id INTO v_ws FROM public.workspaces ORDER BY created_at LIMIT 1;
    IF v_ws IS NULL THEN RETURN 'SKIP: нет воркспейса'; END IF;

    -- Участники-пустышки (без user_id — как контакты). Email проходит CHECK
    -- формата и уникален; строки всё равно откатятся.
    INSERT INTO public.participants (workspace_id, name, email)
      VALUES (v_ws, 'selftest A', 'selftest-a-' || gen_random_uuid() || '@example.com')
      RETURNING id INTO v_p1;
    INSERT INTO public.participants (workspace_id, name, email)
      VALUES (v_ws, 'selftest B', 'selftest-b-' || gen_random_uuid() || '@example.com')
      RETURNING id INTO v_p2;

    -- Базовый шаблон: срок 5 дней, доступ по роли, исполнитель A.
    INSERT INTO public.thread_templates
      (workspace_id, name, thread_type, deadline_days, access_type, access_roles,
       initial_message_html, icon, accent_color)
    VALUES
      (v_ws, 'selftest tpl', 'task', 5, 'roles', ARRAY['Клиент'], '<p>база</p>', 'message-circle', 'blue')
    RETURNING id INTO v_tpl;
    INSERT INTO public.thread_template_assignees (template_id, participant_id)
      VALUES (v_tpl, v_p1);

    -- Привязка канала (владелец = интеграция) — ничего не переопределяет.
    INSERT INTO public.workspace_integrations (workspace_id, type, config)
      VALUES (v_ws, 'telegram_lead_bot', '{}'::jsonb) RETURNING id INTO v_int;
    INSERT INTO public.project_template_thread_templates (integration_id, thread_template_id)
      VALUES (v_int, v_tpl) RETURNING id INTO v_binding;

    -- 1. Наследование: всё из базового шаблона.
    SELECT * INTO r FROM public.resolve_thread_template_binding(v_binding);
    IF r.deadline_days <> 5 THEN v_fail := 'inherit: срок ' || r.deadline_days || ' вместо 5';
    ELSIF r.access_type <> 'roles' OR r.access_roles <> ARRAY['Клиент'] THEN
      v_fail := 'inherit: доступ не унаследован';
    ELSIF r.initial_message_html <> '<p>база</p>' THEN v_fail := 'inherit: сообщение не унаследовано';
    ELSIF r.assignee_ids <> ARRAY[v_p1] THEN v_fail := 'inherit: исполнители не из шаблона';
    END IF;

    -- 2. Переопределение скаляров + роли следуют за access_type.
    --    Задан access_type без ролей → роли пустые, НЕ базовые (ловушка, на
    --    которой ошиблась первая версия функции).
    IF v_fail IS NULL THEN
      UPDATE public.project_template_thread_templates
      SET deadline_days = 3, access_type = 'all', access_roles = NULL,
          initial_message_html = '<p>канал</p>'
      WHERE id = v_binding;
      SELECT * INTO r FROM public.resolve_thread_template_binding(v_binding);
      IF r.deadline_days <> 3 THEN v_fail := 'override: срок не переопределён';
      ELSIF r.access_type <> 'all' THEN v_fail := 'override: access_type не переопределён';
      ELSIF r.access_roles <> '{}'::text[] THEN
        v_fail := 'override: роли должны следовать за access_type (ожидалось пусто)';
      ELSIF r.initial_message_html <> '<p>канал</p>' THEN v_fail := 'override: сообщение не переопределено';
      ELSIF r.icon <> 'message-circle' OR r.accent_color <> 'blue' THEN
        v_fail := 'override: иконка/цвет всегда из базового шаблона';
      END IF;
    END IF;

    -- 3. Исполнители «заменить»: только из привязки, шаблонные не участвуют.
    IF v_fail IS NULL THEN
      UPDATE public.project_template_thread_templates
      SET assignees_mode = 'override' WHERE id = v_binding;
      INSERT INTO public.project_template_thread_assignees (binding_id, participant_id)
        VALUES (v_binding, v_p2);
      SELECT * INTO r FROM public.resolve_thread_template_binding(v_binding);
      IF r.assignee_ids <> ARRAY[v_p2] THEN
        v_fail := 'override: исполнители должны быть только из привязки';
      END IF;
    END IF;

    -- 4. Переопределение пустым набором = «никого» (а не «унаследовать»).
    IF v_fail IS NULL THEN
      DELETE FROM public.project_template_thread_assignees WHERE binding_id = v_binding;
      SELECT * INTO r FROM public.resolve_thread_template_binding(v_binding);
      IF r.assignee_ids <> '{}'::uuid[] THEN
        v_fail := 'override пустым набором должен давать «никого», получено: ' || r.assignee_ids::text;
      END IF;
    END IF;

    -- 5. Возврат к наследованию отдаёт исполнителей шаблона.
    IF v_fail IS NULL THEN
      UPDATE public.project_template_thread_templates
      SET assignees_mode = 'inherit' WHERE id = v_binding;
      SELECT * INTO r FROM public.resolve_thread_template_binding(v_binding);
      IF r.assignee_ids <> ARRAY[v_p1] THEN v_fail := 'inherit после override: ожидались исполнители шаблона';
      END IF;
    END IF;

    -- 6. Инвариант двух полей: булев — отражение режима (мост совместимости).
    IF v_fail IS NULL THEN
      PERFORM 1 FROM public.project_template_thread_templates
        WHERE id = v_binding AND override_assignees <> (assignees_mode = 'override');
      IF FOUND THEN v_fail := 'мост: override_assignees разошёлся с assignees_mode'; END IF;
    END IF;

    RAISE EXCEPTION 'selftest_rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'selftest_rollback' THEN
      v_fail := COALESCE(v_fail, 'ошибка выполнения: ' || SQLERRM);
    END IF;
  END;

  RETURN COALESCE(v_fail, 'PASS');
END;
$$;

REVOKE ALL ON FUNCTION public._selftest_thread_template_folding() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._selftest_thread_template_folding() TO service_role;
