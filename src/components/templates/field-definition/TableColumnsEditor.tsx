/**
 * Редактор колонок таблицы для key-value-table
 */

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import { COLUMN_TYPES, type TableColumn } from './constants'

interface TableColumnsEditorProps {
  columns: TableColumn[]
  onChange: (columns: TableColumn[]) => void
}

export function TableColumnsEditor({ columns, onChange }: TableColumnsEditorProps) {
  const addColumn = () => {
    onChange([...columns, { name: '', type: 'text', width: 30 }])
  }

  const updateColumn = (index: number, updates: Partial<TableColumn>) => {
    const newColumns = [...columns]
    newColumns[index] = { ...newColumns[index], ...updates }
    onChange(newColumns)
  }

  const removeColumn = (index: number) => {
    onChange(columns.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Колонки таблицы</p>
        <Button type="button" variant="outline" size="sm" onClick={addColumn}>
          <Plus className="h-4 w-4 mr-1" />
          Добавить колонку
        </Button>
      </div>

      <div className="border rounded-md overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground">
                Название колонки
              </th>
              <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground w-[140px]">
                Тип данных
              </th>
              <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground w-[100px]">
                Ширина %
              </th>
              <th className="py-2 px-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column, index) => (
              <tr
                key={index}
                className="border-b hover:bg-muted/20 transition-colors group"
              >
                <td className="py-2 px-3">
                  <Input
                    type="text"
                    value={column.name}
                    onChange={(e) => updateColumn(index, { name: e.target.value })}
                    placeholder="Например: Название"
                    className="h-8 text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
                  />
                </td>
                <td className="py-2 px-3">
                  <Select
                    value={column.type}
                    onValueChange={(value) => updateColumn(index, { type: value })}
                  >
                    <SelectTrigger className="h-8 text-sm border-0 bg-transparent p-0 focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLUMN_TYPES.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-2 px-3">
                  <Input
                    type="number"
                    min="10"
                    max="100"
                    value={column.width || 30}
                    onChange={(e) =>
                      updateColumn(index, { width: parseInt(e.target.value) || 30 })
                    }
                    className="h-8 text-sm border-0 bg-transparent p-0 focus-visible:ring-0 w-16"
                  />
                </td>
                <td className="py-2 px-3">
                  {columns.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeColumn(index)}
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Удалить колонку"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Пользователи смогут добавлять строки и редактировать значения прямо в
        таблице при заполнении анкеты.
      </p>
    </div>
  )
}
