import { vi } from 'vitest'

/**
 * jsdom has no layout: fake `clientWidth` and a controllable ResizeObserver so
 * tests can simulate the window being resized.
 */
export function installResizeObserver(initialWidth: number) {
  let width = initialWidth
  const callbacks = new Set<() => void>()
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width })
  class FakeResizeObserver {
    private readonly run: () => void
    constructor(callback: ResizeObserverCallback) {
      this.run = () => callback([], this as unknown as ResizeObserver)
    }
    observe() {
      callbacks.add(this.run)
      this.run()
    }
    unobserve() {}
    disconnect() {
      callbacks.delete(this.run)
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  return {
    resize(next: number) {
      width = next
      callbacks.forEach((run) => run())
    },
  }
}
