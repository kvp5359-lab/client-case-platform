"use client"

/**
 * Логика двухшагового мастера создания папок набора документов на Google Drive
 * (состояние шагов, нумерация подпапок, создание целевой папки/подпапок/папки
 * проекта). Вынесено из CreateDriveFoldersDialog — компонент остался рендером.
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { documentKitKeys, projectShareableKeys } from '@/hooks/queryKeys'
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

  const qc = useQueryClient()

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

  /**
   * Привязать Drive-папку к набору сразу (не дожидаясь шага 2 «Подпапки»).
   * Без этого папка, созданную кнопкой «Новая папка», существовала только на
   * Диске и в состоянии формы — во «Внешних» она появлялась лишь после создания
   * подпапок. Best-effort: ошибку логируем, но не мешаем работе мастера.
   * Инвалидируем список наборов и сборщик ссылок пикера («Внешние»).
   */
  const linkDriveFolderToKit = async (folderId: string) => {
    if (!kit || kit.drive_folder_id === folderId) return
    try {
      await supabase.from('document_kits').update({ drive_folder_id: folderId }).eq('id', kit.id)
      qc.invalidateQueries({ queryKey: documentKitKeys.byProject(kit.project_id) })
      qc.invalidateQueries({ queryKey: projectShareableKeys.byProject(kit.project_id) })
    } catch (error) {
      logger.error('Failed to link drive folder to kit:', error)
    }
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
      // Сразу привязываем созданную папку к набору → появляется во «Внешних»,
      // даже если пользователь закроет мастер, не создав подпапки (шаг 2).
      await linkDriveFolderToKit(created.id)
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

      // Сохраняем созданные папки Drive обратно в сервис: id целевой папки —
      // в набор документов, id подпапок — в соответствующие папки (по имени).
      // Так ссылки не теряются и попадают в шеринг клиенту. Ошибки сохранения
      // не мешают успеху (папки на Drive уже созданы).
      const targetId = data?.targetFolderId as string | undefined
      const created = (data?.created ?? []) as Array<{ name: string; id: string }>
      if (kit && targetId) {
        try {
          const saves: Promise<unknown>[] = [
            Promise.resolve(
              supabase.from('document_kits').update({ drive_folder_id: targetId }).eq('id', kit.id),
            ),
          ]
          const idByName = new Map(created.map((c) => [c.name, c.id]))
          for (const it of subItems) {
            const folderDriveId = idByName.get(it.name.trim())
            if (folderDriveId) {
              saves.push(
                Promise.resolve(
                  supabase.from('folders').update({ drive_folder_id: folderDriveId }).eq('id', it.id),
                ),
              )
            }
          }
          await Promise.allSettled(saves)
          // Обновить пикер ссылок («Внешние») и список наборов без перезагрузки.
          qc.invalidateQueries({ queryKey: documentKitKeys.byProject(kit.project_id) })
          qc.invalidateQueries({ queryKey: projectShareableKeys.byProject(kit.project_id) })
        } catch (saveErr) {
          logger.error('Failed to save drive folder links:', saveErr)
        }
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
