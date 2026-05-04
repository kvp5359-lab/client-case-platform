/**
 * Создание/поиск системного инбокс-проекта и MTProto-треда.
 *
 * Используем тот же системный проект «Личные диалоги Telegram», что и
 * Telegram Business — `is_system_business_inbox` исторически называется
 * по бизнесу, но логически это «личные диалоги сотрудника» независимо
 * от канала. Один проект на сотрудника в воркспейсе, UNIQUE на
 * (workspace_id, system_inbox_user_id) WHERE is_system_business_inbox.
 *
 * Тред — отдельный для каждой пары (employee, client_tg_user_id), UNIQUE
 * на (mtproto_session_user_id, mtproto_client_tg_user_id) WHERE NOT NULL.
 */

import { supabase } from "../db.js"

export async function ensureSystemInboxProject(args: {
  user_id: string
  workspace_id: string
}): Promise<string> {
  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .eq("workspace_id", args.workspace_id)
    .eq("system_inbox_user_id", args.user_id)
    .eq("is_system_business_inbox", true)
    .maybeSingle()
  if (existing) return existing.id as string

  const { data: created, error } = await supabase
    .from("projects")
    .insert({
      workspace_id: args.workspace_id,
      name: "Личные диалоги Telegram",
      description: "Системный проект: личные диалоги сотрудника через Telegram (MTProto / Business).",
      is_system_business_inbox: true,
      system_inbox_user_id: args.user_id,
      created_by: args.user_id,
    })
    .select("id")
    .single()
  if (error || !created) throw new Error(`Failed to create system inbox: ${error?.message}`)

  // Добавляем владельца в project_participants как администратора —
  // иначе get_workspace_threads (для юзеров без view_all_projects) не
  // отдаст ему треды собственного инбокса.
  const { data: ownerParticipant } = await supabase
    .from("participants")
    .select("id")
    .eq("user_id", args.user_id)
    .eq("workspace_id", args.workspace_id)
    .eq("is_deleted", false)
    .maybeSingle()
  if (ownerParticipant) {
    await supabase.from("project_participants").insert({
      project_id: created.id,
      participant_id: ownerParticipant.id,
      project_roles: ["Администратор"],
    })
  }

  return created.id as string
}

export async function ensureMTProtoThread(args: {
  project_id: string
  workspace_id: string
  session_user_id: string
  client_tg_user_id: number
  client_display_name: string
}): Promise<string> {
  const { data: existing } = await supabase
    .from("project_threads")
    .select("id")
    .eq("mtproto_session_user_id", args.session_user_id)
    .eq("mtproto_client_tg_user_id", args.client_tg_user_id)
    .eq("is_deleted", false)
    .maybeSingle()
  if (existing) return existing.id as string

  const { data: created, error } = await supabase
    .from("project_threads")
    .insert({
      project_id: args.project_id,
      workspace_id: args.workspace_id,
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

// Совместимость со старым именем — возвращает только id.
export async function resolveSessionParticipantId(args: {
  user_id: string
  workspace_id: string
}): Promise<string | null> {
  const p = await resolveSessionParticipant(args)
  return p?.id ?? null
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
}): Promise<string | null> {
  const { data: existing } = await supabase
    .from("participants")
    .select("id, name, last_name")
    .eq("workspace_id", args.workspace_id)
    .eq("telegram_user_id", args.telegram_user_id)
    .eq("is_deleted", false)
    .maybeSingle()

  const newName = args.first_name || existing?.name || "Telegram User"
  const newLastName = args.last_name ?? existing?.last_name ?? null

  if (existing) {
    if (existing.name !== newName || existing.last_name !== newLastName) {
      await supabase
        .from("participants")
        .update({ name: newName, last_name: newLastName })
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
