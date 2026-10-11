// Browser smoke test + screenshots. Uses the installed Microsoft Edge (no browser download).
// Usage: node smoke.mjs [baseUrl]   (server must be running)
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const base = process.argv[2] || 'http://127.0.0.1:8000'
const out = new URL('./screenshots/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const check = (cond, msg) => {
  if (!cond) throw new Error('FAIL: ' + msg)
  console.log('ok  ', msg)
}

await page.goto(base)
await page.screenshot({ path: out + '00-onboarding.png' })
await page.getByRole('button', { name: /Skip|छोड़ें/ }).click()
await page.screenshot({ path: out + '01-home.png' })

// headline case
await page.getByRole('textbox').fill('My plot is 200 sq m on a 9 m road. How much gap at the front, how many floors, and what fee?')
await page.keyboard.press('Enter')
await page.getByText('Front open space', { exact: false }).first().waitFor({ timeout: 60000 })
check(await page.getByText('3.0 m').first().isVisible(), 'front open space 3.0 m shown')
check(await page.getByText('Rs 3,000').first().isVisible(), 'permission fee Rs 3,000 shown')
await page.getByText('Rule 56(1)(a) · p.77').first().click()
await page.locator('.react-pdf__Page__textContent mark').first().waitFor({ timeout: 30000 })
check(true, 'PDF opened on the cited page with highlight')
await page.waitForTimeout(800)
await page.screenshot({ path: out + '02-answer-headline.png' })

// rear boundary
await page.getByRole('textbox').fill('What is the minimum rear open space for a 150 sq m residential plot?')
await page.keyboard.press('Enter')
await page.getByText('1.5 m').first().waitFor({ timeout: 60000 })
check(true, 'rear 150 sq m -> 1.5 m')

// not found
await page.getByRole('textbox').fill('How do I pay my property tax online?')
await page.keyboard.press('Enter')
await page.getByText('Not covered by the Bhumi Vikas Rules', { exact: false }).waitFor({ timeout: 60000 })
check(true, 'property tax -> not found card')
await page.screenshot({ path: out + '03-not-found.png' })

// Hindi UI + Hindi question
await page.getByRole('radio', { name: 'हिं' }).first().click()
await page.getByRole('button', { name: 'कुछ और पूछें' }).click()
await page.getByRole('textbox').fill('मेरा प्लॉट 200 वर्ग मीटर का है और सामने 9 मीटर चौड़ी सड़क है। आगे कितनी जगह खाली छोड़नी होगी?')
await page.keyboard.press('Enter')
await page.getByText('सामने खुला स्थान', { exact: false }).first().waitFor({ timeout: 60000 })
check(true, 'Hindi question answered with Hindi labels')
await page.screenshot({ path: out + '04-hindi.png' })
await page.getByRole('radio', { name: 'EN' }).first().click()

// Plot Check
await page.getByRole('button', { name: 'Plot Check' }).click()
await page.getByText('Permission fee').first().waitFor()
check(await page.getByText('Rs 3,250').first().isVisible(), 'plot check total Rs 3,250')
await page.screenshot({ path: out + '05-plot-check.png', fullPage: true })

// Browse + amendment
await page.getByRole('button', { name: 'Browse rules' }).click()
await page.getByPlaceholder(/Search rule/).fill('2')
await page.getByRole('button', { name: /^2\s+Definitions/ }).click()
await page.getByText('This rule was amended on', { exact: false }).first().waitFor()
check(true, 'rule 2 shows the 28-08-2026 amendment banner')
await page.screenshot({ path: out + '06-browse-rule.png' })

// version dialog
await page.getByRole('button', { name: /06-03-2025/ }).click()
await page.getByText('28-08-2026 · Rule 2(5)(c)').waitFor()
await page.screenshot({ path: out + '07-version.png' })
await page.keyboard.press('Escape')

// mobile layout
const m = await browser.newPage({ viewport: { width: 390, height: 844 } })
await m.goto(base)
await m.getByRole('textbox').fill('How far must my balcony stay from a low-voltage overhead electric line?')
await m.keyboard.press('Enter')
await m.getByText('2.5 m vertically', { exact: false }).first().waitFor({ timeout: 60000 })
await m.screenshot({ path: out + '08-mobile.png', fullPage: true })
check(true, 'mobile layout answers')

const real = errors.filter((e) => !/favicon|ResizeObserver/.test(e))
check(real.length === 0, 'no console errors' + (real.length ? ': ' + real.join(' | ') : ''))
await browser.close()
console.log('screenshots in', out)
