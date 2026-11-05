import { FolderOpen, Gamepad2, ImageOff, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { api, errorMessage } from '@/lib/api'
import { BRAND_PRESETS, contrastRatio, CANVAS_COLOR, isLegibleOnCanvas, normalizeHex } from '@/lib/branding'
import { toPersianDigits } from '@/lib/currency'
import type { Settings } from '@/types'
import { Button } from '../ui/Button'
import { ColorField } from '../ui/ColorField'
import { Field, TextInput } from '../ui/Field'
import { Section } from '../ui/Section'

interface BrandingSectionProps {
  draft: Settings
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  /** Called with the logo `data:` URL (or null) for the receipt preview. */
  onLogo?: (url: string | null) => void
}

/** Store name, brand colour and logo — part of the settings draft (saved with the page). */
export function BrandingSection({ draft, set, onLogo }: BrandingSectionProps) {
  const ids = { store: useId(), color: useId() }
  const [logo, setLogo] = useState<{ path: string; url: string | null; error: string | null } | null>(null)
  const [picking, setPicking] = useState(false)

  // Preview the draft logo; results are keyed by path so a stale answer is ignored.
  useEffect(() => {
    const path = draft.logoPath
    if (!path) return
    let cancelled = false
    api.readLogo(path).then(
      (url) => !cancelled && setLogo({ path, url, error: null }),
      (e: unknown) => !cancelled && setLogo({ path, url: null, error: errorMessage(e) }),
    )
    return () => {
      cancelled = true
    }
  }, [draft.logoPath])
  const current = draft.logoPath && logo?.path === draft.logoPath ? logo : null
  useEffect(() => onLogo?.(current?.url ?? null), [current?.url, onLogo])

  const hex = normalizeHex(draft.brandColor)
  const legible = hex === null || isLegibleOnCanvas(hex)

  const pick = async () => {
    setPicking(true)
    try {
      const path = await api.pickLogoFile()
      if (path) set('logoPath', path)
    } catch (e) {
      setLogo({ path: '', url: null, error: errorMessage(e) })
    } finally {
      setPicking(false)
    }
  }

  return (
    <Section title="برند" description="نام، رنگ و لوگوی مجموعه در کل برنامه و روی رسید. تغییر رنگ همین حالا پیش‌نمایش می‌شود و با «ذخیره‌ی تغییرات» ثابت می‌شود.">
      <div className="flex flex-col gap-5 p-4">
        <Field label="نام مجموعه" htmlFor={ids.store} hint="در نوار کناری و سربرگ رسید نمایش داده می‌شود.">
          <TextInput id={ids.store} value={draft.storeName} maxLength={40} onChange={(e) => set('storeName', e.target.value)} />
        </Field>

        <Field
          label="رنگ برند"
          htmlFor={ids.color}
          error={hex === null ? 'رنگ را به شکل ‎#rrggbb‎ وارد کنید.' : null}
          hint="برای قیمت‌ها و دکمه‌های اصلی."
        >
          <ColorField id={ids.color} value={draft.brandColor} onChange={(v) => set('brandColor', v)} presets={BRAND_PRESETS} />
        </Field>
        {!legible && hex && (
          <p role="alert" className="-mt-3 flex items-center gap-2 text-xs text-status-paused">
            <TriangleAlert className="size-3.5" />
            این رنگ روی زمینه‌ی تیره کم‌کنتراست است ({toPersianDigits(contrastRatio(hex, CANVAS_COLOR).toFixed(1))}:۱)؛ قیمت‌ها
            خوانا نخواهند بود.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-label-secondary">لوگو</span>
          <div className="flex items-center gap-3">
            <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
              {current?.url ? (
                <img src={current.url} alt="لوگوی مجموعه" className="size-full object-contain" />
              ) : draft.logoPath ? (
                <ImageOff className="size-5 text-label-tertiary" />
              ) : (
                <Gamepad2 className="size-5 text-label-tertiary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <code dir="ltr" className="block truncate text-xs text-label-secondary select-text">
                {draft.logoPath || '—'}
              </code>
              {current?.error && <p className="mt-1 text-xs text-status-maintenance">{current.error}</p>}
            </div>
            <Button size="sm" disabled={picking} onClick={() => void pick()}>
              <FolderOpen />
              انتخاب فایل…
            </Button>
            {draft.logoPath && (
              <Button size="sm" variant="ghost" onClick={() => set('logoPath', '')}>
                حذف لوگو
              </Button>
            )}
          </div>
          <p className="text-xs text-label-tertiary">PNG، JPG، WebP، GIF یا SVG تا ۲ مگابایت. مسیر کامل فایل ذخیره می‌شود.</p>
        </div>
      </div>
    </Section>
  )
}
