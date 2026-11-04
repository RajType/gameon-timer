#!/usr/bin/env node
// End-to-end test of the real desktop app through tauri-driver.
//
//   Linux:   xvfb-run -a node e2e/run.mjs   (needs tauri-driver + WebKitWebDriver)
//   Windows: node e2e/run.mjs               (needs tauri-driver + msedgedriver) — NOT yet verified;
//            uses the real WebView2 profile, so only on a disposable test machine
//            (E2E_ALLOW_REAL_PROFILE=1).
//
// Env:
//   E2E_APP         new app binary   (default: src-tauri/target/debug/gameon-timer)
//   E2E_LEGACY_APP  v0.1.0 binary (localStorage version). When set, the run starts
//                   with a real upgrade: data is created in the old app first.
//   E2E_OUT         screenshot folder (default: e2e/artifacts)
//
// Isolation: XDG_DATA_HOME (WebView profile, Linux) and GAMEON_DATA_DIR (SQLite)
// point at a fresh temp folder, so a real store profile is never touched.

import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { Driver } from './webdriver.mjs'

import { ELEMENT } from './webdriver.mjs'
const root = path.resolve(import.meta.dirname, '..')
const exe = process.platform === 'win32' ? '.exe' : ''
const APP = process.env.E2E_APP ?? path.join(root, `src-tauri/target/debug/gameon-timer${exe}`)
const LEGACY_APP = process.env.E2E_LEGACY_APP
const OUT = process.env.E2E_OUT ?? path.join(root, 'e2e/artifacts')
// XDG_DATA_HOME isolates the WebView profile on Linux only. Elsewhere the run
// would write into the machine's real WebView storage, so require consent.
if (process.platform !== 'linux' && process.env.E2E_ALLOW_REAL_PROFILE !== '1') {
  console.error('Refusing to run: WebView profile isolation is Linux-only. On a disposable test machine set E2E_ALLOW_REAL_PROFILE=1.')
  process.exit(2)
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gameon-e2e-'))
const env = {
  ...process.env,
  GAMEON_DATA_DIR: path.join(work, 'data'),
  XDG_DATA_HOME: path.join(work, 'xdg'),
  WEBKIT_DISABLE_DMABUF_RENDERER: '1',
}
fs.mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ZWNJ = '‌'
const fa = (n) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])
const toInt = (s) => Number(String(s).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[^\d]/g, ''))
const seconds = (hms) => {
  const [h, m, s] = String(hms).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).split(':').map(Number)
  return h * 3600 + m * 60 + s
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// ---- driver lifecycle ---------------------------------------------------------

function waitForPort(port, timeout = 15_000) {
  const deadline = Date.now() + timeout
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.end()
        resolve()
      })
      socket.on('error', () => (Date.now() > deadline ? reject(new Error('tauri-driver did not start')) : setTimeout(attempt, 200)))
    }
    attempt()
  })
}

const driverProcess = spawn('tauri-driver', [], { env, stdio: ['ignore', 'ignore', 'pipe'] })
driverProcess.stderr.on('data', () => {})
await waitForPort(4444)

let d = new Driver()

async function launch(binary = APP) {
  await d.quit()
  d = new Driver()
  await d.start(binary)
  // The app reopens on the last view (persisted UI preference), so wait for the shell.
  await d.waitFor(() => d.exec(`return !!document.querySelector('nav[aria-label="منوی اصلی"]')`), {
    timeout: 20_000,
    message: 'app shell',
  })
}

