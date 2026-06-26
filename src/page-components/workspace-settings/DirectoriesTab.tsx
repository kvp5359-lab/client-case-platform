/**
 * DirectoriesTab - вкладка управления справочниками
 */

import { useParams, useRouter, usePathname } from 'next/navigation'
import { StatusesDirectory } from '@/components/directories/StatusesDirectory'
import {
  WorkspaceRolesDirectory,
  ProjectRolesDirectory,
} from '@/components/directories/RolesDirectory'
import { QuickRepliesDirectory } from '@/components/directories/QuickRepliesDirectory'
import { FinanceServicesDirectory } from '@/components/directories/FinanceServicesDirectory'
import { FinanceTaxRatesDirectory } from '@/components/directories/FinanceTaxRatesDirectory'
import { FinanceTxCategoriesDirectory } from '@/components/directories/FinanceTxCategoriesDirectory'
import {
  CustomDirectoriesList,
  CustomDirectoryPage,
} from '@/components/directories/custom-directories'
import { SettingsSubNav } from './components/SettingsSubNav'

type DirectorySection =
  | 'statuses' // Статусы (для разных сущностей)
  | 'workspace-roles' // Роли workspace
  | 'project-roles' // Роли проекта
  | 'quick-replies' // Быстрые ответы
  | 'finance-services' // Услуги (финансовый модуль)
  | 'finance-tax-rates' // Налоги (финансовый модуль)
  | 'finance-income-categories' // Статьи доходов
  | 'finance-expense-categories' // Статьи расходов
  | 'custom' // Пользовательские справочники
  | 'custom-detail' // Конкретный справочник

export function DirectoriesTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const pathname = usePathname()

  // Определяем активную секцию по URL
  const getActiveSection = (): DirectorySection => {
    const pathParts = pathname.split('/')
    const directoriesIdx = pathParts.indexOf('directories')
    const section = directoriesIdx >= 0 ? pathParts[directoriesIdx + 1] : undefined
    const subsection = directoriesIdx >= 0 ? pathParts[directoriesIdx + 2] : undefined
    if (section === 'workspace-roles' || section === 'project-roles') return section
    if (section === 'quick-replies') return section
    if (section === 'finance-services') return section
    if (section === 'finance-tax-rates') return section
    if (section === 'finance-income-categories') return section
    if (section === 'finance-expense-categories') return section
    if (section === 'custom' && subsection) return 'custom-detail'
    if (section === 'custom') return 'custom'
    return 'statuses'
  }

  const activeSection = getActiveSection()

  // Группы пунктов меню — в каждом блоке свой заголовок и набор пунктов.
  const groups: { title: string; items: { id: DirectorySection; label: string }[] }[] = [
    {
      title: 'Статусы',
      items: [{ id: 'statuses', label: 'Статусы' }],
    },
    {
      title: 'Роли',
      items: [
        { id: 'workspace-roles', label: 'Роли workspace' },
        { id: 'project-roles', label: 'Роли проекта' },
      ],
    },
    {
      title: 'Шаблоны',
      items: [{ id: 'quick-replies', label: 'Быстрые ответы' }],
    },
    {
      title: 'Финансы',
      items: [
        { id: 'finance-services', label: 'Услуги' },
        { id: 'finance-tax-rates', label: 'Налоги' },
        { id: 'finance-income-categories', label: 'Статьи доходов' },
        { id: 'finance-expense-categories', label: 'Статьи расходов' },
      ],
    },
    {
      title: 'Данные',
      items: [{ id: 'custom', label: 'Справочники' }],
    },
  ]

  const handleSectionChange = (section: string) => {
    router.push(`/workspaces/${workspaceId}/settings/directories/${section}`)
  }

  return (
    <div className="flex bg-white rounded-lg border min-h-[500px]">
      <SettingsSubNav groups={groups} activeId={activeSection} onSelect={handleSectionChange} />

      {/* Контент */}
      <div className="flex-1 p-6">{(
        <>
          {activeSection === 'statuses' && <StatusesDirectory />}
          {activeSection === 'workspace-roles' && <WorkspaceRolesDirectory />}
          {activeSection === 'project-roles' && <ProjectRolesDirectory />}
          {activeSection === 'quick-replies' && <QuickRepliesDirectory />}
          {activeSection === 'finance-services' && <FinanceServicesDirectory />}
          {activeSection === 'finance-tax-rates' && <FinanceTaxRatesDirectory />}
          {activeSection === 'finance-income-categories' && (
            <FinanceTxCategoriesDirectory kind="income" />
          )}
          {activeSection === 'finance-expense-categories' && (
            <FinanceTxCategoriesDirectory kind="expense" />
          )}
          {activeSection === 'custom' && <CustomDirectoriesList />}
          {activeSection === 'custom-detail' && <CustomDirectoryPage />}
        </>
      )}</div>
    </div>
  )
}
