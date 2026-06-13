import { useState, useMemo, useCallback } from 'react'
import { useTranslateMessage } from '@/hooks/messenger/useTranslateMessage'
import { useMyPreferredLanguage } from '@/hooks/useMyPreferredLanguage'
import { useThreadTranslations } from '@/hooks/messenger/useThreadTranslations'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'

/**
 * Перевод сообщения (унифицированно для двух источников), вынесен из MessageBubble.
 *
 * (A) Кэш перевода входящего: `message_translations` на моём preferred_language.
 * (B) Отправленный перевод: автор писал на своём языке, в БД ушёл перевод,
 *     оригинал лежит в `message.original_content`. Виден только автору.
 *
 * Источник нормализуется в `translationSource`; логика toggle/подмены контента
 * одна на оба случая. Возвращает контент для рендера по текущему `viewMode`.
 */
export function useMessageTranslation(message: ProjectMessage, isOwn: boolean) {
  const { data: preferredLang } = useMyPreferredLanguage()
  const { data: threadTranslations } = useThreadTranslations(
    message.thread_id ?? undefined,
    preferredLang ?? undefined,
  )
  const existingTranslation = useMemo(
    () => threadTranslations?.find((t) => t.message_id === message.id) ?? null,
    [threadTranslations, message.id],
  )

  // Унифицированный «оригинал ↔ перевод» pair.
  const translationSource = useMemo(() => {
    // (B) — приоритет, потому что для автора это его собственное намерение
    // (перевёл и отправил), не зависит от текущего preferred_language.
    if (isOwn && message.original_content) {
      return {
        kind: 'sent' as const,
        originalContent: message.original_content,
        originalLanguage: message.original_language ?? null,
        translatedContent: message.content,
        // Target language для отправленных не сохраняли — известно только что
        // это «язык клиента»; в пилюле показываем иконку без кода.
        targetLanguage: null as string | null,
      }
    }
    if (existingTranslation) {
      return {
        kind: 'received' as const,
        originalContent: message.content,
        originalLanguage: existingTranslation.source_language ?? null,
        translatedContent: existingTranslation.translated_content,
        targetLanguage: existingTranslation.target_language,
      }
    }
    return null
  }, [isOwn, message.content, message.original_content, message.original_language, existingTranslation])

  // viewMode: какой контент показывать ВНУТРИ баббла.
  // Дефолт для отправленных — 'translation' (то, что реально ушло клиенту).
  // Дефолт для входящих — 'original' (как клиент написал).
  const [viewMode, setViewMode] = useState<'original' | 'translation'>(() =>
    isOwn && message.original_content ? 'translation' : 'original',
  )
  const translateMutation = useTranslateMessage()
  const handleTranslate = useCallback(() => {
    const target = preferredLang || 'ru'
    translateMutation.mutate(
      { messageId: message.id, targetLanguage: target, threadId: message.thread_id ?? undefined },
      {
        onSuccess: () => {
          // После успешного перевода переключаемся на показ перевода в баббле.
          setViewMode('translation')
        },
      },
    )
  }, [preferredLang, translateMutation, message.id, message.thread_id])
  const handleToggleViewMode = useCallback(() => {
    setViewMode((m) => (m === 'translation' ? 'original' : 'translation'))
  }, [])

  // Финальный контент: если есть translationSource — берём из него по viewMode,
  // иначе обычный message.content.
  const displayContent = translationSource
    ? viewMode === 'translation'
      ? translationSource.translatedContent
      : translationSource.originalContent
    : message.content
  const displayMessage = useMemo(
    () => (displayContent === message.content ? message : { ...message, content: displayContent }),
    [message, displayContent],
  )

  return {
    displayContent,
    displayMessage,
    translationSource,
    viewMode,
    handleTranslate,
    handleToggleViewMode,
    isTranslating: translateMutation.isPending,
  }
}
