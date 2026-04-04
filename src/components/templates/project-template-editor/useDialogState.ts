/**
 * Хук для управления состоянием диалогов добавления шаблонов
 */

import { useState, useCallback } from 'react'

interface DialogState {
  isOpen: boolean
  selectedIds: string[]
}

const INITIAL: DialogState = { isOpen: false, selectedIds: [] }

export function useDialogState() {
  const [forms, setForms] = useState<DialogState>(INITIAL)
  const [docKits, setDocKits] = useState<DialogState>(INITIAL)
  const [knowledge, setKnowledge] = useState<DialogState>(INITIAL)

  const openForms = useCallback(() => setForms({ isOpen: true, selectedIds: [] }), [])
  const closeForms = useCallback(() => setForms(INITIAL), [])
  const toggleFormSelection = useCallback(
    (id: string) =>
      setForms((prev) => ({
        ...prev,
        selectedIds: prev.selectedIds.includes(id)
          ? prev.selectedIds.filter((x) => x !== id)
          : [...prev.selectedIds, id],
      })),
    [],
  )

  const openDocKits = useCallback(() => setDocKits({ isOpen: true, selectedIds: [] }), [])
  const closeDocKits = useCallback(() => setDocKits(INITIAL), [])
  const toggleDocKitSelection = useCallback(
    (id: string) =>
      setDocKits((prev) => ({
        ...prev,
        selectedIds: prev.selectedIds.includes(id)
          ? prev.selectedIds.filter((x) => x !== id)
          : [...prev.selectedIds, id],
      })),
    [],
  )

  const openKnowledge = useCallback(() => setKnowledge({ isOpen: true, selectedIds: [] }), [])
  const closeKnowledge = useCallback(() => setKnowledge(INITIAL), [])
  const toggleKnowledgeSelection = useCallback(
    (id: string) =>
      setKnowledge((prev) => ({
        ...prev,
        selectedIds: prev.selectedIds.includes(id)
          ? prev.selectedIds.filter((x) => x !== id)
          : [...prev.selectedIds, id],
      })),
    [],
  )

  return {
    forms: {
      ...forms,
      open: openForms,
      close: closeForms,
      toggle: toggleFormSelection,
      setOpen: (v: boolean) => (v ? openForms() : closeForms()),
    },
    docKits: {
      ...docKits,
      open: openDocKits,
      close: closeDocKits,
      toggle: toggleDocKitSelection,
      setOpen: (v: boolean) => (v ? openDocKits() : closeDocKits()),
    },
    knowledge: {
      ...knowledge,
      open: openKnowledge,
      close: closeKnowledge,
      toggle: toggleKnowledgeSelection,
      setOpen: (v: boolean) => (v ? openKnowledge() : closeKnowledge()),
    },
  }
}
