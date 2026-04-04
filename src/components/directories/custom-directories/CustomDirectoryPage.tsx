/**
 * Страница конкретного справочника: вкладки «Записи» и «Поля»
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { customDirectoryKeys } from '@/hooks/queryKeys'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DirectoryFieldsEditor } from './DirectoryFieldsEditor'
import { DirectoryEntriesTable } from './DirectoryEntriesTable'
import type { CustomDirectory } from '@/types/customDirectories'
import { EmptyState } from '@/components/ui/empty-state'

export function CustomDirectoryPage() {
  const { workspaceId, directoryId } = useParams<{ workspaceId: string; directoryId: string }>()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('entries')

  const { data: directory, isLoading } = useQuery<CustomDirectory>({
    queryKey: customDirectoryKeys.detail(directoryId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_directories')
        .select('*')
        .eq('id', directoryId!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!directoryId,
    staleTime: 5 * 60 * 1000,
  })

  const goBack = () => {
    router.push(`/workspaces/${workspaceId}/settings/directories/custom`)
  }

  if (isLoading) {
    return <EmptyState loading />
  }

  if (!directory) {
    return (
      <div className="text-center py-8 text-gray-500">
        <EmptyState emptyText="Справочник не найден" />
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={goBack}>
            Назад к списку
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h3 className="text-lg font-semibold">{directory.name}</h3>
          {directory.description && (
            <p className="text-sm text-gray-500">{directory.description}</p>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="entries">Записи</TabsTrigger>
          <TabsTrigger value="fields">Структура полей</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="mt-4">
          <DirectoryEntriesTable directoryId={directoryId!} />
        </TabsContent>

        <TabsContent value="fields" className="mt-4">
          <DirectoryFieldsEditor directoryId={directoryId!} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
