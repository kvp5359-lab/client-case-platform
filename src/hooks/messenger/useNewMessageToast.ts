"use client"

/**
 * Toast notifications for new messenger messages.
 * Workspace-level realtime subscription on project_messages INSERT.
 */

import { useEffect, useId, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { inboxKeys, messengerKeys, sidebarKeys, workspaceKeys } from '@/hooks/queryKeys'
import { getCurrentProjectParticipant, markAsRead } from '@/services/api/messenger/messengerService'
import { readInboxFromCache } from './useInbox'
import type { Workspace } from '@/types/entities'
import { buildToastContent } from './MessageToastContent'
import {
  type RealtimeMessagePayload,
  groupedLines,
  makeGroupKey,
  fetchAvatarUrl,
  parseTextLine,
} from './useMessageToastPayload'
import { playIncomingSound } from './useMessageSound'
import { useNotificationMute } from '@/hooks/useNotificationMute'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import type { TaskItem } from '@/components/tasks/types'

/** Поля строки project_threads из realtime-payload, нужные для тоста «Новый диалог». */
type RealtimeThreadPayload = {
  id: string
  name: string | null
  type: string | null
  project_id: string | null
  workspace_id: string
  owner_user_id: string | null
  status_id: string | null
  deadline: string | null
  accent_color: string | null
  icon: string | null
  is_pinned: boolean | null
  created_at: string | null
  created_by: string | null
  sort_order: number | null
  wazzup_channel_id: string | null
  business_connection_id: string | null
  mtproto_session_user_id: string | null
}

export function useNewMessageToast(workspaceId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const userRef = useRef(user)
  useEffect(() => {
    userRef.current = user
  }, [user])

  // Режим «тишина» — глушит тост новых сообщений и звук. Читаем через ref,
  // чтобы realtime-обработчик внутри подписки видел актуальное значение без
  // переподписки на канал при каждом переключении.
  const { isMuted } = useNotificationMute(workspaceId)
  const isMutedRef = useRef(isMuted)
  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  const myParticipantIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!workspaceId || !user) return
    supabase
      .from('participants')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .then(({ data }) => {
        myParticipantIdsRef.current = new Set(data?.map((p) => p.id) ?? [])
      })
  }, [workspaceId, user])

  // Уникальный ID инстанса — useId() стабилен и безопасен на рендере.
  const instanceId = useId()

  useEffect(() => {
    if (!workspaceId || !user) return

    // Уникальное имя канала для каждого монтирования (защита от React StrictMode)
    const toastChannelName = `msg-toast:${workspaceId}:${instanceId}`

    const channel = supabase
      .channel(toastChannelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        async (payload) => {
          // Режим «тишина» — не показываем тост и не проигрываем звук.
          if (isMutedRef.current) return
          const msg = payload.new as RealtimeMessagePayload
          const msgChannel: 'client' | 'internal' =
            msg.channel === 'internal' ? 'internal' : 'client'

          // Игнорируем «исторические» сообщения — пришли в БД из бэкфилла
          // (MTProto getHistory подтянул старую переписку). Признак: created_at
          // явно в прошлом. Realtime отдаёт INSERT-payload как любое другое
          // событие, но это не «новое» сообщение, для которого нужен звук/toast.
          // Порог 60 секунд — с запасом покрывает clock drift между БД и
          // клиентом, при этом реальные новые входящие точно проходят.
          if (msg.created_at) {
            const ageMs = Date.now() - new Date(msg.created_at).getTime()
            if (ageMs > 60_000) return
          }

          // Не показываем тост на свои же сообщения. Может быть race —
          // participants ещё не загрузились в ref. Тогда подгружаем синхронно.
          if (msg.sender_participant_id) {
            if (myParticipantIdsRef.current.size === 0 && userRef.current) {
              const { data } = await supabase
                .from('participants')
                .select('id')
                .eq('workspace_id', workspaceId)
                .eq('user_id', userRef.current.id)
              myParticipantIdsRef.current = new Set(data?.map((p) => p.id) ?? [])
            }
            if (myParticipantIdsRef.current.has(msg.sender_participant_id)) return
          }

          // Личные диалоги (тред без project_id: TG Business / MTProto / Wazzup /
          // личная почта) — уведомление показываем ТОЛЬКО владельцу диалога.
          // Иначе владелец воркспейса и менеджеры с полным доступом (RLS пускает
          // их ко всем сообщениям) получали бы тосты о чужих личных переписках.
          // Проектные/клиентские треды не трогаем — там уведомление по доступу
          // к проекту это правильно.
          if (!msg.project_id && msg.thread_id) {
            const currentUserId = userRef.current?.id
            const { data: ownerRow } = await supabase
              .from('project_threads')
              .select('owner_user_id')
              .eq('id', msg.thread_id)
              .maybeSingle()
            const ownerUserId =
              (ownerRow as { owner_user_id?: string | null } | null)?.owner_user_id ?? null
            if (ownerUserId && ownerUserId !== currentUserId) return
          }

          // Проектные/клиентские треды: тост только если ты ПОДПИСАН на тред,
          // ЛИБО тебя @упомянули в этом сообщении, ЛИБО это ОТВЕТ на твоё сообщение.
          // Заглушённый (mute) тред не даёт тостов — но прямое упоминание/ответ тебе
          // всё равно «высовывается» (как в Telegram), не снимая mute. Fail-open:
          // при ошибке RPC показываем тост (лучше шум, чем потерять уведомление).
          if (msg.project_id && msg.thread_id) {
            let allowed = true
            const { data: subscribed, error: subErr } = await supabase.rpc(
              'is_thread_subscribed_me',
              { p_thread_id: msg.thread_id },
            )
            if (!subErr) {
              allowed = subscribed === true
              if (!allowed) {
                const myPids = [...myParticipantIdsRef.current]
                if (myPids.length) {
                  // @упоминание меня в этом сообщении
                  const { data: mentioned } = await supabase
                    .from('message_mentions')
                    .select('message_id')
                    .eq('message_id', (payload.new as { id: string }).id)
                    .in('participant_id', myPids)
                    .limit(1)
                  allowed = !!mentioned?.length
                  // ответ на моё сообщение
                  if (!allowed) {
                    const replyToId = (payload.new as { reply_to_message_id?: string | null })
                      .reply_to_message_id
                    if (replyToId) {
                      const { data: orig } = await supabase
                        .from('project_messages')
                        .select('sender_participant_id')
                        .eq('id', replyToId)
                        .maybeSingle()
                      const origSender = (orig as { sender_participant_id?: string | null } | null)
                        ?.sender_participant_id
                      allowed = !!origSender && myParticipantIdsRef.current.has(origSender)
                    }
                  }
                }
              }
            }
            if (!allowed) return
          }

          const ws = queryClient.getQueryData<Workspace>(workspaceKeys.detail(workspaceId))
          const durationSec = ws?.notification_toast_duration ?? 5
          const duration = durationSec === 0 ? Infinity : durationSec * 1000

          // Единый кеш v2 — читаем один раз, достаём и projectName, и accent_color.
          // Кэш теперь infinite (страницы) — readInboxFromCache флэтит их в один массив.
          const cachedThreads = readInboxFromCache(queryClient, workspaceId)
          const threadEntry = cachedThreads?.find((c) => c.thread_id === msg.thread_id)
          // Личные диалоги (project_id=NULL) — суффикс в скобках не показываем,
          // имя отправителя само по себе достаточно. Для проектных тредов —
          // имя проекта, fallback на «Проект» если по какой-то причине не догрузилось.
          const isPersonal = !msg.project_id
          // Имя проекта и имя треда/задачи — для верхней строки `Имя (Проект · Тред)`.
          // Личные диалоги (project_id=NULL) — проект не показываем.
          let projectName: string | null = isPersonal
            ? null
            : (threadEntry?.project_name ?? null)
          let threadName: string | null = threadEntry?.thread_name ?? null
          let accentColor = threadEntry?.thread_accent_color ?? null
          let threadIcon: string | null = threadEntry?.thread_icon ?? null

          // Фоллбэк: если что-то не лежит в inbox-кеше (тред не открывался во
          // «Входящих» / email-тред ещё не попадал в inbox v2), подгружаем
          // напрямую из project_threads (+ имя проекта через join).
          const needFallback =
            !accentColor || !threadIcon || !threadName || (!isPersonal && !projectName)
          if (needFallback && msg.thread_id) {
            const { data: threadRow } = await supabase
              .from('project_threads')
              .select('accent_color, icon, name, projects(name)')
              .eq('id', msg.thread_id)
              .maybeSingle()
            const row = threadRow as
              | {
                  accent_color?: string | null
                  icon?: string | null
                  name?: string | null
                  projects?: { name?: string | null } | null
                }
              | null
            accentColor = accentColor ?? (row?.accent_color ?? null)
            threadIcon = threadIcon ?? (row?.icon ?? null)
            threadName = threadName ?? (row?.name ?? null)
            if (!isPersonal) projectName = projectName ?? (row?.projects?.name ?? null)
          }
          // Последний фоллбэк имени проекта, чтобы не показать пустые скобки.
          if (!isPersonal && !projectName) projectName = 'Проект'

          // Если у входящего email sender_participant_id=NULL, sender_name = email.
          // Подставляем имя контакта из inbox v2, если оно резолвлено через participant.
          const isEmailLike = !!msg.sender_name && /@/.test(msg.sender_name)
          const senderName =
            (isEmailLike && threadEntry?.counterpart_name && !/@/.test(threadEntry.counterpart_name)
              ? threadEntry.counterpart_name
              : msg.sender_name) ?? 'Участник'

          // Прямой 1:1 диалог (WhatsApp / Email / прямой TG-контакт): имя треда =
          // имя контакта = отправитель → в скобках его НЕ показываем. Остаётся
          // только проект (если есть); без проекта — скобок нет вовсе. Прямой TG
          // определяем по совпадению имени треда с отправителем (у TG Business/
          // MTProto тред назван по контакту); WhatsApp/Email — по иконке канала.
          const isDirectChat =
            threadIcon === 'mail' ||
            threadIcon === 'whatsapp' ||
            (!!threadName && threadName === senderName)
          if (isDirectChat) threadName = null

          const messageId = (payload.new as { id: string }).id

          const textLine = await parseTextLine(msg.content, messageId)
          const groupKey = makeGroupKey(msg.project_id, msg.sender_participant_id, msg.thread_id)

          const avatarUrl = msg.sender_participant_id
            ? await fetchAvatarUrl(msg.sender_participant_id)
            : null

          const lines = groupedLines.get(groupKey) ?? []
          lines.push(textLine)
          groupedLines.set(groupKey, lines)

          // Bump project to top in sidebar
          const now = new Date().toISOString()
          for (const canViewAll of [true, false]) {
            const key = sidebarKeys.projects(workspaceId, canViewAll)
            queryClient.setQueryData(
              key,
              (old: { id: string; last_activity_at: string | null }[] | undefined) => {
                if (!old) return old
                return [...old].sort((a, b) => {
                  const aTime = a.id === msg.project_id ? now : (a.last_activity_at ?? '')
                  const bTime = b.id === msg.project_id ? now : (b.last_activity_at ?? '')
                  return bTime.localeCompare(aTime)
                })
              },
            )
          }

          const dismissGroup = () => {
            groupedLines.delete(groupKey)
            toast.dismiss(groupKey)
          }

          const goToChat = async () => {
            dismissGroup()
            if (!msg.thread_id) return

            // Загружаем данные треда для открытия боковой панели
            const { data: thread } = await supabase
              .from('project_threads')
              .select('id, name, type, project_id, workspace_id, status_id, deadline, accent_color, icon, is_pinned, created_at, created_by, sort_order')
              .eq('id', msg.thread_id)
              .eq('is_deleted', false)
              .maybeSingle()

            if (thread) {
              const taskItem: TaskItem = {
                id: thread.id,
                name: thread.name,
                type: thread.type as 'chat' | 'task',
                project_id: thread.project_id,
                workspace_id: thread.workspace_id,
                status_id: thread.status_id,
                deadline: thread.deadline,
                accent_color: thread.accent_color,
                icon: thread.icon,
                is_pinned: thread.is_pinned,
                created_at: thread.created_at,
                created_by: thread.created_by,
                sort_order: thread.sort_order ?? 0,
                project_name: projectName,
              }
              globalOpenThread(taskItem)
            }
          }

          const doMarkAsRead = async () => {
            dismissGroup()
            const currentUser = userRef.current
            if (!currentUser) return
            const participant = await getCurrentProjectParticipant(msg.project_id, currentUser.id)
            if (!participant) return
            if (!msg.thread_id) return
            await markAsRead(participant.participantId, msg.project_id, msgChannel, msg.thread_id)
            queryClient.setQueryData(messengerKeys.unreadCountByThreadId(msg.thread_id), 0)
            queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
            queryClient.invalidateQueries({ queryKey: inboxKeys.unread(workspaceId) })
            queryClient.invalidateQueries({ queryKey: inboxKeys.messageStatuses(workspaceId) })
          }

          playIncomingSound()

          toast.custom(
            () =>
              buildToastContent(
                groupedLines.get(groupKey) ?? [],
                projectName,
                threadName,
                senderName,
                avatarUrl,
                msgChannel,
                goToChat,
                doMarkAsRead,
                dismissGroup,
                accentColor,
                threadIcon,
              ),
            {
              id: groupKey,
              duration,
              onDismiss: () => groupedLines.delete(groupKey),
              onAutoClose: () => groupedLines.delete(groupKey),
            },
          )
        },
      )
      // Тост «Новый диалог» при создании треда внешнего личного диалога.
      // Закрывает кейс: сотрудник пишет клиенту ПЕРВЫМ в TG/WhatsApp — тред
      // создаётся, но в «Непрочитанных» не виден (своё сообщение) и обычный
      // тост сообщения подавлен. Здесь сигнал привязан к самому факту создания
      // треда, поэтому ловит и собственное первое касание. Для входящего нового
      // диалога сработает И этот тост, И обычный тост сообщения — поэтому текст
      // нейтральный, без «вы написали первым».
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_threads',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          // Режим «тишина» — не показываем тост «Новый диалог» и не проигрываем звук.
          if (isMutedRef.current) return
          const t = payload.new as RealtimeThreadPayload

          // Только свежесозданные — отсекаем возможный реплей старых строк.
          if (t.created_at) {
            const ageMs = Date.now() - new Date(t.created_at).getTime()
            if (ageMs > 60_000) return
          }

          // Только ЛИЧНЫЕ диалоги с внешним каналом (WhatsApp / TG Business /
          // MTProto), принадлежащие текущему пользователю. Исключает внутренние
          // треды и задачи (нет внешней привязки) и чужие личные диалоги.
          const isExternalDialog =
            !!t.wazzup_channel_id || !!t.business_connection_id || !!t.mtproto_session_user_id
          if (!isExternalDialog) return
          if (!t.owner_user_id || t.owner_user_id !== userRef.current?.id) return

          const ws = queryClient.getQueryData<Workspace>(workspaceKeys.detail(workspaceId))
          const durationSec = ws?.notification_toast_duration ?? 5
          const duration = durationSec === 0 ? Infinity : durationSec * 1000

          // У MTProto при первом исходящем имя — плейсхолдер `tg:<id>`
          // (резолвится при ответе). Плейсхолдеры/@username не показываем —
          // лучше нейтральное «Новый диалог», чем «Новый диалог: tg:12345».
          const raw = (t.name ?? '').trim()
          const isPlaceholder = !raw || /^tg:/i.test(raw) || raw.startsWith('@')
          const title = isPlaceholder ? 'Новый диалог' : `Новый диалог: ${raw}`
          const channelLabel = t.wazzup_channel_id ? 'WhatsApp' : 'Telegram'

          playIncomingSound()

          toast(title, {
            id: `new-thread:${t.id}`,
            description: channelLabel,
            duration,
            action: {
              label: 'Открыть',
              onClick: () => {
                const taskItem: TaskItem = {
                  id: t.id,
                  name: t.name ?? 'Диалог',
                  type: (t.type as 'chat' | 'task') ?? 'chat',
                  project_id: t.project_id ?? null,
                  workspace_id: t.workspace_id,
                  status_id: t.status_id ?? null,
                  deadline: t.deadline ?? null,
                  accent_color: t.accent_color ?? 'blue',
                  icon: t.icon ?? 'message-square',
                  is_pinned: t.is_pinned ?? false,
                  created_at: t.created_at ?? '',
                  created_by: t.created_by ?? null,
                  sort_order: t.sort_order ?? 0,
                  project_name: null,
                }
                globalOpenThread(taskItem)
              },
            },
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, user, queryClient, instanceId])
}
