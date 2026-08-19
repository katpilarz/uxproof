import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const token = readFileSync('/tmp/claude-1000/-home-kasia-GitHub-uxproof/fb9da08e-d79b-4938-bf0c-5612c9c2a7cc/scratchpad/session_token.txt', 'utf8').trim();
const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: 'uxproof_session', value: token, domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();

page.on('console', m => { if (['error','warning'].includes(m.type())) console.log('[console]', m.type(), m.text().slice(0, 200)); });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
page.on('request', r => { if (r.url().includes('/api/chat') || r.url().includes('/api/presentations')) console.log('[req]', r.method(), r.url().replace('http://localhost:3457','')); });
page.on('response', async r => {
  if (r.url().includes('/api/chat') || r.url().includes('/api/presentations')) console.log('[res]', r.status(), r.url().replace('http://localhost:3457',''));
});

await page.goto('http://localhost:3457/files', { waitUntil: 'networkidle' });
console.log('on /files, cards:', await page.locator('text=uxdata.csv').count());

const btn = page.getByRole('button', { name: 'Generate presentation' }).first();
console.log('button disabled?', await btn.isDisabled());
await btn.click();
console.log('clicked. url now:', page.url());

// give navigation + auto-send + generation time
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(5000);
  const url = page.url();
  const userMsg   = await page.locator('text=Generate Q4 2025 presentation').count();
  const genCard   = await page.locator('text=Building 8-slide research deck').count();
  const readyCard = await page.locator('text=Download .pptx').count();
  const errCard   = await page.locator('text=Retry generation').count();
  console.log(`t+${(i+1)*5}s url=${url.replace('http://localhost:3457','')} promptMsg=${userMsg} generating=${genCard} ready=${readyCard} error=${errCard}`);
  if (readyCard || errCard) break;
}
await page.screenshot({ path: '/tmp/claude-1000/-home-kasia-GitHub-uxproof/fb9da08e-d79b-4938-bf0c-5612c9c2a7cc/scratchpad/repro.png', fullPage: true });
await browser.close();
