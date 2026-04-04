"use client"

/**
 * Хук для управления списком email-чипов с подсказками из участников workspace.
 * Используется в ThreadTemplateDialog (режим email).
 */

import { useState, useMemo } from 'react'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import type { EmailChip } from '@/components/templates/EmailRecipientInput'

export function useEmailChips(initialEmails: EmailChip[], participants: WorkspaceParticipant[]) {
  const [selectedEmails, setSelectedEmails] = useState<EmailChip[]>(initialEmails)
  const [emailInput, setEmailInput] = useState('')
  const [emailDropdownOpen, setEmailDropdownOpen] = useState(false)

  const emailSuggestions = useMemo(() => {
    return participants
      .filter((p) => p.email && !p.email.endsWith('@telegram.placeholder'))
      .map((p) => ({
        email: p.email!,
        label: [p.name, p.last_name].filter(Boolean).join(' ') || p.email!,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [participants])

  const enrichedEmails = useMemo(() => {
    if (participants.length === 0) return selectedEmails
    return selectedEmails.map((chip) => {
      if (chip.label !== chip.email) return chip
      const p = participants.find((pp) => pp.email?.toLowerCase() === chip.email.toLowerCase())
      if (!p) return chip
      const label = [p.name, p.last_name].filter(Boolean).join(' ')
      return label ? { ...chip, label } : chip
    })
  }, [selectedEmails, participants])

  const filteredEmailSuggestions = useMemo(() => {
    const selectedSet = new Set(enrichedEmails.map((e) => e.email.toLowerCase()))
    const base = emailSuggestions.filter((s) => !selectedSet.has(s.email.toLowerCase()))
    if (!emailInput.trim()) return base
    const q = emailInput.toLowerCase()
    return base.filter(
      (s) => s.email.toLowerCase().includes(q) || s.label.toLowerCase().includes(q),
    )
  }, [emailInput, emailSuggestions, enrichedEmails])

  const addChip = (chip: EmailChip) => setSelectedEmails((prev) => [...prev, chip])
  const removeChip = (email: string) =>
    setSelectedEmails((prev) => prev.filter((x) => x.email !== email))
  const removeLast = () => setSelectedEmails((prev) => prev.slice(0, -1))

  return {
    enrichedEmails,
    emailInput,
    setEmailInput,
    emailDropdownOpen,
    setEmailDropdownOpen,
    filteredEmailSuggestions,
    addChip,
    removeChip,
    removeLast,
  }
}
