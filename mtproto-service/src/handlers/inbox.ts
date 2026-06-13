/**
 * Создание/поиск MTProto-треда без привязки к проекту.
 *
 * Архитектура «Личные диалоги» (см. memory note `personal_dialogs_architecture`):
 * фейковые системные проекты больше не плодим — тред живёт с
 * `project_id=NULL` + `owner_user_id` (сотрудник-владелец сессии).
 * Привязка к проекту — отдельное действие сотрудника (move_thread_to_project).
 *
 * Тред — отдельный для каждой пары (employee, client_tg_user_id), UNIQUE
 * на (mtproto_session_user_id, mtproto_client_tg_user_id) WHERE NOT NULL.
 */

import { supabase } from "../db.js"

export async function ensureMTProtoThread(args: {
  workspace_id: string
  session_user_id: string
  client_tg_user_id: number
  client_display_name: string
}): Promise<string> {
  const { data: existing } = await supabase
    .from("project_threads")
    .select("id, name")
    .eq("mtproto_session_user_id", args.session_user_id)
    .eq("mtproto_client_tg_user_id", args.client_tg_user_id)
    .eq("is_deleted", false)
    .maybeSingle()
  if (existing) {
    // Тред мог быть создан с плейсхолдером (`tg:<id>` / `@username`), когда
    // имя контакта ещё не было известно (например, первое исходящее новому
    // контакту). Как только приходит настоящее имя — переименовываем.
    // Только плейсхолдер → реальное имя, не наоборот.
    const isPlaceholder = /^(tg:|@)/.test((existing.name as string | null) ?? "")
    const incomingIsReal =
      !!args.client_display_name && !/^(tg:|@)/.test(args.client_display_name)
    if (isPlaceholder && incomingIsReal) {
      await supabase
        .from("project_threads")
        .update({ name: args.client_display_name })
        .eq("id", existing.id as string)
    }
    return existing.id as string
  }

  const { data: created, error } = await supabase
    .from("project_threads")
    .insert({
      project_id: null,
      workspace_id: args.workspace_id,
      owner_user_id: args.session_user_id,
      name: args.client_display_name,
      type: "chat",
      access_type: "all",
      mtproto_session_user_id: args.session_user_id,
      mtproto_client_tg_user_id: args.client_tg_user_id,
      icon: "telegram",
      accent_color: "blue",
    })
    .select("id")
    .single()
  if (error || !created) throw new Error(`Failed to create mtproto thread: ${error?.message}`)
  return created.id as string
}

/**
 * Резолв participant_id сотрудника-владельца сессии в воркспейсе.
 * Нужен для proper-стампа sender_participant_id у исходящих с других
 * устройств.
 */
export async function resolveSessionParticipant(args: {
  user_id: string
  workspace_id: string
}): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("participants")
    .select("id, name, last_name")
    .eq("user_id", args.user_id)
    .eq("workspace_id", args.workspace_id)
    .eq("is_deleted", false)
    .maybeSingle()
  if (!data) return null
  const fullName = [data.name, data.last_name].filter(Boolean).join(" ") || "Сотрудник"
  return { id: data.id as string, name: fullName }
}

/**
 * Upsert клиента (собеседника MTProto) в таблицу participants как
 * "Telegram-контакт". Возвращает participant_id. Тот же контракт, что
 * у telegram-webhook (групповые боты), поэтому работает существующая
 * фича «Привязать к участнику» (RPC merge_telegram_contact).
 *
 * Дедуп по (workspace_id, telegram_user_id). Если уже привязан к юзеру
 * (linked_user_id) — обновляем только имена/фамилии, чтобы не сломать
 * слияние.
 */
export async function ensureClientParticipant(args: {
  workspace_id: string
  telegram_user_id: number
  first_name: string | null
  last_name: string | null
  username?: string | null
}): Promise<string | null> {
  const { data: existing } = await supabase
    .from("participants")
    .select("id, name, last_name, telegram_username")
    .eq("workspace_id", args.workspace_id)
    .eq("telegram_user_id", args.telegram_user_id)
    .eq("is_deleted", false)
    .maybeSingle()

  const newName = args.first_name || existing?.name || "Telegram User"
  const newLastName = args.last_name ?? existing?.last_name ?? null
  // username без @; не затираем существующий, если в апдейте его нет.
  const newUsername =
    args.username ?? (existing?.telegram_username as string | null | undefined) ?? null

  if (existing) {
    if (
      existing.name !== newName ||
      existing.last_name !== newLastName ||
      (existing.telegram_username as string | null) !== newUsername
    ) {
      await supabase
        .from("participants")
        .update({ name: newName, last_name: newLastName, telegram_username: newUsername })
        .eq("id", existing.id)
    }
    return existing.id as string
  }

  const { data: created, error } = await supabase
    .from("participants")
    .insert({
      workspace_id: args.workspace_id,
      name: newName,
      last_name: newLastName,
      telegram_username: newUsername,
      email: `tg_${args.telegram_user_id}@telegram.placeholder`,
      telegram_user_id: args.telegram_user_id,
      workspace_roles: ["Telegram-контакт"],
      can_login: false,
      is_deleted: false,
    })
    .select("id")
    .single()
  if (error || !created) {
    return null
  }
  return created.id as string
}
