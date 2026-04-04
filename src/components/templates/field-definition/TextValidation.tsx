/**
 * Настройки валидации для текстового поля
 */

import { Input } from '@/components/ui/input'
import { FieldGroup } from '@/components/ui/field-group'

interface TextValidationProps {
  minLength: string
  maxLength: string
  onMinLengthChange: (value: string) => void
  onMaxLengthChange: (value: string) => void
}

export function TextValidation({
  minLength,
  maxLength,
  onMinLengthChange,
  onMaxLengthChange,
}: TextValidationProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FieldGroup label="Минимальная длина">
        <Input
          id="minLength"
          type="number"
          placeholder="0"
          value={minLength}
          onChange={(e) => onMinLengthChange(e.target.value)}
          className="border-0 shadow-none p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </FieldGroup>
      <FieldGroup label="Максимальная длина">
        <Input
          id="maxLength"
          type="number"
          placeholder="1000"
          value={maxLength}
          onChange={(e) => onMaxLengthChange(e.target.value)}
          className="border-0 shadow-none p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </FieldGroup>
    </div>
  )
}
