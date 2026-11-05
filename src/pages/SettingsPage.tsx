import { Play } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { BrandingSection } from '@/components/admin/BrandingSection'
import { CategoryManager } from '@/components/admin/CategoryManager'
import { ReceiptPreview } from '@/components/admin/ReceiptPreview'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextArea } from '@/components/ui/Field'
import { Section, SettingRow } from '@/components/ui/Section'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Switch } from '@/components/ui/Switch'
import { errorMessage } from '@/lib/api'
import { applyRounding } from '@/lib/billing'
import { applyBranding, DEFAULT_BRAND_COLOR } from '@/lib/branding'
import { formatNumber, formatToman, toPersianDigits } from '@/lib/currency'
import { ROUNDING_MODE_LABEL, ROUNDING_UNITS } from '@/lib/rounding'
import { playSound, SOUND_PRESET_LABEL } from '@/lib/sound'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import type { RoundingMode, Settings, SoundPreset } from '@/types'

const ALERT_INTERVALS = [0, 15, 30, 45, 60, 90, 120]
const PAUSE_LIMITS = [0, 5, 10, 15, 20, 30, 60]
const EXAMPLE_AMOUNT = 182_450

const minutesLabel = (m: number) => (m === 0 ? 'خاموش' : `${toPersianDigits(m)} دقیقه`)

