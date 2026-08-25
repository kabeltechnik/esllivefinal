// ============================================================================
//  FEHLERSEITE MESSEN — kein Pruefwerkzeug, sondern ein MESSGERAET
//  (heisst bewusst nicht *_pruefen.js, damit der Sammel-Einzeiler es nicht mitzieht)
// ----------------------------------------------------------------------------
//  Anlass (Nutzer 05.10.): "Die Ligaliste updatet sich auch nicht immer und gibt
//  immer die Meldung: Keine bekannte Portal-Seite."
//
//  Laedt eine Portal-Seite nicht (Netz kurz weg, Portal antwortet nicht), zeigt
//  Edge seine eigene Fehlerseite. Der Autopilot laeuft auch dort — mit dem
//  Hostnamen "chromewebdata". Die aeltere Fassung schrieb dann "keine bekannte
//  Portal-Seite (chromewebdata)" und tat nichts mehr; Edges eigener Neuversuch
//  ruht, solange der Tab verborgen ist. Die Ligaliste blieb also tot, bis jemand
//  ihren Tab ansah.
//
//  Dieses Geraet startet ein ECHTES Edge mit Wegwerf-Profil und spielt die Kette
//  nach, ohne ein echtes Portal zu beruehren (ccs.vodafone.de zeigt per
//  --host-resolver-rules auf diesen Rechner):
//
//     A  = Dashboard (Attrappe, oder mit echt=1 das ECHTE Dashboard aus
//          test_quali_zeiten.html); oeffnet per window.open die Ligaliste
//     B  = Attrappe der Ligaliste unter http://ccs.vodafone.de:<port>/.../liga_listen.rb
//          In B laufen die ECHTE esl_autopilot.user.js und der ECHTE kpi_crawler.js,
//          eingespielt wie vom Starter (offene Fernsteuerung + Registrierung fuer
//          jedes neue Dokument).
//     Dann faellt das "Portal" aus, und B laedt sich selbst neu (so tut es der
//     Crawler nach einem Sitzungsverlust) -> Fehlerseite.
//
//    node pruefwerkzeuge/fehlerseite_messen.mjs
//        ohne Fenster (headless): die Mechanik. Erwartung: Hinweis auf der
//        Fehlerseite, nach 20 s laedt der Autopilot neu, B ist zurueck, Fenstername,
//        Verbindung zum Dashboard und Crawler stehen wieder.
//    node pruefwerkzeuge/fehlerseite_messen.mjs verborgen=1
//        der Betriebsfall: sichtbares Edge, Schlaf-Schwelle 30 s, A und B liegen
//        verborgen hinter einem fremden Tab, BEVOR das Portal ausfaellt.
//        Erwartung: B kommt zurueck, WAEHREND es verborgen ist.
//    ... echt=1           A ist das echte Dashboard. Zusaetzlich geprueft: die
//        Meldung der Fehlerseite steht GENAU EINMAL im Logbuch des Dashboards.
//    ... zweimal=1        das Portal bleibt laenger weg: der erste Neuversuch
//        scheitert, der zweite gelingt.
//    ... alt=<Ordner>     Gegenprobe mit einer aelteren esl_autopilot.user.js aus
//        diesem Ordner. Erwartung: die alte Meldung steht da; verborgen kommt B
//        nicht von selbst zurueck.
//
//  Gemessen am 05.10. (Edge 154): siehe CLAUDE.md, Abschnitt "LIGALISTE LIEFERT
//  NICHT IMMER".
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
const VERBORGEN = ARG.verborgen === '1', ZWEIMAL = ARG.zweimal === '1', ECHT = ARG.echt === '1';
const ALT = ARG.alt ? path.resolve(ARG.alt) : '';
const SCHWELLE = +(ARG.schwelle || 30);
const PA = +(ARG.porta || 8441), PP = +(ARG.portp || 8442), CDP = +(ARG.cdp || 9358);
// Zeitplan, gerechnet ab dem Verbergen (bzw. ab dem Scharfstellen): B laedt sich bei ARM selbst neu.
const ARM = +(ARG.arm || (VERBORGEN ? 50 : 6));
const AUS_UM = Math.max(1, ARM - 4), AN_UM = ARM + (ZWEIMAL ? 27 : 12), ENDE_UM = ARM + (ZWEIMAL ? 62 : 42);
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
if (!EDGE) { console.log('Kein Edge gefunden — dieses Geraet misst Edge-Verhalten.'); process.exit(2); }
const warte = ms => new Promise(r => setTimeout(r, ms));
let schlecht = 0;
const soll = (name, ok, info) => { if (!ok) schlecht++; console.log((ok ? '  ok   ' : '  FEHL ') + name + (info ? '  [' + info + ']' : '')); };

