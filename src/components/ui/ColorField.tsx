import { Check } from 'lucide-react'
import { DEFAULT_BRAND_COLOR, normalizeHex, type ColorPreset } from '@/lib/branding'
import { cn } from '@/lib/cn'
import { TextInput } from './Field'

interface ColorFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
  presets: readonly ColorPreset[]
}

/** Native colour picker + hex field + presets. Swatch colours are data, so they are inline styles. */
export function ColorField({ id, value, onChange, presets }: ColorFieldProps) {
  const hex = normalizeHex(value)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="color"
        aria-label="انتخاب رنگ"
        value={hex ?? DEFAULT_BRAND_COLOR}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-12 cursor-pointer rounded-xl border border-white/10 bg-transparent p-1"
      />
      <TextInput
        id={id}
        dir="ltr"
        value={value}
        maxLength={7}
        spellCheck={false}
        aria-invalid={hex === null || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 font-mono text-sm"
      />
      <div role="radiogroup" aria-label="رنگ‌های پیشنهادی" className="flex items-center gap-1.5">
        {presets.map((preset) => {
          const selected = hex === preset.color
          return (
            <button
              key={preset.color}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset.label}
              title={preset.label}
              onClick={() => onChange(preset.color)}
              className={cn('grid size-7 place-items-center rounded-full border border-white/15', selected && 'ring-2 ring-label/70')}
              style={{ backgroundColor: preset.color }}
            >
              {selected && <Check className="size-3.5 text-black/70" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
