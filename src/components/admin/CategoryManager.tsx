import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { errorMessage } from '@/lib/api'
import { normalizeHex } from '@/lib/branding'
import { UNCATEGORIZED_LABEL } from '@/lib/buffet'
import { formatNumber } from '@/lib/currency'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import type { Category } from '@/types'
import { CategoryDot } from '../buffet/CategoryDot'
import { Button } from '../ui/Button'
import type { ColorPreset } from '@/lib/branding'
import { ColorField } from '../ui/ColorField'
import { Field, Select, TextInput } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { Section } from '../ui/Section'

const CATEGORY_COLORS: readonly ColorPreset[] = [
  { color: '#64d2ff', label: 'آبی روشن' },
  { color: '#bf5af2', label: 'بنفش' },
  { color: '#ff6482', label: 'صورتی' },
  { color: '#ffd60a', label: 'زرد' },
  { color: '#ac8e68', label: 'قهوه‌ای' },
  { color: '#8e8e93', label: 'خاکستری' },
]

function CategoryForm({ category, onClose }: { category?: Category; onClose: () => void }) {
  const createCategory = useSettingsStore((s) => s.createCategory)
  const updateCategory = useSettingsStore((s) => s.updateCategory)
  const pushToast = useUiStore((s) => s.pushToast)
  const ids = { name: useId(), color: useId() }
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0]!.color)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (name.trim() === '') return setError('نام دسته را وارد کنید.')
    if (!normalizeHex(color)) return setError('رنگ را به شکل ‎#rrggbb‎ وارد کنید.')
    setSaving(true)
    setError(null)
    try {
      if (category) await updateCategory(category.id, { name, color })
      else await createCategory({ name, color })
      pushToast({ tone: 'success', title: category ? 'دسته ذخیره شد' : 'دسته اضافه شد', detail: name.trim() })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={category ? 'ویرایش دسته' : 'دسته‌ی جدید'}
      subtitle={category?.name}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="primary" size="lg" className="flex-1" disabled={saving} onClick={() => void submit()}>
            {category ? 'ذخیره' : 'افزودن دسته'}
          </Button>
          <Button size="lg" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="نام" htmlFor={ids.name}>
          <TextInput id={ids.name} value={name} maxLength={40} autoFocus placeholder="مثلاً نوشیدنی گرم" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="رنگ" htmlFor={ids.color}>
          <ColorField id={ids.color} value={color} onChange={setColor} presets={CATEGORY_COLORS} />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-status-maintenance/10 px-3 py-2.5 text-[13px] text-status-maintenance">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/** Delete a category; its products move to another category or become uncategorised (one transaction). */
function DeleteCategory({ category, onClose }: { category: Category; onClose: () => void }) {
  const categories = useSettingsStore((s) => s.categories)
  const deleteCategory = useSettingsStore((s) => s.deleteCategory)
  const pushToast = useUiStore((s) => s.pushToast)
  const targetId = useId()
  const others = categories.filter((c) => c.id !== category.id)
  const [target, setTarget] = useState('none')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const confirm = async () => {
    setSaving(true)
    try {
      await deleteCategory(category.id, target === 'none' ? null : Number(target))
      pushToast({ tone: 'success', title: 'دسته حذف شد', detail: category.name })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <Modal
      title="حذف دسته"
      subtitle={category.name}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="primary" size="lg" className="flex-1" disabled={saving} onClick={() => void confirm()}>
            حذف دسته
          </Button>
          <Button size="lg" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-6 text-label-secondary">
          {category.productCount > 0
            ? `${formatNumber(category.productCount)} کالا در این دسته است. پیش از حذف، آن‌ها به دسته‌ی زیر منتقل می‌شوند (همه با هم، در یک تراکنش).`
            : 'این دسته کالایی ندارد.'}
        </p>
        {category.productCount > 0 && (
          <Field label="انتقال کالاها به" htmlFor={targetId}>
            <Select id={targetId} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="none">{UNCATEGORIZED_LABEL}</option>
              {others.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-status-maintenance/10 px-3 py-2.5 text-[13px] text-status-maintenance">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

export function CategoryManager() {
  const categories = useSettingsStore((s) => s.categories)
  const uncategorized = useSettingsStore((s) => s.products.filter((p) => p.categoryId === null).length)
  const [editing, setEditing] = useState<{ category?: Category } | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  return (
    <Section
      title="دسته‌بندی کالا"
      description="تغییرات دسته‌ها بلافاصله ذخیره می‌شوند (جدا از دکمه‌ی ذخیره‌ی پایین صفحه). کالای بدون دسته همه‌جا قابل فروش است."
      actions={
        <Button onClick={() => setEditing({})}>
          <Plus />
          دسته‌ی جدید
        </Button>
      }
    >
      <ul aria-label="دسته‌ها">
        {categories.map((category) => (
          <li key={category.id} data-category-id={category.id} className="flex items-center gap-3 border-b border-separator px-4 py-2.5 text-[13px]">
            <CategoryDot color={category.color} size="size-3" />
            <span className="font-medium">{category.name}</span>
            <span className="text-xs text-label-tertiary tabular-nums">{formatNumber(category.productCount)} کالا</span>
            <div className="ms-auto flex gap-1">
              <Button variant="ghost" size="sm" aria-label={`ویرایش ${category.name}`} onClick={() => setEditing({ category })}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="sm" aria-label={`حذف ${category.name}`} onClick={() => setDeleting(category)}>
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
        <li className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-label-secondary">
          <CategoryDot size="size-3" />
          <span>{UNCATEGORIZED_LABEL}</span>
          <span className="text-xs text-label-tertiary tabular-nums">{formatNumber(uncategorized)} کالا</span>
        </li>
      </ul>
      {editing && <CategoryForm category={editing.category} onClose={() => setEditing(null)} />}
      {deleting && <DeleteCategory category={deleting} onClose={() => setDeleting(null)} />}
    </Section>
  )
}