/** SIGKILL the app (no shutdown hooks run) — simulates a crash or power loss. */
function hardKill(binary) {
  if (process.platform === 'win32') {
    execSync(`taskkill /F /IM ${path.basename(binary)}`, { stdio: 'ignore' })
    return
  }
  // Not `pkill -f`: it would also match the shell running it.
  const pids = execSync('ps -eo pid=,args=', { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
    .filter((m) => m && m[2].split(' ')[0] === binary)
    .map((m) => Number(m[1]))
  assert(pids.length > 0, `no running process for ${binary}`)
  for (const pid of pids) process.kill(pid, 'SIGKILL')
}

// ---- page helpers --------------------------------------------------------------

const card = (name) => `//article[@aria-label='${name}']`
const station = (n) => `ایستگاه ${fa(n)}`

async function clickX(xpath) {
  try {
    await d.click(await d.xpath(xpath))
  } catch (error) {
    if (!String(error.message).includes('intercepted')) throw error
    await dismissToasts() // a transient toast was on top; the operator would wait
    await d.click(await d.xpath(xpath))
  }
}

async function cardButton(name, label) {
  await clickX(`${card(name)}//button[contains(normalize-space(.), '${label}')]`)
}

async function cardInfo(name) {
  return d.exec(
    `const a = document.querySelector('article[aria-label="' + arguments[0] + '"]');
     if (!a) return null;
     const timer = a.querySelector('p[dir="ltr"]');
     return { text: a.innerText, timer: timer ? timer.textContent : null };`,
    name,
  )
}

async function waitCard(name, predicate, message) {
  return d.waitFor(async () => {
    const info = await cardInfo(name)
    return info && predicate(info) ? info : null
  }, { message: `${name}: ${message}` })
}

async function dismissToasts() {
  await d.exec(`document.querySelectorAll('[aria-live] [role] button[aria-label="بستن"]').forEach(b => b.click()); return true`)
  await sleep(100)
}

async function nav(label) {
  await dismissToasts()
  await clickX(`//nav[@aria-label='منوی اصلی']//button[.//span[normalize-space()='${label}']]`)
  await sleep(250)
}

async function toastSeen(text, timeout = 8_000) {
  return d.waitFor(() => d.exec(`return [...document.querySelectorAll('[role=status],[role=alert]')].some(t => t.innerText.includes(arguments[0]))`, text), {
    timeout,
    message: `toast "${text}"`,
  })
}

/** Element for the form control labelled `label` (optionally inside the dialog). */
async function control(label, { inDialog = true } = {}) {
  const ref = await d.exec(
    `const scope = arguments[1] ? document.querySelector('[role=dialog]') : document;
     const l = [...scope.querySelectorAll('label')].find(x => x.firstChild && x.firstChild.textContent.trim() === arguments[0]);
     return l ? (l.control || document.getElementById(l.htmlFor)) : null;`,
    label,
    inDialog,
  )
  assert(ref, `control "${label}" not found`)
  return ref[ELEMENT]
}

async function selectOption(selectId, value) {
  const option = await d.exec(`return arguments[0].querySelector('option[value="' + arguments[1] + '"]')`, { [ELEMENT]: selectId }, String(value))
  assert(option, `option ${value} missing`)
  await d.click(option[ELEMENT])
}

/** Replace an input's text: focus, select all, type (Ctrl+A is unreliable in WebKitWebDriver). */
async function replaceText(id, text) {
  await d.click(id)
  await d.exec('arguments[0].select(); return true', { [ELEMENT]: id })
  await d.type(id, text)
}

async function shot(name) {
  fs.writeFileSync(path.join(OUT, `${name}.png`), await d.screenshot())
}

async function localStorageGet(key) {
  return d.exec('return localStorage.getItem(arguments[0])', key)
}

// ---- scenarios -----------------------------------------------------------------

// Not a seeded plan name, so the run works with or without the legacy upgrade step.
const E2E_PLAN = 'اتاق VIP ویژه'

const results = []
async function step(name, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`✓ ${name} (${Date.now() - started} ms)`)
  } catch (error) {
    results.push({ name, ok: false, error: error.message })
    console.log(`✗ ${name}\n    ${error.message}`)
    await shot(`FAILED-${results.length}`).catch(() => {})
    throw error
  }
}

let legacyPayload = null
let oldTimer1 = 0

