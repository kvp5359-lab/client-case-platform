/**
 * WorkspaceInfoSection — редактирование названия и описания workspace.
 */

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspaceStore'

interface WorkspaceInfoSectionProps {
  workspaceId: string
}

function WorkspaceInfoForm({
  workspaceId,
  initialName,
  initialDescription,
}: {
  workspaceId: string
  initialName: string
  initialDescription: string
}) {
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace)
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)

  const hasChanges = name !== initialName || description !== initialDescription

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim()
      if (!trimmedName) throw new Error('Название не может быть пустым')
      const { error } = await supabase
        .from('workspaces')
        .update({ name: trimmedName, description: description.trim() || null })
        .eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      refreshWorkspace()
      toast.success('Сохранено')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Ошибка при сохранении')
    },
  })

  return (
    <CardContent className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ws-name">Название</Label>
        <Input
          id="ws-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название рабочего пространства"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ws-description">Описание</Label>
        <Textarea
          id="ws-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Краткое описание (необязательно)"
          rows={3}
        />
      </div>
      <Button
        onClick={() => saveMutation.mutate()}
        disabled={!hasChanges || saveMutation.isPending}
      >
        {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
      </Button>
    </CardContent>
  )
}

export function WorkspaceInfoSection({ workspaceId }: WorkspaceInfoSectionProps) {
  const workspace = useWorkspaceStore((s) => s.workspace)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Информация о workspace</CardTitle>
        <CardDescription>Название и описание рабочего пространства</CardDescription>
      </CardHeader>
      {workspace && (
        <WorkspaceInfoForm
          key={`${workspace.id}-${workspace.updated_at}`}
          workspaceId={workspaceId}
          initialName={workspace.name ?? ''}
          initialDescription={workspace.description ?? ''}
        />
      )}
    </Card>
  )
}
