/**
 * CampusCycle — campus-map release browser flow test (optional).
 *
 * Drives the real UI: student registration, campus map (image, marker
 * placement under zoom, selection, route), QR rental by manual entry, active
 * ride, return with completion summary, history, mobile layout, and the admin
 * workflow (bicycles, QR label, moving a station on the map, rides, maintenance,
 * analytics). Fails on any page error or console error.
 *
 * It WRITES to the database behind the running API — point it at a test
 * database (see README → Testing), not at real data.
 *
 *   npm install --no-save playwright-core && npx playwright-core install chromium-headless-shell
 *   UI_BASE=http://localhost:5175 UI_API=http://localhost:4000/api node tests/campus-flow.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.UI_BASE || 'http://localhost:5175';
const API = process.env.UI_API || 'http://localhost:4000/api';
const SHOTS = new URL('./screenshots/', import.meta.url);
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (p, name) => p.screenshot({ path: new URL(`${name}.png`, SHOTS).pathname.replace(/^\/([A-Z]:)/, '$1'), fullPage: false });

const out = [];
let fails = 0;
const check = (c, m) => { out.push(`${c ? '  ✔' : '  ✖'} ${m}`); if (!c) fails++; };

async function apiJson(path, { token, method = 'GET', body } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}
const adminToken = (await apiJson('/auth/login', { method: 'POST', body: { email: 'admin@campuscycle.edu', password: 'Admin@123' } })).token;

const browser = await chromium.launch({ headless: true });

function watch(page, label) {
  page.on('pageerror', (e) => { out.push(`  ✖ [${label}] pageerror: ${e.message}`); fails++; });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
      out.push(`  ✖ [${label}] console error: ${m.text()}`);
      fails++;
    }
  });
}

// ------------------------------------------------------------------ student
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  watch(p, 'student');
  out.push('Student workflow');
  const email = `ui.${Date.now()}@campuscycle.edu`;
  await p.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await p.fill('#name', 'UI Test Student');
  await p.fill('#email', email);
  await p.fill('#password', 'Cycle2026');
  await p.click('button[type=submit]');
  await p.waitForURL(`${BASE}/app`, { timeout: 15000 });
  check(true, 'register -> lands on the student dashboard');
  await p.waitForSelector('.campus-map .leaflet-marker-icon', { timeout: 15000 });
  const dashMarkers = await p.locator('.campus-map .leaflet-marker-icon').count();
  check(dashMarkers === 19, `dashboard map preview shows 19 station markers (${dashMarkers})`);
  await shot(p, '01-student-dashboard');

  await p.goto(`${BASE}/app/map`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.campus-map img.leaflet-image-layer');
  const imgOk = await p.evaluate(() => {
    const img = document.querySelector('.campus-map img.leaflet-image-layer');
    return img && img.complete && img.naturalWidth === 1280 && img.naturalHeight === 720;
  });
  check(imgOk, 'the campus map image loads at 1280x720 (upright orientation)');
  await shot(p, '02-map-overview');

  // Marker positions stay on the image: compare marker centre vs. stored % after zoom.
  async function markerOffsetPx(title) {
    return p.evaluate((t) => {
      const img = document.querySelector('.campus-map img.leaflet-image-layer').getBoundingClientRect();
      const m = [...document.querySelectorAll('.campus-map .leaflet-marker-icon')].find((el) => el.title.startsWith(t));
      const r = m.getBoundingClientRect();
      return { x: ((r.left + r.width / 2 - img.left) / img.width) * 100, y: ((r.top + r.height / 2 - img.top) / img.height) * 100 };
    }, title);
  }
  const libStation = (await apiJson('/stations', { token: adminToken })).stations.find((s) => s.code === 'ST04');
  const pos1 = await markerOffsetPx('Library Stop');
  check(Math.abs(pos1.x - libStation.map_x) < 0.6 && Math.abs(pos1.y - libStation.map_y) < 0.6,
    `Library Stop marker sits at its stored image position (${pos1.x.toFixed(2)}%, ${pos1.y.toFixed(2)}%)`);
  await p.click('button[aria-label="Zoom in"]');
  await p.click('button[aria-label="Zoom in"]');
  await p.waitForTimeout(600);
  const pos2 = await markerOffsetPx('Library Stop');
  check(Math.abs(pos2.x - libStation.map_x) < 0.6 && Math.abs(pos2.y - libStation.map_y) < 0.6, 'after zooming in, the marker is still on the same spot of the image');
  await p.click('button[aria-label="Reset map view"]');
  await p.waitForTimeout(400);

  // Select a station marker.
  await p.locator('.campus-map .leaflet-marker-icon[title^="Library Stop"]').click();
  await p.waitForSelector('text=Free docks');
  const panelText = await p.locator('main, body').first().innerText();
  check(/Library Stop/.test(panelText) && /Available/.test(panelText) && /Capacity/.test(panelText), 'selecting a marker shows name, availability, capacity');
  await shot(p, '03-map-station-selected');

  // Plan a route Library -> Neeram Hall.
  await p.getByRole('button', { name: 'Start here' }).click();
  const neeram = (await apiJson('/stations', { token: adminToken })).stations.find((s) => s.code === 'ST13');
  await p.selectOption('#route-to', String(neeram.id));
  await p.waitForSelector('text=Distance along campus roads', { timeout: 10000 });
  const routeLines = await p.locator('.campus-map path.leaflet-interactive, .campus-map svg path').count();
  check(routeLines >= 2, 'the route is drawn on the map');
  const routeText = await p.locator('text=≈').first().innerText();
  check(/≈ \d+ m/.test(routeText), `route distance shown as approximate (${routeText.trim()})`);
  await shot(p, '04-map-route');

  // Rent at Library Stop via manual QR entry.
  await p.getByRole('tab', { name: /Station/ }).click();
  await p.getByRole('button', { name: /Rent a cycle here/ }).click();
  await p.waitForSelector('text=Rent a cycle');
  const firstBike = p.locator('[role=dialog] ul button').first();
  const bikeCode = (await firstBike.locator('span.block').first().innerText()).trim();
  await firstBike.click();
  const bike = (await apiJson(`/bicycles/lookup?code=${bikeCode}`, { token: adminToken })).bicycle;
  check(!(await p.locator('#qr').inputValue()), 'the QR field is not pre-filled (student must scan or type it)');
  await p.fill('#qr', 'CC-QR-WRONG');
  await p.getByRole('button', { name: /Unlock/ }).click();
  await p.waitForSelector('text=No bicycle matches that QR code');
  check(true, 'an invalid QR shows an error toast');
  await p.fill('#qr', bike.qr_code);
  await shot(p, '05-rent-scan');
  await p.getByRole('button', { name: /Unlock/ }).click();
  await p.waitForSelector(`text=Ride started on ${bikeCode}`);
  check(true, `ride started on ${bikeCode}`);
  await p.waitForSelector(`text=You are riding`);
  await shot(p, '06-map-active-ride');

  await p.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await p.waitForSelector('text=Active ride');
  const t1 = await p.locator('text=Duration').locator('..').locator('..').innerText();
  check(/Duration/.test(t1), 'dashboard shows the active ride with a live duration');
  await shot(p, '07-dashboard-active-ride');

  // Return via the map: choose Neeram Hall.
  await p.goto(`${BASE}/app/map?station=${neeram.id}`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Return my cycle here' }).click();
  await p.waitForSelector('#return-station');
  const fullOptionDisabled = await p.evaluate(() =>
    [...document.querySelectorAll('#return-station option')].some((o) => /— full$/.test(o.textContent) && o.disabled)
  );
  check(fullOptionDisabled, 'full stations are listed but disabled in the return picker');
  await p.getByRole('button', { name: 'End ride here' }).click();
  await p.waitForSelector('text=Ride complete');
  await p.waitForTimeout(800);
  await shot(p, '08-ride-complete');
  const summary = await p.locator('[role=dialog]').innerText();
  check(/Library Stop/.test(summary) && /Neeram Hall Stop/.test(summary) && /Duration/.test(summary), 'completion summary shows route, duration and times');
  await p.getByRole('button', { name: 'Done' }).click();

  const neeramAfter = (await apiJson('/stations', { token: adminToken })).stations.find((s) => s.code === 'ST13');
  check(neeramAfter.available_count === neeram.available_count + 1, `Neeram Hall availability updated (${neeram.available_count} -> ${neeramAfter.available_count})`);

  await p.goto(`${BASE}/app/rides`, { waitUntil: 'networkidle' });
  await p.waitForSelector(`text=${bikeCode}`);
  check(true, 'completed ride appears in ride history');
  await shot(p, '09-ride-history');

  await p.goto(`${BASE}/app/report`, { waitUntil: 'networkidle' });
  await shot(p, '10-report-form');
  const html = await p.content();
  check(/QR code missing or will not scan/.test(html), 'report form offers the QR-code category');
  await ctx.close();
}

// ------------------------------------------------------------------ mobile
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  watch(p, 'mobile');
  out.push('Mobile');
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p.fill('#email', 'student@campuscycle.edu');
  await p.fill('#password', 'Student@123');
  await p.click('button[type=submit]');
  await p.waitForURL(`${BASE}/app`);
  await p.goto(`${BASE}/app/map`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.campus-map .leaflet-marker-icon');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'no horizontal page scroll at 390px wide');
  await shot(p, '11-mobile-map');
  await p.locator('.campus-map .leaflet-marker-icon[title^="Agira Hall Stop"]').tap();
  await p.waitForSelector('text=Free docks');
  await p.locator('text=Free docks').scrollIntoViewIfNeeded();
  await shot(p, '12-mobile-station');
  check(true, 'tapping a marker on mobile opens the station panel');
  await ctx.close();
}

// ------------------------------------------------------------------ admin
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  watch(p, 'admin');
  out.push('Admin workflow');
  // Unauthorized: student session cannot open admin pages.
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p.fill('#email', 'student@campuscycle.edu');
  await p.fill('#password', 'Student@123');
  await p.click('button[type=submit]');
  await p.waitForURL(`${BASE}/app`);
  await p.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  check(!p.url().startsWith(`${BASE}/admin`), `a student opening /admin is redirected (${p.url().replace(BASE, '')})`);
  await p.evaluate(() => localStorage.clear());

  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p.fill('#email', 'admin@campuscycle.edu');
  await p.fill('#password', 'wrong-password1');
  await p.click('button[type=submit]');
  await p.waitForSelector('text=Invalid email or password');
  check(true, 'invalid admin login shows an error');
  await p.fill('#password', 'Admin@123');
  await p.click('button[type=submit]');
  await p.waitForURL(`${BASE}/admin`);
  await p.waitForSelector('text=Registered students');
  await shot(p, '13-admin-dashboard');
  check(true, 'admin dashboard shows database statistics');

  await p.goto(`${BASE}/admin/bicycles`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /Add bicycle/ }).click();
  await p.fill('#cycle_code', 'CC-UI-1');
  await p.getByRole('button', { name: 'Generate' }).click();
  await p.fill('#model', 'UI Test Bike');
  const st01 = (await apiJson('/stations', { token: adminToken })).stations.find((s) => s.code === 'ST01');
  await p.selectOption('#station_id', String(st01.id));
  await p.locator('[role=dialog] button[type=submit]').click();
  await p.waitForSelector('text=CC-UI-1 added to the fleet');
  check(true, 'admin adds a bicycle (generated QR)');
  await p.locator('tr', { hasText: 'CC-UI-1' }).getByRole('button', { name: 'Edit' }).click();
  await p.fill('#model', 'UI Test Bike v2');
  await p.locator('[role=dialog] button[type=submit]').click();
  await p.waitForSelector('text=CC-UI-1 updated');
  check(true, 'admin edits the bicycle');
  await p.locator('tr', { hasText: 'CC-UI-1' }).getByRole('button', { name: 'QR label' }).click();
  await p.waitForSelector('[role=dialog] img[alt^="QR code"]');
  await shot(p, '14-admin-qr-label');
  check(true, 'QR label renders for printing');
  await p.keyboard.press('Escape');

  // Move a station on the admin map.
  await p.goto(`${BASE}/admin/map`, { waitUntil: 'networkidle' });
  await p.locator('.campus-map .leaflet-marker-icon[title^="Tennis Court Stop"]').click();
  await p.getByRole('button', { name: 'Move' }).click();
  const box = await p.locator('.campus-map img.leaflet-image-layer').boundingBox();
  await p.mouse.click(box.x + box.width * 0.3969, box.y + box.height * 0.48);
  await shot(p, '15-admin-move-station');
  await p.getByRole('button', { name: 'Save position' }).click();
  await p.waitForSelector('text=Tennis Court Stop moved');
  const moved = (await apiJson('/stations', { token: adminToken })).stations.find((s) => s.code === 'ST10');
  check(Math.abs(moved.map_y - 48) < 0.8 && Math.abs(moved.map_x - 39.69) < 0.8, `station coordinates updated from the map (${moved.map_x}, ${moved.map_y})`);

  await p.goto(`${BASE}/admin/stations`, { waitUntil: 'networkidle' });
  await p.locator('tr', { hasText: 'Tennis Court Stop' }).getByRole('button', { name: 'Edit' }).click();
  await p.waitForSelector('#map_x');
  await p.fill('#location', 'Central avenue beside the Tennis Court (edited)');
  await p.fill('#map_y', '41.667');
  await shot(p, '16-admin-station-form');
  await p.locator('[role=dialog] button[type=submit]').click();
  await p.waitForSelector('text=Tennis Court Stop updated');
  check(true, 'admin edits station details and coordinates in the form');

  await p.goto(`${BASE}/admin/rentals`, { waitUntil: 'networkidle' });
  await p.fill('input[aria-label="Search rides"]', 'ui.');
  await p.waitForTimeout(900);
  const rows = await p.locator('tbody tr').count();
  check(rows >= 1, `admin ride search finds the UI student's ride (${rows})`);
  await shot(p, '17-admin-rentals');

  // Maintenance: file one as a student via API, then resolve in the UI.
  const studentToken = (await apiJson('/auth/login', { method: 'POST', body: { email: 'student@campuscycle.edu', password: 'Student@123' } })).token;
  const anyBike = (await apiJson('/bicycles?status=AVAILABLE', { token: studentToken })).bicycles[0];
  await apiJson('/maintenance', { token: studentToken, method: 'POST', body: { bicycle_id: anyBike.id, category: 'TYRE', severity: 'LOW', description: 'UI test: slow puncture in rear tyre.' } });
  await p.goto(`${BASE}/admin/maintenance`, { waitUntil: 'networkidle' });
  await p.waitForSelector('text=UI test: slow puncture');
  check(true, 'admin sees the submitted maintenance report');
  await shot(p, '18-admin-maintenance');

  await p.goto(`${BASE}/admin/analytics`, { waitUntil: 'networkidle' });
  await p.waitForSelector('text=Weekly rides');
  await p.waitForTimeout(800);
  await shot(p, '19-admin-analytics');
  check(true, 'analytics page renders weekly and maintenance trend charts');
  await ctx.close();
}

await browser.close();
console.log(out.join('\n'));
console.log(`\n${fails === 0 ? 'ALL UI CHECKS PASSED' : fails + ' UI CHECK(S) FAILED'}`);
process.exit(fails ? 1 : 0);