const AUTOPILOT = readFileSync(ALT && existsSync(path.join(ALT, 'esl_autopilot.user.js')) ? path.join(ALT, 'esl_autopilot.user.js') : path.join(WURZEL, 'esl_autopilot.user.js'), 'utf8');
const CRAWLER = readFileSync(path.join(WURZEL, 'kpi_crawler.js'), 'utf8');
const WARTE_SEK = +((AUTOPILOT.match(/var FEHLERSEITE_WARTE_SEK = (\d+);/) || [])[1] || 0);

// ---------------------------------------------------------------- Seiten
const A_HTML = `<!doctype html><meta charset=utf-8><title>Dashboard (Messung)</title><body>Dashboard (Messung)`;
// Mitschreiber in A (Attrappe UND echtes Dashboard): was B meldet, wie oft A eingefroren wurde, Oeffner.
const A_SKRIPT = `(function(){ if (window.__messA) return; window.__messA = true; window.log = []; window.fz = 0;
  window.addEventListener('message', function(ev){ var d = ev.data || {};
    if (d && d.__mess) window.log.push(Object.assign({ um: Date.now() }, d));
    if (d && d.type === 'KPI_HINWEIS') window.log.push({ um: Date.now(), art: 'hinweis', text: String(d.text || '') }); });
  document.addEventListener('freeze', function(){ window.fz++; });
  window.oeffne = function(url){ window.b = window.open(url, 'rcKpiQuelle'); try { window.rcKpiWin = window.b; } catch (e) {} return !!window.b; };
  window.lockA = function(){ return new Promise(function(r){ navigator.locks.request('rc_wach_A_' + Date.now(), function(){ r(true); return new Promise(function(){}); }); }); };
})(); 1`;
const B_HTML = `<!doctype html><meta charset=utf-8><title>Ligaliste (Messung)</title><body>Ligaliste (Messung)<table id="result-table"><tr><td>-</td></tr></table>`;
// Beobachter, der VOR dem Autopiloten in jedem neuen Dokument von B laeuft: meldet an A, was B gerade ist.
const BEOBACHTER = `(function(){ try { if (window.top !== window.self) return; var n = 0;
  function sende(art, mehr){ try { if (window.opener) window.opener.postMessage(Object.assign({ __mess:1, art:art, href:location.href, titel:document.title, name:window.name, zeit:Date.now() }, mehr || {}), '*'); } catch (e) {} }
  sende('dokument');
  setInterval(function(){ n++; var b = document.getElementById('rcAutoBanner'); sende('puls', { n:n, banner: b ? b.textContent : '', crawler: !!window.kpiCrawlerInterval, lock: !!window.__rcWachLock }); }, 2000);
  document.addEventListener('freeze', function(){ sende('eingefroren'); }); document.addEventListener('resume', function(){ sende('aufgetaut'); });
} catch (e) {} })();`;
const PAKET = BEOBACHTER + '\nwindow.__rcFiles = ' + JSON.stringify({ kpi: CRAWLER }) + ';\n' + AUTOPILOT;

