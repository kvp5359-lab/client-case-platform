import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TAG_COLOR_PALETTE } from '@/utils/notionPill'

export function ColorPickerInline({
  color,
  onChange,
}: {
  color: string
  onChange: (color: string) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="w-5 h-5 rounded-full shrink-0 hover:scale-110 transition-transform border border-black/10"
          style={{ backgroundColor: color }}
          title="Изменить цвет"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="end">
        <div className="grid grid-cols-5 gap-1.5">
          {TAG_COLOR_PALETTE.map((c) => (
            <button
              key={c}
              className="w-6 h-6 rounded-md border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                borderColor: c === color ? '#000' : 'transparent',
              }}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
