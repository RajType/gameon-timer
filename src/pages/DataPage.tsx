import { ArchiveRestore, DatabaseBackup, FolderOpen, HardDriveDownload, LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Section, SettingRow } from '@/components/ui/Section'
import { api, errorMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatNumber, toPersianDigits } from '@/lib/currency'
import { formatDateTime } from '@/lib/time'
import { useAppStore } from '@/store/appStore'
import { toastError, useUiStore } from '@/store/uiStore'
import type { BackupInfo, BackupKind, DataInfo, ImportSummary, LegacyImportRecord, RestoreResult } from '@/types'

const KIND_LABEL: Record<BackupKind, string> = {
  manual: 'دستی',
  auto: 'خودکار روزانه',
  'pre-migration': 'پیش از ارتقای برنامه',
  'pre-restore': 'نسخه‌ی ایمنی پیش از بازگردانی',
}

const LEGACY_LABEL: Record<LegacyImportRecord['status'], { text: string; tone: string }> = {
  imported: { text: 'منتقل شد', tone: 'text-status-running' },
  skipped: { text: 'نگهداری شد (ادغام نشد)', tone: 'text-status-paused' },
  failed: { text: 'ناموفق', tone: 'text-status-maintenance' },
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${formatNumber(bytes)} بایت`
  if (bytes < 1024 * 1024) return `${formatNumber(Math.round(bytes / 1024))} کیلوبایت`
  return `${toPersianDigits((bytes / 1024 / 1024).toFixed(1))} مگابایت`
}

function legacyDetail(record: LegacyImportRecord): string {
  if (record.status !== 'imported') return record.detail
  try {
    const s = JSON.parse(record.detail) as ImportSummary
    return `${formatNumber(s.stations)} ایستگاه، ${formatNumber(s.openSessions)} جلسه‌ی باز، ${formatNumber(s.invoices)} فاکتور، ${formatNumber(s.orderLines)} ردیف بوفه`
  } catch {
    return record.detail
  }
}

export function DataPage() {
  const [info, setInfo] = useState<DataInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<BackupInfo | null>(null)
  const applyBootstrap = useAppStore((s) => s.applyBootstrap)
  const pushToast = useUiStore((s) => s.pushToast)

  const load = useCallback(async () => {
    try {
      setInfo(await api.dataInfo())
    } catch (e) {
      toastError('اطلاعات داده بارگذاری نشد', e)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api.dataInfo().then(
      (next) => !cancelled && setInfo(next),
      (e: unknown) => toastError('اطلاعات داده بارگذاری نشد', e),
    )
    return () => {
      cancelled = true
    }
  }, [])

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key)
    try {
      await task()
    } catch (e) {
      toastError('عملیات انجام نشد', new Error(errorMessage(e)))
    } finally {
      setBusy(null)
    }
  }

  const afterRestore = async (result: RestoreResult) => {
    applyBootstrap(result.bootstrap)
    pushToast({
      tone: 'success',
      title: 'بازگردانی انجام شد',
      detail: `نسخه‌ی ایمنی از داده‌های قبلی: ${result.report.safetyBackup.fileName}`,
    })
    await load()
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-8">
      <Section title="پایگاه داده" description="همه‌ی ایستگاه‌ها، جلسه‌ها، سفارش‌ها، فاکتورها، نرخ‌ها و تنظیمات در این فایل SQLite ذخیره می‌شوند.">
        <SettingRow label="مسیر فایل">
          <code dir="ltr" className="block max-w-[520px] truncate rounded-lg bg-black/30 px-2.5 py-1 text-xs text-label-secondary select-text">
            {info?.dbPath ?? '…'}
          </code>
        </SettingRow>
        <SettingRow label="حجم">
          <span className="text-[13px] text-label-secondary tabular-nums">{info ? formatSize(info.sizeBytes) : '…'}</span>
        </SettingRow>
        <SettingRow label="نسخه‌ی طرح‌واره">
          <span className="text-[13px] text-label-secondary tabular-nums">
            {info ? `${toPersianDigits(info.schemaVersion)} از ${toPersianDigits(info.latestSchemaVersion)}` : '…'}
          </span>
        </SettingRow>
        <SettingRow label="تعداد فاکتورها">
          <span className="text-[13px] text-label-secondary tabular-nums">{info ? formatNumber(info.invoiceCount) : '…'}</span>
        </SettingRow>
      </Section>

      <Section
        title="پشتیبان‌گیری و بازگردانی"
        description={`هر روز یک پشتیبان خودکار گرفته می‌شود (${toPersianDigits(14)} نسخه‌ی آخر نگهداری می‌شود). پیش از هر بازگردانی، یک نسخه‌ی ایمنی از داده‌های فعلی ساخته می‌شود.`}
        actions={
          <>
            <Button
              variant="primary"
              disabled={busy !== null}
              onClick={() =>
                void run('backup', async () => {
                  setInfo(await api.createBackup())
                  pushToast({ tone: 'success', title: 'پشتیبان ساخته شد' })
                })
              }
            >
              {busy === 'backup' ? <LoaderCircle className="animate-spin" /> : <DatabaseBackup />}
              پشتیبان‌گیری الان
            </Button>
            <Button
              disabled={busy !== null}
              onClick={() =>
                void run('export', async () => {
                  const path = await api.exportBackup()
                  if (path) pushToast({ tone: 'success', title: 'پشتیبان ذخیره شد', detail: path })
                })
              }
            >
              <HardDriveDownload />
              ذخیره در فایل…
            </Button>
            <Button
              disabled={busy !== null}
              onClick={() =>
                void run('restore-file', async () => {
                  const result = await api.restoreBackupFromFile()
                  if (result) await afterRestore(result)
                })
              }
            >
              <FolderOpen />
              بازگردانی از فایل…
            </Button>
          </>
        }
      >
        {info && info.backups.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-label-secondary">هنوز پشتیبانی ساخته نشده است.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-separator text-xs text-label-tertiary">
                <th className="px-4 py-2.5 text-start font-medium">زمان</th>
                <th className="px-4 py-2.5 text-start font-medium">نوع</th>
                <th className="px-4 py-2.5 text-start font-medium">حجم</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {info?.backups.map((backup) => (
                <tr key={backup.fileName} className="border-b border-separator last:border-b-0" data-backup={backup.fileName}>
                  <td className="px-4 py-2.5 tabular-nums">{formatDateTime(backup.createdAt)}</td>
                  <td className="px-4 py-2.5 text-label-secondary">{KIND_LABEL[backup.kind]}</td>
                  <td className="px-4 py-2.5 text-label-secondary tabular-nums">{formatSize(backup.sizeBytes)}</td>
                  <td className="px-4 py-2.5 text-end">
                    <Button size="sm" disabled={busy !== null} onClick={() => setConfirming(backup)}>
                      <ArchiveRestore />
                      بازگردانی
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {info && (
          <p dir="ltr" className="border-t border-separator px-4 py-2.5 text-end text-xs text-label-tertiary select-text">
            {info.backupsDir}
          </p>
        )}
      </Section>

      <Section
        title="انتقال از نسخه‌ی قبلی"
        description="داده‌های نسخه‌ی قبلی (localStorage) یک‌بار و به‌صورت کامل منتقل می‌شوند. متن اصلی آن‌ها همیشه در پایگاه داده و پشتیبان‌ها نگهداری می‌شود."
      >
        {info && info.legacyImports.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-label-secondary">داده‌ای از نسخه‌ی قبلی پیدا نشد.</p>
        ) : (
          <ul>
            {info?.legacyImports.map((record) => (
              <li key={`${record.payloadHash}:${record.status}`} className="flex items-start gap-4 border-b border-separator px-4 py-3 last:border-b-0">
                <span className={cn('w-40 shrink-0 text-[13px] font-medium', LEGACY_LABEL[record.status].tone)}>
                  {LEGACY_LABEL[record.status].text}
                </span>
                <div className="min-w-0 flex-1 text-xs leading-5 text-label-secondary">
                  <p>{legacyDetail(record)}</p>
                  <p className="text-label-tertiary">
                    {formatDateTime(record.createdAt)} – {formatSize(record.payloadBytes)} –{' '}
                    <span dir="ltr" className="font-mono">{record.payloadHash.slice(0, 12)}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {confirming && (
        <Modal
          title="بازگردانی پشتیبان"
          subtitle={formatDateTime(confirming.createdAt)}
          onClose={() => setConfirming(null)}
          busy={busy === 'restore'}
          footer={
            <>
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                disabled={busy !== null}
                onClick={() =>
                  void run('restore', async () => {
                    await afterRestore(await api.restoreBackup(confirming.fileName))
                    setConfirming(null)
                  })
                }
              >
                {busy === 'restore' && <LoaderCircle className="animate-spin" />}
                جایگزینی داده‌ها
              </Button>
              <Button size="lg" onClick={() => setConfirming(null)} disabled={busy !== null}>
                انصراف
              </Button>
            </>
          }
        >
          <p className="text-[13px] leading-6 text-label-secondary">
            همه‌ی داده‌های فعلی (از جمله جلسه‌های باز) با محتوای این پشتیبان جایگزین می‌شوند. پیش از این کار، به‌طور خودکار یک نسخه‌ی ایمنی از وضعیت فعلی ساخته می‌شود تا در صورت نیاز قابل بازگشت باشد.
          </p>
        </Modal>
      )}
    </div>
  )
}
