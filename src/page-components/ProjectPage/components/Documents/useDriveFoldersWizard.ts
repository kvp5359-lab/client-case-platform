"use client"

/**
 * Логика двухшагового мастера создания папок набора документов на Google Drive
 * (состояние шагов, нумерация подпапок, создание целевой папки/подпапок/папки
 * проекта). Вынесено из CreateDriveFoldersDialog — компонент остался рендером.
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { extractGoogleDriveFolderId } from '@/utils/googleDrive'
import { logger } from '@/utils/logger'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import type { DriveFolderRef } from '@/components/google-drive/DriveFolderTreePicker'

export type SubItem = {
  id: string
  name: string
}

/** Снять ведущий «N. » с имени. */
export function stripNumber(name: string): string {
  return name.replace(/^\s*\d+\.\s*/, '')
}

/** Снять ведущий «N. » и проставить новую сквозную нумерацию от `start`. */
export function renumber(items: SubItem[], start: number): SubItem[] {
  return items.map((it, i) => ({
    ...it,
    name: `${start + i}. ${stripNumber(it.name)}`,
  }))
}

/** Применить/снять нумерацию ко всему списку. */
export function applyNumbering(items: SubItem[], numbered: boolean, start: number): SubItem[] {
  return numbered
    ? renumber(items, start)
    : items.map((it) => ({ ...it, name: stripNumber(it.name) }))
}

export function useDriveFoldersWizard(params: {
  open: boolean
  kit: DocumentKitWithDocuments | null
  googleDriveFolderLink: string | null | undefined
  workspaceId: string
  onCreateProjectFolder?: (folderName: string) => Promise<void>
  defaultProjectFolderName?: string | null
  onOpenChange: (open: boolean) => void
}) {
  const {
    open,
    kit,
    googleDriveFolderLink,
    workspaceId,
    onCreateProjectFolder,
    defaultProjectFolderName,
    onOpenChange,
  } = params

  const [step, setStep] = useState<1 | 2>(1)
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [numbered, setNumbered] = useState(true)
  const [startNumber, setStartNumber] = useState(1)
  const [subItems, setSubItems] = useState<SubItem[]>([])
  const [targetFolder, setTargetFolder] = useState<DriveFolderRef | null>(null)
  const [isCreatingTarget, setIsCreatingTarget] = useState(false)
  const [isCreatingSubs, setIsCreatingSubs] = useState(false)
  const [projectFolderName, setProjectFolderName] = useState('')
  const [isCreatingProjectFolder, setIsCreatingProjectFolder] = useState(false)

  const projectFolderId = googleDriveFolderLink
    ? extractGoogleDriveFolderId(googleDriveFolderLink)
    : null

  useEffect(() => {
    if (open && kit) {
      setStep(1)
      setNewFolderName(kit.name)
      setProjectFolderName(defaultProjectFolderName || kit.name || '')
      setNumbered(true)
      setStartNumber(1)
      setSubItems(
        renumber(
          (kit.folders || []).map((f) => ({ id: f.id, name: f.name })),
          1,
        ),
      )
      setShowNewFolderInput(false)
      setReloadKey(0)
      setSelectedFolderId(null)
      setTargetFolder(null)
      setIsCreatingTarget(false)
      setIsCreatingSubs(false)
      setIsCreatingProjectFolder(false)
    }
  }, [open, kit]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnectProjectFolder = async () => {
    if (!onCreateProjectFolder || !projectFolderName.trim()) return
    setIsCreatingProjectFolder(true)
    try {
      await onCreateProjectFolder(projectFolderName.trim())
    } catch (error) {
      logger.error('Failed to create project folder:', error)
    } finally {
      setIsCreatingProjectFolder(false)
    }
  }

  const handleSelectTarget = (folder: DriveFolderRef) => {
    setSelectedFolderId(folder.id)
    setTargetFolder(folder)
    setShowNewFolderInput(false)
  }

  const handleCreateTargetFolder = async () => {
    if (!projectFolderId || !newFolderName.trim()) return
    const name = newFolderName.trim()
    const parentId = targetFolder?.id ?? projectFolderId
    setIsCreatingTarget(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-create-folder', {
        body: { workspaceId, parentFolderId: parentId, folderName: name },
      })
      if (error) throw error
      if (data?.error) {
        toast.error(
          data.error === 'Google Drive not connected' ? 'Google Drive не подключён' : data.error,
        )
        return
      }
      const created = { id: data.folderId as string, name }
      setTargetFolder(created)
      setSelectedFolderId(created.id)
      setShowNewFolderInput(false)
      toast.success(`Папка «${name}» создана`)
      setReloadKey((k) => k + 1)
    } catch (error) {
      logger.error('Failed to create target folder:', error)
      toast.error('Не удалось создать папку')
    } finally {
      setIsCreatingTarget(false)
    }
  }

  const handleToggleNumbered = (checked: boolean) => {
    setNumbered(checked)
    setSubItems((prev) => applyNumbering(prev, checked, startNumber))
  }

  const handleStartNumberChange = (raw: string) => {
    const parsed = parseInt(raw, 10)
    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1
    setStartNumber(next)
    setSubItems((prev) => renumber(prev, next))
  }

  const handleFolderNameChange = (id: string, name: string) => {
    setSubItems((prev) => prev.map((it) => (it.id === id ? { ...it, name } : it)))
  }

  const handleRemoveFolder = (id: string) => {
    setSubItems((prev) => applyNumbering(prev.filter((it) => it.id !== id), numbered, startNumber))
  }

  const validNames = subItems.map((it) => it.name).filter((n) => n.trim())

  const handleCreateSubfolders = async () => {
    if (!targetFolder) return

    if (validNames.length === 0) {
      toast.error('Нет папок для создания')
      return
    }

    setIsCreatingSubs(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-create-folder', {
        body: {
          action: 'batch',
          workspaceId,
          parentFolderId: targetFolder.id,
          subfolderNames: validNames,
        },
      })

      if (error) throw error
      if (data?.error) {
        toast.error(
          data.error === 'Google Drive not connected' ? 'Google Drive не подключён' : data.error,
        )
        return
      }

      toast.success(`Создано ${data?.created?.length || 0} подпапок`)
      onOpenChange(false)
    } catch (error) {
      logger.error('Failed to create subfolders:', error)
      toast.error('Не удалось создать подпапки')
    } finally {
      setIsCreatingSubs(false)
    }
  }

  return {
    step,
    setStep,
    showNewFolderInput,
    setShowNewFolderInput,
    newFolderName,
    setNewFolderName,
    reloadKey,
    selectedFolderId,
    numbered,
    startNumber,
    subItems,
    targetFolder,
    isCreatingTarget,
    isCreatingSubs,
    projectFolderName,
    setProjectFolderName,
    isCreatingProjectFolder,
    projectFolderId,
    validNames,
    handleConnectProjectFolder,
    handleSelectTarget,
    handleCreateTargetFolder,
    handleToggleNumbered,
    handleStartNumberChange,
    handleFolderNameChange,
    handleRemoveFolder,
    handleCreateSubfolders,
  }
}
