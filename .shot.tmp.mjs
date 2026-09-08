import { chromium } from '/Users/said/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const T = '0f1ba85a-55ae-49ab-8de4-b14dbe8d5019'
const tok = jwt.sign({ userId: process.argv[3], email: 'x@y.z', tenantId: T, role: process.argv[4], type: 'access' }, process.env.JWT_SECRET, { expiresIn: '30m' })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.addInitScript(t => { localStorage.setItem('gestiq_token', t); localStorage.setItem('ng_welcome_seen', '1') }, tok)
await page.goto('http://localhost:5173/nextgital/prospects', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5500)
try { await page.getByRole('button', { name: /Nouveau prospect/i }).first().click({ timeout: 6000 }) } catch (e) { console.log('bouton introuvable') }
await page.waitForTimeout(2500)
await page.screenshot({ path: process.argv[2] })
console.log('capture ok')
await browser.close()
