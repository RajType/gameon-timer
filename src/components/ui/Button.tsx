import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const VARIANT: Record<Variant, string> = {
  // Gold = the one action that moves money or the session forward.
  primary: 'bg-brand text-brand-contrast shadow-brand hover:bg-brand-400 active:bg-brand-600',
  secondary: 'bg-white/[0.08] text-label hover:bg-white/[0.13] active:bg-white/[0.06]',
  ghost: 'text-label-secondary hover:bg-white/[0.07] hover:text-label',
}

const SIZE: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-2.5 text-[13px] [&_svg]:size-3.5',
  md: 'h-9 gap-1.5 rounded-[10px] px-3 text-[13px] [&_svg]:size-4',
  lg: 'h-11 gap-2 rounded-xl px-5 text-[15px] [&_svg]:size-[18px]',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap',
        'transition-[background-color,color,transform,opacity] duration-150 active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  )
}
