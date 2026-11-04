import { DatabaseZap, Gamepad2, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { Button } from './ui/Button'

/** Shown until the SQLite store is open: loading, fatal error, or a failed legacy import. */
export function BootScreen() {
  const phase = useAppStore((s) => s.phase)
  const error = useAppStore((s) => s.error)
  const legacy = useAppStore((s) => s.legacy)
  const bootstrap = useAppStore((s) => s.bootstrap)
  const continueWithoutLegacy = useAppStore((s) => s.continueWithoutLegacy)
  const [busy, setBusy] = useState(false)

  if (phase === 'loading') {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-4 text-label-secondary">
          <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-b from-gold-300 to-gold-600 text-black shadow-gold">
            <Gamepad2 className="size-7" />
          </div>
          <p className="flex items-center gap-2 text-[13px]">
            <LoaderCircle className="size-4 animate-spin" />
            در حال آماده‌سازی داده‌ها…
          </p>
        </div>
      </div>
    )
  }

  const isLegacy = phase === 'legacy-failed'
  return (
    <div className="grid h-full place-items-center p-6">
      <div role="alert" className="glass w-full max-w-lg rounded-3xl border border-separator p-7 shadow-glass">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-status-paused/12 text-status-paused">
            <DatabaseZap className="size-5" />
          </div>
          <h1 className="text-lg font-semibold">
            {isLegacy ? 'انتقال داده‌های نسخه‌ی قبلی انجام نشد' : 'پایگاه داده در دسترس نیست'}
          </h1>
        </div>

        <p className="mt-4 text-[13px] leading-6 text-label-secondary">
          {isLegacy
            ? 'داده‌های قبلی (ایستگاه‌ها، جلسه‌ها و فاکتورها) سالم وارد نشدند و هیچ تغییری در پایگاه داده‌ی جدید ثبت نشد. نسخه‌ی اصلی داده‌ها دست‌نخورده باقی مانده و یک نسخه‌ی کامل از آن نیز در پایگاه داده ذخیره شده است.'
            : 'برنامه نتوانست پایگاه داده‌ی محلی را باز کند. داده‌ای حذف نشده است.'}
        </p>
        {(error ?? legacy?.error) && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-black/40 p-3 text-xs leading-5 whitespace-pre-wrap text-label-secondary select-text">
            {error ?? legacy?.error}
          </pre>
        )}

        <div className="mt-6 flex gap-2">
          <Button variant={isLegacy ? 'secondary' : 'primary'} onClick={() => void bootstrap()} disabled={busy}>
            تلاش دوباره
          </Button>
          {isLegacy && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await continueWithoutLegacy()
                setBusy(false)
              }}
            >
              ادامه بدون انتقال
            </Button>
          )}
        </div>
        {isLegacy && (
          <p className="mt-3 text-xs leading-5 text-label-tertiary">
            با «ادامه بدون انتقال»، برنامه با تنظیمات پیش‌فرض شروع می‌شود و داده‌ی قبلی برای بررسی بعدی در بخش «داده و پشتیبان» نگهداری می‌شود.
          </p>
        )}
      </div>
    </div>
  )
}
