import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { supabase } from '@/lib/supabase'
import type { FieldDefinition } from '@/types/formKit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Pencil, Trash2 } from 'lucide-react'
import { FieldDefinitionDialog } from './FieldDefinitionDialog'
import { FIELD_TYPE_LABELS } from './field-definition/constants'
import { fieldDefinitionKeys } from '@/hooks/queryKeys'

// Цветовые схемы для типов полей (бледные оттенки, компактные)
const FIELD_TYPE_COLORS: Record<string, string> = {
  text: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
  textarea: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400',
  number: 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400',
  date: 'bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400',
  email: 'bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400',
  phone: 'bg-pink-50 text-pink-600 dark:bg-pink-950/50 dark:text-pink-400',
  url: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400',
  checkbox: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
  select: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400',
}

export function FieldTemplatesContent() {
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null)

  const queryClient = useQueryClient()

  // Загрузка полей
  const { data: fields = [], isLoading } = useQuery({
    queryKey: fieldDefinitionKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_definitions')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      return data as FieldDefinition[]
    },
  })

  // Удаление поля
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('field_definitions').delete().eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fieldDefinitionKeys.all })
    },
    onError: () => {
      toast.error('Не удалось удалить поле')
    },
  })

  // Фильтрация полей
  const filteredFields = fields.filter((field) => {
    const matchesSearch = field.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = selectedType === 'all' || field.field_type === selectedType
    return matchesSearch && matchesType
  })

  // Обработчики
  const handleCreate = () => {
    setEditingField(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (field: FieldDefinition) => {
    setEditingField(field)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Удалить поле?',
      description: 'Вы уверены, что хотите удалить это поле?',
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    await deleteMutation.mutateAsync(id)
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    setEditingField(null)
  }

  return (
    <>
      {/* Заголовок */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Шаблоны полей</h3>
      </div>

      {/* Фильтры */}
      <div className="mb-4 space-y-3">
        {/* Поиск и кнопка добавления */}
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8"
          />
          <Button size="sm" onClick={handleCreate}>
            + Добавить
          </Button>
        </div>

        {/* Фильтр по типу */}
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant={selectedType === 'all' ? 'default' : 'outline'}
            onClick={() => setSelectedType('all')}
          >
            Все
          </Button>
          {Object.entries(FIELD_TYPE_LABELS).map(([type, label]) => (
            <Button
              key={type}
              size="sm"
              variant={selectedType === type ? 'default' : 'outline'}
              onClick={() => setSelectedType(type)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Таблица полей */}
      <div className="border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
        ) : filteredFields.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {searchQuery || selectedType !== 'all'
              ? 'Ничего не найдено'
              : 'Пока нет полей. Создайте первое!'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Описание</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFields.map((field) => (
                <TableRow key={field.id} className="h-5 hover:bg-muted/50">
                  <TableCell className="font-medium py-0 px-3 text-sm">{field.name}</TableCell>
                  <TableCell className="py-0 px-3">
                    <Badge
                      className={`border-transparent text-[11px] py-0 px-1.5 ${
                        FIELD_TYPE_COLORS[field.field_type] ||
                        'bg-gray-50 text-gray-600 dark:bg-gray-950/50 dark:text-gray-400'
                      }`}
                    >
                      {FIELD_TYPE_LABELS[field.field_type] || field.field_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground py-0 px-3 text-xs">
                    {field.description || '—'}
                  </TableCell>
                  <TableCell className="text-right py-0 px-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(field)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(field.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Диалог создания/редактирования */}
      <FieldDefinitionDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleDialogClose()
        }}
        field={editingField}
      />

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </>
  )
}
