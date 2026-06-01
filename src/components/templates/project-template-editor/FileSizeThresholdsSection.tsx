/**
 * Секция настройки порогов размера файла в редакторе типа проекта.
 * Два порога (МБ): жёлтый и красный — подсвечивают тег размера файла
 * в наборах документов проектов этого типа. Пусто → подсветка выключена.
 */

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileWarning, Check } from 'lucide-react'
import { projectTemplateKeys } from '@/hooks/queryKeys'

type FileSizeThresholdsSectionProps = {
  templateId: string | undefined
  warnMb: number | null | undefined
  dangerMb: number | null | undefined
}

// Пустая строка → null (порог выключен). Невалидное/отрицательное → null.
function parseThreshold(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (!trimmed) return null
  const num = Number(trimmed)
  if (!Number.isFinite(num) || num <= 0) return null
  return num
}

export function FileSizeThresholdsSection({
  templateId,
  warnMb,
  dangerMb,
}: FileSizeThresholdsSectionProps) {
  const queryClient = useQueryClient()
  const [warnInput, setWarnInput] = useState('')
  const [dangerInput, setDangerInput] = useState('')

  /* eslint-disable react-hooks/set-state-in-effect -- синхронизация инпутов с загруженными данными */
  useEffect(() => {
    setWarnInput(warnMb != null ? String(warnMb) : '')
    setDangerInput(dangerMb != null ? String(dangerMb) : '')
  }, [warnMb, dangerMb])
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: async (thresholds: { warn: number | null; danger: number | null }) => {
      const { error } = await supabase
        .from('project_templates')
        .update({
          file_size_warn_mb: thresholds.warn,
          file_size_danger_mb: thresholds.danger,
        })
        .eq('id', templateId ?? '')
      if (error) throw error
    },
    onSuccess: () => {
      // Инвалидация по префиксу захватит и detail() (страница проекта),
      // и detailFull() (редактор) — обе формы обновятся.
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.detail(templateId) })
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.detailFull(templateId) })
      toast.success('Пороги размера файла сохранены')
    },
    onError: () => {
      toast.error('Не удалось сохранить пороги размера файла')
    },
  })

  const warn = parseThreshold(warnInput)
  const danger = parseThreshold(dangerInput)
  const invalidOrder = warn != null && danger != null && danger <= warn

  const handleSave = () => {
    if (invalidOrder) {
      toast.error('Красный порог должен быть больше жёлтого')
      return
    }
    saveMutation.mutate({ warn, danger })
  }

  return (
    <section className="space-y-3 mb-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileWarning className="w-5 h-5 text-muted-foreground" />
          Подсветка больших файлов
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Тег размера файла в наборах документов окрашивается, когда файл превышает порог.
          Оставьте поле пустым, чтобы отключить соответствующий цвет.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Жёлтый порог, МБ
          </label>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={warnInput}
            onChange={(e) => setWarnInput(e.target.value)}
            placeholder="напр. 2"
            className="w-36"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Красный порог, МБ
          </label>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={dangerInput}
            onChange={(e) => setDangerInput(e.target.value)}
            placeholder="напр. 5"
            className="w-36"
          />
        </div>
        <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending || invalidOrder}>
          <Check className="h-4 w-4 mr-1" />
          Сохранить
        </Button>
      </div>

      {invalidOrder && (
        <p className="text-sm text-destructive">Красный порог должен быть больше жёлтого.</p>
      )}
    </section>
  )
}
