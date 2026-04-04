import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'

interface AnalysisProgressProps {
  progress: number
  fileName: string
}

export function AnalysisProgress({ progress, fileName }: AnalysisProgressProps) {
  return (
    <div className="space-y-6 py-8">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <div className="text-center">
          <p className="text-lg font-semibold mb-1">
            Нейросеть анализирует документ...
          </p>
          <p className="text-sm text-muted-foreground">{fileName}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Progress value={progress} className="h-2" />
        <p className="text-center text-sm text-muted-foreground">
          {progress}%
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Извлечение данных может занять 10-30 секунд
      </p>
    </div>
  )
}