try {
  if (LEGACY_APP) {
    await step('v0.1.0: create data in the old localStorage app', async () => {
      await launch(LEGACY_APP)
      for (const n of [1, 2, 7]) await cardButton(station(n), 'شروع جلسه')
      await clickX(`${card(station(1))}//button[@aria-label='افزودن از بوفه']`)
      await clickX(`//button[@aria-label='افزودن نوشابه']`)
      await clickX(`//button[@aria-label='افزودن نوشابه']`)
      await clickX(`${card(station(1))}//button[@aria-label='افزودن از بوفه']`)
      await sleep(1200)
      await cardButton(station(2), 'مکث')
      await cardButton(station(7), 'تسویه')
      await clickX(`//button[contains(., 'پرداخت و بستن جلسه')]`)
      await waitCard(station(7), (i) => i.text.includes('آزاد'), 'free after checkout')
      legacyPayload = await localStorageGet('gameon:floor')
      const state = JSON.parse(legacyPayload).state
      assert(Object.keys(state.sessions).length === 2 && state.invoices.length === 1, 'old app state as expected')
      oldTimer1 = seconds((await cardInfo(station(1))).timer)
      await shot('00-v010-dashboard')
      await sleep(1500) // let WebKit flush localStorage
    })

    await step('upgrade: new app imports localStorage into SQLite exactly once', async () => {
      await launch(APP)
      await toastSeen('داده‌های نسخه‌ی قبلی منتقل شد')
      const c1 = await waitCard(station(1), (i) => i.text.includes('در حال بازی'), 'running')
      assert(seconds(c1.timer) >= oldTimer1, `timer continued (${c1.timer})`)
      assert(c1.text.includes('۵۰٬۰۰۰'), 'buffet 2 × 25,000 kept')
      await waitCard(station(2), (i) => i.text.includes('متوقف'), 'paused')
      await waitCard(station(7), (i) => i.text.includes('آزاد'), 'free')
      const stats = await d.exec('return document.querySelector("main").innerText')
      assert(stats.includes('فاکتورهای امروز') && /فاکتورهای امروز\s*۱/.test(stats), 'today invoice count = 1 (legacy invoice)')
      assert((await localStorageGet('gameon:floor')) === null, 'legacy key removed after import')
      const archived = await d.exec(`return Object.keys(localStorage).filter(k => k.startsWith('gameon:floor:archived:')).map(k => localStorage.getItem(k))`)
      assert(archived.length === 1 && archived[0] === legacyPayload, 'verbatim copy archived in localStorage')
      await shot('01-upgraded-dashboard')
    })

    await step('duplicate import is prevented (legacy key put back + reload)', async () => {
      await d.exec(`localStorage.setItem('gameon:floor', arguments[0]); location.reload(); return true`, legacyPayload)
      await sleep(500)
      await d.waitFor(() => d.exec("return document.querySelectorAll('article[aria-label]').length === 10"), { message: '10 cards' })
      await nav('داده و پشتیبان')
      const text = await d.waitFor(async () => {
        const t = await d.exec('return document.querySelector("main").innerText')
        return t.includes('منتقل شد') ? t : null
      }, { message: 'data page' })
      assert(text.split('منتقل شد').length - 1 === 1, 'exactly one imported record')
      assert(/تعداد فاکتورها\s*۱/.test(text), 'still one invoice')
      assert((await localStorageGet('gameon:floor')) === null, 'key archived again')
      await shot('02-data-page-after-import')
      await nav('داشبورد')
    })
  } else {
    console.log('… E2E_LEGACY_APP not set: skipping the v0.1.0 upgrade scenario')
    await launch(APP)
    await cardButton(station(1), 'شروع جلسه')
    await cardButton(station(2), 'شروع جلسه')
    await sleep(1100)
    await cardButton(station(2), 'مکث')
  }

  await step('restart recovery: timers keep counting while the app is closed', async () => {
    const before = await waitCard(station(1), (i) => i.timer, 'timer')
    const paused = (await cardInfo(station(2))).timer
    await d.quit()
    await sleep(5000)
    await launch(APP)
    const after = await waitCard(station(1), (i) => i.text.includes('در حال بازی'), 'running')
    const gained = seconds(after.timer) - seconds(before.timer)
    assert(gained >= 5, `gained ${gained}s while closed`)
    assert((await cardInfo(station(2))).timer === paused, 'paused timer frozen')
  })

  await step('crash recovery: kill -9 loses nothing', async () => {
    await cardButton(station(4), 'شروع جلسه')
    await waitCard(station(4), (i) => i.text.includes('در حال بازی'), 'running')
    hardKill(APP)
    await sleep(1000)
    await launch(APP)
    await waitCard(station(4), (i) => i.text.includes('در حال بازی'), 'still running after crash')
    await waitCard(station(1), (i) => i.text.includes('در حال بازی'), 'still running after crash')
  })

  await step('controller count change splits billing (chip updates)', async () => {
    await clickX(`${card(station(4))}//button[@aria-label='تعداد دسته']`)
    await clickX(`//button[@role='menuitemradio'][contains(., '${fa(4)} دسته')]`)
    await d.waitFor(
      () => d.exec(`return document.querySelector('article[aria-label="' + arguments[0] + '"] button[aria-label="تعداد دسته"]').textContent.includes(arguments[1])`, station(4), fa(4)),
      { message: 'chip shows 4 controllers' },
    )
  })

  await step('admin: create a rate plan with controller pricing', async () => {
    await nav(`نرخ${ZWNJ}ها و دسته${ZWNJ}ها`)
    await clickX(`//button[contains(., 'نرخ جدید')]`)
    await d.type(await control('نام'), E2E_PLAN)
    await d.type(await d.css(`[role=dialog] input[aria-label="نرخ ساعتی ${fa(1)} دسته"]`), '250000')
    await d.type(await d.css(`[role=dialog] input[aria-label="نرخ ساعتی ${fa(2)} دسته"]`), '۳۰۰۰۰۰')
    await clickX(`//div[@role='dialog']//button[normalize-space()='ذخیره']`)
    await toastSeen('نرخ جدید اضافه شد')
    await d.waitFor(() => d.exec(`const a = document.querySelector('article[aria-label="' + arguments[0] + '"]'); return a && a.innerText.includes('۲۵۰٬۰۰۰') && a.innerText.includes('۳۰۰٬۰۰۰')`, E2E_PLAN), { message: 'plan card' })
    await shot('03-rates-page')
  })

  await step('admin: add a VIP station; duplicate names rejected', async () => {
    await nav(`ایستگاه${ZWNJ}ها`)
    for (const attempt of [1, 2]) {
      await clickX(`//button[contains(., 'ایستگاه جدید')]`)
      await d.type(await control('نام'), 'اتاق VIP ۱')
      await clickX(`//div[@role='dialog']//button[@role='radio'][normalize-space()='VIP']`)
      const plan = await control('نرخ')
      const planId = await d.exec(`return [...arguments[0].options].find(o => o.textContent === arguments[1]).value`, { [ELEMENT]: plan }, E2E_PLAN)
      await selectOption(plan, planId)
      await clickX(`//div[@role='dialog']//button[contains(., 'افزودن ایستگاه')]`)
      if (attempt === 1) {
        await toastSeen('ایستگاه اضافه شد')
      } else {
        await d.waitFor(() => d.exec(`return document.querySelector('[role=dialog] [role=alert]')?.innerText.includes('ایستگاهی با این نام وجود دارد')`), { message: 'duplicate error' })
        await shot('04-station-form-duplicate')
        await clickX(`//div[@role='dialog']//button[normalize-space()='انصراف']`)
      }
    }
    const rows = await d.exec(`return [...document.querySelectorAll('tbody tr')].filter(r => r.innerText.includes('اتاق VIP ۱')).length`)
    assert(rows === 1, 'one VIP station row')
  })

  await step('admin: disable a station; busy stations cannot be disabled', async () => {
    const busyDisabled = await d.exec(`return document.querySelector('button[role=switch][aria-label="فعال بودن ' + arguments[0] + '"]').disabled`, station(1))
    assert(busyDisabled, 'switch disabled while a session is open')
    await d.click(await d.css(`button[role=switch][aria-label="فعال بودن ${station(5)}"]`))
    await d.waitFor(() => d.exec(`return document.querySelector('button[role=switch][aria-label="فعال بودن ' + arguments[0] + '"]').getAttribute('aria-checked') === 'false'`, station(5)), { message: 'disabled' })
    await shot('05-stations-page')
    await nav('داشبورد')
    await waitCard(station(5), (i) => i.text.includes('خارج از سرویس'), 'out of service on dashboard')
    await waitCard('اتاق VIP ۱', (i) => i.text.includes('VIP') && i.text.includes('از ۲۵۰٬۰۰۰'), 'VIP card with from-price')
  })

  await step('admin: rate change affects new sessions only', async () => {
    const before = (await cardInfo(station(1))).text.match(/([۰-۹٬]+) تومان \/ ساعت/)?.[1]
    await nav(`نرخ${ZWNJ}ها و دسته${ZWNJ}ها`)
    await clickX(`//article[contains(@aria-label, 'PS5')]//button[starts-with(@aria-label, 'ویرایش')]`)
    await replaceText(await d.css(`[role=dialog] input[aria-label="نرخ ساعتی ${fa(1)} دسته"]`), '999000')
    await clickX(`//div[@role='dialog']//button[normalize-space()='ذخیره']`)
    await toastSeen('نرخ ذخیره شد')
    await nav('داشبورد')
    const after = (await cardInfo(station(1))).text.match(/([۰-۹٬]+) تومان \/ ساعت/)?.[1]
    assert(before && before === after, `open session keeps its rate (${before} → ${after})`)
    await cardButton(station(3), 'شروع جلسه')
    await waitCard(station(3), (i) => i.text.includes('۹۹۹٬۰۰۰ تومان / ساعت'), 'new session at new rate')
  })

  await step('settings: rounding rule + receipt text saved and applied at checkout', async () => {
    await nav('تنظیمات')
    await selectOption(await control('واحد گرد کردن', { inDialog: false }), 5000)
    await clickX(`//button[@role='radio'][normalize-space()='رو به بالا']`)
    await replaceText(await control('پانویس', { inDialog: false }), 'تا دیدار بعد!')
    await d.waitFor(() => d.exec(`return document.querySelector('[aria-label="پیش‌نمایش رسید"]').innerText.includes('تا دیدار بعد')`), { message: 'live receipt preview' })
    await shot('06-settings-page')
    await clickX(`//button[contains(., 'ذخیره‌ی تغییرات')]`)
    await toastSeen('تنظیمات ذخیره شد')
    await nav('داشبورد')
    await cardButton(station(3), 'تسویه')
    const total = await d.waitFor(() => d.exec(`return document.querySelector('[data-testid=invoice-total]')?.textContent`), { message: 'invoice preview' })
    assert(toInt(total) % 5000 === 0 && toInt(total) > 0, `total rounded up to 5,000 (${total})`)
    const dialog = await d.exec(`return document.querySelector('[role=dialog]').innerText`)
    assert(dialog.includes(`رو به بالا ${fa(5)}٬۰۰۰`), 'rounding rule shown on invoice')
    await shot('07-invoice-modal')
    await clickX(`//button[contains(., 'پرداخت و بستن جلسه')]`)
    await toastSeen('ثبت شد')
    await waitCard(station(3), (i) => i.text.includes('آزاد'), 'free after checkout')
  })

  await step('backup now → change data → restore from list → safety copy kept', async () => {
    await nav('داده و پشتیبان')
    await clickX(`//button[contains(., 'پشتیبان${ZWNJ}گیری الان')]`)
    await toastSeen('پشتیبان ساخته شد')
    const manual = await d.waitFor(() => d.exec(`return [...document.querySelectorAll('tr[data-backup]')].find(r => r.innerText.includes('دستی'))?.dataset.backup`), { message: 'manual backup row' })
    await nav('داشبورد')
    await cardButton(station(6), 'شروع جلسه')
    await waitCard(station(6), (i) => i.text.includes('در حال بازی'), 'running')
    await nav('داده و پشتیبان')
    await clickX(`//tr[@data-backup='${manual}']//button[contains(., 'بازگردانی')]`)
    await clickX(`//div[@role='dialog']//button[contains(., 'جایگزینی داده')]`)
    await toastSeen('بازگردانی انجام شد', 15_000)
    await d.waitFor(() => d.exec(`return document.querySelector('main').innerText.includes('نسخه‌ی ایمنی پیش از بازگردانی')`), { message: 'safety backup listed' })
    await shot('08-data-page-after-restore')
    await nav('داشبورد')
    await waitCard(station(6), (i) => i.text.includes('آزاد'), 'restored to the backup state')
    await waitCard(station(1), (i) => i.text.includes('در حال بازی'), 'older sessions intact')
  })

  await step('restored data survives another restart', async () => {
    await launch(APP)
    await waitCard(station(6), (i) => i.text.includes('آزاد'), 'still restored')
    await waitCard('اتاق VIP ۱', () => true, 'admin changes from before backup kept')
    await shot('09-final-dashboard')
  })
  await step('floor map: drag (pointer + keyboard) in edit mode; positions survive restart', async () => {
    const mapCard = (id) => `[data-station-id="${id}"]`
    const read = (id) =>
      d.exec(`const el = document.querySelector(arguments[0]); return el && [parseInt(el.style.left), parseInt(el.style.top)]`, mapCard(id))
    const openMap = async () => {
      await nav(`ایستگاه${ZWNJ}ها`)
      await d.click(await d.css('button[role=switch][aria-label="ویرایش چیدمان"]'))
      await d.waitFor(() => read('station-2'), { message: 'floor map' })
    }
    await openMap()
    const layout = await d.exec(`const c = document.querySelector(arguments[0]);
      return { board: getComputedStyle(document.querySelector('[data-testid=floor-board]')).direction,
               card: getComputedStyle(c).direction, inert: c.firstElementChild.inert }`, mapCard('station-2'))
    assert(layout.board === 'ltr' && layout.card === 'rtl', `physical board, RTL cards (${JSON.stringify(layout)})`)
    assert(layout.inert, 'card buttons inert while arranging')

    // Pointer drag.
    const [x0, y0] = await read('station-2')
    await d.dragBy(await d.css(mapCard('station-2')), 120, 64)
    const dragged = await d.waitFor(async () => {
      const p = await read('station-2')
      return p[0] !== x0 || p[1] !== y0 ? p : null
    }, { message: 'station-2 moved' })
    assert(Math.abs(dragged[0] - (x0 + 120)) <= 4 && Math.abs(dragged[1] - (y0 + 64)) <= 4, `dropped near target: ${dragged} from ${[x0, y0]}`)
    assert(dragged[0] % 8 === 0 && dragged[1] % 8 === 0, 'snapped to the 8px grid')

    // Keyboard drag: Space, → →, Space (25px per step).
    const [kx0, ky0] = await read('station-3')
    const handle = await d.css(mapCard('station-3'))
    for (const key of ['\uE00D', '\uE014', '\uE014', '\uE00D']) {
      await d.type(handle, key)
      await sleep(120)
    }
    const keyed = await d.waitFor(async () => {
      const p = await read('station-3')
      return p[0] !== kx0 ? p : null
    }, { message: 'station-3 moved by keyboard' })
    assert(Math.abs(keyed[0] - (kx0 + 50)) <= 4 && Math.abs(keyed[1] - ky0) <= 4, `keyboard moved ~50px right: ${keyed} from ${[kx0, ky0]}`)
    await sleep(400)
    await shot('10-floor-map-edit')

    await launch(APP)
    await openMap()
    assert(JSON.stringify(await read('station-2')) === JSON.stringify(dragged), 'pointer-dragged position persisted')
    assert(JSON.stringify(await read('station-3')) === JSON.stringify(keyed), 'keyboard-moved position persisted')
    await nav('داشبورد')
    await waitCard(station(1), (i) => i.text.includes('در حال بازی'), 'dashboard unaffected')
  })
} catch {
  // reported below
} finally {
  await d.quit()
  driverProcess.kill()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} E2E steps passed · screenshots: ${OUT}`)
  fs.rmSync(work, { recursive: true, force: true })
  process.exitCode = failed.length > 0 || results.length === 0 ? 1 : 0
}
