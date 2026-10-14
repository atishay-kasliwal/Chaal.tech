import { chromium } from 'playwright';
import parser from 'socket.io-msgpack-parser';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.PHASE0_URL || 'http://127.0.0.1:5173';
const backend = 'https://teen-patti.onrender.com';
const out = path.resolve('visual-baselines/original');
const room = `baseline-${Date.now().toString(36)}`;
const browser = await chromium.launch({ executablePath: process.env.PHASE0_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = { sourceCommit: '3f0cb69a71d922557f9b17a08a78f413b2e90774', capturedAt: new Date().toISOString(), baseURL, browser: await browser.version(), room, screenshots: [], checks: [], privacy: [], errors: [] };
const contexts = [];
const players = [];
let lastRoomData = null;
await fs.mkdir(out, { recursive: true });
async function capture(page, name, extra = {}) {
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  report.screenshots.push({ name, viewport: page.viewportSize(), url: page.url(), ...extra });
  console.log(`Captured ${name}`);
}
async function state() {
  if (!lastRoomData) throw new Error('No roomData received from the original socket');
  return lastRoomData;
}
async function waitForRoom(predicate) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (lastRoomData && predicate(lastRoomData)) return lastRoomData;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the original backend room update');
}
async function ready(page) {
  await page.getByRole('button', { name: 'Create Room', exact: true }).waitFor({ state: 'visible', timeout: 45000 });
}
async function advanceCheck(label, before, after) {
  report.checks.push({ label, before, after });
}
try {
  const c = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  contexts.push(c);
  const page = await c.newPage();
  page.on('websocket', ws => {
    if (!ws.url().includes('teen-patti.onrender.com')) return;
    const decoder = new parser.Decoder();
    decoder.on('decoded', packet => {
      if (packet.data?.[0] !== 'roomData') return;
      const patch = packet.data[1];
      lastRoomData = { ...lastRoomData, ...patch };
      const data = lastRoomData;
      const users = data?.usersList || [];
      const own = users.find(u => u.username.toLowerCase() === 'baseline 1');
      const opponents = users.filter(u => u.username.toLowerCase() !== 'baseline 1');
      const actual = cards => (cards || []).filter(card => card.rank != null && String(card.rank) !== '0' && card.suit).length;
      const summary = { started: !!data.isStarted, show: !!data.gameShow, ownBlind: own?.isBlind, ownCardIdentities: actual(own?.cardsInHand), opponentCardIdentities: opponents.reduce((n,u) => n + actual(u.cardsInHand), 0) };
      const previous = report.privacy.at(-1);
      if (JSON.stringify(previous) !== JSON.stringify(summary)) report.privacy.push(summary);
    });
    ws.on('framereceived', frame => {
      if (typeof frame.payload !== 'string') {
        try { decoder.add(frame.payload); } catch { /* Engine.IO control frame, not a game packet. */ }
      }
    });
  });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /Teen Patti/ }).first().waitFor();
  await page.waitForTimeout(1300); // Capture after the original route/card entry animations.
  const cardAssets = await page.evaluate(async () => {
    const registered = !!customElements.get('playing-card');
    return { registered, font: getComputedStyle(document.body).fontFamily };
  });
  report.checks.push({ label: 'card-assets-and-font', ...cardAssets });
  await capture(page, '01-home-desktop');
  await page.goto(`${baseURL}/test-cards`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await capture(page, '02-card-deck-desktop');
  await page.goto(`${baseURL}/create-room`, { waitUntil: 'domcontentloaded' });
  await capture(page, '03-create-connecting-desktop');
  await ready(page);
  await capture(page, '04-create-join-desktop');
  await page.locator('#roomName').fill(room);
  await page.locator('#create-room-btn').click();
  await page.getByRole('heading', { name: 'Take a Seat' }).waitFor({ timeout: 45000 });
  await page.waitForTimeout(1200);
  await capture(page, '05-join-name-desktop');
  await page.locator('#username').fill('Baseline 1');
  await page.getByRole('group', { name: 'Player Name' }).getByRole('button', { name: 'Join', exact: true }).click();
  await page.getByRole('heading', { name: 'Game Settings' }).waitFor({ timeout: 20000 });
  players.push(page);
  await capture(page, '06-waiting-one-player-desktop');
  for (let i = 2; i <= 6; i++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    const p = await context.newPage();
    await p.goto(`${baseURL}/${room}`, { waitUntil: 'domcontentloaded' });
    await p.getByRole('heading', { name: 'Take a Seat' }).waitFor({ timeout: 45000 });
    await p.waitForTimeout(1200); // Original page hydrates before its submit handler/socket are ready.
    await p.locator('#username').fill(`Baseline ${i}`);
    await p.getByRole('group', { name: 'Player Name' }).getByRole('button', { name: 'Join', exact: true }).click();
    await p.getByRole('heading', { name: 'Game Settings' }).waitFor({ timeout: 20000 });
    players.push(p);
    await capture(page, `07-waiting-${i}-players-desktop`);
  }
  let data = await waitForRoom(d => d.usersList.length === 6);
  report.checks.push({ label: 'six-members', count: data.usersList.length });
  await page.getByRole('button', { name: 'Start Game', exact: true }).click();
  await page.getByRole('button', { name: 'See', exact: true }).waitFor({ timeout: 20000 });
  await capture(page, '08-six-player-blind-desktop');
  data = await state();
  const httpRoom = await (await fetch(`${backend}/room/${room}`)).json();
  report.privacy.push({ source: 'unauthenticated-HTTP-audit-room', started: httpRoom.isStarted, fields: Object.keys(httpRoom), hasUsersList: Array.isArray(httpRoom.usersList), remainingDeckIdentities: (httpRoom.cardsRemaining || []).filter(c => c.rank != null && String(c.rank) !== '0' && c.suit).length });
  await page.getByRole('button', { name: 'See', exact: true }).click();
  await page.getByRole('button', { name: 'Seen', exact: true }).waitFor();
  await capture(page, '09-six-player-seen-desktop');
  data = await state();
  const actor = players[Number(data.usersList[data.currentPlayer].username.split(' ')[1]) - 1];
  const before = { pot: data.pot, balance: data.usersList[data.currentPlayer].balance };
  await actor.getByRole('button', { name: /^(Blind|Chal)$/ }).click();
  await waitForRoom(d => d.pot > before.pot);
  data = await state();
  await advanceCheck('bet', before, { pot: data.pot });
  await capture(actor, '10-bet-and-turn-desktop');
  for (let i = 0; i < 4; i++) {
    data = await state();
    const actorName = data.usersList[data.currentPlayer].username;
    const p = players[Number(actorName.split(' ')[1]) - 1];
    p.once('dialog', dialog => dialog.accept());
    await p.getByRole('button', { name: 'Pack', exact: true }).click();
    await waitForRoom(d => d.usersList.find(u => u.username === actorName)?.isPacked && d.usersList[d.currentPlayer]?.username !== actorName);
  }
  await capture(page, '11-packed-and-two-active-desktop');
  data = await state();
  for (const user of data.usersList.filter(u => !u.isPacked && u.isBlind)) {
    const p = players[Number(user.username.split(' ')[1]) - 1];
    await p.getByRole('button', { name: 'See', exact: true }).click();
    await waitForRoom(d => !d.usersList.find(u => u.username === user.username)?.isBlind);
  }
  data = await state();
  const showActor = players[Number(data.usersList[data.currentPlayer].username.split(' ')[1]) - 1];
  await showActor.getByRole('button', { name: 'Show', exact: true }).click();
  await page.getByRole('heading', { name: 'Declare Winner', exact: true }).waitFor({ timeout: 15000 });
  await capture(page, '12-show-and-manual-winner-desktop');
  data = await state();
  report.checks.push({ label: 'show', gameShow: data.gameShow, activeCount: data.usersList.filter(u => !u.isPacked).length });
  // Characterize the existing manual UI in our isolated test room; no claim of automatic evaluation.
  await page.locator('select').selectOption(data.usersList.find(u => !u.isPacked).id);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('heading', { name: 'Game Settings' }).waitFor({ timeout: 15000 });
  await capture(page, '13-after-manual-settlement-desktop');
  data = await state();
  report.checks.push({ label: 'manual-settlement', isStarted: data.isStarted, balances: data.usersList.map(u => ({ name: u.username, balance: u.balance })) });
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, '14-waiting-mobile');
  await page.getByRole('button', { name: 'Start Game', exact: true }).click();
  await page.getByRole('button', { name: 'See', exact: true }).waitFor();
  await capture(page, '15-six-player-game-mobile');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await capture(page, '16-refresh-during-hand');
  report.checks.push({ label: 'refresh-during-hand', visibleText: (await page.locator('body').innerText()).slice(0, 500) });
} catch (error) {
  report.errors.push(String(error));
  if (players[0]) await capture(players[0], 'failure-state').catch(() => {});
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
  await fs.writeFile(path.join(out, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ screenshots: report.screenshots.length, checks: report.checks, privacy: report.privacy, errors: report.errors }, null, 2));
}
