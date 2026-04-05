"use client"

/**
 * useEmailSuggestionsFilter — фильтрация email-подсказок:
 * - синхронизирует label выбранных email'ов с подсказками
 * - фильтрует подсказки по введённой строке, исключая уже выбранные
 *
 * Выделено из useChatSettingsActions для уменьшения файла.
 */

import { useEffect, useMemo } from 'react'

interface EmailSuggestion {
  email: string
  label: string
}

interface EmailChip {
  email: string
  label: string
}

export function useEmailSuggestionsFilter(
  emailSuggestions: EmailSuggestion[],
  selectedEmails: EmailChip[],
  emailInput: string,
  setSelectedEmails: (updater: (prev: EmailChip[]) => EmailChip[]) => void,
) {
  // Подставляем human-label из подсказок в chips, где label пока равен email
  useEffect(() => {
    if (emailSuggestions.length === 0 || selectedEmails.length === 0) return
    setSelectedEmails((prev) =>
      prev.map((chip) => {
        if (chip.label !== chip.email) return chip
        const match = emailSuggestions.find(
          (s) => s.email.toLowerCase() === chip.email.toLowerCase(),
        )
        return match ? { ...chip, label: match.label } : chip
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailSuggestions])

  const filteredSuggestions = useMemo(() => {
    const selectedSet = new Set(selectedEmails.map((e) => e.email.toLowerCase()))
    const base = emailSuggestions.filter((s) => !selectedSet.has(s.email.toLowerCase()))
    if (!emailInput.trim()) return base
    const q = emailInput.toLowerCase()
    return base.filter(
      (s) => s.email.toLowerCase().includes(q) || s.label.toLowerCase().includes(q),
    )
  }, [emailInput, emailSuggestions, selectedEmails])

  return { filteredSuggestions }
}
