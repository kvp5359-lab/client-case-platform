"use client"

import { Button } from '@/components/ui/button'
import { FolderOpen, Upload } from 'lucide-react'

interface DocumentSourceSelectorProps {
  onSelect: (source: 'project' | 'upload') => void
}

export function DocumentSourceSelector({ onSelect }: DocumentSourceSelectorProps) {
  return (
    <div className="space-y-4 py-6">
      <p className="text-sm text-muted-foreground text-center">
        Выберите источник документа для автозаполнения анкеты
      </p>

      <div className="grid grid-cols-2 gap-4">
        <Button
          variant="outline"
          className="h-32 flex flex-col items-center justify-center gap-3"
          onClick={() => onSelect('project')}
        >
          <FolderOpen className="w-10 h-10 text-primary" />
          <div className="text-center">
            <div className="font-semibold">Из документов проекта</div>
            <div className="text-xs text-muted-foreground mt-1">
              Используйте загруженные документы
            </div>
          </div>
        </Button>

        <Button
          variant="outline"
          className="h-32 flex flex-col items-center justify-center gap-3"
          onClick={() => onSelect('upload')}
        >
          <Upload className="w-10 h-10 text-primary" />
          <div className="text-center">
            <div className="font-semibold">Загрузить с компьютера</div>
            <div className="text-xs text-muted-foreground mt-1">
              Файл не будет сохранён
            </div>
          </div>
        </Button>
      </div>
    </div>
  )
}




