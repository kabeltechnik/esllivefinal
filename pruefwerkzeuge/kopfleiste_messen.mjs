// ============================================================================
//  KOPFLEISTE MESSEN — kein Pruefwerkzeug, sondern ein MESSGERAET
//  (heisst bewusst nicht *_pruefen.js, damit der Sammel-Einzeiler es nicht mitzieht)
// ----------------------------------------------------------------------------
//  Aufruf (aus dem Projektordner, der Offline-Server muss laufen:
//          python -m http.server 8412 --bind 127.0.0.1):
//    node pruefwerkzeuge/kopfleiste_messen.mjs
//    node pruefwerkzeuge/kopfleiste_messen.mjs src=<aeltere Fassung.js>   (Gegenprobe)
//
//  Braucht die drei ESL-Exporte in "Test Excels/" (siehe HARNESS unten) und ein
//  installiertes Chrome oder Edge. Startet ein EIGENES headless-Fenster (Port 9341,
//  eigenes Wegwerf-Profil) und beendet es wieder.
//
//  Was gemessen wird (Nutzer-Befund 05.10.: "Einstellungsmenue nicht mehr sichtbar ...
//  alles verschiebt sich"):
//    A  Zoom nach dem Start (Vorgabe 100 %, Automatik aus)
//    B  zehn Fensterbreiten, VOLL belegt: Menue und Schliessen im Bild? ueberlappt etwas?
//    C  Zoom von Hand 125 / 150 / 200 %
//    D  zwoelf Zustandswechsel: bewegt sich ein ANDERES Bedienelement?
//    E  mehr Inhalt -> passt der ResizeObserver von selbst nach?
//    F  Re-Inject
//    G  einmalige Umstellung auf 100 %, spaetere Wahl des Nutzers bleibt
//
//  Warum headless und nicht das Browser-Pane: in einer VERBORGENEN Seite feuert der
//  ResizeObserver nicht — dort misst man nur die Funktion, nicht ihren Ausloeser.
//
//  Zwei Fallen, in die diese Messung selbst gelaufen ist (05.10.):
//   1. Gefaelschte Zeitstempel (rcKpiLastUpdate 95 Min alt) wecken den echten Watchdog,
//      die Seite laedt sich mitten in der Messung neu. Texte deshalb direkt setzen.
//   2. rcProjektKnoepfe blendet die Projekt-Knoepfe im Einzelprojekt-Betrieb alle 15 s
//      inline aus. Erzwungen werden sie hier per Stylesheet mit !important.
// ============================================================================
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SRC = (process.argv.find(a => a.startsWith('src=')) || '').slice(4);
const KAND = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
const exe = KAND.find(existsSync);
const PORT = 9341;
const prof = mkdtempSync(path.join(tmpdir(), 'esl-kopf-'));
// --disable-sync: sonst holt Edge die Konto-Einstellungen ins Wegwerf-Profil (gemessen 05.10.: "alle Cookies
// blockieren" nach rund 12 s) — ab dann wirft localStorage, und das Dashboard liefe anders als im Betrieb.
const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-sync', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
const warte = ms => new Promise(r => setTimeout(r, ms));
let ziel = null;
for (let i = 0; i < 60 && !ziel; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); ziel = l.find(t => t.type === 'page'); } catch { await warte(250); }
}
if (!ziel) { console.log('kein Browser'); proc.kill(); process.exit(2); }
const ws = new WebSocket(ziel.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let nr = 0; const offen = new Map(); const fehlerLog = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); }
  else if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) console.log('   [Navigation ' + new Date().toISOString().slice(14,19) + '] ' + m.params.frame.url.slice(0, 90));
  else if (m.method === 'Runtime.exceptionThrown') fehlerLog.push((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text || '').slice(0, 160));
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') fehlerLog.push('console.error: ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 160));
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++nr; offen.set(id, m => m.error ? rej(new Error(method + ' ' + JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const js = async (ausdruck) => {
  const r = await cdp('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
  return r.result.value;
};
const breite = async (w, h = 1080) => { await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await warte(900); };
await cdp('Runtime.enable'); await cdp('Page.enable');

const HARNESS = 'http://127.0.0.1:8412/test_abgleich_esl.html?std=AL&k=Export_20260928_212911.xlsx&m=Export_20260928_212922.xlsx&u=Export_20260928_212931.xlsx' + (SRC ? '&src=' + SRC : '');
const laden = async (vorher) => {
  await cdp('Page.navigate', { url: 'http://127.0.0.1:8412/pruefwerkzeuge/' });
  await warte(600);
  if (vorher) await js(vorher);
  await cdp('Page.navigate', { url: HARNESS + '&x=' + Date.now() });
  for (let i = 0; i < 200; i++) { await warte(500); try { if (await js('!!window.__fertig')) break; } catch {} }
  // Die Schein-Portalseite hat ein echtes Formular: klickt das Dashboard dort "Suchen" (Waechter nach
  // ESL-Fehlserie), laedt die Seite neu und die Messung liefe auf einer frischen Seite weiter.
  await js(`window.addEventListener('submit', function(e){ e.preventDefault(); window.__submitGebremst = (window.__submitGebremst || 0) + 1; }, true); 1`);
  return js(`(document.getElementById('log') ? document.getElementById('log').textContent : document.body.innerText).split('\\n').filter(z => /BESTANDEN|fehlgeschlagen/i.test(z)).pop() || 'kein Ergebnis'`);
};

const MESS = `(() => {
  const hd = document.querySelector('#rcLiveDashboard .rc-header');
  const ctl = hd.querySelector('.rc-header-ctl') || hd.children[hd.children.length - 1];
  const R = e => e.getBoundingClientRect();
  const sicht = e => e.getClientRects().length > 0;
  const vw = window.innerWidth;
  const tools = R(document.getElementById('rcToolsBtn')), zu = R(document.getElementById('rcBtnToggle'));
  const kinder = Array.from(ctl.children).filter(sicht);
  const erstes = kinder[0];
  const marke = hd.querySelector('.rc-header-brand');
  const markeFest = Array.from(marke.children).filter(sicht).filter(e => !e.id);
  const letzteMarke = markeFest[markeFest.length - 1];
  const info = hd.querySelector('.rc-header-info');
  return {
    vw, zoom: window.rcZoom || 1, stufe: window.rcKopfStufe,
    menue: tools.left >= -0.5 && tools.right <= vw + 0.5, zu: zu.left >= -0.5 && zu.right <= vw + 0.5,
    beschnitten: erstes ? R(erstes).left < R(ctl).left - 0.5 : false,
    ueberlappt: (letzteMarke && erstes) ? R(letzteMarke).right > R(erstes).left + 0.5 : false,
    sichtbar: kinder.length, hoehe: Math.round(R(hd).height),
    infoBreite: info ? Math.round(R(info).width) : null,
    zweizeilig: Array.from(hd.querySelectorAll('#rcFetchStatus, #rcLastSale')).filter(sicht).some(e => R(e).height > 20 * (window.rcZoom || 1))
  };
})()`;
const LAGE = `(() => { const o = {}; ['rcOhneStackChip','rcQuellenZeit','rcClock','rcPageArena','rcPageCockpit','rcProjWahl','rcBtnJetzt','rcBtnAutoRot','rcBtnAutoRotQuali','rcStandortFilter','rcStackFilter','rcTeamFilter','rcToolsBtn','rcBtnToggle'].forEach(n => { const e = document.getElementById(n); o[n] = e && e.getClientRects().length ? Math.round(e.getBoundingClientRect().left * 10) / 10 : null; }); return o; })()`;
const zeile = (titel, m) => console.log((titel + '                                        ').slice(0, 40) + ' vw ' + m.vw + ' zoom ' + m.zoom + ' Stufe ' + m.stufe + ' | Menue ' + (m.menue ? 'JA  ' : 'NEIN') + ' Schliessen ' + (m.zu ? 'JA  ' : 'NEIN') + ' | beschnitten ' + (m.beschnitten ? 'JA' : 'nein') + ' ueberlappt ' + (m.ueberlappt ? 'JA' : 'nein') + ' | sichtbar ' + m.sichtbar + ' Info ' + m.infoBreite + ' zweizeilig ' + (m.zweizeilig ? 'JA' : 'nein') + ' Hoehe ' + m.hoehe);
const VOLL = `(() => { (function(){ if (!document.getElementById('testProj')) { const st = document.createElement('style'); st.id = 'testProj'; st.textContent = '#rcProjWahl{display:flex !important}'; document.head.appendChild(st); } })(); document.getElementById('rcZeitEsl').textContent = '16:20 · vor 12 Min'; document.getElementById('rcZeitLiga').textContent = '14:57 · vor 1 Std'; const s = document.getElementById('rcStandortFilter'); s.value = 'AL'; s.dispatchEvent(new Event('change', {bubbles:true})); return 1; })()`;

let schlecht = 0;
const soll = (name, ok, info) => { if (!ok) schlecht++; console.log((ok ? '  ok   ' : '  FEHL ') + name + (info ? '  [' + info + ']' : '')); };

try {
  await breite(1920);
  // ---- A: Ausgangslage wie beim Nutzer: nichts gespeichert (alte Vorgabe = Automatik an) ----
  const erg = await laden(`localStorage.clear(); 1`);
  console.log('Pruefseite: ' + erg + (SRC ? '   (Fassung ' + SRC + ')' : ''));
  const z0 = await js(`({ zoom: window.rcZoom || 1, auto: window.rcZoomAutoAn(), label: document.getElementById('rcZoomLabel').textContent, css: getComputedStyle(document.getElementById('rcLiveDashboard')).zoom, marke: localStorage.getItem('rcZoom100Migriert') })`);
  console.log('Zoom nach dem Start bei 1920 px: ' + JSON.stringify(z0));
  await js(VOLL); await warte(900);
  zeile('1920 voll belegt (Projekt-Knoepfe, Filter)', await js(MESS));

  if (!SRC) {
    soll('Zoom 100 %, Automatik aus, Marke gesetzt', z0.zoom === 1 && z0.auto === false && z0.label === '100%' && z0.css === '1' && z0.marke === '1', JSON.stringify(z0));
    // ---- B: Breiten-Matrix, OHNE rcKopfEinpassen von Hand: der ResizeObserver muss es tun ----
    console.log('\n-- Breiten (Steuerung-Seite mit Statuszeile = breiteste Lage) --');
    await js(`document.getElementById('rcPageCockpit').click(); window.rcFetchStatusVoll = 'aktualisiert 21:29:31 · Zeitraum 05.10.2026 · 6.263 Kontakte'; window.rcFetchStatusAktualisieren(); 1`);
    for (const w of [1920, 1760, 1600, 1536, 1440, 1366, 1280, 1152, 1024, 900]) {
      await breite(w);
      const m = await js(MESS);
      zeile(w + ' px', m);
      soll(w + ': Menue und Schliessen im Bild', m.menue && m.zu);
      soll(w + ': nichts zweizeilig, Hoehe 52' + (w >= 1024 ? ', nichts ueberlappt' : ''), (w < 1024 || !m.ueberlappt) && !m.zweizeilig && m.hoehe === 52);
      if (w >= 1024) soll(w + ': Bedienung nicht beschnitten', !m.beschnitten);
    }
    await breite(1920);
    const zur = await js(MESS);
    soll('zurueck auf 1920: wieder Stufe 0 (alles sichtbar)', zur.stufe === 0 && !zur.beschnitten, 'Stufe ' + zur.stufe);

    // ---- C: Zoom von Hand auf 150 % (1920 px -> 1280 nutzbar): Menue bleibt ----
    console.log('\n-- Zoom von Hand --');
    for (const z of [1.25, 1.5, 2]) {
      await js(`window.rcApplyZoom(${z}, false); 1`); await warte(900);
      const m = await js(MESS); zeile('1920 px, Zoom ' + z, m);
      soll('Zoom ' + z + ': Menue und Schliessen im Bild' + (z < 2 ? ', keine Ueberlappung' : ' (links beschnitten ist hier erlaubt)'), m.menue && m.zu && (z >= 2 || !m.ueberlappt) && m.hoehe === Math.round(52 * z));
    }
    await js(`window.rcApplyZoom(1, false); 1`); await warte(900);

    // ---- D: Ruhe — nichts verschiebt sich, wenn etwas erscheint oder seinen Text wechselt ----
    console.log('\n-- Ruhe bei 1920 px --');
    await js(`document.getElementById('rcPageArena').click(); (function(){ const s = document.getElementById('rcStandortFilter'); s.value = 'ALL'; s.dispatchEvent(new Event('change', {bubbles:true})); })(); 1`); await warte(700);
    const vergleich = async (name, tun, darf) => {
      const a = await js(LAGE); await js(tun); await warte(700); const b = await js(LAGE);
      const bewegt = Object.keys(a).filter(k => a[k] !== null && b[k] !== null && Math.abs(a[k] - b[k]) > 0.5 && !(darf || []).includes(k));
      soll(name + ': kein anderes Bedienelement bewegt sich', bewegt.length === 0, bewegt.map(k => k + ' ' + a[k] + '>' + b[k]).join(', '));
    };
    await vergleich('Standort-Filter setzen (Reset-Knopf erscheint)', `(function(){ const s = document.getElementById('rcStandortFilter'); s.value = 'AL'; s.dispatchEvent(new Event('change', {bubbles:true})); })(); 1`, ['rcOhneStackChip']);
    const rst = await js(`getComputedStyle(document.getElementById('rcFltReset')).visibility`);
    soll('Reset-Knopf ist bei gesetztem Filter sichtbar', rst === 'visible', rst);
    await vergleich('Team-Filter setzen', `(function(){ const s = document.getElementById('rcTeamFilter'); if (s.options.length > 1) { s.value = s.options[1].value; s.dispatchEvent(new Event('change', {bubbles:true})); } })(); 1`, ['rcOhneStackChip']);
    await vergleich('Filter zuruecksetzen (Reset-Knopf verschwindet)', `document.getElementById('rcFltReset').click(); 1`, ['rcOhneStackChip']);
    const rst2 = await js(`getComputedStyle(document.getElementById('rcFltReset')).visibility`);
    soll('Reset-Knopf ist ohne Filter unsichtbar, sein Platz bleibt', rst2 === 'hidden', rst2);
    await vergleich('Zaehler verschwindet', `document.getElementById('rcOhneStackChip').style.display = 'none'; 1`, ['rcOhneStackChip']);
    await vergleich('Zaehler erscheint dreistellig', `(function(){ const c = document.getElementById('rcOhneStackChip'); c.style.display = ''; c.innerHTML = '128<span> ohne Stack</span>'; })(); 1`, ['rcOhneStackChip']);
    await vergleich('Quellen-Zeit wechselt (— / jetzt / vor 89 Min / vor 12 Std)', `document.getElementById('rcZeitEsl').textContent = '23:59 · vor 89 Min'; document.getElementById('rcZeitLiga').textContent = '00:00 · vor 12 Std'; 1`, []);
    await vergleich('Quellen-Zeit leer', `document.getElementById('rcZeitEsl').textContent = '—'; document.getElementById('rcZeitLiga').textContent = '12:03 · jetzt'; 1`, []);
    await vergleich('Auto-Wechsel an ("Auto AN")', `document.getElementById('rcBtnAutoRot').click(); 1`, []);
    await vergleich('Auto-Wechsel aus', `document.getElementById('rcBtnAutoRot').click(); 1`, []);
    await vergleich('Seite Steuerung (Statuszeile erscheint)', `document.getElementById('rcPageCockpit').click(); window.rcFetchStatusAktualisieren(); 1`, []);
    await vergleich('Seite Arena', `document.getElementById('rcPageArena').click(); 1`, []);
    await vergleich('Jetzt-Knopf belegt', `(function(){ const b = document.getElementById('rcBtnJetzt'); b.disabled = true; b.classList.add('rc-btn-on'); b.classList.add('rc-btn-warn'); })(); 1`, []);

    // ---- E: Inhalt aendert sich -> der ResizeObserver passt nach (ohne Aufruf von Hand) ----
    console.log('\n-- Nachpassen bei 1600 px --');
    await js(`(function(){ const st = document.getElementById('testProj'); if (st) st.remove(); document.getElementById('rcProjWahl').style.display = 'none'; })(); 1`);
    await breite(1600);
    const e1 = await js(MESS); zeile('1600 ohne Projekt-Knoepfe', e1);
    await js(`(function(){ if (!document.getElementById('testProj')) { const st = document.createElement('style'); st.id = 'testProj'; st.textContent = '#rcProjWahl{display:flex !important}'; document.head.appendChild(st); } })(); 1`); await warte(900);
    const e2 = await js(MESS); zeile('1600 mit Projekt-Knoepfen', e2);
    soll('mehr Inhalt -> hoehere Stufe von selbst, Menue im Bild, nichts beschnitten', e2.stufe >= e1.stufe && e2.menue && e2.zu && !e2.beschnitten, e1.stufe + ' -> ' + e2.stufe);
    await breite(1920);

    // ---- F: Re-Inject: genau eine Leiste, ein Beobachter, Zoom bleibt 100 % ----
    console.log('\n-- Re-Inject --');
    await js(`window.rcApplyZoom(1.5, false); 1`); await warte(400);
    const ri = await js(`(async () => { const t = await (await fetch('esl_live_arena_v22.js?f=' + Date.now(), { cache: 'reload' })).text(); const alt = window.__rcKopfRO; window.rcLastSaleTs = Date.now() - 60000; (0, eval)(t); await new Promise(r => setTimeout(r, 2500)); return { dash: document.querySelectorAll('#rcLiveDashboard').length, kopf: document.querySelectorAll('.rc-header').length, ctl: document.querySelectorAll('.rc-header-ctl').length, chip: document.querySelectorAll('#rcOhneStackChip').length, modal: document.querySelectorAll('#rcDetailModal').length, toast: document.querySelectorAll('#rcToastContainer').length, cfg: document.querySelectorAll('#rcCfgPanel').length, neuerRO: !!window.__rcKopfRO && window.__rcKopfRO !== alt, zoom: window.rcZoom, css: getComputedStyle(document.getElementById('rcLiveDashboard')).zoom, prop: document.documentElement.style.getPropertyValue('--rc-zoom') }; })()`);
    soll('nach Re-Inject je 1 Dashboard/Leiste/Bedienung/Zaehler/Modal/Toast/Konfigurator', ri.dash === 1 && ri.kopf === 1 && ri.ctl === 1 && ri.chip === 1 && ri.modal === 1 && ri.toast === 1 && ri.cfg === 1, JSON.stringify(ri));
    soll('neuer Beobachter, und die 150 % der alten Fassung sind NICHT geerbt', ri.neuerRO && ri.zoom === 1 && ri.css === '1', 'zoom ' + ri.zoom + ' css ' + ri.css + ' prop ' + ri.prop);
    await js(VOLL); await warte(700);
    await breite(1366); const f1 = await js(MESS); zeile('1366 nach Re-Inject', f1);
    soll('Einpassen laeuft nach Re-Inject weiter', f1.menue && f1.zu && !f1.beschnitten && f1.stufe > 0);
    await breite(1920);

    // ---- G: Migration: einmalig, spaetere Wahl des Nutzers bleibt ----
    console.log('\n-- Zoom-Vorgabe --');
    await laden(`localStorage.clear(); localStorage.setItem('rcZoomAuto', '1'); localStorage.setItem('rcZoom', '1.5'); 1`);
    const g1 = await js(`({ zoom: window.rcZoom, auto: window.rcZoomAutoAn(), label: document.getElementById('rcZoomLabel').textContent })`);
    soll('gespeicherte Automatik + 150 % werden EINMAL auf 100 % gestellt', g1.zoom === 1 && g1.auto === false && g1.label === '100%', JSON.stringify(g1));
    await laden(`localStorage.setItem('rcZoomAuto', '1'); 1`);
    const g2 = await js(`({ zoom: window.rcZoom, auto: window.rcZoomAutoAn(), label: document.getElementById('rcZoomLabel').textContent })`);
    soll('danach von Hand eingeschaltete Automatik BLEIBT (Marke)', g2.auto === true && g2.zoom === 1.5 && g2.label === 'Auto 150%', JSON.stringify(g2));
    await js(VOLL); await warte(900);
    const g2m = await js(MESS); zeile('1920 mit Automatik 150 %', g2m);
    soll('auch mit Automatik 150 %: Menue und Schliessen im Bild', g2m.menue && g2m.zu && !g2m.ueberlappt);
    await js(`window.rcZoomAuto(false); window.rcApplyZoom(1); 1`);
    await breite(1500); await warte(700);
    const g3 = await js(`window.rcZoom`);
    soll('Automatik aus: eine Groessenaenderung des Fensters aendert den Zoom nicht', g3 === 1, String(g3));
    await js(`window.rcZoomAuto(true); 1`); await breite(1600); await warte(900);
    const g4 = await js(`window.rcZoom`);
    soll('spaeter eingeschaltete Automatik folgt dem Fenster ohne Neuladen (1600 -> 125 %)', g4 === 1.25, String(g4));
  } else {
    // ---- Gegenprobe mit der alten Fassung: die Befunde muessen sich zeigen ----
    const m = await js(MESS);
    soll('ALT: bei 1920 px liegt das Werkzeug-Menue ausserhalb des Bildes', !m.menue, 'Zoom ' + m.zoom);
    await js(`(function(){ const s = document.getElementById('rcStandortFilter'); s.value = 'ALL'; s.dispatchEvent(new Event('change', {bubbles:true})); })(); 1`); await warte(700);
    const a = await js(LAGE);
    await js(`(function(){ const s = document.getElementById('rcStandortFilter'); s.value = 'AL'; s.dispatchEvent(new Event('change', {bubbles:true})); })(); 1`); await warte(700);
    const b = await js(LAGE);
    const bewegt = Object.keys(a).filter(k => a[k] !== null && b[k] !== null && Math.abs(a[k] - b[k]) > 0.5);
    soll('ALT: ein Filterklick verschiebt die Bedienelemente', bewegt.length >= 1, bewegt.length + ' bewegt, z. B. ' + bewegt.slice(0, 3).map(k => k + ' ' + a[k] + '>' + b[k]).join(', '));
  }
  const fl = fehlerLog.filter(f => !/regiocom\.png|favicon|404/.test(f));
  soll('keine JS-Fehler waehrend der Messung (auch kein "ResizeObserver loop")', fl.length === 0, fl.slice(0, 3).join(' || '));
  console.log('\n' + (schlecht ? schlecht + ' FEHLGESCHLAGEN' : 'ALLES GEMESSEN WIE ERWARTET'));
} catch (e) { console.log('ABBRUCH: ' + (e && e.stack || e)); schlecht++; }
try { ws.close(); } catch {}
try { proc.kill(); } catch {}
// Wegwerf-Profil (rund 85 MB je Lauf) wieder abraeumen; der Browser gibt die Dateien erst kurz nach dem Ende frei.
await warte(800);
try { rmSync(prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch { console.log('(Wegwerf-Profil blieb liegen: ' + prof + ')'); }
process.exit(schlecht ? 1 : 0);
