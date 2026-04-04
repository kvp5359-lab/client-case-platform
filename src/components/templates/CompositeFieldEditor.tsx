/**
 * CompositeFieldEditor — компонент для управления вложенными полями составного поля
 * Позволяет добавлять, удалять и переупорядочивать вложенные поля
 *
 * Мутации и D&D вынесены в useCompositeFieldMutations (Z5-54)
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, GripVertical, Search } from 'lucide-react'
import { useCompositeFieldMutations, FIELD_TYPE_LABELS } from './useCompositeFieldMutations'

interface CompositeFieldEditorProps {
  fieldId: string
  onChangesDetected?: (hasChanges: boolean) => void
}

export function CompositeFieldEditor({ fieldId, onChangesDetected }: CompositeFieldEditorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSelectOpen, setIsSelectOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const {
    compositeItems,
    itemsLoading,
    filteredFields,
    getSearchFiltered,
    addFieldMutation,
    removeFieldMutation,
    draggedItemId,
    dragOverItemId,
    dragOverPosition,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  } = useCompositeFieldMutations(fieldId, onChangesDetected)

  const searchFiltered = useMemo(
    () => getSearchFiltered(searchQuery),
    [getSearchFiltered, searchQuery],
  )

  // Автофокус на поле поиска при открытии
  useEffect(() => {
    if (isSelectOpen) {
      const timerId = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 10)
      return () => clearTimeout(timerId)
    }
  }, [isSelectOpen])

  // Сбрасываем индекс при закрытии
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isSelectOpen) {
      setHighlightedIndex(0)
    }
  }, [isSelectOpen])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Сбрасываем выделенный индекс при изменении поискового запроса
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setHighlightedIndex(0)
  }, [searchQuery])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleFieldSelect = (selectedFieldId: string) => {
    if (selectedFieldId && !addFieldMutation.isPending) {
      addFieldMutation.mutate(selectedFieldId, {
        onSuccess: () => {
          setSearchQuery('')
          setIsSelectOpen(false)
        },
      })
    }
  }

  if (itemsLoading) {
    return <div className="text-sm text-muted-foreground">Загрузка...</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Вложенные поля</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Поля будут отображаться в одной строке в указанном порядке
        </p>
      </div>

      {/* Добавление поля */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Select
            value=""
            onValueChange={handleFieldSelect}
            open={isSelectOpen}
            onOpenChange={(open) => {
              setIsSelectOpen(open)
              if (!open) setSearchQuery('')
            }}
          >
            <SelectTrigger className="flex-1 h-9">
              <SelectValue placeholder="Выберите поле для добавления..." />
            </SelectTrigger>
            <SelectContent>
              {/* Поиск */}
              <div className="px-2 pb-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Поиск..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8"
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setHighlightedIndex((prev) =>
                          prev < searchFiltered.length - 1 ? prev + 1 : prev,
                        )
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        if (searchFiltered.length > 0 && searchFiltered[highlightedIndex]) {
                          handleFieldSelect(searchFiltered[highlightedIndex].id)
                        }
                      } else {
                        e.stopPropagation()
                      }
                    }}
                  />
                </div>
              </div>

              {/* Список полей */}
              {(() => {
                if (filteredFields.length === 0) {
                  return (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      Все доступные поля уже добавлены
                    </div>
                  )
                }

                if (searchFiltered.length === 0) {
                  return (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      Ничего не найдено
                    </div>
                  )
                }

                return searchFiltered.map((field, index) => (
                  <SelectItem
                    key={field.id}
                    value={field.id}
                    className={index === highlightedIndex ? 'bg-accent' : ''}
                  >
                    {field.name} ({FIELD_TYPE_LABELS[field.field_type]})
                  </SelectItem>
                ))
              })()}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={() => setIsSelectOpen(true)} size="sm" className="h-9">
          <Plus className="w-4 h-4 mr-1" />
          Добавить
        </Button>
      </div>

      {/* Список вложенных полей */}
      {compositeItems.length === 0 ? (
        <div className="border border-dashed rounded-md p-8 text-center text-sm text-muted-foreground">
          Нет вложенных полей. Добавьте поля из списка выше.
        </div>
      ) : (
        <div className="border rounded-md divide-y">
          {/* Заголовок таблицы */}
          <div className="flex items-center gap-3 px-3 py-1 bg-muted/30 font-medium text-sm">
            <div className="w-5" />
            <div className="w-[45%]">Название</div>
            <div className="flex-1">Тип</div>
            <div className="w-10" />
          </div>

          {/* Строки таблицы */}
          {compositeItems.map((item) => {
            const isDragging = draggedItemId === item.id
            const isOver = dragOverItemId === item.id

            return (
              <div
                key={item.id}
                className={`relative flex items-center gap-3 px-3 py-1 transition-colors ${
                  isDragging ? 'opacity-40 bg-blue-50' : isOver ? 'bg-blue-50' : 'hover:bg-muted/50'
                }`}
                draggable
                onDragStart={(e) => handleDragStart(e, item.id)}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, item)}
                onDragEnd={handleDragEnd}
              >
                {/* Индикатор позиции drop */}
                {isOver && (
                  <div
                    className={`absolute left-0 right-0 h-1 bg-blue-500 ${
                      dragOverPosition === 'top' ? '-top-0.5' : '-bottom-0.5'
                    }`}
                  />
                )}
                {/* Drag handle */}
                <div className="cursor-move hover:bg-gray-200 p-1 rounded transition-colors inline-flex">
                  <GripVertical className="w-4 h-4 text-muted-foreground" />
                </div>

                {/* Название поля */}
                <div className="w-[45%] text-sm">{item.nested_field.name}</div>

                {/* Тип поля */}
                <div className="flex-1 text-sm text-muted-foreground">
                  {FIELD_TYPE_LABELS[item.nested_field.field_type]}
                </div>

                {/* Кнопка удаления */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFieldMutation.mutate(item.id)}
                  disabled={removeFieldMutation.isPending}
                  className="w-10 h-8 p-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
