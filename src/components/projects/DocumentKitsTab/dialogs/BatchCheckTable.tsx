"use client"

import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2 } from 'lucide-react'
import type { DocumentStatus } from '@/components/documents/types'
import type { BatchCheckResult } from './useBatchCheck'

interface BatchCheckTableProps {
  results: BatchCheckResult[]
  statuses: DocumentStatus[]
  checkedCount: number
  onToggleCheck: (index: number) => void
  onToggleAll: (checked: boolean) => void
  onUpdateField: (
    index: number,
    field: 'suggestedName' | 'description' | 'status',
    value: string,
  ) => void
}

export function BatchCheckTable({
  results,
  statuses,
  checkedCount,
  onToggleCheck,
  onToggleAll,
  onUpdateField,
}: BatchCheckTableProps) {
  return (
    <div className="border rounded-md flex-1 overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow className="border-b">
            <TableHead className="w-[30px] h-10 px-2">{/* Статус */}</TableHead>
            <TableHead className="w-[40px] h-10 px-2">
              <Checkbox
                checked={checkedCount === results.length && results.length > 0}
                onCheckedChange={(checked) => onToggleAll(checked === true)}
              />
            </TableHead>
            <TableHead className="w-[20%] h-10 px-3 text-xs">Оригинальное название</TableHead>
            <TableHead className="w-[25%] h-10 px-3 text-xs">Новое название</TableHead>
            <TableHead className="h-10 px-3 text-xs">Описание</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result, index) => {
            const currentStatus = statuses.find((s) => s.id === result.status)

            return (
              <TableRow
                key={result.documentId}
                className={result.error ? 'bg-destructive/5 border-b' : 'border-b'}
              >
                <TableCell className="py-2 px-2 align-top">
                  {currentStatus && (
                    <div
                      className="w-3 h-3 rounded-full mt-1"
                      style={{ backgroundColor: currentStatus.color }}
                      title={currentStatus.name}
                    />
                  )}
                </TableCell>
                <TableCell className="py-2 px-2 align-top">
                  <Checkbox
                    checked={result.isChecked}
                    disabled={!!result.error}
                    onCheckedChange={() => onToggleCheck(index)}
                  />
                </TableCell>
                <TableCell className="font-medium text-xs py-2 px-3 align-top">
                  {result.originalName}
                </TableCell>
                <TableCell className="py-2 px-3 align-top">
                  {result.isLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-xs">Проверка...</span>
                    </div>
                  ) : result.error ? (
                    <span className="text-xs text-destructive">{result.error}</span>
                  ) : (
                    <input
                      type="text"
                      value={result.suggestedName || ''}
                      onChange={(e) => onUpdateField(index, 'suggestedName', e.target.value)}
                      className="text-xs outline-none focus:bg-accent/20 rounded px-1 py-0.5 min-h-[20px] w-full bg-transparent border-none"
                    />
                  )}
                </TableCell>
                <TableCell className="py-2 px-3 align-top">
                  {result.isLoading ? (
                    <div className="text-muted-foreground text-xs">Ожидание...</div>
                  ) : result.error ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <textarea
                      value={result.description || ''}
                      onChange={(e) => onUpdateField(index, 'description', e.target.value)}
                      placeholder="Описание документа..."
                      className="text-xs outline-none focus:bg-accent/20 rounded px-1 py-0.5 min-h-[40px] w-full bg-transparent border-none resize-none whitespace-pre-wrap"
                    />
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
