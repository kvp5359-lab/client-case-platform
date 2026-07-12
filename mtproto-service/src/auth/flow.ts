/**
 * Поток авторизации сотрудника в Telegram через MTProto.
 *
 * Telegram API требует трёх шагов в худшем случае:
 *  1. sendCode(phone) → Telegram присылает 5-значный код в Telegram-приложение
 *     (или SMS, если десктопных сессий нет). Возвращает phone_code_hash —
 *     обязательный для signIn.
 *  2. signIn(phone, phone_code_hash, code) → если 2FA выключен, успех.
 *     Если включён — кидает SessionPasswordNeededError.
 *  3. checkPassword(cloud_password) → финальный успех.
 *
 * Между шагами пользователь возвращается к нашему UI, поэтому состояние
 * (phone_code_hash + temp StringSession) храним в БД. TTL 5 минут.
 */

import { TelegramClient, Api } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import { config } from "../config.js"
import { encryptSession, decryptSession } from "../crypto.js"
import { supabase } from "../db.js"
import { buildClient, primeEntityCache, setClient } from "../sessions/manager.js"
import { registerHandlers } from "../handlers/updates.js"
import { logger } from "../utils/logger.js"

export interface SendCodeResult {
  ok: true
}

export interface SignInResult {
  signed_in: boolean
  requires_2fa: boolean
  tg_user?: {
    id: number
    username?: string
    first_name?: string
    last_name?: string
  }
}

/**
 * Шаг 1. Запросить код.
 */
export async function sendCode(args: {
  user_id: string
  workspace_id: string
  phone: string
}): Promise<SendCodeResult> {
  const stringSession = new StringSession("") // пустая сессия = новый логин
  const client = await buildClient(stringSession)
  await client.connect()

  // try/finally: если sendCode бросит (неверный номер, FLOOD, сеть) — коннект
  // gramjs всё равно закрывается, иначе он «повисал» бы навсегда (утечка).
  let phoneCodeHash: string
  let pendingSessionStr: string
  try {
    ;({ phoneCodeHash } = await client.sendCode(
      {
        apiId: config.TELEGRAM_API_ID,
        apiHash: config.TELEGRAM_API_HASH,
      },
      args.phone,
    ))
    pendingSessionStr = client.session.save() as unknown as string
  } finally {
    // Коннект закрываем в любом случае — на следующем шаге создаётся новый
    // клиент с сохранённой session string.
    await client.disconnect()
  }

  // Подменяем (или создаём) auth state — один пользователь = одна попытка
  // логина в каждый момент.
  const { error: upsertErr } = await supabase
    .from("telegram_mtproto_auth_states")
    .upsert({
      user_id: args.user_id,
      workspace_id: args.workspace_id,
      phone: args.phone,
      phone_code_hash: phoneCodeHash,
      pending_session_encrypted: encryptSession(pendingSessionStr),
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }, { onConflict: "user_id" })
  if (upsertErr) {
    logger.error("[auth.sendCode] upsert error:", upsertErr)
    throw new Error("Failed to persist auth state")
  }

  return { ok: true }
}

/**
 * Шаг 2. Ввод кода. Может потребовать 2FA — тогда возвращаем флаг.
 */
export async function signInWithCode(args: {
  user_id: string
  code: string
}): Promise<SignInResult> {
  const state = await loadAuthState(args.user_id)
  if (!state) throw new Error("No pending auth state — send code first")

  const stringSession = new StringSession(decryptSession(state.pending_session_encrypted))
  const client = await buildClient(stringSession)
  await client.connect()

  try {
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: state.phone,
        phoneCodeHash: state.phone_code_hash,
        phoneCode: args.code,
      }),
    )
  } catch (err) {
    // 2FA включён — Telegram возвращает RPC-ошибку SESSION_PASSWORD_NEEDED.
    // В gramjs она прилетает обычным Error без специального класса,
    // ловим по сообщению.
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("SESSION_PASSWORD_NEEDED")) {
      const partialSessionStr = client.session.save() as unknown as string
      await supabase
        .from("telegram_mtproto_auth_states")
        .update({
          pending_session_encrypted: encryptSession(partialSessionStr),
        })
        .eq("user_id", args.user_id)
      await client.disconnect()
      return { signed_in: false, requires_2fa: true }
    }
    await client.disconnect()
    throw err
  }

  // 2FA не нужно — финализируем.
  return await finalizeAuth(args.user_id, client, state.workspace_id)
}

