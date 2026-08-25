// ============================================================================
//  SCHLAF MESSEN — kein Pruefwerkzeug, sondern ein MESSGERAET
//  (heisst bewusst nicht *_pruefen.js, damit der Sammel-Einzeiler es nicht mitzieht)
// ----------------------------------------------------------------------------
//  Anlass (Nutzer 05.10.): "Die Ligaliste updatet sich auch nicht immer."
//  Im Logbuch stand: Ligaliste 13 Minuten ohne Abruf ("Sperre ... verfallen
//  (787 s)"), Dashboard 50 Minuten ("Takt stand 2992 s still") — und beide liefen
//  in der Sekunde weiter, in der ihr Tab wieder vorn lag. Edge legt verborgene
//  Tabs schlafen ("Schlafende Tabs").
//
//  Dieses Geraet startet ein ECHTES Edge mit eigenem Wegwerf-Profil (sichtbares,
//  kleines Fenster — headless kennt keine schlafenden Tabs), stellt die
//  Schlaf-Schwelle auf 30 s und misst:
//
//    node pruefwerkzeuge/schlaf_messen.mjs
//        fall=echt (Vorgabe): das ECHTE Dashboard (test_quali_zeiten.html) oeffnet
//        eine Seite mit dem ECHTEN kpi_crawler.js; beide liegen 70 s verborgen.
//        Erwartung: keiner der beiden wird eingefroren.
//    node pruefwerkzeuge/schlaf_messen.mjs alt=<Ordner mit aelteren Fassungen>
//        Gegenprobe: esl_live_arena_v22.js / kpi_crawler.js aus diesem Ordner.
//        Erwartung: beide WERDEN eingefroren (sonst misst das Geraet nichts).
//    node pruefwerkzeuge/schlaf_messen.mjs fall=einzeln [flags=1]
//        Zwei unverbundene Hintergrund-Tabs, einer mit Web Lock, einer ohne.
//        Zeigt auch, was in einer eingefrorenen Seite noch laeuft (Zeitgeber,
//        fetch, sync-XHR, Nachrichten) und ob die Fernsteuerung sie wecken kann.
//    node pruefwerkzeuge/schlaf_messen.mjs fall=betrieb [alock=1] [b1lock=1] [flags=1]
//        Der Betriebsfall mit Attrappen: A oeffnet B (verbunden), beide verborgen.
//
//  Gemessen am 05.10. (Edge 154):
//    - verborgener Tab ohne Schutz: nach 30 s eingefroren; Zeitgeber stehen, ein
//      fetch aus einem Nachrichten-Handler kommt nicht zurueck, sync-XHR scheitert
//      sofort, Nachrichten (postMessage/BroadcastChannel) kommen weiter an
//    - die Hintergrund-Argumente aus ESL_Start.cmd (flags=1) verhindern das NICHT
//    - Web Lock in der Seite: nicht eingefroren (edge://discards: "holding Web Lock")
//    - verbundene Seiten (opener) frieren gemeinsam ein, sobald ALLE verborgen
//      sind; ein Lock in EINER der beiden schuetzt beide
//    - Page.setWebLifecycleState(active) weckt, aber nur bis zur naechsten Schwelle
//    - --disable-features=EdgeSleepingTabs aendert nichts (kein Startargument dafuer)
// ============================================================================
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, '..');
const ARG = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf('='); return i < 0 ? [a, '1'] : [a.slice(0, i), a.slice(i + 1)]; }));
const FALL = ARG.fall || 'echt';
const SCHWELLE = +(ARG.schwelle || 30), VERB = +(ARG.verb || 70);
const PORT = +(ARG.port || 8434), CDP = +(ARG.cdp || 9354), FLAGS = ARG.flags === '1';
const ALT = ARG.alt ? path.resolve(ARG.alt) : '';
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
if (!EDGE) { console.log('Kein Edge gefunden — dieses Geraet misst Edge-Verhalten.'); process.exit(2); }
const warte = ms => new Promise(r => setTimeout(r, ms));
let schlecht = 0;
const soll = (name, ok, info) => { if (!ok) schlecht++; console.log((ok ? '  ok   ' : '  FEHL ') + name + (info ? '  [' + info + ']' : '')); };

