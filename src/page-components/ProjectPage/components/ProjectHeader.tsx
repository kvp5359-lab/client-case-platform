"use client"

/**
 * Заголовок проекта: название (inline-редактирование) + шаблон + аватарки участников по ролям.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Pencil, Check, X } from 'lucide-react'
import { logger } from '@/utils/logger'
import { ParticipantAvatars } from '@/components/participants/ParticipantAvatars'
import type { RoleGroup } from '../hooks/useProjectHeaderParticipants'
import type { UseMutationResult } from '@tanstack/react-query'

interface ProjectHeaderProps {
  projectName: string
  canEdit: boolean
  updateProjectName: UseMutationResult<unknown, Error, string>
  templateName?: string | null
  participantGroups?: RoleGroup[]
}

export function ProjectHeader({
  projectName,
  canEdit,
  updateProjectName,
  templateName,
  participantGroups,
}: ProjectHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState('')

  const handleStartEdit = () => {
    setEditedName(projectName)
    setIsEditing(true)
  }

  const handleSaveName = async () => {
    if (editedName.trim() && editedName !== projectName) {
      try {
        await updateProjectName.mutateAsync(editedName.trim())
        toast.success('Название обновлено')
      } catch (error) {
        logger.error('Ошибка обновления названия проекта:', error)
        toast.error('Не удалось обновить название проекта', {
          description: error instanceof Error ? error.message : undefined,
        })
      }
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditedName('')
  }

  const hasGroups = participantGroups && participantGroups.length > 0

  return (
    <div className="flex items-baseline gap-2">
      {isEditing ? (
        <div className="flex items-center gap-2 w-full">
          <input
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            className="text-2xl font-bold bg-transparent border-none outline-none focus:ring-0 p-0 w-full"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveName()
              if (e.key === 'Escape') handleCancelEdit()
            }}
          />
          <Button size="sm" onClick={handleSaveName}>
            <Check className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <>
          {canEdit ? (
            <div
              onClick={handleStartEdit}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleStartEdit()
                }
              }}
              className="relative text-2xl font-bold hover:text-primary transition-colors cursor-pointer group shrink-0"
            >
              {projectName}
              <Pencil className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity absolute -right-5 top-1/2 -translate-y-1/2" />
            </div>
          ) : (
            <h1 className="text-2xl font-bold shrink-0">{projectName}</h1>
          )}

          {templateName && (
            <>
              <div className="self-center w-px h-5 bg-gray-200" />
              <span className="text-2xl font-bold text-gray-300 shrink-0">{templateName}</span>
            </>
          )}

          {hasGroups && (
            <div className="self-center flex items-center gap-1.5">
              <div className="w-px h-5 bg-gray-200 shrink-0 mr-0.5" />
              {participantGroups.map((group, idx) => (
                <div key={group.role} className="flex items-center gap-1.5 shrink-0">
                  {idx > 0 && <span className="text-gray-300 text-xs shrink-0">·</span>}
                  <ParticipantAvatars participants={group.participants} maxVisible={3} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
