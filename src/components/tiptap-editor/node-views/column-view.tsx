"use client"

import { NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Settings, Trash2 } from 'lucide-react'
import { type BorderRadius, COLUMN_BG_COLORS } from '../extensions/columns'
import { cn } from '@/lib/utils'

const radiusOptions: { value: BorderRadius; label: string }[] = [
  { value: 'none', label: 'Нет' },
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
  { value: 'xl', label: 'XL' },
]

const radiusClasses: Record<BorderRadius, string> = {
  none: '',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
}

export function ColumnView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const bgColor = (node.attrs.bgColor as string | null) || null
  const borderRadius = (node.attrs.borderRadius as BorderRadius) || 'none'
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <NodeViewWrapper className="column-item relative group/column" style={{ minWidth: 0 }}>
      <div
        className={cn(
          'p-3 min-h-[80px] transition-colors',
          radiusClasses[borderRadius],
          !bgColor && 'border-2 border-dashed border-gray-300',
          bgColor && 'border border-transparent',
        )}
        style={bgColor ? { backgroundColor: bgColor } : undefined}
      >
        <NodeViewContent className="focus:outline-none [&>p]:m-0 [&>p:not(:last-child)]:mb-2" />

        {/* Кнопка настроек */}
        <div className="absolute top-1 right-1 opacity-0 group-hover/column:opacity-100 transition-opacity z-10">
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="icon" className="h-6 w-6 shadow-sm">
                <Settings className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="end">
              <div className="space-y-4">
                {/* Цвет фона */}
                <div className="space-y-2">
                  <p className="text-xs font-medium">Цвет фона</p>
                  <div className="grid grid-cols-4 gap-1">
                    {COLUMN_BG_COLORS.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        className={cn(
                          'w-7 h-7 rounded-md border transition-all hover:scale-110',
                          bgColor === item.value && 'ring-2 ring-primary ring-offset-1',
                          !item.value && 'bg-gradient-to-br from-gray-100 to-gray-300',
                        )}
                        style={item.value ? { backgroundColor: item.value } : undefined}
                        title={item.name}
                        onClick={() => updateAttributes({ bgColor: item.value })}
                      />
                    ))}
                  </div>
                </div>

                {/* Скругление */}
                <div className="space-y-2">
                  <p className="text-xs font-medium">Скругление углов</p>
                  <div className="flex gap-1">
                    {radiusOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateAttributes({ borderRadius: opt.value })}
                        className={cn(
                          'flex-1 px-2 py-1.5 text-xs rounded border',
                          borderRadius === opt.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-muted',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Удалить колонки */}
                <div className="border-t pt-3">
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-destructive rounded hover:bg-destructive/10 transition-colors"
                    onClick={() => {
                      // getPos() returns position of this column node
                      // Walk up to find parent columns node
                      const pos = typeof getPos === 'function' ? getPos() : undefined
                      if (pos == null) return
                      const resolved = editor.state.doc.resolve(pos)
                      // Parent of column is columns
                      const columnsDepth = resolved.depth - 1
                      if (columnsDepth >= 0) {
                        const columnsPos = resolved.before(columnsDepth + 1)
                        const columnsNode = editor.state.doc.nodeAt(columnsPos)
                        if (columnsNode && columnsNode.type.name === 'columns') {
                          editor
                            .chain()
                            .focus()
                            .deleteRange({
                              from: columnsPos,
                              to: columnsPos + columnsNode.nodeSize,
                            })
                            .run()
                        }
                      }
                      setSettingsOpen(false)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                    Удалить колонки
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </NodeViewWrapper>
  )
}
