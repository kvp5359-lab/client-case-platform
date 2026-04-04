"use client"

/**
 * Секция «Основное» на вкладке Настройки проекта
 * Поля: статус, дедлайн, шаблон, описание
 */

import { useRef } from 'react'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ProjectStatusSelector } from './ProjectStatusSelector'
import { ProjectDeadlinePicker } from './ProjectDeadlinePicker'
import type { Project } from '../types'

interface ProjectTemplate {
  id: string
  name: string
}

interface ProjectSettingsSectionProps {
  project: Project
  templateName: string | null
  templates: ProjectTemplate[]
  canEditProjectInfo: boolean
  onStatusChange: (status: string) => void
  onDeadlineChange: (date: Date | undefined) => void
  onDescriptionChange: (description: string) => void
  onTemplateChange: (templateId: string | null) => void
}

export function ProjectSettingsSection({
  project,
  templateName,
  templates,
  canEditProjectInfo,
  onStatusChange,
  onDeadlineChange,
  onDescriptionChange,
  onTemplateChange,
}: ProjectSettingsSectionProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleDescriptionBlur = () => {
    const trimmed = (textareaRef.current?.value || '').trim()
    const current = project.description || ''
    if (trimmed !== current) {
      onDescriptionChange(trimmed)
    }
  }

  return (
    <div className="grid grid-cols-[140px_1fr] gap-y-4 items-center text-sm">
      {/* Статус */}
      <label className="font-medium text-muted-foreground">Статус</label>
      <div>
        <ProjectStatusSelector
          project={project}
          onStatusChange={onStatusChange}
          disabled={!canEditProjectInfo}
        />
      </div>

      {/* Дедлайн */}
      <label className="font-medium text-muted-foreground">Дедлайн</label>
      <div>
        <ProjectDeadlinePicker
          project={project}
          onDeadlineChange={onDeadlineChange}
          disabled={!canEditProjectInfo}
        />
      </div>

      {/* Шаблон */}
      <label className="font-medium text-muted-foreground">Шаблон</label>
      <div>
        {canEditProjectInfo && templates.length > 0 ? (
          <Select
            value={project.template_id ?? 'none'}
            onValueChange={(value) => onTemplateChange(value === 'none' ? null : value)}
            disabled={!canEditProjectInfo}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Без шаблона</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : templateName ? (
          <span>{templateName}</span>
        ) : (
          <span className="text-muted-foreground">Без шаблона</span>
        )}
      </div>

      {/* Описание */}
      <label className="font-medium text-muted-foreground self-start pt-2">Описание</label>
      <div>
        <Textarea
          ref={textareaRef}
          key={project.description ?? ''}
          defaultValue={project.description || ''}
          onBlur={handleDescriptionBlur}
          placeholder="Описание проекта..."
          rows={3}
          disabled={!canEditProjectInfo}
          className="resize-none"
        />
      </div>
    </div>
  )
}
