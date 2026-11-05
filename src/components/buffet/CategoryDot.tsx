import { UNCATEGORIZED_COLOR } from '@/lib/buffet'

/** Category colour swatch. Colours are data (from SQLite), so they are set inline. */
export function CategoryDot({ color, size = 'size-2' }: { color?: string; size?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${size}`} style={{ backgroundColor: color ?? UNCATEGORIZED_COLOR }} />
}
