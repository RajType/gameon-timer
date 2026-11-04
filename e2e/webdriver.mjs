// Minimal W3C WebDriver client (no dependencies) for driving the real Tauri
// window through `tauri-driver` (Linux: WebKitWebDriver, Windows: msedgedriver).

// W3C web element identifier.
export const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf'

export class Driver {
  constructor(base = 'http://127.0.0.1:4444') {
    this.base = base
    this.id = null
  }

  async req(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json?.value?.error) {
      throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json.value ?? json).slice(0, 400)}`)
    }
    return json.value
  }

  s(path) {
    return `/session/${this.id}${path}`
  }

  async start(application) {
    const value = await this.req('POST', '/session', {
      capabilities: { alwaysMatch: { browserName: 'wry', 'tauri:options': { application } } },
    })
    this.id = value.sessionId
    return this
  }

  async quit() {
    if (!this.id) return
    await this.req('DELETE', this.s('')).catch(() => {})
    this.id = null
  }

  exec(script, ...args) {
    return this.req('POST', this.s('/execute/sync'), { script, args })
  }

  execAsync(script, ...args) {
    return this.req('POST', this.s('/execute/async'), { script, args })
  }

  async find(using, value) {
    const el = await this.req('POST', this.s('/element'), { using, value })
    return el[ELEMENT]
  }

  css(selector) {
    return this.find('css selector', selector)
  }

  xpath(expr) {
    return this.find('xpath', expr)
  }

  click(id) {
    return this.req('POST', this.s(`/element/${id}/click`), {})
  }

  type(id, text) {
    return this.req('POST', this.s(`/element/${id}/value`), { text })
  }

  clear(id) {
    return this.req('POST', this.s(`/element/${id}/clear`), {})
  }

  text(id) {
    return this.req('GET', this.s(`/element/${id}/text`))
  }

  async screenshot() {
    return Buffer.from(await this.req('GET', this.s('/screenshot')), 'base64')
  }

  /** Poll `fn` until it returns a truthy value. */
  async waitFor(fn, { timeout = 10_000, interval = 150, message = 'condition' } = {}) {
    const deadline = Date.now() + timeout
    let last
    while (Date.now() < deadline) {
      try {
        last = await fn()
        if (last) return last
      } catch (error) {
        last = error
      }
      await new Promise((r) => setTimeout(r, interval))
    }
    throw new Error(`timed out waiting for ${message} (last: ${last instanceof Error ? last.message : JSON.stringify(last)})`)
  }
}
