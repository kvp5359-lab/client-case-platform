"use client"

/**
 * Состояние и данные окна поиска+фильтров внутри треда.
 * Отдельно от `useMessageSearch` (инлайн-поиск ленты) — оверлей самодостаточен.
 */

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDebounce } from '@/hooks/shared/useDebounce'
import { STALE_TIME } from '@/hooks/queryKeys'
import {
  searchThreadMessages,
  getThreadSenders,
  type ThreadSearchFilters,
} from '@/services/api/messenger/messengerSearchService'
import type { MessageAttachment } from '@/services/api/messenger/messengerService'
import { isImage, isAudioAttachment } from '@/components/messenger/utils/attachmentHelpers'
import { extractLinks } from '@/utils/messenger/extractLinks'

export type ThreadSearchView = 'messages' | 'gallery'
export type ThreadSearchFilterKey = 'files' | 'images' | 'links' | 'audio'

type SenderInfo = { senderName: string; senderAvatarUrl: string | null }
export type GalleryImage = SenderInfo & {
  attachment: MessageAttachment
  messageId: string
  createdAt: string
}
export type GalleryFile = GalleryImage
export type GalleryAudio = GalleryImage
export type GalleryLink = SenderInfo & { url: string; messageId: string; createdAt: string }

type MessageLike = {
  content: string | null
  attachments?: MessageAttachment[] | null
}

/** Счётчики вложений/ссылок по массиву сообщений (для бейджей на кнопках). */
function countAttachments(msgs: MessageLike[]) {
  let images = 0
  let audios = 0
  let files = 0
  let links = 0
  for (const m of msgs) {
    for (const att of m.attachments ?? []) {
      if (isImage(att.mime_type)) images++
      else if (isAudioAttachment(att)) audios++
      else files++
    }
    links += extractLinks(m.content ?? '').length
  }
  return { images, audios, files, links }
}

export function useThreadSearch(threadId: string) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ThreadSearchView>('messages')
  const [wantFiles, setWantFiles] = useState(false)
  const [wantImages, setWantImages] = useState(false)
  const [wantLinks, setWantLinks] = useState(false)
  const [wantAudio, setWantAudio] = useState(false)
  const [senderParticipantId, setSenderParticipantId] = useState<string | null>(null)

  const toggleFilter = useCallback((key: ThreadSearchFilterKey) => {
    if (key === 'files') setWantFiles((v) => !v)
    else if (key === 'images') setWantImages((v) => !v)
    else if (key === 'audio') setWantAudio((v) => !v)
    else setWantLinks((v) => !v)
  }, [])

  const filters: ThreadSearchFilters = useMemo(
    () => ({ wantFiles, wantImages, wantLinks, wantAudio, senderParticipantId }),
    [wantFiles, wantImages, wantLinks, wantAudio, senderParticipantId],
  )

  const debouncedQuery = useDebounce(query, 300)
  const trimmed = debouncedQuery.trim()
  const typeFilter = wantFiles || wantImages || wantLinks || wantAudio
  // Ищем при запросе от 2 символов ИЛИ при активном фильтре (тип/отправитель) —
  // тогда без текста работает как «медиа-вкладка». Иначе окно пустое (подсказка).
  const shouldSearch = trimmed.length >= 2 || typeFilter || senderParticipantId !== null

  // Список отправителей треда для селектора — грузим лениво (при открытом окне).
  const { data: senders = [] } = useQuery({
    queryKey: ['messenger', 'thread-senders', threadId],
    queryFn: () => getThreadSenders(threadId),
    enabled: !!threadId,
    staleTime: STALE_TIME.MEDIUM,
  })

  const { data: messages = [], isFetching: isSearching } = useQuery({
    queryKey: ['messenger', 'thread-search', threadId, trimmed, filters],
    queryFn: () => searchThreadMessages(threadId, trimmed, filters),
    enabled: !!threadId && shouldSearch,
    staleTime: STALE_TIME.SHORT,
  })

  // Общее количество вложений/ссылок в треде (независимо от запроса) — для
  // бейджей на кнопках фильтров: показать «сколько есть» и дизейблить нулевые.
  const { data: allAttachMessages = [] } = useQuery({
    queryKey: ['messenger', 'thread-attach-total', threadId],
    queryFn: () =>
      searchThreadMessages(threadId, '', {
        wantFiles: true,
        wantImages: true,
        wantAudio: true,
        wantLinks: true,
        senderParticipantId: null,
      }),
    enabled: !!threadId,
    staleTime: STALE_TIME.SHORT,
  })
  const totalCounts = useMemo(() => countAttachments(allAttachMessages), [allAttachMessages])

  const { images, audios, files, links } = useMemo(() => {
    // Найденное сообщение может нести смешанные вложения (фото + PDF). Если
    // выбраны конкретные типы — кладём в галерею только их, иначе (чистый текст
    // или только фильтр отправителя) — всё из найденных сообщений.
    const showImages = !typeFilter || wantImages
    const showAudios = !typeFilter || wantAudio
    const showFiles = !typeFilter || wantFiles
    const showLinks = !typeFilter || wantLinks
    const imgs: GalleryImage[] = []
    const auds: GalleryAudio[] = []
    const fls: GalleryFile[] = []
    const lnks: GalleryLink[] = []
    for (const m of messages) {
      const senderName = m.sender
        ? [m.sender.name, m.sender.last_name].filter(Boolean).join(' ')
        : m.sender_name || ''
      const senderAvatarUrl = m.sender?.avatar_url ?? null
      const base = { messageId: m.id, createdAt: m.created_at, senderName, senderAvatarUrl }
      for (const att of m.attachments ?? []) {
        if (isImage(att.mime_type)) {
          if (showImages) imgs.push({ ...base, attachment: att })
        } else if (isAudioAttachment(att)) {
          if (showAudios) auds.push({ ...base, attachment: att })
        } else if (showFiles) {
          fls.push({ ...base, attachment: att })
        }
      }
      if (showLinks) {
        for (const url of extractLinks(m.content)) lnks.push({ ...base, url })
      }
    }
    return { images: imgs, audios: auds, files: fls, links: lnks }
  }, [messages, typeFilter, wantImages, wantAudio, wantFiles, wantLinks])

  return {
    query,
    setQuery,
    view,
    setView,
    filters: { wantFiles, wantImages, wantLinks, wantAudio },
    toggleFilter,
    senders,
    senderParticipantId,
    setSenderParticipantId,
    trimmed,
    shouldSearch,
    isSearching,
    messages,
    images,
    audios,
    files,
    links,
    // Счётчики на кнопках = ОБЩЕЕ число вложений в треде (не текущие результаты),
    // чтобы «Файлы (4)» показывало наличие и до ввода запроса.
    counts: totalCounts,
  }
}
