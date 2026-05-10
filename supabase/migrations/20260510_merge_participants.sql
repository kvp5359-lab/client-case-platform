-- RPC: объединение двух participants одного workspace.
-- Source поглощается target'ом: все ссылки переносятся, source помечается is_deleted.
-- Безопасность: участники одного workspace, source не должен иметь user_id
-- (нельзя объединять реальных пользователей с логином). Право: владелец
-- воркспейса или manage_participants.

CREATE OR REPLACE FUNCTION public.merge_participants(
  p_target_id uuid,
  p_source_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target RECORD;
  v_source RECORD;
  v_workspace_id uuid;
BEGIN
  IF p_target_id = p_source_id THEN
    RAISE EXCEPTION 'merge_participants: target = source';
  END IF;

  SELECT * INTO v_target FROM participants WHERE id = p_target_id;
  IF NOT FOUND OR v_target.is_deleted THEN
    RAISE EXCEPTION 'merge_participants: target not found or deleted';
  END IF;

  SELECT * INTO v_source FROM participants WHERE id = p_source_id;
  IF NOT FOUND OR v_source.is_deleted THEN
    RAISE EXCEPTION 'merge_participants: source not found or deleted';
  END IF;

  IF v_target.workspace_id <> v_source.workspace_id THEN
    RAISE EXCEPTION 'merge_participants: different workspaces';
  END IF;
  v_workspace_id := v_target.workspace_id;

  IF v_source.user_id IS NOT NULL OR v_source.can_login THEN
    RAISE EXCEPTION 'merge_participants: source участника с логином объединять нельзя — выберите контакт';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM participants par
    JOIN workspace_roles wr ON wr.name = ANY(par.workspace_roles)
                            AND wr.workspace_id = par.workspace_id
    WHERE par.user_id = auth.uid()
      AND par.workspace_id = v_workspace_id
      AND par.is_deleted = false
      AND (wr.is_owner = true OR (wr.permissions->>'manage_participants')::boolean = true)
  ) THEN
    RAISE EXCEPTION 'merge_participants: access denied';
  END IF;

  UPDATE project_threads SET contact_participant_id = p_target_id WHERE contact_participant_id = p_source_id;
  UPDATE projects SET contact_participant_id = p_target_id WHERE contact_participant_id = p_source_id;
  UPDATE project_messages SET sender_participant_id = p_target_id WHERE sender_participant_id = p_source_id;
  UPDATE telegram_link_tokens SET participant_id = p_target_id WHERE participant_id = p_source_id;
  UPDATE folders SET assignee_id = p_target_id WHERE assignee_id = p_source_id;
  UPDATE folder_slots SET assignee_id = p_target_id WHERE assignee_id = p_source_id;
  UPDATE services SET default_assignee_id = p_target_id WHERE default_assignee_id = p_source_id;
  UPDATE project_service_items SET executor_id = p_target_id WHERE executor_id = p_source_id;
  UPDATE project_money_movements SET receiver_id = p_target_id WHERE receiver_id = p_source_id;
  UPDATE project_money_movements SET payer_id = p_target_id WHERE payer_id = p_source_id;
  UPDATE project_transactions SET participant_id = p_target_id WHERE participant_id = p_source_id;

  DELETE FROM project_participants pp
  WHERE pp.participant_id = p_source_id
    AND EXISTS (SELECT 1 FROM project_participants pp2
                WHERE pp2.participant_id = p_target_id AND pp2.project_id = pp.project_id);
  UPDATE project_participants SET participant_id = p_target_id WHERE participant_id = p_source_id;

  DELETE FROM project_thread_members ptm
  WHERE ptm.participant_id = p_source_id
    AND EXISTS (SELECT 1 FROM project_thread_members ptm2
                WHERE ptm2.participant_id = p_target_id AND ptm2.thread_id = ptm.thread_id);
  UPDATE project_thread_members SET participant_id = p_target_id WHERE participant_id = p_source_id;

  DELETE FROM project_thread_assignees pta
  WHERE pta.participant_id = p_source_id
    AND EXISTS (SELECT 1 FROM project_thread_assignees pta2
                WHERE pta2.participant_id = p_target_id AND pta2.thread_id = pta.thread_id);
  UPDATE project_thread_assignees SET participant_id = p_target_id WHERE participant_id = p_source_id;

  DELETE FROM task_assignees ta
  WHERE ta.participant_id = p_source_id
    AND EXISTS (SELECT 1 FROM task_assignees ta2
                WHERE ta2.participant_id = p_target_id AND ta2.thread_id = ta.thread_id);
  UPDATE task_assignees SET participant_id = p_target_id WHERE participant_id = p_source_id;

  DELETE FROM board_members bm
  WHERE bm.participant_id = p_source_id
    AND EXISTS (SELECT 1 FROM board_members bm2
                WHERE bm2.participant_id = p_target_id AND bm2.board_id = bm.board_id);
  UPDATE board_members SET participant_id = p_target_id WHERE participant_id = p_source_id;

  DELETE FROM message_reactions mr
  WHERE mr.participant_id = p_source_id
    AND EXISTS (SELECT 1 FROM message_reactions mr2
                WHERE mr2.participant_id = p_target_id
                  AND mr2.message_id = mr.message_id AND mr2.emoji = mr.emoji);
  UPDATE message_reactions SET participant_id = p_target_id WHERE participant_id = p_source_id;

  DELETE FROM message_read_status mrs
  WHERE mrs.participant_id = p_source_id
    AND EXISTS (SELECT 1 FROM message_read_status mrs2
                WHERE mrs2.participant_id = p_target_id AND mrs2.thread_id = mrs.thread_id);
  UPDATE message_read_status SET participant_id = p_target_id WHERE participant_id = p_source_id;

  UPDATE participant_channels SET participant_id = p_target_id WHERE participant_id = p_source_id;

  UPDATE participants
  SET
    telegram_user_id = COALESCE(telegram_user_id, v_source.telegram_user_id),
    phone = COALESCE(phone, v_source.phone),
    avatar_url = COALESCE(avatar_url, v_source.avatar_url),
    last_name = COALESCE(last_name, v_source.last_name),
    notes = CASE
      WHEN v_source.notes IS NOT NULL AND v_source.notes != ''
      THEN COALESCE(notes, '') || CASE WHEN notes IS NOT NULL AND notes != '' THEN E'\n---\n' ELSE '' END || v_source.notes
      ELSE notes
    END,
    updated_at = now()
  WHERE id = p_target_id;

  UPDATE participants
  SET is_deleted = true, deleted_at = now(), updated_at = now()
  WHERE id = p_source_id;

  RETURN json_build_object('target_id', p_target_id, 'source_id', p_source_id, 'workspace_id', v_workspace_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.merge_participants(uuid, uuid) TO authenticated;