// ---------------------------------------------------------------- Seiten
// Unabhaengiger Zaehler (NICHT der des Dashboards/Crawlers): freeze/resume + 1-s-Zeitgeber.
const ZAEHLER = `
window.__mess = { fz: 0, rs: 0, ticks: 0, lastTickUhr: Date.now(), maxGap: 0, ereignisse: [] };
(function(){ var M = window.__mess, last = performance.now();
  setInterval(function(){ var n = performance.now(); M.maxGap = Math.max(M.maxGap, n - last); last = n; M.lastTickUhr = Date.now(); M.ticks++; }, 1000);
  document.addEventListener('freeze', function(){ M.fz++; M.frozen = true; M.ereignisse.push([Date.now(), 'eingefroren']); });
  document.addEventListener('resume', function(){ M.rs++; M.frozen = false; M.ereignisse.push([Date.now(), 'aufgetaut']); });
  document.addEventListener('visibilitychange', function(){ M.ereignisse.push([Date.now(), document.hidden ? 'verborgen' : 'sichtbar']); });
})();`;
const B_HTML = `<!doctype html><meta charset=utf-8><title>B</title><body>B<script>
var Q = new URLSearchParams(location.search), NAME = Q.get('name'), LOCK = Q.get('lock') === '1';
document.title = NAME; var lockHeld = false, fetchStart = 0, fetchDone = 0, xhrN = 0, xhrMs = null, xhrErr = '';
${ZAEHLER}
if (LOCK && navigator.locks) navigator.locks.request('rc_wach_' + NAME + '_' + Date.now(), function(){ lockHeld = true; return new Promise(function(){}); });
function stand(){ var M = window.__mess; return { t:'pong', name:NAME, ticks:M.ticks, lastTickUhr:M.lastTickUhr, frozen:!!M.frozen, fz:M.fz, rs:M.rs, hidden:document.hidden, lockHeld:lockHeld, ereignisse:M.ereignisse, maxGap:Math.round(M.maxGap), fetchStart:fetchStart, fetchDone:fetchDone, xhrN:xhrN, xhrMs:xhrMs, xhrErr:xhrErr }; }
function tu(d, antwort){
  if (d.t === 'ping') antwort(stand());
  if (d.t === 'fetch' && (!d.an || d.an === NAME)) { fetchStart++; fetch('/__slow?ms=300').then(function(r){ return r.text(); }).then(function(){ fetchDone++; }).catch(function(){}); }
  if (d.t === 'xhr' && (!d.an || d.an === NAME)) { var t0 = performance.now(); xhrN++; try { var x = new XMLHttpRequest(); x.open('GET', '/__slow?ms=300', false); x.send(); xhrMs = Math.round(performance.now() - t0); xhrErr = x.status === 200 ? '' : 'status ' + x.status; } catch (e) { xhrErr = String(e && e.message || e).slice(0, 60); xhrMs = -1; } }
}
window.addEventListener('message', function(ev){ tu(ev.data || {}, function(a){ try { ev.source.postMessage(a, '*'); } catch (e) {} }); });
var ch = new BroadcastChannel('schlaf'); ch.onmessage = function(ev){ tu(ev.data || {}, function(a){ ch.postMessage(a); }); };
</script>`;
const A_HTML = `<!doctype html><meta charset=utf-8><title>A</title><body>A<script>
window.wins = {}; window.stat = {}; window.aLock = false;
${ZAEHLER}
window.lockA = function(){ return new Promise(function(r){ navigator.locks.request('rc_wach_A_' + Date.now(), function(){ aLock = true; r(true); return new Promise(function(){}); }); }); };
window.oeffne = function(url, name){ wins[name] = window.open(url, name); return !!wins[name]; };
function merke(d){ if (d && d.t === 'pong') stat[d.name] = Object.assign({ um: Date.now() }, d); }
window.addEventListener('message', function(ev){ merke(ev.data); });
var ch = new BroadcastChannel('schlaf'); ch.onmessage = function(ev){ merke(ev.data); };
setInterval(function(){ Object.keys(wins).forEach(function(n){ try { wins[n].postMessage({ t:'ping' }, '*'); } catch (e) {} }); ch.postMessage({ t:'ping' }); }, 2000);
window.sende = function(an, t){ ch.postMessage({ t:t, an:an }); Object.keys(wins).forEach(function(n){ if (n === an) try { wins[n].postMessage({ t:t, an:an }, '*'); } catch (e) {} }); return true; };
</script>`;
// Huelle fuer den ECHTEN Crawler: eigener Zaehler + Antwort auf "ping" — sonst nur kpi_crawler.js.
const LIGA_HTML = `<!doctype html><meta charset=utf-8><title>Ligaliste (Messung)</title><body>Ligaliste (Messung)<script>
${ZAEHLER}
window.addEventListener('message', function(ev){ var d = ev.data || {}; if (d.t !== 'ping') return; var M = window.__mess, W = window.rcCrawlerWach || null;
  try { ev.source.postMessage({ t:'pong', name:'LIGA', ticks:M.ticks, lastTickUhr:M.lastTickUhr, frozen:!!M.frozen, fz:M.fz, rs:M.rs, hidden:document.hidden, ereignisse:M.ereignisse, maxGap:Math.round(M.maxGap),
    crawler: !!window.kpiCrawlerInterval, wachLock: !!window.__rcWachLock, wach: W ? { lock: W.lock, eingefroren: W.eingefroren, zuletztSek: W.zuletztSek } : null }, '*'); } catch (e) {} });
</script><script src="/kpi_crawler.js"></script>`;

