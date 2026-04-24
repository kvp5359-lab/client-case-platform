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

  const handleSectionChange = (section: TemplateSection) => {
    router.push(`/workspaces/${workspaceId}/settings/templates/${section}`)
  }

  const renderMenuItem = (item: (typeof menuItems)[0]) => (
    <button
      key={item.id}
      onClick={() => handleSectionChange(item.id)}
      className={`
        w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors
        ${
          activeSection === item.id
            ? 'bg-amber-100 text-amber-900 font-medium'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }
      `}
    >
      {item.label}
    </button>
  )

  return (
    <div className="flex bg-white rounded-lg border min-h-[500px]">
      {/* Боковая навигация в стиле Notion */}
      <aside className="w-56 border-r bg-white p-3 flex-shrink-0">
        <nav className="space-y-1">
          {/* Типы проектов (project_templates) */}
          {renderMenuItem(menuItems[0])}

          {/* Секция АНКЕТЫ */}
          <div className="pt-4">
            <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
              Анкеты
            </p>
            <div className="space-y-0.5 pl-2">
              {renderMenuItem(menuItems[1])} {/* form_templates */}
              {renderMenuItem(menuItems[2])} {/* field_definitions */}
            </div>
          </div>

          {/* Секция НАБОРЫ ДОКУМЕНТОВ */}
          <div className="pt-4">
            <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
              Наборы документов
            </p>
            <div className="space-y-0.5 pl-2">
              {renderMenuItem(menuItems[3])} {/* document_kit_templates */}
              {renderMenuItem(menuItems[4])} {/* folder_templates */}
              {renderMenuItem(menuItems[5])} {/* slot_templates */}
            </div>
          </div>

          {/* Секция ТРЕДЫ */}
          <div className="pt-4">
            <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
              Треды
            </p>
            <div className="space-y-0.5 pl-2">
              {renderMenuItem(menuItems.find((m) => m.id === 'thread-templates')!)}{' '}
              {/* thread_templates */}
            </div>
          </div>

          {/* Секция ГЕНЕРАЦИЯ */}
          <div className="pt-4">
            <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
              Генерация
            </p>
            <div className="space-y-0.5 pl-2">
              {renderMenuItem(menuItems[6])} {/* document_templates */}
            </div>
          </div>
        </nav>
      </aside>

      {/* Контент */}
      <div className="flex-1 min-w-0 p-6 overflow-hidden">
        {activeSection === 'project-templates' && <ProjectTemplatesContent />}
        {activeSection === 'form-templates' && <FormTemplatesContent />}
        {activeSection === 'field-templates' && <FieldTemplatesContent />}
        {activeSection === 'document-kit-templates' && <DocumentKitTemplatesContent />}
        {activeSection === 'folder-templates' && <FolderTemplatesContent />}
        {activeSection === 'slot-templates' && <SlotTemplatesContent />}
        {activeSection === 'document-templates' && <DocumentTemplatesContent />}
        {activeSection === 'thread-templates' && <ThreadTemplatesContent />}
      </div>
    </div>
  )
}