function SettingsForm({ initial }: { initial: Settings }) {
  const saveSettings = useSettingsStore((s) => s.saveSettings)
  const pushToast = useUiStore((s) => s.pushToast)
  const [draft, setDraft] = useState<Settings>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ids = { header: useId(), footer: useId(), unit: useId(), alert: useId(), pause: useId(), volume: useId() }
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // Live preview: the whole app takes the draft brand colour while editing;
  // leaving without saving restores the saved one.
  useEffect(() => {
    applyBranding(draft.brandColor)
  }, [draft.brandColor])
  useEffect(
    () => () => {
      applyBranding(useSettingsStore.getState().settings?.brandColor ?? DEFAULT_BRAND_COLOR)
    },
    [],
  )

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveSettings(draft)
      pushToast({ tone: 'success', title: 'تنظیمات ذخیره شد', detail: 'تغییرات رسید و گرد کردن روی فاکتورهای بعدی اعمال می‌شود.' })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const rule = { unit: draft.roundingUnit, mode: draft.roundingMode }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-8 pb-28">
      <BrandingSection draft={draft} set={set} onLogo={setLogoUrl} />

      <Section title="رسید" description="متن چاپ‌شده روی رسید. هر فاکتور متن زمان صدور خود را نگه می‌دارد.">
        <div className="flex gap-6 p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <Field label="سربرگ" htmlFor={ids.header} hint="مثلاً آدرس و شماره‌ی تماس. هر خط جدا چاپ می‌شود.">
              <TextArea id={ids.header} value={draft.receiptHeader} maxLength={300} rows={3} onChange={(e) => set('receiptHeader', e.target.value)} />
            </Field>
            <Field label="پانویس" htmlFor={ids.footer}>
              <TextArea id={ids.footer} value={draft.receiptFooter} maxLength={300} rows={2} onChange={(e) => set('receiptFooter', e.target.value)} />
            </Field>
          </div>
          <div className="grid shrink-0 place-items-start rounded-2xl bg-black/25 p-5">
            <ReceiptPreview settings={draft} logoUrl={logoUrl} />
          </div>
        </div>
      </Section>

      <Section title="گرد کردن مبلغ" description="فقط مبلغ نهایی گرد می‌شود و تفاوت آن روی فاکتور نمایش داده می‌شود.">
        <SettingRow label="واحد گرد کردن" htmlFor={ids.unit}>
          <Select
            id={ids.unit}
            className="w-44"
            value={draft.roundingUnit}
            onChange={(e) => set('roundingUnit', Number(e.target.value))}
          >
            {ROUNDING_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit === 0 ? 'بدون گرد کردن' : formatToman(unit)}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow
          label="روش"
          hint={`نمونه: ${formatToman(EXAMPLE_AMOUNT)} ← ${formatToman(applyRounding(EXAMPLE_AMOUNT, rule))}`}
        >
          <div className={draft.roundingUnit === 0 ? 'pointer-events-none opacity-40' : undefined}>
            <SegmentedControl<RoundingMode>
              aria-label="روش گرد کردن"
              options={(['nearest', 'up', 'down'] as const).map((m) => ({ value: m, label: ROUNDING_MODE_LABEL[m] }))}
              value={draft.roundingMode}
              onChange={(m) => set('roundingMode', m)}
            />
          </div>
        </SettingRow>
      </Section>

      <Section title="صدای هشدار" description="یادآوری برای مدت بازی و مکث‌های طولانی. هشدارها هنگام باز شدن دوباره‌ی برنامه تکرار نمی‌شوند.">
        <SettingRow label="پخش صدا">
          <Switch label="پخش صدا" checked={draft.soundEnabled} onChange={(v) => set('soundEnabled', v)} />
        </SettingRow>
        <SettingRow label="صدا">
          <div className="flex items-center gap-2">
            <SegmentedControl<SoundPreset>
              aria-label="نوع صدا"
              options={(['chime', 'bell', 'beep'] as const).map((p) => ({ value: p, label: SOUND_PRESET_LABEL[p] }))}
              value={draft.soundPreset}
              onChange={(p) => set('soundPreset', p)}
            />
            <Button size="sm" onClick={() => playSound(draft.soundPreset, draft.soundVolume)} aria-label="پخش نمونه">
              <Play />
              نمونه
            </Button>
          </div>
        </SettingRow>
        <SettingRow label="بلندی صدا" htmlFor={ids.volume}>
          <div className="flex w-56 items-center gap-3">
            <input
              id={ids.volume}
              type="range"
              min={0}
              max={100}
              step={5}
              value={draft.soundVolume}
              onChange={(e) => set('soundVolume', Number(e.target.value))}
              className="flex-1 accent-brand"
            />
            <span className="w-8 text-end text-xs text-label-secondary tabular-nums">{formatNumber(draft.soundVolume)}</span>
          </div>
        </SettingRow>
        <SettingRow label="هشدار مدت بازی" hint="هر بار که یک جلسه این مقدار بازی را کامل کند." htmlFor={ids.alert}>
          <Select id={ids.alert} className="w-36" value={draft.alertEveryMinutes} onChange={(e) => set('alertEveryMinutes', Number(e.target.value))}>
            {ALERT_INTERVALS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'خاموش' : `هر ${minutesLabel(m)}`}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow label="هشدار مکث طولانی" hint="یک بار برای هر مکث، وقتی جلسه این مدت متوقف بماند." htmlFor={ids.pause}>
          <Select id={ids.pause} className="w-36" value={draft.longPauseMinutes} onChange={(e) => set('longPauseMinutes', Number(e.target.value))}>
            {PAUSE_LIMITS.map((m) => (
              <option key={m} value={m}>
                {minutesLabel(m)}
              </option>
            ))}
          </Select>
        </SettingRow>
      </Section>

      <CategoryManager />

      <div className="fixed bottom-5 start-[calc(15rem+1.5rem)] end-6 z-20 mx-auto flex max-w-[1100px] items-center gap-3 rounded-2xl border border-white/10 bg-surface-raised px-4 py-3 shadow-2xl shadow-black/60">
        <p className="flex-1 text-[13px] text-label-secondary">
          {error ? <span role="alert" className="text-status-maintenance">{error}</span> : dirty ? 'تغییرات ذخیره نشده است.' : 'همه‌ی تغییرات ذخیره شده است.'}
        </p>
        <Button onClick={() => setDraft(initial)} disabled={!dirty || saving}>
          بازگردانی
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={!dirty || saving}>
          ذخیره‌ی تغییرات
        </Button>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings)
  if (!settings) return null
  // Re-key on saved content so the draft resets cleanly after a save/restore.
  return <SettingsForm key={JSON.stringify(settings)} initial={settings} />
}
