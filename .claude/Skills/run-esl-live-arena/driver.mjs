#!/usr/bin/env node
// CDP driver fuer esl_live_arena_v22.js Offline-Haerbnisse.
// Startet headless Chrome mit --remote-debugging-port, haelt die Verbindung
// in einer State-Datei fest (dasselbe Prinzip wie ESL_Start.cmd/AnkerSetzen),
// und bietet: launch / goto / eval / screenshot / quit.
//
// Aufruf immer aus <unit>/ (Projektwurzel), z.B.:
//   node .claude/skills/run-esl-live-arena/driver.mjs launch
//   node .claude/skills/run-esl-live-arena/driver.mjs goto "http://127.0.0.1:8412/test_quali_zeiten.html?zeiten=1"
//   node .claude/skills/run-esl-live-arena/driver.mjs eval "window.switchPage('quali'); 1"
//   node .claude/skills/run-esl-live-arena/driver.mjs screenshot out.png
//   node .claude/skills/run-esl-live-arena/driver.mjs quit

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STATE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.driver_state.json');
const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
  throw new Error('Kein Chrome/Edge gefunden unter den bekannten Pfaden.');
}

function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

async function cdpJson(port, p) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`);
  if (!r.ok) throw new Error(`CDP HTTP ${p} -> ${r.status}`);
  return r.json();
}

async function cdpSend(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    const timer = setTimeout(() => { ws.close(); reject(new Error('CDP Timeout: ' + method)); }, 20000);
    ws.addEventListener('open', () => ws.send(JSON.stringify({ id, method, params })));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        clearTimeout(timer);
        ws.close();
        if (msg.error) reject(new Error(method + ': ' + JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
    ws.addEventListener('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

async function cmdLaunch() {
  const chrome = findChrome();
  const port = 9333;
  const profile = mkdtempSync(path.join(tmpdir(), 'esl-arena-cdp-'));
  const proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    // --disable-sync: laeuft hier Edge statt Chrome, meldet es das Wegwerf-Profil am Microsoft-Konto an und holt
    // dessen Einstellungen (gemessen 05.10.: nach rund 12 s "alle Cookies blockieren") — ab dann wirft
    // localStorage, und das Dashboard liefe anders als im Betrieb.
    '--no-first-run', '--disable-sync',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1600,1000',
    'about:blank',
  ], { detached: true, stdio: 'ignore' });
  proc.unref();
  // auf /json/version warten
  let ver = null;
  for (let i = 0; i < 40; i++) {
    try { ver = await cdpJson(port, '/json/version'); break; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  if (!ver) throw new Error('Chrome DevTools-Endpunkt kam nicht hoch.');
  const targets = await cdpJson(port, '/json/list');
  const target = targets.find(t => t.type === 'page') || targets[0];
  saveState({ port, pid: proc.pid, targetId: target.id, wsUrl: target.webSocketDebuggerUrl, profile });
  console.log('Chrome laeuft: port=' + port + ' pid=' + proc.pid + ' target=' + target.id);
}

async function cmdGoto(url) {
  const s = loadState();
  if (!s) throw new Error('Kein aktiver Chrome. Erst "launch" ausfuehren.');
  await cdpSend(s.wsUrl, 'Page.enable');
  await cdpSend(s.wsUrl, 'Page.navigate', { url });
  await new Promise(r => setTimeout(r, 600)); // erstes Dokument
  console.log('Navigiert: ' + url);
}

async function cmdEval(expr) {
  const s = loadState();
  if (!s) throw new Error('Kein aktiver Chrome. Erst "launch" ausfuehren.');
  const res = await cdpSend(s.wsUrl, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error('Eval-Fehler: ' + JSON.stringify(res.exceptionDetails.exception));
  console.log(JSON.stringify(res.result.value));
}

async function cmdWaitFor(expr, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = loadState();
    const res = await cdpSend(s.wsUrl, 'Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res.result && res.result.value) { console.log('Bedingung erfuellt: ' + expr); return; }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Timeout beim Warten auf: ' + expr);
}

async function cmdScreenshot(outFile) {
  const s = loadState();
  if (!s) throw new Error('Kein aktiver Chrome. Erst "launch" ausfuehren.');
  const res = await cdpSend(s.wsUrl, 'Page.captureScreenshot', { format: 'png' });
  writeFileSync(outFile, Buffer.from(res.data, 'base64'));
  console.log('Screenshot geschrieben: ' + outFile);
}

async function cmdQuit() {
  const s = loadState();
  if (!s) { console.log('Nichts zu beenden.'); return; }
  try { process.kill(s.pid); } catch { /* schon weg */ }
  writeFileSync(STATE_FILE, '{}');
  console.log('Chrome beendet (pid ' + s.pid + ').');
}

const [, , cmd, ...rest] = process.argv;
try {
  if (cmd === 'launch') await cmdLaunch();
  else if (cmd === 'goto') await cmdGoto(rest[0]);
  else if (cmd === 'eval') await cmdEval(rest.join(' '));
  else if (cmd === 'waitfor') await cmdWaitFor(rest[0], rest[1] ? Number(rest[1]) : undefined);
  else if (cmd === 'screenshot') await cmdScreenshot(rest[0]);
  else if (cmd === 'quit') await cmdQuit();
  else {
    console.error('Unbekannter Befehl: ' + cmd);
    console.error('Befehle: launch | goto <url> | eval "<js>" | waitfor "<js-bool>" [timeoutMs] | screenshot <datei> | quit');
    process.exit(1);
  }
} catch (e) {
  console.error('FEHLER: ' + e.message);
  process.exit(1);
}
