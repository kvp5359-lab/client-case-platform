/**
 * TemplatesTab - вкладка управления шаблонами
 *
 * Соответствует таблицам БД:
 * - project_templates (Типы проектов)
 * - form_templates (Шаблоны анкет)
 * - field_definitions (Шаблоны полей)
 * - document_kit_templates (Шаблоны наборов)
 * - folder_templates (Шаблоны папок)
 * - document_templates (Шаблоны документов для генерации DOCX)
 */

import { useParams, useRouter, usePathname } from 'next/navigation'
import { ProjectTemplatesContent } from '@/components/templates/ProjectTemplatesContent'
import { FormTemplatesContent } from '@/components/templates/FormTemplatesContent'
import { FieldTemplatesContent } from '@/components/templates/FieldTemplatesContent'
import { DocumentKitTemplatesContent } from '@/components/templates/DocumentKitTemplatesContent'
import { FolderTemplatesContent } from '@/components/templates/FolderTemplatesContent'
import { SlotTemplatesContent } from '@/components/templates/SlotTemplatesContent'
import { DocumentTemplatesContent } from '@/components/templates/DocumentTemplatesContent'
import { ThreadTemplatesContent } from '@/components/templates/ThreadTemplatesContent'
import { SettingsSubNav, type SettingsSubNavGroup } from './components/SettingsSubNav'

type TemplateSection =
  | 'project-templates' // project_templates
  | 'form-templates' // form_templates
  | 'field-templates' // field_definitions
  | 'document-kit-templates' // document_kit_templates
  | 'folder-templates' // folder_templates
  | 'slot-templates' // slot_templates
  | 'document-templates' // document_templates
  | 'thread-templates' // thread_templates

export function TemplatesTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const pathname = usePathname()

  // Определяем активную секцию по URL
  const getActiveSection = (): TemplateSection => {
    const path = pathname.split('/').pop()
    const validSections: TemplateSection[] = [
      'project-templates',
      'form-templates',
      'field-templates',
      'document-kit-templates',
      'folder-templates',
      'slot-templates',
      'document-templates',
      'thread-templates',
    ]
    return validSections.includes(path as TemplateSection)
      ? (path as TemplateSection)
      : 'project-templates'
  }

  const activeSection = getActiveSection()

  const menuItems = [
    {
      id: 'project-templates' as const,
      label: 'Шаблоны проектов',
      dbTable: 'project_templates',
    },
    {
      id: 'form-templates' as const,
      label: 'Шаблоны анкет',
      dbTable: 'form_templates',
    },
    {
      id: 'field-templates' as const,
      label: 'Шаблоны полей',
      dbTable: 'field_definitions',
    },
    {
      id: 'document-kit-templates' as const,
      label: 'Шаблоны наборов',
      dbTable: 'document_kit_templates',
    },
    {
      id: 'folder-templates' as const,
      label: 'Шаблоны папок',
      dbTable: 'folder_templates',
    },
    {
      id: 'slot-templates' as const,
      label: 'Шаблоны слотов',
      dbTable: 'slot_templates',
    },
    {
      id: 'document-templates' as const,
      label: 'Шаблоны документов',
      dbTable: 'document_templates',
    },
    {
      id: 'thread-templates' as const,
      label: 'Шаблоны тредов',
      dbTable: 'thread_templates',
    },
  ]

  const handleSectionChange = (section: string) => {
    router.push(`/workspaces/${workspaceId}/settings/templates/${section}`)
  }

  const byId = (id: TemplateSection) => {
    const m = menuItems.find((x) => x.id === id)!
    return { id: m.id, label: m.label }
  }
  const groups: SettingsSubNavGroup[] = [
    { items: [byId('project-templates')] },
    { title: 'Анкеты', items: [byId('form-templates'), byId('field-templates')] },
    {
      title: 'Наборы документов',
      items: [byId('document-kit-templates'), byId('folder-templates'), byId('slot-templates')],
    },
    { title: 'Треды', items: [byId('thread-templates')] },
    { title: 'Генерация', items: [byId('document-templates')] },
  ]

  return (
    <div className="flex bg-white rounded-lg border min-h-[500px]">
      <SettingsSubNav groups={groups} activeId={activeSection} onSelect={handleSectionChange} />

      {/* Контент */}
      <div className="flex-1 min-w-0 p-6 overflow-hidden">
        {activeSection === 'project-templates' && <ProjectTemplatesContent />}
        {activeSection === 'form-templates' && <FormTemplatesContent />}
        {activeSection === 'field-templates' && <FieldTemplatesContent workspaceId={workspaceId} />}
        {activeSection === 'document-kit-templates' && <DocumentKitTemplatesContent />}
        {activeSection === 'folder-templates' && <FolderTemplatesContent />}
        {activeSection === 'slot-templates' && <SlotTemplatesContent />}
        {activeSection === 'document-templates' && <DocumentTemplatesContent />}
        {activeSection === 'thread-templates' && <ThreadTemplatesContent />}
      </div>
    </div>
  )
}