const TYP = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.xlsx': 'application/octet-stream', '.xls': 'application/octet-stream' };
const srvA = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const html = t => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(t); };
  if (u.pathname === '/__a.html') return html(A_HTML);
  if (u.pathname === '/__x.html') return html('<!doctype html><title>X</title>fremde Seite');
  // Dateien aus dem Projektordner (nur lesen) — fuer das echte Dashboard (echt=1).
  const datei = path.resolve(WURZEL, decodeURIComponent(u.pathname).replace(/^\/+/, ''));
  if (!datei.startsWith(WURZEL)) { res.writeHead(403); return res.end(); }
  try { if (!statSync(datei).isFile()) throw 0; res.writeHead(200, { 'content-type': TYP[path.extname(datei).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(readFileSync(datei)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srvA.listen(PA, '127.0.0.1', r));
let srvP = null;
const portalAn = () => new Promise(r => { srvP = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); s.end(B_HTML); }); srvP.listen(PP, '127.0.0.1', r); });
const portalAus = () => new Promise(r => { if (!srvP) return r(); const s = srvP; srvP = null; if (s.closeAllConnections) s.closeAllConnections(); s.close(() => r()); });
await portalAn();
const UA = `http://127.0.0.1:${PA}`;
const URL_B = `http://ccs.vodafone.de:${PP}/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/liga_listen.rb?script_id=11035`;

// ---------------------------------------------------------------- Edge
const profil = mkdtempSync(path.join(tmpdir(), 'esl-fehl-'));
mkdirSync(path.join(profil, 'Default'), { recursive: true });
writeFileSync(path.join(profil, 'Default', 'Preferences'), JSON.stringify({ edge: { sleeping_tabs: { enabled: true, threshold: SCHWELLE, fade_tabs: true, auto_discard_enabled: false } }, browser: { has_seen_welcome_page: true } }));
// Kein Verkehr zu echten Portalen: alle Portal-Namen zeigen auf diesen Rechner.
const UMLEITUNG = '--host-resolver-rules=MAP *.vodafone.de 127.0.0.1,MAP *.regiocom.net 127.0.0.1,MAP *.microsoftonline.com 127.0.0.1,MAP *.live.com 127.0.0.1';
// Die echte Ligaliste laeuft ueber https (sicherer Kontext — nur dort gibt es Web Locks). Die Attrappe laeuft
// ueber http; damit der Wachhalter des Crawlers wie im Betrieb greift, gilt ihre Adresse hier als sicher.
const SICHER = `--unsafely-treat-insecure-origin-as-secure=http://ccs.vodafone.de:${PP}`;
// --disable-sync ist PFLICHT fuer jedes Wegwerf-Profil auf dem Entwicklungsrechner: Edge meldet ein neues
// Profil selbst am Microsoft-Konto an und holt dessen Einstellungen. Stehen dort "alle Cookies blockieren"
// (so gemessen am 05.10.: nach rund 12 s), ist ab dann JEDER Seitenspeicher gesperrt — auch Web Locks
// (SecurityError "The request was denied."). Die Messung saehe aus wie ein Fehler im Wachhalter.
const args = [`--remote-debugging-port=${CDP}`, `--user-data-dir=${profil}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', UMLEITUNG, SICHER, '--disable-features=HttpsUpgrades,Translate']
  .concat(VERBORGEN ? ['--window-size=760,520', '--window-position=20,20'] : ['--headless=new', '--disable-gpu'])
  .concat([ECHT ? `${UA}/test_quali_zeiten.html` : `${UA}/__a.html`]);
console.log('FEHLERSEITE MESSEN | ' + (VERBORGEN ? 'Betriebsfall: Tabs verborgen (Schlaf-Schwelle ' + SCHWELLE + ' s)' : 'ohne Fenster (Mechanik)') + (ECHT ? ' | echtes Dashboard' : '') +
  (ALT ? ' | GEGENPROBE mit ' + ALT : '') + (ZWEIMAL ? ' | Portal bleibt laenger weg' : '') + ' | Autopilot wartet ' + (WARTE_SEK || '—') + ' s');
const proc = spawn(EDGE, args, { stdio: 'ignore' });
const liste = async () => (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json());
function verbinde(wsUrl, ereignis) {
  return new Promise((ok, nein) => {
    const ws = new WebSocket(wsUrl); let nr = 0; const offen = new Map();
    ws.addEventListener('open', () => ok({
      cdp: (method, params = {}) => new Promise((res, rej) => { const id = ++nr; offen.set(id, m => m.error ? rej(new Error(method + ' ' + JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); }),
      zu: () => { try { ws.close(); } catch { } } }));
    ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); } else if (m.method && ereignis) ereignis(m); });
    ws.addEventListener('error', nein);
  });
}
const ende = async code => {
  try { spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { }
  try { proc.kill(); } catch { }
  srvA.close(); await portalAus(); await warte(1200);
  try { rmSync(profil, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch { console.log('  (Wegwerf-Profil blieb liegen: ' + profil + ')'); }
  process.exit(code);
};
let zielA = null;
for (let i = 0; i < 100 && !zielA; i++) { try { zielA = (await liste()).find(t => t.type === 'page' && t.url.startsWith(UA)); } catch { } if (!zielA) await warte(250); }
if (!zielA) { console.log('ABBRUCH: Start-Tab nicht gefunden'); await ende(2); }
const ver = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json();
console.log('Edge ' + ver.Browser);
const Br = await verbinde(ver.webSocketDebuggerUrl);
let A = await verbinde(zielA.webSocketDebuggerUrl);
const auf = async (V, a, geste) => { const r = await V.cdp('Runtime.evaluate', { expression: a, awaitPromise: true, returnByValue: true, userGesture: !!geste }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
const vorn = async id => { await fetch(`http://127.0.0.1:${CDP}/json/activate/${id}`); await warte(500); };

try {
  // Seite A steht (Attrappe sofort; das echte Dashboard braucht einen Moment fuer seine Daten)
  let bereit = false;
  for (let i = 0; i < 160 && !bereit; i++) { try { bereit = await auf(A, ECHT ? `!!document.getElementById('rcLiveDashboard') && typeof window.rcLogbuch === 'function'` : `document.readyState === 'complete' && location.pathname === '/__a.html' && /Messung/.test(document.title)`); } catch { } if (!bereit) await warte(400); }
  if (ECHT) soll('das echte Dashboard laeuft', bereit);
  await auf(A, A_SKRIPT);
  if (VERBORGEN) {
    if (ECHT) { await warte(1200); soll('das echte Dashboard haelt seinen Web Lock', await auf(A, '!!window.__rcWachLock && !!(window.rcWachLage && window.rcWachLage.lock)')); }
    else await auf(A, 'lockA()');                    // die Attrappe haelt einen Web Lock wie das Dashboard
  }
  soll('das Dashboard oeffnet die Ligaliste', await auf(A, `oeffne(${JSON.stringify(URL_B)})`, true) === true);
  let zielB = null;
  for (let i = 0; i < 60 && !zielB; i++) { zielB = (await liste()).find(t => t.type === 'page' && t.url.startsWith('http://ccs.vodafone.de:')); if (!zielB) await warte(250); }
  if (!zielB) throw new Error('Ligalisten-Tab nicht gefunden');

  // Anker wie im Starter: Verbindung bleibt OFFEN, der Autopilot ist fuer jedes neue Dokument registriert
  // und wird zusaetzlich in die schon offene Seite gespielt.
  const nav = [], konsole = []; let t0 = Date.now();
  const B = await verbinde(zielB.webSocketDebuggerUrl, m => {
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) nav.push({ um: Date.now(), url: m.params.frame.url, nichtErreichbar: m.params.frame.unreachableUrl || '' });
    if (m.method === 'Runtime.consoleAPICalled') { const t = m.params.args.map(a => a.value).join(' '); if (/\[Autopilot/.test(t)) konsole.push({ um: Date.now(), t: t.replace(/%c/g, '').slice(0, 220) }); }
  });
  await B.cdp('Page.enable'); await B.cdp('Runtime.enable');
  await B.cdp('Page.addScriptToEvaluateOnNewDocument', { source: PAKET });
  await B.cdp('Runtime.evaluate', { expression: PAKET });
  let laeuft = false;
  for (let i = 0; i < 100 && !laeuft; i++) { await warte(300); laeuft = await auf(B, '!!window.kpiCrawlerInterval'); }
  await warte(600);
  const lock0 = await auf(B, '!!window.__rcWachLock && !!(window.rcCrawlerWach && window.rcCrawlerWach.lock)');
  soll('in B laufen der echte Autopilot und der echte KPI-Crawler (mit Wachhalter)', laeuft && lock0, 'Web Lock ' + (lock0 ? 'gehalten' : 'KEINER') + ' | ' + konsole.slice(-1).map(k => k.t).join(''));

  // B laedt sich bei ARM selbst neu — so tut es der Crawler nach einem Sitzungsverlust.
  await auf(B, `setTimeout(function(){ location.reload(); }, ${ARM * 1000}); 1`);
  let tVorn = 0;
  if (VERBORGEN) {
    await vorn(zielA.id);
    await Br.cdp('Target.createTarget', { url: `${UA}/__x.html` });
    A.zu(); A = null;
    console.log('  fremde Seite liegt vorn — Dashboard und Ligaliste sind verborgen');
  }
  t0 = Date.now(); const rel = um => (um - t0 >= 0 ? '+' : '') + Math.round((um - t0) / 1000) + ' s';
  console.log('  Plan: Portal faellt aus bei +' + AUS_UM + ' s, B laedt sich neu bei +' + ARM + ' s, Portal ist zurueck bei +' + AN_UM + ' s, Ende der Beobachtung bei +' + ENDE_UM + ' s');
  await warte(AUS_UM * 1000 - (Date.now() - t0)); await portalAus();
  await warte(AN_UM * 1000 - (Date.now() - t0)); await portalAn();
  await warte(ENDE_UM * 1000 - (Date.now() - t0));
  if (VERBORGEN) { tVorn = Date.now(); await vorn(zielA.id); await warte(5000); A = await verbinde(zielA.webSocketDebuggerUrl); }
  await warte(1500);

  // ------------------------------------------------------------ Auswertung
  const fehl = nav.filter(n => n.um >= t0 && /^chrome-error:/.test(n.url));
  const zurueck = fehl.length ? nav.find(n => n.um > fehl[0].um && n.url === URL_B) : null;
  console.log('  Verlauf von B: ' + (nav.filter(n => n.um >= t0).map(n => rel(n.um) + ' ' + (/^chrome-error:/.test(n.url) ? 'FEHLERSEITE' : 'Ligaliste')).join(', ') || '-') + (tVorn ? ' | wieder sichtbar bei ' + rel(tVorn) : ''));
  const aLog = JSON.parse(await auf(A, 'JSON.stringify({ log: window.log, fz: window.fz, buch: (window.rcLogBuf || []).filter(function(z){ return /Fehlerseite des Browsers/.test(z); }) })'));
  const vonFehlerseite = aLog.log.filter(x => /^chrome-error:/.test(x.href || ''));
  const pulse = vonFehlerseite.filter(x => x.art === 'puls');
  const hinweise = aLog.log.filter(x => x.art === 'hinweis' && /Fehlerseite des Browsers/.test(x.text));
  const bannerFehl = (pulse.map(x => x.banner).filter(Boolean).pop() || konsole.filter(k => fehl.length && k.um >= fehl[0].um && (!zurueck || k.um < zurueck.um)).map(k => k.t).pop() || '');
  console.log('  auf der Fehlerseite: Titel "' + ((pulse[pulse.length - 1] || {}).titel || '?') + '", Fenstername "' + ((vonFehlerseite[0] || {}).name || '?') + '", Zeitgeber-Pulse an das Dashboard: ' + pulse.length +
    ', eingefroren: ' + aLog.log.filter(x => x.art === 'eingefroren').length + 'x');
  console.log('  Hinweis des Autopiloten dort: ' + (bannerFehl || '(keiner gelesen)'));
  soll('B landet beim Neuladen ohne Portal auf Edges Fehlerseite', fehl.length >= 1 && fehl[0].nichtErreichbar === URL_B, fehl.length ? rel(fehl[0].um) : 'keine Fehlerseite');
  soll('der Autopilot laeuft dort; die Verbindung zum Dashboard (opener) und der Fenstername stehen noch', vonFehlerseite.length >= 1 && vonFehlerseite[0].name === 'rcKpiQuelle', vonFehlerseite.length + ' Nachrichten');
  if (!ALT) {
    soll('Hinweis: Portal nicht erreichbar (mit Fehlercode), laedt von selbst neu — keine "fremde Seite"', /ccs\.vodafone\.de ist nicht erreichbar \((ERR_|HTTP ERROR)/.test(bannerFehl) && /von selbst neu/.test(bannerFehl) && !/gehoert nicht zu/.test(bannerFehl));
    soll('das Dashboard bekommt die Meldung der Fehlerseite (je Versuch eine, immer derselbe Text)', hinweise.length === fehl.length && hinweise.every(h => h.text === hinweise[0].text) && /Ligalisten-Tab steht auf der Fehlerseite des Browsers \(ccs\.vodafone\.de, ERR_/.test((hinweise[0] || {}).text || ''), hinweise.length + 'x: ' + ((hinweise[0] || {}).text || '').slice(0, 130));
    if (ECHT) soll('im Logbuch des echten Dashboards steht sie GENAU EINMAL', aLog.buch.length === 1, aLog.buch.length + ' Zeile(n): ' + String(aLog.buch[0] || '').slice(0, 150));
    const dauer = zurueck ? (zurueck.um - fehl[0].um) / 1000 : -1;
    const erw = ZWEIMAL ? [2 * WARTE_SEK - 3, 2 * WARTE_SEK + 14] : [WARTE_SEK - 3, WARTE_SEK + 9];
    soll('B ist von selbst zurueck auf der Ligaliste' + (ZWEIMAL ? ' — nach ZWEI Versuchen' : ''), !!zurueck && dauer >= erw[0] && dauer <= erw[1] && (!ZWEIMAL || fehl.length >= 2),
      zurueck ? Math.round(dauer) + ' s nach der Fehlerseite, ' + fehl.length + ' Fehlerseite(n)' : 'nicht zurueck');
    if (VERBORGEN) soll('... und zwar, WAEHREND der Tab verborgen war', !!zurueck && zurueck.um < tVorn, zurueck ? rel(zurueck.um) + ' (sichtbar erst ' + rel(tVorn) + ')' : '');
    await auf(B, `try { window.opener.postMessage({ __mess:1, art:'probe', href:location.href, zeit:Date.now() }, '*'); } catch (e) {} 1`); await warte(500);
    const b = JSON.parse(await auf(B, `JSON.stringify({ href: location.href, name: window.name, opener: !!window.opener, crawler: !!window.kpiCrawlerInterval, lock: !!window.__rcWachLock, grund: (window.rcCrawlerWach || {}).grund || '' })`));
    const probe = JSON.parse(await auf(A, `JSON.stringify(window.log.filter(function(x){ return x.art === 'probe'; }).length)`));
    soll('danach: Fenstername, Verbindung zum Dashboard, Crawler und Wachhalter stehen wieder', b.href === URL_B && b.name === 'rcKpiQuelle' && b.opener && probe >= 1 && b.crawler && b.lock,
      'Name ' + b.name + ', opener ' + b.opener + ', Crawler ' + b.crawler + ', Web Lock ' + b.lock + (b.grund ? ' (' + b.grund + ')' : '') + ', Nachricht am Dashboard ' + probe);
    if (VERBORGEN) soll('nichts wurde eingefroren (Dashboard ' + aLog.fz + 'x)', aLog.fz === 0 && aLog.log.filter(x => x.art === 'eingefroren').length === 0);
  } else {
    soll('GEGENPROBE: die aeltere Fassung meldet dort "keine bekannte Portal-Seite (chromewebdata)"', /keine bekannte Portal-Seite \(chromewebdata\)/.test(bannerFehl) || konsole.some(k => /keine bekannte Portal-Seite \(chromewebdata\)/.test(k.t)), bannerFehl);
    if (VERBORGEN) soll('GEGENPROBE: verborgen kommt B NICHT von selbst zurueck', !zurueck || zurueck.um >= tVorn, zurueck ? 'zurueck bei ' + rel(zurueck.um) + ', sichtbar ab ' + rel(tVorn) : 'bis zum Ende nicht zurueck');
    else console.log('  (ohne Fenster gilt der Tab als sichtbar: Edges eigener Neuversuch darf hier helfen' + (zurueck ? ' — zurueck bei ' + rel(zurueck.um) : ' — bis zum Ende nicht zurueck') + ')');
  }

  // ------------------------------------------------------------ fremder Tab (nur neue Fassung, ohne Fenster)
  if (!ALT && !VERBORGEN) {
    const kons2 = [];
    const t = await Br.cdp('Target.createTarget', { url: 'about:blank' }); await warte(600);
    const z = (await liste()).find(x => x.id === t.targetId);
    const F = await verbinde(z.webSocketDebuggerUrl, m => { if (m.method === 'Runtime.consoleAPICalled') kons2.push(m.params.args.map(a => a.value).join(' ')); });
    await F.cdp('Page.enable'); await F.cdp('Runtime.enable');
    await F.cdp('Page.addScriptToEvaluateOnNewDocument', { source: AUTOPILOT });
    await F.cdp('Page.navigate', { url: 'http://127.0.0.1:9/fremd' }); await warte(6000);
    const fb = await auf(F, `(document.getElementById('rcAutoBanner') || {}).textContent || ''`);
    const txt = fb || kons2.filter(k => /\[Autopilot\]/.test(k)).pop() || '';
    soll('fremder Tab auf einer Fehlerseite: nur ein grauer Satz, KEIN Neuladen angekuendigt', /gehoert nicht zu ESL oder Ligaliste/.test(txt) && !kons2.some(k => /von selbst neu/.test(k)), txt.slice(0, 120));
    F.zu();
  }
} catch (e) { console.log('ABBRUCH ' + (e && e.stack || e)); schlecht++; }
console.log(schlecht ? schlecht + ' FEHLGESCHLAGEN' : 'ALLES GEMESSEN WIE ERWARTET');
try { if (A) A.zu(); } catch { } Br.zu();
await ende(schlecht ? 1 : 0);
