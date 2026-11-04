/** Join truthy class names. Tiny on purpose — no runtime dependency needed. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
