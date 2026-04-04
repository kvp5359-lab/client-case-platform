/**
 * Настройки валидации для числового поля
 */

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface NumberValidationProps {
  minValue: string
  maxValue: string
  step: string
  onMinValueChange: (value: string) => void
  onMaxValueChange: (value: string) => void
  onStepChange: (value: string) => void
}

export function NumberValidation({
  minValue,
  maxValue,
  step,
  onMinValueChange,
  onMaxValueChange,
  onStepChange,
}: NumberValidationProps) {
  return (
    <div className="space-y-3 p-4 border rounded-md bg-muted/30">
      <p className="text-sm font-medium">Настройки числового поля</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="minValue" className="text-xs">
            Минимум
          </Label>
          <Input
            id="minValue"
            type="number"
            placeholder="0"
            value={minValue}
            onChange={(e) => onMinValueChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxValue" className="text-xs">
            Максимум
          </Label>
          <Input
            id="maxValue"
            type="number"
            placeholder="100"
            value={maxValue}
            onChange={(e) => onMaxValueChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="step" className="text-xs">
            Шаг
          </Label>
          <Input
            id="step"
            type="number"
            placeholder="1"
            value={step}
            onChange={(e) => onStepChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
