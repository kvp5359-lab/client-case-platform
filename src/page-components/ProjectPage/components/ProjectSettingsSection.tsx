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
import { ProjectStatusPopover } from '@/components/projects/ProjectStatusPopover'
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
    <div className="space-y-4 text-sm">
      {/* Компактная строка под вкладками: статус, дедлайн, шаблон без подписей */}
      <div className="flex flex-wrap items-stretch gap-2">
        {/* Статус — тот же стиль, что и в шапке проекта (только высотой h-8) */}
        <ProjectStatusPopover
          workspaceId={project.workspace_id}
          projectTemplateId={project.template_id}
          currentStatusId={project.status_id ?? null}
          onChange={onStatusChange}
          disabled={!canEditProjectInfo}
          size="md"
        />
        {/* Дедлайн — оборачиваем в контур, узкий блок под формат даты */}
        <div className="h-8 w-[150px] inline-flex items-center px-2 rounded-md border bg-background">
          <ProjectDeadlinePicker
            project={project}
            onDeadlineChange={onDeadlineChange}
            disabled={!canEditProjectInfo}
          />
        </div>
        {/* Шаблон */}
        {canEditProjectInfo && templates.length > 0 ? (
          <Select
            value={project.template_id ?? 'none'}
            onValueChange={(value) => onTemplateChange(value === 'none' ? null : value)}
            disabled={!canEditProjectInfo}
          >
            <SelectTrigger className="w-[220px] h-8">
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
        ) : (
          <div className="h-8 inline-flex items-center px-2 rounded-md border text-muted-foreground bg-background">
            {templateName ?? 'Без шаблона'}
          </div>
        )}
      </div>

      {/* Описание — отдельным блоком ниже */}
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
  )
}
