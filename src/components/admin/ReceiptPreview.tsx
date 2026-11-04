import { applyRounding } from '@/lib/billing'
import { formatNumber, formatSignedToman, toPersianDigits } from '@/lib/currency'
import type { Settings } from '@/types'

const SAMPLE = [
  { label: 'زمان بازی (۲ دسته)', amount: 182_250 },
  { label: 'نوشابه × ۲', amount: 50_000 },
]

/** Paper-style preview of the printed receipt with the current (unsaved) settings. */
export function ReceiptPreview({ settings }: { settings: Settings }) {
  const subtotal = SAMPLE.reduce((sum, l) => sum + l.amount, 0)
  const total = applyRounding(subtotal, { unit: settings.roundingUnit, mode: settings.roundingMode })
  return (
    <div
      aria-label="پیش‌نمایش رسید"
      className="w-64 rounded-md bg-[#f4f2ec] px-5 py-5 font-sans text-[12px] leading-5 text-[#1b1b1b] shadow-2xl shadow-black/50"
    >
      <p className="text-center text-[15px] font-bold">{settings.storeName || '—'}</p>
      {settings.receiptHeader && (
        <p className="mt-1 text-center text-[11px] whitespace-pre-line text-[#555]">{settings.receiptHeader}</p>
      )}
      <div className="my-3 border-t border-dashed border-[#999]" />
      <p className="flex justify-between text-[11px] text-[#555]">
        <span>ایستگاه ۳</span>
        <span>فاکتور {toPersianDigits(128)}</span>
      </p>
      <div className="my-2 border-t border-dashed border-[#999]" />
      {SAMPLE.map((line) => (
        <p key={line.label} className="flex justify-between">
          <span>{line.label}</span>
          <span className="tabular-nums">{formatNumber(line.amount)}</span>
        </p>
      ))}
      <div className="my-2 border-t border-dashed border-[#999]" />
      {total !== subtotal && (
        <p className="flex justify-between text-[11px] text-[#555]">
          <span>گرد کردن</span>
          <span className="tabular-nums">{formatSignedToman(total - subtotal)}</span>
        </p>
      )}
      <p className="flex justify-between text-[14px] font-bold">
        <span>جمع کل</span>
        <span className="tabular-nums">{formatNumber(total)} تومان</span>
      </p>
      {settings.receiptFooter && (
        <p className="mt-3 text-center text-[11px] whitespace-pre-line text-[#555]">{settings.receiptFooter}</p>
      )}
    </div>
  )
}