const TYP = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.xlsx': 'application/octet-stream', '.xls': 'application/octet-stream' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const html = t => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(t); };
  if (u.pathname === '/__a.html') return html(A_HTML);
  if (u.pathname === '/__b.html') return html(B_HTML);
  if (u.pathname === '/__liga.html') return html(LIGA_HTML);
  if (u.pathname === '/__x.html') return html('<!doctype html><title>X</title>fremde Seite');
  if (u.pathname === '/__slow') return void setTimeout(() => { res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); res.end('ok'); }, +(u.searchParams.get('ms') || 300));
  // Dateien aus dem Projektordner (nur lesen). Mit alt=<Ordner> kommen Dashboard und Crawler von dort.
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  let datei = path.resolve(WURZEL, rel);
  if (ALT && (rel === 'esl_live_arena_v22.js' || rel === 'kpi_crawler.js') && existsSync(path.join(ALT, rel))) datei = path.join(ALT, rel);
  else if (!datei.startsWith(WURZEL)) { res.writeHead(403); return res.end(); }
  try { if (!statSync(datei).isFile()) throw 0; res.writeHead(200, { 'content-type': TYP[path.extname(datei).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(readFileSync(datei)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const srv6 = http.createServer((q, s) => srv.emit('request', q, s));      // "localhost" loest teils auf ::1 auf
await new Promise(r => { srv6.on('error', () => r()); srv6.listen(PORT, '::1', r); });
const U = `http://127.0.0.1:${PORT}`, UL = `http://localhost:${PORT}`;

// ---------------------------------------------------------------- Edge
const profil = mkdtempSync(path.join(tmpdir(), 'esl-schlaf-'));
mkdirSync(path.join(profil, 'Default'), { recursive: true });
writeFileSync(path.join(profil, 'Default', 'Preferences'), JSON.stringify({ edge: { sleeping_tabs: { enabled: true, threshold: SCHWELLE, fade_tabs: true, auto_discard_enabled: false } }, browser: { has_seen_welcome_page: true } }));
const startUrl = FALL === 'echt' ? `${U}/test_quali_zeiten.html` : `${U}/__a.html`;
// --disable-sync ist PFLICHT fuer jedes Wegwerf-Profil auf dem Entwicklungsrechner: Edge meldet ein neues
// Profil selbst am Microsoft-Konto an und holt dessen Einstellungen. Stehen dort "alle Cookies blockieren"
// (so gemessen am 05.10.: nach rund 12 s), ist ab dann JEDER Seitenspeicher gesperrt — auch Web Locks
// (SecurityError "The request was denied."). Die Messung saehe aus wie ein Fehler im Wachhalter.
const args = [`--remote-debugging-port=${CDP}`, `--user-data-dir=${profil}`, '--no-first-run', '--no-default-browser-check', '--disable-sync']
  .concat(FLAGS ? ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=Translate,IntensiveWakeUpThrottling,CalculateNativeWinOcclusion'] : [])
  .concat(['--window-size=760,520', '--window-position=20,20', startUrl]);
console.log('SCHLAF MESSEN | Fall ' + FALL + (ALT ? ' | GEGENPROBE mit ' + ALT : '') + ' | Schlaf-Schwelle ' + SCHWELLE + ' s | Starter-Argumente ' + (FLAGS ? 'an' : 'aus'));
const proc = spawn(EDGE, args, { stdio: 'ignore' });
const liste = async () => (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json());
function verbinde(wsUrl) {
  return new Promise((ok, nein) => {
    const ws = new WebSocket(wsUrl); let nr = 0; const offen = new Map();
    ws.addEventListener('open', () => ok({
      cdp: (method, params = {}) => new Promise((res, rej) => { const id = ++nr; offen.set(id, m => m.error ? rej(new Error(method + ' ' + JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); }),
      zu: () => { try { ws.close(); } catch { } } }));
    ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); } });
    ws.addEventListener('error', nein);
  });
}
// Das Wegwerf-Profil (rund 90 MB je Lauf) wird am Ende wieder abgeraeumt. Edge gibt seine Dateien erst
// frei, wenn der ganze Prozessbaum weg ist — deshalb taskkill abwarten (spawnSync) und mit Wiederholung loeschen.
const ende = async code => {
  try { spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { }
  try { proc.kill(); } catch { }
  srv.close(); srv6.close(); await warte(1200);
  try { rmSync(profil, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch { console.log('  (Wegwerf-Profil blieb liegen: ' + profil + ')'); }
  process.exit(code);
};
let zielA = null;
for (let i = 0; i < 100 && !zielA; i++) { try { zielA = (await liste()).find(t => t.type === 'page' && t.url.startsWith(U)); } catch { } if (!zielA) await warte(250); }
if (!zielA) { console.log('ABBRUCH: Start-Tab nicht gefunden'); await ende(2); }
const ver = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json();
console.log('Edge ' + ver.Browser);
const Br = await verbinde(ver.webSocketDebuggerUrl);
let A = await verbinde(zielA.webSocketDebuggerUrl);
const js = async (a, geste) => { const r = await A.cdp('Runtime.evaluate', { expression: a, awaitPromise: true, returnByValue: true, userGesture: !!geste }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
const vorn = async id => { await fetch(`http://127.0.0.1:${CDP}/json/activate/${id}`); await warte(500); };
const discards = async namen => {
  try {
    const t = await Br.cdp('Target.createTarget', { url: 'edge://discards', background: true }); await warte(3500);
    const z = (await liste()).find(x => x.id === t.targetId); const D = await verbinde(z.webSocketDebuggerUrl);
    const r = await D.cdp('Runtime.evaluate', { returnByValue: true, expression: `(() => { const out = []; const geh = n => { if (!n) return; if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push(t); return; } if (n.shadowRoot) geh(n.shadowRoot); n.childNodes && n.childNodes.forEach(geh); }; geh(document.body); return out.join(' | '); })()` });
    const txt = r.result.value || '';
    namen.forEach(([marke, name]) => { const i = txt.indexOf(marke); if (i < 0) return; const j = txt.indexOf('[Load]', i);
      const zeile = txt.slice(i, j > 0 ? j : i + 400).replace(/ +/g, ' ');
      const m = zeile.match(/\| (visible|hidden) \| \w+ \| (\w+) \| .*?\[View Reason\] \| [^|]+\| (\S+) \| (?:\[View Reason\] \| ([^|]+)\|)?/);
      console.log('  Edges eigene Sicht (edge://discards) ' + name + ': Zustand ' + (m ? m[2] : '?') + ', einfrierbar ' + (m ? (m[3] === '✔' ? 'JA' : m[3] === '~' ? 'bedingt' : 'nein') : '?') + (m && m[4] ? ' — Grund: ' + m[4].trim() : '')); });
    D.zu();
  } catch (e) { console.log('  (edge://discards nicht lesbar: ' + e.message + ')'); }
};
const rel = (t, t0) => (t >= t0 ? '+' : '') + Math.round((t - t0) / 1000) + ' s';

try {
  // ====================================================================== fall=echt
  if (FALL === 'echt') {
    let bereit = false;
    for (let i = 0; i < 120 && !bereit; i++) { await warte(500); try { bereit = await js(`!!document.getElementById('rcLiveDashboard') && typeof window.rcLogbuch === 'function'`); } catch { } }
    soll('das echte Dashboard laeuft in der Pruefseite', bereit);
    await js(ZAEHLER + '; 1');
    await warte(1500);
    const wA0 = JSON.parse(await js(`JSON.stringify({ lock: !!window.__rcWachLock, lage: window.rcWachLage || null })`));
    await js(`window.__liga = window.open('${UL}/__liga.html', 'rcKpiQuelle'); window.__ligaStand = null; window.addEventListener('message', function(ev){ if (ev.data && ev.data.t === 'pong') window.__ligaStand = Object.assign({ um: Date.now() }, ev.data); }); setInterval(function(){ try { window.__liga.postMessage({ t:'ping' }, '*'); } catch (e) {} }, 2000); 1`, true);
    await warte(3000); await vorn(zielA.id); await warte(3000);
    const l0 = JSON.parse(await js('JSON.stringify(window.__ligaStand)'));
    console.log('  Dashboard: Web Lock ' + (wA0.lock ? 'gehalten' : 'KEINER') + ' | Ligalisten-Seite: Crawler ' + (l0 && l0.crawler ? 'laeuft' : 'laeuft NICHT') + ', Web Lock ' + (l0 && l0.wachLock ? 'gehalten' : 'KEINER'));
    soll('der echte kpi_crawler.js laeuft in der Ligalisten-Seite und ist mit dem Dashboard verbunden', !!(l0 && l0.crawler));
    if (!ALT) {
      soll('Dashboard haelt den Web Lock (rcWachLage.lock)', wA0.lock && wA0.lage && wA0.lage.lock === true, JSON.stringify(wA0.lage));
      soll('Crawler haelt den Web Lock (rcCrawlerWach.lock)', !!(l0 && l0.wachLock && l0.wach && l0.wach.lock === true), JSON.stringify(l0 && l0.wach));
    }
    const tVerb = Date.now();
    await Br.cdp('Target.createTarget', { url: `${U}/__x.html` });
    A.zu(); A = null;                 // eine angehaengte Fernsteuerung soll das Ergebnis nicht verfaelschen
    console.log('  fremde Seite liegt vorn — Dashboard und Ligaliste sind ' + VERB + ' s verborgen (Schwelle ' + SCHWELLE + ' s) ...');
    await warte(VERB * 1000);
    const tVorn = Date.now();
    await vorn(zielA.id); await warte(4000);
    A = await verbinde(zielA.webSocketDebuggerUrl);
    await warte(2500);
    const a = JSON.parse(await js(`JSON.stringify({ m: window.__mess, lage: window.rcWachLage || null, liga: window.__ligaStand, log: (window.rcLogBuf || []).filter(function(z){ return /einfrier|eingefroren/i.test(z); }).slice(-4) })`));
    const b = a.liga;
    console.log('  Dashboard : eingefroren ' + a.m.fz + 'x, groesste Zeitgeber-Luecke ' + Math.round(a.m.maxGap / 1000) + ' s | ' + (a.m.ereignisse.map(x => rel(x[0], tVorn) + ' ' + x[1]).join(', ') || '-'));
    console.log('  Ligaliste : eingefroren ' + (b ? b.fz : '?') + 'x, groesste Zeitgeber-Luecke ' + (b ? Math.round(b.maxGap / 1000) : '?') + ' s | ' + (b ? b.ereignisse.map(x => rel(x[0], tVorn) + ' ' + x[1]).join(', ') : '-'));
    if (a.log.length) console.log('  Logbuch des Dashboards: ' + a.log.join(' || '));
    await discards([['| Ligaliste (Messung) | http', 'Ligaliste'], ['test_quali_zeiten.html', 'Dashboard']]);
    if (!ALT) {
      soll('Dashboard wurde in ' + VERB + ' s verborgen NICHT eingefroren', a.m.fz === 0, 'freeze ' + a.m.fz);
      soll('Ligaliste (Crawler) wurde NICHT eingefroren', !!b && b.fz === 0, 'freeze ' + (b && b.fz));
      soll('der Wachhalter des Dashboards meldet dasselbe (rcWachLage.eingefroren = 0)', !!a.lage && a.lage.eingefroren === 0, JSON.stringify(a.lage));
    } else {
      soll('GEGENPROBE: die aeltere Fassung des Dashboards WIRD eingefroren', a.m.fz >= 1, 'freeze ' + a.m.fz);
      soll('GEGENPROBE: die aeltere Fassung des Crawlers WIRD eingefroren', !!b && b.fz >= 1, 'freeze ' + (b && b.fz));
    }
  }
  // ====================================================================== fall=betrieb
  else if (FALL === 'betrieb') {
    await warte(700);
    if (ARG.alock === '1') await js('lockA()');
    await js(`oeffne('${UL}/__b.html?name=B1&lock=${ARG.b1lock === '1' ? 1 : 0}', 'B1')`, true); await warte(1800);
    await vorn(zielA.id); await warte(1500);
    console.log('  Lock in A: ' + (ARG.alock === '1' ? 'ja' : 'nein') + ' | Lock in B1: ' + (ARG.b1lock === '1' ? 'ja' : 'nein'));
    const tVerb = Date.now();
    await Br.cdp('Target.createTarget', { url: `${U}/__x.html` });
    A.zu(); A = null;
    console.log('  fremde Seite liegt vorn — A und B1 sind ' + VERB + ' s verborgen ...');
    await warte(VERB * 1000);
    const tVorn = Date.now();
    await vorn(zielA.id); await warte(3000);
    A = await verbinde(zielA.webSocketDebuggerUrl); await warte(2500);
    const a = JSON.parse(await js('JSON.stringify({ m: window.__mess, b: stat.B1 || null })'));
    console.log('  A : eingefroren ' + a.m.fz + 'x | ' + a.m.ereignisse.map(x => rel(x[0], tVorn) + ' ' + x[1]).join(', '));
    console.log('  B1: eingefroren ' + (a.b ? a.b.fz : '?') + 'x | ' + (a.b ? a.b.ereignisse.map(x => rel(x[0], tVorn) + ' ' + x[1]).join(', ') : '-'));
    await discards([['| B1 | http', 'B1'], ['| A | http', 'A']]);
    const mitLock = ARG.alock === '1' || ARG.b1lock === '1';
    soll(mitLock ? 'mit Web Lock: weder A noch B1 eingefroren' : 'ohne Web Lock: A und B1 nach der Schwelle eingefroren',
      mitLock ? (a.m.fz === 0 && a.b && a.b.fz === 0) : (a.m.fz >= 1 && a.b && a.b.fz >= 1));
  }
  // ====================================================================== fall=einzeln
  else {
    const neu = async (name, lock) => { const t = await Br.cdp('Target.createTarget', { url: `${U}/__b.html?name=${name}&lock=${lock}` }); await warte(1300); return t.targetId; };
    const idB1 = await neu('B1', 0); await neu('B2', 1);
    await vorn(zielA.id);
    console.log('  Tabs: A (vorn), B1 ohne Lock, B2 mit Web Lock — unverbunden');
    const t0 = Date.now(); let schlafSeit = null, geprueft = false, geweckt = false; const erg = {};
    while ((Date.now() - t0) / 1000 < +(ARG.sek || 110)) {
      await warte(5000);
      const s = JSON.parse(await js('JSON.stringify(stat)')), sek = Math.round((Date.now() - t0) / 1000), b1 = s.B1, b2 = s.B2;
      const antwortet = b1 && Date.now() - b1.um < 8000;
      if (b1 && b1.frozen && schlafSeit === null) { schlafSeit = sek; erg.b1Nach = sek; erg.antwortet = antwortet; console.log('  ' + sek + ' s: B1 EINGEFROREN — Zeitgeber stehen, antwortet auf Nachrichten: ' + (antwortet ? 'ja' : 'nein')); }
      if (schlafSeit !== null && !geprueft && sek - schlafSeit >= 5) {
        geprueft = true;
        await js(`sende('B1','fetch')`); await warte(5000);
        let x = JSON.parse(await js('JSON.stringify(stat.B1)')); erg.fetch = x.fetchStart + ' gestartet, ' + x.fetchDone + ' fertig';
        await js(`sende('B1','xhr')`); await warte(5000);
        x = JSON.parse(await js('JSON.stringify(stat.B1)')); erg.xhr = x.xhrMs === -1 ? 'scheitert (' + x.xhrErr + ')' : x.xhrMs + ' ms';
        console.log('       fetch aus dem Nachrichten-Handler: ' + erg.fetch + ' | sync-XHR: ' + erg.xhr);
      }
      if (schlafSeit !== null && geprueft && !geweckt && sek - schlafSeit >= 25) {
        geweckt = true;
        const z = (await liste()).find(t => t.id === idB1); const B = await verbinde(z.webSocketDebuggerUrl);
        try { await B.cdp('Page.setWebLifecycleState', { state: 'active' }); console.log('  ' + sek + ' s: Fernsteuerung weckt B1 (Page.setWebLifecycleState active)'); } catch (e) { console.log('       Wecken fehlgeschlagen: ' + e.message); }
        B.zu();
      }
      if (geweckt && erg.wach === undefined && b1 && !b1.frozen && b1.rs > 0) { erg.wach = sek; console.log('  ' + sek + ' s: B1 aufgetaut (der haengende fetch kam an: ' + b1.fetchDone + ')'); }
      if (erg.wach !== undefined && erg.wieder === undefined && b1 && b1.frozen) { erg.wieder = sek; console.log('  ' + sek + ' s: B1 erneut eingefroren'); }
      erg.b2Fz = b2 ? b2.fz : null; erg.b2Lock = b2 ? b2.lockHeld : null;
    }
    await discards([['| B1 | http', 'B1 (ohne Lock)'], ['| B2 | http', 'B2 (mit Lock)']]);
    soll('B1 ohne Web Lock wird nach der Schwelle eingefroren', erg.b1Nach !== undefined, 'nach ' + erg.b1Nach + ' s');
    soll('  ... Nachrichten kommen weiter an, ein fetch daraus kommt NICHT zurueck', erg.antwortet === true && /, 0 fertig$/.test(erg.fetch || ''), erg.fetch);
    soll('B2 mit Web Lock wird NICHT eingefroren', erg.b2Lock === true && erg.b2Fz === 0, 'freeze ' + erg.b2Fz);
    soll('die Fernsteuerung kann B1 wecken — Edge friert danach wieder ein', erg.wach !== undefined && erg.wieder !== undefined, 'wach ' + erg.wach + ' s, wieder eingefroren ' + erg.wieder + ' s');
  }
} catch (e) { console.log('ABBRUCH ' + (e && e.stack || e)); schlecht++; }
console.log(schlecht ? schlecht + ' FEHLGESCHLAGEN' : 'ALLES GEMESSEN WIE ERWARTET');
try { if (A) A.zu(); } catch { } Br.zu();
await ende(schlecht ? 1 : 0);
