/** Render the existing Companion clock UI as a local Blender texture. */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const output = path.join(here, 'lab/textures');
await mkdir(output, { recursive: true });
const html = `<!doctype html><html><head><link rel="stylesheet" href="/src/styles/demo-companion.css">
<style>html,body{margin:0;width:320px;height:240px;overflow:hidden;background:#09071e}
*,*::before,*::after{animation:none!important;transition:none!important}.kirby-label{opacity:1!important}</style>
</head><body><script type="module">
import { createClockApp } from '/src/scripts/demos/companion/app-clock.js';
const clock=createClockApp();document.body.appendChild(clock.el);clock.pause();window.clockReady=true;
</script></body></html>`;
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(root, relative.startsWith('assets/') ? `public/${relative}` : relative);
    if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end(); return; }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  const page = await browser.newPage({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 1, reducedMotion: 'reduce', timezoneId: 'UTC' });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => {
    const Original = Date;
    const fixed = Original.parse('2025-10-21T11:45:00Z');
    window.Date = class extends Original {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed; }
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.clockReady);
  await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
  if (errors.length) throw new Error(errors.join('\n'));
  await page.locator('.kirby-screen').screenshot({ path: path.join(output, 'companion-clock.png'), animations: 'disabled' });
  await writeFile(path.join(output, 'companion-clock.json'), JSON.stringify({
    renderer: 'src/scripts/demos/companion/app-clock.js',
    assets: 'public/assets/demos/companion/',
    resolution: [320, 240], fixedClock: '11:45, Tuesday 21 October',
    note: 'Existing demo UI rendered directly; fixed clock echoes the documentary photo. No photographed enclosure or LCD glare.'
  }, null, 2));
  console.log(`COMPANION_UI ${path.join(output, 'companion-clock.png')}`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
