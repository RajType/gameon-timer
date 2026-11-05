import { useId, useState } from 'react'
import { errorMessage } from '@/lib/api'
import { UNCATEGORIZED_LABEL, validateProduct } from '@/lib/buffet'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import type { Product } from '@/types'
import { Button } from '../ui/Button'
import { Field, Select, TextInput } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { MoneyInput } from '../ui/MoneyInput'
import { Switch } from '../ui/Switch'

interface ProductFormProps {
  product?: Product
  /** Pre-selected category for a new item (e.g. the active buffet filter). */
  defaultCategoryId?: number | null
  onClose: () => void
}

export function ProductForm({ product, defaultCategoryId = null, onClose }: ProductFormProps) {
  const createProduct = useSettingsStore((s) => s.createProduct)
  const updateProduct = useSettingsStore((s) => s.updateProduct)
  const pushToast = useUiStore((s) => s.pushToast)
  const categories = useSettingsStore((s) => s.categories)
  const ids = { name: useId(), category: useId(), price: useId(), stock: useId(), active: useId(), counted: useId() }

  const [name, setName] = useState(product?.name ?? '')
  // Uncategorised stays a valid choice: such items work everywhere.
  const [categoryId, setCategoryId] = useState<number | null>(product ? product.categoryId : defaultCategoryId)
  const [price, setPrice] = useState<number | null>(product?.price ?? null)
  const [active, setActive] = useState(product?.active ?? true)
  const [counted, setCounted] = useState(product ? product.stockQuantity !== null : true)
  const [stock, setStock] = useState<number | null>(product?.stockQuantity ?? null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const problem = validateProduct({ name, price, counted, stock })
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    const input = { name, categoryId, price: price ?? 0, active, stockQuantity: counted ? stock : null }
    try {
      if (product) await updateProduct(product.id, input)
      else await createProduct(input)
      pushToast({ tone: 'success', title: product ? 'کالا ذخیره شد' : 'کالا اضافه شد', detail: name.trim() })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={product ? 'ویرایش کالا' : 'کالای جدید'}
      subtitle={product?.name}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Button variant="primary" size="lg" className="flex-1" disabled={saving} onClick={() => void submit()}>
            {product ? 'ذخیره' : 'افزودن کالا'}
          </Button>
          <Button size="lg" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label="نام" htmlFor={ids.name}>
          <TextInput id={ids.name} value={name} maxLength={40} autoFocus placeholder="مثلاً آبمیوه" onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="دسته" htmlFor={ids.category}>
          <Select
            id={ids.category}
            value={categoryId === null ? 'none' : String(categoryId)}
            onChange={(e) => setCategoryId(e.target.value === 'none' ? null : Number(e.target.value))}
          >
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
            <option value="none">{UNCATEGORIZED_LABEL}</option>
          </Select>
        </Field>

        <Field label="قیمت" htmlFor={ids.price} hint="تغییر قیمت فقط روی سفارش‌های بعدی اثر دارد.">
          <MoneyInput id={ids.price} value={price} invalid={price === null && error !== null} onChange={setPrice} />
        </Field>

        <div className="flex flex-col gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
          <div className="flex items-center justify-between">
            <label htmlFor={ids.counted} className="text-[13px]">
              شمارش موجودی
              <span className="block text-xs text-label-tertiary">با هر سفارش کم می‌شود؛ موجودی هیچ‌وقت منفی نمی‌شود.</span>
            </label>
            <Switch id={ids.counted} label="شمارش موجودی" checked={counted} onChange={setCounted} />
          </div>
          {counted && (
            <Field label="موجودی فعلی" htmlFor={ids.stock} hint="تعداد موجود در انبار را وارد کنید.">
              <MoneyInput id={ids.stock} unit="عدد" value={stock} invalid={stock === null && error !== null} onChange={setStock} />
            </Field>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2.5">
          <label htmlFor={ids.active} className="text-[13px]">
            فعال
            <span className="block text-xs text-label-tertiary">کالای غیرفعال در فهرست سفارش نمایش داده نمی‌شود.</span>
          </label>
          <Switch id={ids.active} label="فعال" checked={active} onChange={setActive} />
        </div>

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