/**
 * Шаг 3 (опционально). Cloud-пароль 2FA.
 */
export async function signInWithPassword(args: {
  user_id: string
  password: string
}): Promise<SignInResult> {
  const state = await loadAuthState(args.user_id)
  if (!state) throw new Error("No pending auth state — send code first")

  const stringSession = new StringSession(decryptSession(state.pending_session_encrypted))
  const client = await buildClient(stringSession)
  await client.connect()

  try {
    await client.signInWithPassword(
      {
        apiId: config.TELEGRAM_API_ID,
        apiHash: config.TELEGRAM_API_HASH,
      },
      {
        password: async () => args.password,
        onError: (err: unknown) => {
          throw err
        },
      },
    )
  } catch (err) {
    await client.disconnect()
    throw err
  }

  return await finalizeAuth(args.user_id, client, state.workspace_id)
}

/**
 * Сохраняет финальную сессию в БД, регистрирует клиент в менеджере, чистит
 * auth_state. Возвращает данные сотрудника.
 */
async function finalizeAuth(
  userId: string,
  client: TelegramClient,
  workspaceId: string,
): Promise<SignInResult> {
  let me: unknown
  try {
    me = await client.getMe()
  } catch (e) {
    // getMe упал (сеть/сессия) — закрываем коннект, иначе повиснет (утечка).
    await client.disconnect()
    throw e
  }
  // gramjs возвращает Api.User; собираем нужные поля.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = me as any
  const tgUser = {
    id: Number(m.id),
    username: m.username ?? undefined,
    first_name: m.firstName ?? undefined,
    last_name: m.lastName ?? undefined,
  }

  const finalSessionStr = client.session.save() as unknown as string
  const encrypted = encryptSession(finalSessionStr)

  // Глобальная UNIQUE на tg_user_id защищает от попытки привязать один
  // и тот же Telegram-аккаунт к двум разным пользователям сервиса.
  // Если упадёт 23505 — отдадим понятный текст.
  const { error: upsertErr } = await supabase
    .from("telegram_mtproto_sessions")
    .upsert({
      user_id: userId,
      workspace_id: workspaceId,
      session_encrypted: encrypted,
      tg_user_id: tgUser.id,
      tg_username: tgUser.username ?? null,
      tg_first_name: tgUser.first_name ?? null,
      tg_last_name: tgUser.last_name ?? null,
      tg_phone: m.phone ? `+${m.phone}` : null,
      is_active: true,
      connected_at: new Date().toISOString(),
      disconnected_at: null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
  if (upsertErr) {
    await client.disconnect()
    if ((upsertErr as { code?: string }).code === "23505") {
      throw new Error("This Telegram account is already linked to another user")
    }
    throw upsertErr
  }

  // Чистим временное состояние.
  await supabase.from("telegram_mtproto_auth_states").delete().eq("user_id", userId)

  // Регистрируем клиент в менеджере — он останется висеть и обрабатывать
  // апдейты до отключения.
  setClient(userId, client)
  registerHandlers(client, {
    user_id: userId,
    workspace_id: workspaceId,
    tg_user_id: tgUser.id,
  })
  // Прогрев entity-cache, чтобы send/react/read по чистому user_id работали
  // сразу, а не только после первого входящего сообщения от каждого клиента.
  await primeEntityCache(client)

  logger.info(`[auth] signed in: user_id=${userId} tg_user_id=${tgUser.id}`)
  return { signed_in: true, requires_2fa: false, tg_user: tgUser }
}

interface AuthState {
  user_id: string
  workspace_id: string
  phone: string
  phone_code_hash: string
  pending_session_encrypted: string
}

async function loadAuthState(userId: string): Promise<AuthState | null> {
  const { data } = await supabase
    .from("telegram_mtproto_auth_states")
    .select("user_id, workspace_id, phone, phone_code_hash, pending_session_encrypted, expires_at")
    .eq("user_id", userId)
    .maybeSingle()
  if (!data) return null
  if (new Date(data.expires_at as string) < new Date()) {
    await supabase.from("telegram_mtproto_auth_states").delete().eq("user_id", userId)
    return null
  }
  return data as AuthState
}
