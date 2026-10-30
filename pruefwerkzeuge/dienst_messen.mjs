// ============================================================================
//  DIENST MESSEN - kein Pruefwerkzeug, sondern ein MESSGERAET
//  (heisst bewusst nicht *_pruefen.js, damit der Sammel-Einzeiler es nicht mitzieht)
// ----------------------------------------------------------------------------
//  Misst die Bausteine des Datendienstes am ECHTEN Edge: ein Wegwerf-Profil, ein
//  eigener Debug-Port (nie 9222), --headless=new und --disable-sync (ein neues
//  Profil holt sich sonst die Einstellungen des Kontos, "alle Cookies blockieren"
//  macht dann jeden Seitenspeicher unbrauchbar). Edge wird am Ende per
//  taskkill /T /F ueber die EIGENE pid beendet, nie per Name; das Profil wird
//  geloescht. Weitere Faelle haengen spaetere Aufgaben hier an.
//
//    node pruefwerkzeuge/dienst_messen.mjs fall=edge         (CDP- und Edge-Bausteine)
//    node pruefwerkzeuge/dienst_messen.mjs fall=edge-hilfen  (Prozessliste, Sperre, Cache)
//    node pruefwerkzeuge/dienst_messen.mjs fall=esl          (ESL-Abruf gegen das Schein-ESL, Port 8413)
//    node pruefwerkzeuge/dienst_messen.mjs fall=liga         (Liga-Abruf gegen die Schein-Ligaliste, Port 8414)
//    node pruefwerkzeuge/dienst_messen.mjs fall=dienst       (esl_dienst.js als Kindprozess gegen beide Schein-Portale,
//                                                             Dienst-Port 8797; Edge startet hier der DIENST)
//    node pruefwerkzeuge/dienst_messen.mjs fall=bereich      (Vortage und Zeitraeume des Dienstes: tagesstart + POST /api/bereich,
//                                                             wie fall=dienst; dauert rund 3 bis 5 Minuten)
//    node pruefwerkzeuge/dienst_messen.mjs fall=alles        (Ende zu Ende: Dienst + ECHTE Gastseite/Dashboard im Edge gegen beide
//                                                             Schein-Portale, 13 Pruefungen, rund 10 bis 15 Minuten)
//
//  Ausgabe: MESSUNG fall=<name>: n von m OK   (Exit 0 nur, wenn alles OK ist)
// ============================================================================
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARG = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a, '1'] : [a.slice(0, i), a.slice(i + 1)]; }));
const FALL = ARG.fall;

const regeln = require(path.join(WURZEL, 'esl_dienst_regeln.js'));
const cdp = require(path.join(WURZEL, 'esl_dienst_cdp.js'));
const edge = require(path.join(WURZEL, 'esl_dienst_edge.js'));

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
// Erster freier Port ab "ab" (Edge bekommt NIE 9222, das gehoert dem echten Betrieb).
const freierPort = (ab) => new Promise((ja) => {
  const s = net.createServer();
  s.once('error', () => ja(freierPort(ab + 1)));
  s.listen(ab, '127.0.0.1', () => s.close(() => ja(ab)));
});

let gesamt = 0, gut = 0;
// fn liefert [ok, info]; eine Ausnahme ist ein FEHL mit dem Text, kein Abbruch der Messung.
async function pruefe(name, fn) {
  let ok = false, info = '';
  try { [ok, info] = await fn(); } catch (e) { info = 'Ausnahme: ' + (e && e.message || e); }
  gesamt++; if (ok) gut++;
  console.log((ok ? '  ok   ' : '  FEHL ') + name + (info ? '  [' + info + ']' : ''));
}

// ---------------------------------------------------------------- Umgebung
const EXE = edge.edgeFinden();
if (!EXE) { console.log('Kein Edge gefunden - dieses Geraet misst Edge-Verhalten.'); process.exit(2); }
const profil = mkdtempSync(path.join(tmpdir(), 'esl-dienst-'));
const PORT = await freierPort(9232);
const gesehen = [];   // was der Hilfsserver an Anfragen sah: { pfad, cookie }
const srv = http.createServer((q, s) => {
  gesehen.push({ pfad: q.url, cookie: q.headers.cookie || '' });
  s.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  s.end('<!doctype html><meta charset=utf-8><title>dienst-messung</title>dienst-messung');
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const SRV = 'http://127.0.0.1:' + srv.address().port;

// Edge nur ueber die EIGENE pid beenden - und hoechstens einmal: die pid wird VOR dem Kill auf 0 gesetzt,
// denn Windows vergibt freie pids binnen Sekunden neu, ein zweiter Kill traefe einen fremden Prozessbaum.
let pid = 0;
function edgeBeenden() {
  if (!pid) return;
  const p = pid; pid = 0;
  try { spawnSync('taskkill', ['/PID', String(p), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { }
}
// Netz bei unnormalem Ende (Strg+C, Ausnahme): gleiche Aufraeumung fuer die pid, die dieses Geraet gestartet hat.
// Im exit-Handler darf nichts asynchron sein; rmSync wartet dort nicht auf Edges Dateien (am Messgeraet
// gemessen: das Profil blieb liegen), also von Hand mit synchroner Pause wiederholen.
function profilLoeschenSync() {
  for (let i = 0; i < 12; i++) {
    try { rmSync(profil, { recursive: true, force: true }); return; } catch (e) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); }
  }
}
// Schein-Portal (fall=esl: Schein-ESL, fall=liga: Schein-Ligaliste, fall=dienst: beide): je ein eigener
// Kindprozess, beendet wird nur dieses Kind.
const ESL_PORT = 8413, ESL_BASIS = 'http://esl.regiocom.net:' + ESL_PORT;
const LIGA_PORT = 8414, LIGA_BASIS = 'http://ccs.vodafone.de:' + LIGA_PORT, MS_BASIS = 'http://login.microsoftonline.com:' + LIGA_PORT;
const ESL_DEF = { name: 'Schein-ESL', datei: 'esl_schein_server.js', port: ESL_PORT, env: { TAGE: '10' }, steuer: '/esl/steuer?' };
const LIGA_DEF = { name: 'Schein-Ligaliste', datei: 'liga_schein_server.js', port: LIGA_PORT, env: {}, steuer: '/__steuer?' };
const SCHEIN = FALL === 'liga' ? LIGA_DEF : ESL_DEF;
const kinder = new Map();   // Schein-Definition -> Kindprozess
function scheinStarten(def = SCHEIN) {
  const k = spawn(process.execPath, [path.join(WURZEL, 'pruefwerkzeuge', def.datei)],
    { env: Object.assign({}, process.env, def.env, { PORT: String(def.port) }), stdio: 'ignore', windowsHide: true });
  k.on('error', () => { /* zeigt sich als fehlende Antwort auf die Steuerung */ });
  kinder.set(def, k);
}
// Liefert ein Versprechen, das mit dem Ende des Kindes erfuellt ist (hoechstens 5 s).
function scheinBeenden(def = SCHEIN) {
  const k = kinder.get(def);
  if (!k) return Promise.resolve();
  kinder.delete(def);
  const weg = new Promise((r) => { if (k.exitCode !== null) return r(); k.once('exit', r); setTimeout(r, 5000); });
  try { k.kill(); } catch (e) { }
  return weg;
}
const steuer = async (q, def = SCHEIN) => {
  try { const r = await fetch('http://127.0.0.1:' + def.port + def.steuer + q, { signal: AbortSignal.timeout(5000) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
};
async function scheinBereit(ms = 30000, def = SCHEIN) {
  for (const t = Date.now(); Date.now() - t < ms; await warte(250)) if (await steuer('aktion=zustand', def)) return true;
  return false;
}

// fall=dienst: der Dienst als Kindprozess (beendet wird nur dieses Kind) und sein Testordner.
let dienstKind = null, dienstOrdner = null;
process.on('exit', () => {
  edgeBeenden();
  if (dienstKind) try { dienstKind.kill(); } catch (e) { }
  for (const d of [...kinder.keys()]) scheinBeenden(d);
  profilLoeschenSync();
  if (dienstOrdner) try { rmSync(dienstOrdner, { recursive: true, force: true }); } catch (e) { }
});
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));
process.on('uncaughtException', (e) => { console.log('ABBRUCH: ' + ((e && e.stack) || e)); process.exit(1); });
const ende = async (code) => {
  edgeBeenden();
  await Promise.all([...kinder.keys()].map((d) => scheinBeenden(d)));
  srv.close();
  await warte(1200);
  try { rmSync(profil, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch (e) { console.log('  (Wegwerf-Profil blieb liegen: ' + profil + ')'); }
  process.exit(code);
};

console.log('DIENST MESSEN | fall=' + FALL + ' | Edge-Port ' + PORT + ' | Profil ' + profil);
if (!['edge', 'edge-hilfen', 'esl', 'liga', 'dienst', 'bereich', 'alles'].includes(FALL)) { console.log('Unbekannter Fall. Moeglich: fall=edge | fall=edge-hilfen | fall=esl | fall=liga | fall=dienst | fall=bereich | fall=alles'); await ende(2); }
const DIENST_FALL = FALL === 'dienst' || FALL === 'bereich' || FALL === 'alles';   // der Dienst startet Edge selbst, beide Schein-Portale laufen

// fall=esl: Schein-ESL mit 10 Vortagen, fall=liga: Schein-Ligaliste, fall=dienst: beide. Ein schon belegter Port
// wird nicht angefasst (fremder Prozess).
const SCHEINE = DIENST_FALL ? [ESL_DEF, LIGA_DEF] : FALL === 'esl' || FALL === 'liga' ? [SCHEIN] : [];
for (const def of SCHEINE) {
  if (await freierPort(def.port) !== def.port) { console.log('Port ' + def.port + ' ist belegt (laeuft schon ein ' + def.name + '?) - bitte selbst beenden.'); await ende(2); }
  scheinStarten(def);
  if (!await scheinBereit(30000, def)) { console.log(def.name + ' antwortet nicht.'); await ende(2); }
}
// Die Portal-Namen zeigen auf diesen Rechner (kein Verkehr zum echten Portal); die http-Adressen gelten als
// sicherer Kontext, sonst gibt es dort keine Web Locks. HttpsUpgrades aus: die Attrappen koennen kein https.
const ESL_EXTRA = FALL === 'esl' ? ['--host-resolver-rules=MAP esl.regiocom.net 127.0.0.1',
  '--unsafely-treat-insecure-origin-as-secure=' + ESL_BASIS, '--disable-features=HttpsUpgrades']
  : FALL === 'liga' ? ['--host-resolver-rules=MAP ccs.vodafone.de 127.0.0.1,MAP login.microsoftonline.com 127.0.0.1',
    '--unsafely-treat-insecure-origin-as-secure=' + LIGA_BASIS + ',' + MS_BASIS, '--disable-features=HttpsUpgrades'] : [];

// Edge starten wie der Dienst: edgeArgumente + edgeStarten, dazu nur die Messzusaetze. fall=dienst: das tut der Dienst.
let liste = null, bis = 0;
if (!DIENST_FALL) {
  const args = regeln.edgeArgumente({ port: PORT, profil, cacheDir: '', extra: ['--headless=new', '--disable-sync', '--disable-gpu', ...ESL_EXTRA] });
  const t0 = Date.now();
  pid = edge.edgeStarten(EXE, args);
  while (!liste && Date.now() - t0 < 12000) { liste = await cdp.cdpListe(PORT); if (!liste) await warte(250); }
  bis = Date.now() - t0;
}

// Neues Dokument abwarten (fall=esl, fall=liga): die Marke im alten verschwindet mit ihm.
const laden = async (s, ausloesen) => {
  await s.seite(() => { window.__rcMessAlt = 1; });
  await ausloesen();
  for (let i = 0; i < 80; i++) {
    try { if (await s.seite(() => document.readyState === 'complete' && !window.__rcMessAlt)) return true; } catch (e) { }
    await warte(250);
  }
  return false;
};

// ---------------------------------------------------------------- fall=edge
if (FALL === 'edge') {
  await pruefe('Edge startet mit edgeArgumente (+ headless, ohne Sync) und cdpListe antwortet in <= 10 s', async () => [Array.isArray(liste) && bis <= 10000, bis + ' ms, ' + (liste ? liste.length : 0) + ' Ziele']);

  const prozesse = await edge.prozesseLesen();
  const besitzer = await edge.portBesitzer(PORT);
  const zustand = regeln.portZustand(besitzer, prozesse, profil);
  await pruefe('portZustand(portBesitzer, prozesseLesen, Profil) === eigen', async () => [zustand === 'eigen', 'Zustand ' + zustand + ', Besitzer ' + besitzer + ', gestartete pid ' + pid]);

  await pruefe('flagZustand der Edge-Kommandozeile === erfuellt', async () => {
    const p = (prozesse || []).find((x) => x.ProcessId === besitzer);
    const f = regeln.flagZustand(p && p.CommandLine);
    return [f.zustand === 'erfuellt', f.zustand + (f.fehlt.length ? ', fehlt: ' + f.fehlt.join('; ') : '')];
  });

  // Das Geheimnis reist als HttpOnly-Cookie: der Server sieht es, die Seite nicht.
  const wert = 'g' + Date.now().toString(36);
  let tabId = null;
  await pruefe('cookieSetzen + neuerTab: der Hilfsserver sieht rcDienst=<wert>', async () => {
    const gesetzt = await cdp.cookieSetzen(PORT, { name: 'rcDienst', value: wert, url: SRV + '/' });
    tabId = await cdp.neuerTab(PORT, SRV + '/messung');
    for (let i = 0; i < 40 && !gesehen.some((g) => g.pfad === '/messung'); i++) await warte(200);
    const g = gesehen.find((x) => x.pfad === '/messung');
    return [gesetzt === true && !!tabId && !!g && g.cookie.split(';').some((c) => c.trim() === 'rcDienst=' + wert), 'gesetzt ' + gesetzt + ', Tab ' + tabId + ', Kopf "' + (g ? g.cookie : 'keine Anfrage') + '"'];
  });

  const tab = tabId && ((await cdp.cdpListe(PORT)) || []).find((t) => t.id === tabId);
  await pruefe('document.cookie in der Seite enthaelt das Cookie NICHT (HttpOnly)', async () => {
    if (!tab) return [false, 'Tab nicht in der Liste'];
    return cdp.mitSitzung(tab.webSocketDebuggerUrl, async (s) => {
      for (let i = 0; i < 40 && (await s.seite(() => location.href)) !== SRV + '/messung'; i++) await warte(200);
      const dc = await s.seite(() => document.cookie);
      return [typeof dc === 'string' && !/rcDienst/.test(dc), 'document.cookie = "' + dc + '"'];
    }, 20000);
  });

  await pruefe("auswerten('1+1') === 2", async () => {
    if (!tab) return [false, 'Tab nicht in der Liste'];
    const r = await cdp.mitSitzung(tab.webSocketDebuggerUrl, (s) => s.auswerten('1+1'), 10000);
    return [r === 2, 'Ergebnis ' + r];
  });

  await pruefe("auswerten('new Promise(()=>{})', 1000) scheitert in <= 2 s", async () => {
    if (!tab) return [false, 'Tab nicht in der Liste'];
    const t = Date.now();
    let fehler = null;
    try { await cdp.mitSitzung(tab.webSocketDebuggerUrl, (s) => s.auswerten('new Promise(()=>{})', 1000), 15000); } catch (e) { fehler = e; }
    const dauer = Date.now() - t;
    return [!!fehler && dauer <= 2000, dauer + ' ms, ' + (fehler ? fehler.message : 'keine Ausnahme')];
  });

  await pruefe('tabSchliessen liefert true (und der Tab ist weg)', async () => {
    const r = tabId && await cdp.tabSchliessen(PORT, tabId);
    let weg = false;
    for (let i = 0; i < 20 && !weg; i++) { weg = !((await cdp.cdpListe(PORT)) || []).some((t) => t.id === tabId); if (!weg) await warte(200); }
    return [r === true && weg, 'Rueckgabe ' + r + ', weg ' + weg];
  });
}

// ---------------------------------------------------------------- fall=edge-hilfen
if (FALL === 'edge-hilfen') {
  await pruefe('edgeFinden liefert den Pfad einer vorhandenen msedge.exe', async () => [/msedge\.exe$/i.test(EXE) && existsSync(EXE), EXE]);

  await pruefe('prozesseLesen: die gestartete Edge-pid und dieser Prozess stehen mit Kommandozeile drin', async () => {
    const p = await edge.prozesseLesen();
    const e = (p || []).find((x) => x.ProcessId === pid), n = (p || []).find((x) => x.ProcessId === process.pid);
    return [!!e && /^msedge\.exe$/i.test(e.Name) && e.CommandLine.includes('--user-data-dir=' + profil) && !!n && /node/i.test(n.Name), (p ? p.length : 'null') + ' Prozesse'];
  });

  // Die Liste enthaelt immer node.exe (diesen Prozess): leer ist nie wahr, sondern "nichts gelesen" = null.
  // Gegenprobe: eine leere Liste wuerde prozessKonflikt "kein Konflikt" sagen lassen (nicht messbar = in Ordnung).
  await pruefe('prozesseAusText: leere Ausgabe -> null (nie []), Einzelobjekt -> Liste; [] wuerde "kein Konflikt" ergeben', async () => {
    const einzel = edge.prozesseAusText('{"ProcessId":4,"Name":"node.exe","CommandLine":null}');
    const kaputt = edge.prozesseAusText('{"ProcessId"');
    const mitLeer = regeln.prozessKonflikt([], 1).art, mitNull = regeln.prozessKonflikt(edge.prozesseAusText(''), 1).art;
    return [edge.prozesseAusText('') === null && kaputt === null &&
      Array.isArray(einzel) && einzel.length === 1 && einzel[0].ProcessId === 4 && einzel[0].CommandLine === null &&
      mitLeer === null && mitNull === 'nicht-pruefbar', 'leer -> ' + edge.prozesseAusText('') + ', prozessKonflikt([]).art = ' + mitLeer + ', prozessKonflikt(leere Ausgabe).art = ' + mitNull];
  });

  await pruefe('portBesitzer: ein freier Port liefert null, der Debug-Port die Edge-pid', async () => {
    const frei = await edge.portBesitzer(await freierPort(9300)), belegt = await edge.portBesitzer(PORT);
    return [frei === null && belegt === pid, 'frei ' + frei + ', belegt ' + belegt + ', Edge-pid ' + pid];
  });

  await pruefe('profilBelegt: true solange Edge laeuft, false fuer ein leeres Verzeichnis', async () => {
    const leer = mkdtempSync(path.join(tmpdir(), 'esl-leer-'));
    const r = [edge.profilBelegt(profil), edge.profilBelegt(leer)];
    rmSync(leer, { recursive: true, force: true });
    return [r[0] === true && r[1] === false, 'laufendes Profil ' + r[0] + ', leeres Verzeichnis ' + r[1]];
  });

  await pruefe('cacheOrdner: legt den Ordner an, raeumt die Schreibprobe ab; unbeschreibbar -> leer', async () => {
    const name = 'messung-' + process.pid;
    const dir = edge.cacheOrdner(name);
    const ok1 = !!dir && existsSync(dir) && !existsSync(path.join(dir, '.schreibprobe')) && dir.toLowerCase().endsWith(path.join('regiocom_ESL_Cache', name).toLowerCase());
    if (dir) rmSync(dir, { recursive: true, force: true });
    const alt = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = process.execPath;          // eine Datei statt eines Ordners: mkdir muss scheitern
    const kaputt = edge.cacheOrdner(name);
    process.env.LOCALAPPDATA = alt;
    return [ok1 && kaputt === '', 'Ordner "' + dir + '", unbeschreibbar -> "' + kaputt + '"'];
  });

  await pruefe('echterKlick und taste kommen als vertrauenswuerdige Ereignisse an (isTrusted, Text im Feld)', async () => {
    const id = await cdp.neuerTab(PORT, SRV + '/messung');
    let tab = null;
    for (let i = 0; i < 25 && !tab; i++) { tab = ((await cdp.cdpListe(PORT)) || []).find((t) => t.id === id && t.url.startsWith(SRV)); if (!tab) await warte(200); }
    if (!tab) return [false, 'Tab nicht gefunden'];
    const r = await cdp.mitSitzung(tab.webSocketDebuggerUrl, async (s) => {
      await s.seite(() => {
        document.body.innerHTML = '<button id="b" style="position:fixed;left:10px;top:10px;width:100px;height:40px">b</button><input id="i" style="position:fixed;left:10px;top:70px;width:100px;height:30px">';
        window.__e = [];
        document.getElementById('b').addEventListener('click', (ev) => window.__e.push('klick:' + ev.isTrusted));
        document.getElementById('i').addEventListener('keydown', (ev) => window.__e.push('taste:' + ev.key + ':' + ev.isTrusted));
      });
      await cdp.echterKlick(s, 50, 30);
      await cdp.echterKlick(s, 50, 85);       // Fokus ins Feld
      await cdp.taste(s, 'a');
      await cdp.taste(s, 'Enter');
      return s.seite(() => ({ e: window.__e, wert: document.getElementById('i').value }));
    }, 20000);
    await cdp.tabSchliessen(PORT, id);
    return [r.e.join(',') === 'klick:true,taste:a:true,taste:Enter:true' && r.wert === 'a', JSON.stringify(r)];
  });

  await pruefe('profilBelegt wird false, sobald Edge beendet ist', async () => {
    edgeBeenden();
    let frei = false;
    for (let i = 0; i < 30 && !frei; i++) { frei = edge.profilBelegt(profil) === false; if (!frei) await warte(250); }
    return [frei, frei ? 'frei' : 'weiter belegt'];
  });
}

// ---------------------------------------------------------------- fall=esl
if (FALL === 'esl') {
  const esl = require(path.join(WURZEL, 'esl_dienst_esl.js'));
  const XLSX = require(path.join(WURZEL, 'node_modules', 'xlsx'));
  const heute = regeln.datumIso(new Date());
  const merk = {};
  const tabId = await cdp.neuerTab(PORT, ESL_BASIS + esl.ESL_PFADE.anmeldung);
  let ws = null;
  for (let i = 0; i < 40 && !ws; i++) {
    const t = ((await cdp.cdpListe(PORT)) || []).find((x) => x.id === tabId && x.url.startsWith(ESL_BASIS));
    if (t) ws = t.webSocketDebuggerUrl; else await warte(250);
  }
  if (!ws) { console.log('ESL-Tab nicht gefunden.'); await ende(1); }
  const mit = (fn) => cdp.mitSitzung(ws, fn, 240000);
  const runde = (p) => mit((s) => esl.eslRunde(s, p, merk));
  const anmeldungen = async () => ((await steuer('aktion=zustand')) || {}).anmeldungen;
  const kurz = (r) => !r ? String(r) : r.art + (r.grund ? ' "' + r.grund + '"' : '') + (r.b64 ? ' (' + r.b64.slice(0, 3) + '..., ' + r.b64.length + ' Zeichen)' : '');
  // Tage (YYYY-MM-DD) aller Zeilen einer gelieferten Mappe.
  const tage = (b64) => {
    const wb = XLSX.read(Buffer.from(b64, 'base64'), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const i = rows[0].map((h) => String(h).toLowerCase().trim()).indexOf('datum');
    return rows.slice(1).filter((r) => r.some((x) => x !== '')).map((r) => String(r[i]).slice(0, 10));
  };

  await pruefe('1 abgemeldet: erste eslRunde(kabel) meldet die Anmeldung (Schein +1, merk.zeiten genau 1 frischer Eintrag), die naechste liefert Excel (PK)', async () => {
    await steuer('aktion=abmelden');
    const a0 = await anmeldungen();
    const r1 = await runde('kabel');
    const a1 = await anmeldungen();
    const z1 = (merk.zeiten || []).slice();               // der Deckel zaehlt, was wirklich abgeschickt wurde
    const r2 = await runde('kabel');
    const a2 = await anmeldungen();
    const z2 = (merk.zeiten || []).length;
    return [r1.art === 'fehler' && /anmeld/i.test(r1.grund) && a1 - a0 === 1 && a2 === a1 && z1.length === 1 && Date.now() - z1[0] < 120000 && z2 === 1 &&
      r2.art === 'excel' && /^UEs/.test(r2.b64 || ''),
      'erste: ' + kurz(r1) + ' | Anmeldungen +' + (a1 - a0) + '/+' + (a2 - a0) + ' | merk.zeiten ' + z1.length + '/' + z2 + ' | zweite: ' + kurz(r2)];
  });

  await pruefe("2 eslRunde(mobile) liefert Excel, Schein-Sitzung steht auf 'mobile'", async () => {
    const r = await runde('mobile');
    const z = await steuer('aktion=zustand');
    return [r.art === 'excel' && z.sitzung === 'mobile', kurz(r) + ' | Sitzung ' + z.sitzung];
  });

  await pruefe('3 aktion=ablauf: spaetestens die dritte eslRunde(mobile) liefert wieder Excel (die erste nicht)', async () => {
    await steuer('aktion=ablauf');
    const r = [];
    for (let i = 0; i < 3; i++) { r.push(await runde('mobile')); if (r[i].art === 'excel') break; }
    return [r.length > 1 && r[r.length - 1].art === 'excel', r.map(kurz).join(' | ')];
  });

  await pruefe("4 aktion=leer&p=kabel: eslRunde(kabel) liefert 'leer'", async () => {
    await steuer('aktion=leer&p=kabel&an=1');
    const r = await runde('kabel');
    await steuer('aktion=leer&p=kabel&an=0');
    return [r.art === 'leer', kurz(r)];
  });

  await pruefe("5 ohne Autofill + abgemeldet: eslAnmelden -> 'kein-passwort' (nichts abgeschickt); drei frische Zeiten -> 'gedeckelt'", async () => {
    await steuer('aktion=ohneautofill&an=1');
    await steuer('aktion=abmelden');
    const a0 = await anmeldungen();
    const [maske, r1, r2, n1, n2] = await mit(async (s) => {
      const geladen = await laden(s, () => s.befehl('Page.navigate', { url: ESL_BASIS + esl.ESL_PFADE.haupt }));
      const jetzt = Date.now();
      const m1 = { zeiten: [] }, m2 = { zeiten: [jetzt - 1000, jetzt - 60000, jetzt - 120000] };
      return [geladen && await s.seite(() => !!document.getElementById('loginform:pw')),
        await esl.eslAnmelden(s, m1, jetzt), await esl.eslAnmelden(s, m2, jetzt), m1.zeiten.length, m2.zeiten.length];
    });
    const a1 = await anmeldungen();
    await steuer('aktion=ohneautofill&an=0');
    // Gezaehlt wird nur 'abgeschickt': kein-passwort laesst die Liste leer, gedeckelt haengt nichts an.
    return [maske === true && r1 === 'kein-passwort' && r2 === 'gedeckelt' && a1 === a0 && n1 === 0 && n2 === 3,
      'Maske ' + maske + ' | ' + r1 + ' (zeiten ' + n1 + ') | ' + r2 + ' (zeiten ' + n2 + ') | Anmeldungen +' + (a1 - a0)];
  });
  // Wieder anmelden (zaehlt nicht): die Maske kam ohne Autofill, also neu laden; eine Runde schickt ab, die naechste liefert.
  await mit((s) => laden(s, () => s.befehl('Page.reload', {})));
  console.log('       (wieder anmelden: ' + [await runde('kabel'), await runde('kabel')].map(kurz).join(' | ') + ')');

  await pruefe('6 aktion=gestern + Neuladen: Seite steht auf gestern, eslRunde liefert Excel nur mit heutigen Zeilen', async () => {
    await steuer('aktion=gestern&an=1');
    const vorher = await mit(async (s) => { await laden(s, () => s.befehl('Page.reload', {})); return esl.eslZustand(s); });
    const r = await runde('kabel');
    const t = r.b64 ? tage(r.b64) : [];
    return [vorher.datumHeute === false && r.art === 'excel' && t.length > 0 && t.every((x) => x === heute),
      'vorher datumHeute ' + vorher.datumHeute + ' | ' + kurz(r) + ' | ' + t.length + ' Zeilen, Tage ' + [...new Set(t)].join(',')];
  });

  await pruefe('7 eslBereichExport(kabel, heute-5, gestern): alle Zeilen im Bereich, >= 5 Tage; danach datumHeute === true', async () => {
    const d = new Date();
    const von = regeln.datumIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 5));
    const bis = regeln.datumIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
    const [r, z, verz] = await mit(async (s) => {
      // Langsamer Server: die Suche des Klicks (nur dieser XHR, der Export laeuft per fetch) geht erst 3 s spaeter ab.
      // Ohne das Warten auf das Ende der Suche wuerde der Export ihr zuvorkommen. Der Zaehler im sessionStorage
      // beweist, dass die Bremse wirklich griff (er ueberlebt das Navigieren am Ende von eslBereichExport).
      await s.seite(() => {
        sessionStorage.setItem('rcMessVerzoegert', '0');
        const send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (body) {
          if (typeof body === 'string' && body.indexOf('javax.faces.source=filterForm%3A') >= 0) {
            sessionStorage.setItem('rcMessVerzoegert', String(+sessionStorage.getItem('rcMessVerzoegert') + 1));
            const x = this; setTimeout(() => send.call(x, body), 3000);
            return;
          }
          return send.call(this, body);
        };
      });
      return [await esl.eslBereichExport(s, 'kabel', von, bis), await esl.eslZustand(s), await s.seite(() => sessionStorage.getItem('rcMessVerzoegert'))];
    });
    const t = r.b64 ? tage(r.b64) : [], verschieden = [...new Set(t)].sort();
    // rcRahmenExport schickt seine EIGENE Suche mit den eingetragenen Daten (FormData des Formulars) - der Schein
    // uebernimmt sie, die Mappe stimmt also auch ganz ohne Klick. Beleg fuer den echten Klick samt Warten: im
    // Protokoll der Ansicht, die exportiert hat, steht VOR dem Export erst die Suche des Klicks, dann der
    // Tabellen-Filter, den die Seite danach selbst nachschickt, dann die Suche des Exports (ohne Klick nur die letzte).
    const L = ((await steuer('aktion=zustand')) || {}).log || [];
    const ie = L.map((e) => e.was).lastIndexOf('export');
    const davor = ie < 0 ? [] : L.slice(0, ie).filter((e) => e.vs === L[ie].vs && (e.was === 'suche' || e.was === 'filter-neubau'));
    const ablauf = davor.slice(-3).map((e) => e.was === 'suche' ? 'suche ' + e.von + '..' + e.bis : e.was);
    const soll = ['suche ' + von + '..' + bis, 'filter-neubau', 'suche ' + von + '..' + bis];
    return [r.art === 'excel' && t.length > 0 && t.every((x) => x >= von && x <= bis) && verschieden.length >= 5 && z.datumHeute === true && verz === '1' && ablauf.join(' > ') === soll.join(' > '),
      von + '..' + bis + ' | ' + kurz(r) + ' | ' + t.length + ' Zeilen, Tage ' + verschieden.join(',') + ' | danach datumHeute ' + z.datumHeute + ' | Suche des Klicks 3 s gebremst: ' + verz + 'x | Schein-Protokoll vor dem Export: ' + (ablauf.join(' > ') || 'leer')];
  });

  await pruefe('8 nach eslRunde haelt die Seite genau einen Web Lock rc_wach_dienst_esl (auch nach zweiter Pflege)', async () => {
    const r = await runde('kabel');
    const gehalten = await mit(async (s) => { await esl.eslPflege(s); return s.seite(async () => (await navigator.locks.query()).held.map((l) => l.name)); });
    const n = gehalten.filter((x) => x === 'rc_wach_dienst_esl').length;
    return [r.art === 'excel' && n === 1, kurz(r) + ' | gehalten ' + JSON.stringify(gehalten)];
  });

  await pruefe('9 Schein-ESL aus: Fehlerseite; Schein bald wieder da, Runde bei +5 s laedt NICHT neu (20-s-Regel); Runde nach >= 20 s laedt neu und liefert Excel', async () => {
    await scheinBeenden();
    const z1 = await mit(async (s) => { await laden(s, () => s.befehl('Page.reload', {})); return esl.eslZustand(s); });
    const t0 = Date.now();
    const r1 = await runde('kabel');                    // sieht die Fehlerseite zum ersten Mal: wartet
    const seit = merk.fehlerSeit;                       // wann die Fehlerseite zuerst gesehen wurde
    // Schein sofort wieder an: ab hier gelingt jedes Neuladen. Eine Runde, die frueh neu laedt, haette Excel.
    scheinStarten();
    const bereit = await scheinBereit();
    await mit((s) => s.seite(() => { window.__rcMessFehlerseite = 1; }));   // Marke in der Fehlerseite: ein Neuladen loescht sie
    await warte(Math.max(0, 5000 - (Date.now() - t0)));
    const alter2 = Date.now() - seit;
    const r2 = await runde('kabel');
    const [z2, marke] = await mit(async (s) => [await esl.eslZustand(s), await s.seite(() => window.__rcMessFehlerseite === 1)]);
    await warte(Math.max(0, 21000 - (Date.now() - seit)));
    const alter3 = Date.now() - seit;
    const r3 = await runde('kabel');
    return [z1.fehlerseite === true && r1.art === 'fehler' && bereit && alter2 < 20000 &&
      r2.art === 'fehler' && /Neuladen nach 20 s/.test(r2.grund || '') && z2.fehlerseite === true && marke === true &&
      alter3 >= 20000 && r3.art === 'excel',
      'Fehlerseite ' + z1.fehlerseite + ' (' + z1.fehlerCode + ') | erste: ' + kurz(r1) + ' | Schein wieder da ' + bereit + ' | +' + Math.round(alter2 / 1000) + ' s: ' + kurz(r2) +
      ', noch Fehlerseite ' + z2.fehlerseite + ', Marke ' + marke + ' | +' + Math.round(alter3 / 1000) + ' s: ' + kurz(r3)];
  });

  // Aus fall=alles (Pruefung 3) gefolgt: wird mitten im Betrieb abgemeldet, steht der Tab auf einer Seite des Portals und merkt es erst
  // am Export. Eine Runde, die dann nur "Anmeldeseite" meldet und die Anmeldung der naechsten ueberlaesst, braucht drei Runden bis zum
  // Excel; die Anmeldung gehoert in dieselbe Runde (Excel spaetestens in der zweiten).
  await pruefe('10 abgemeldet bei stehender Portal-Seite: die ERSTE eslRunde meldet an (Schein +1, nicht erst die zweite), die zweite liefert Excel', async () => {
    const vor = await mit((s) => esl.eslZustand(s));
    merk.zeiten = [];                                    // Pruefung 5 hat den Deckel gefuellt
    await steuer('aktion=abmelden');
    const a0 = await anmeldungen();
    const r1 = await runde('kabel');
    const a1 = await anmeldungen();
    const r2 = await runde('kabel');
    return [!vor.anmeldung && r1.art === 'fehler' && /abgeschickt/i.test(r1.grund || '') && a1 - a0 === 1 && r2.art === 'excel' && /^UEs/.test(r2.b64 || ''),
      'Tab vorher auf Anmeldeseite ' + vor.anmeldung + ' | erste: ' + kurz(r1) + ' | Anmeldungen +' + (a1 - a0) + ' | zweite: ' + kurz(r2)];
  });
}

// ---------------------------------------------------------------- fall=liga
if (FALL === 'liga') {
  const liga = require(path.join(WURZEL, 'esl_dienst_liga.js'));
  const XLSX = require(path.join(WURZEL, 'node_modules', 'xlsx'));
  const PROJEKTE = regeln.PROJEKTE;
  // Agenten der Testdatei, OHNE den Schein gezaehlt: Zeilen unter der Kopfzeile mit Agentenname und CCS-ID.
  const agenten = (() => {
    const wb = XLSX.readFile(path.join(WURZEL, 'Test Excels', 'ligalisten.xls'));
    for (const n of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
      const k = rows.findIndex((r) => r.includes('Agentenname'));
      if (k < 0) continue;
      const iN = rows[k].indexOf('Agentenname'), iC = rows[k].indexOf('CCS-ID');
      return new Set(rows.slice(k + 1).filter((r) => r[iN] !== '' && r[iC] !== '').map((r) => String(r[iC]))).size;
    }
    return 0;
  })();
  // Ein Tab je Ligaliste, wie der Dienst ihn anlegt; merk gehoert zum Tab (neuer Tab = neues merk).
  const tabOeffnen = async () => {
    const id = await cdp.neuerTab(PORT, LIGA_BASIS + liga.LIGA_PFAD);
    for (let i = 0; i < 40; i++) {
      const t = ((await cdp.cdpListe(PORT)) || []).find((x) => x.id === id && /^https?:/.test(x.url));
      if (t) return { id, ws: t.webSocketDebuggerUrl };
      await warte(250);
    }
    return { id, ws: null };
  };
  let tab = await tabOeffnen(), merk = {};
  if (!tab.ws) { console.log('Liga-Tab nicht gefunden.'); await ende(1); }
  const mit = (fn) => cdp.mitSitzung(tab.ws, fn, 300000);
  const runde = () => mit((s) => liga.ligaRunde(s, merk));
  const alleOk = (r) => !!(r && r.jeBaum) && PROJEKTE.every((p) => r.jeBaum[p].art === 'ok');
  const baumKurz = (b) => !b ? String(b) : b.art + (b.rows ? ' ' + b.rows.length : '') + (b.grund ? ' "' + b.grund + '"' : '');
  const kurz = (r) => !r ? String(r) : (r.jeBaum ? PROJEKTE.map((p) => p + ' ' + baumKurz(r.jeBaum[p])).join(', ') : 'jeBaum null') +
    (r.grund ? ' | grund "' + r.grund + '"' : '') + ' | ersetzen ' + r.ersetzen;

  await pruefe('1 ligaRunde: alle drei Baeume ok, Zeilen zusammen = Agenten der Testdatei, jede CCS-ID genau einmal; Seite haelt genau einen Web Lock rc_wach_dienst_liga', async () => {
    const r = await runde();
    const ids = r.jeBaum ? PROJEKTE.flatMap((p) => (r.jeBaum[p].rows || []).map((x) => String(x.ccsId))) : [];
    const locks = await mit(async (s) => (await s.seite(async () => (await navigator.locks.query()).held.map((l) => l.name))));
    const n = locks.filter((x) => x === 'rc_wach_dienst_liga').length;
    // Gleiche Summe auch, wenn dreimal DERSELBE Baum kaeme (3 x 52) - erst die verschiedenen CCS-IDs belegen drei Baeume.
    return [alleOk(r) && r.ersetzen === false && agenten > 0 && ids.length === agenten && new Set(ids).size === agenten && n === 1,
      kurz(r) + ' | ' + ids.length + ' Zeilen, ' + new Set(ids).size + ' verschiedene CCS-IDs, Testdatei ' + agenten + ' | Locks ' + JSON.stringify(locks)];
  });

  await pruefe("2 aktion=ora&p=um: um 'ora', kabel/mobile 'ok'; ligaZusammenfuehren -> vollstaendig false, fehlend ['um']", async () => {
    await steuer('aktion=ora&p=um');
    const r = await runde();
    await steuer('aktion=ora&p=');
    const z = r.jeBaum ? regeln.ligaZusammenfuehren(r.jeBaum) : null;
    const km = r.jeBaum ? (r.jeBaum.kabel.rows || []).length + (r.jeBaum.mobile.rows || []).length : -1;
    return [!!z && r.jeBaum.um.art === 'ora' && r.jeBaum.kabel.art === 'ok' && r.jeBaum.mobile.art === 'ok' &&
      z.vollstaendig === false && JSON.stringify(z.fehlend) === '["um"]' && z.payload.length === km && km > 0,
      kurz(r) + ' | vollstaendig ' + (z && z.vollstaendig) + ', fehlend ' + JSON.stringify(z && z.fehlend) + ', Nutzlast ' + (z && z.payload.length)];
  });

  await pruefe('3 aktion=tot: ersetzen === true; Tab schliessen + neu, aktion=lebt -> wieder ok', async () => {
    await steuer('aktion=tot');
    const r1 = await runde();
    const zu = await cdp.tabSchliessen(PORT, tab.id);
    tab = await tabOeffnen(); merk = {};
    await steuer('aktion=lebt');
    const r2 = await runde();
    return [r1.ersetzen === true && !!r1.jeBaum && PROJEKTE.every((p) => r1.jeBaum[p].art === 'sitzung-tot') && zu === true && alleOk(r2) && r2.ersetzen === false,
      'tot: ' + kurz(r1) + ' | Tab geschlossen ' + zu + ' | neu: ' + kurz(r2)];
  });

  await pruefe('4 aktion=ms&an=1, Tab neu: spaetestens nach 6 ligaRunde steht das Token (erste Runde sah die Microsoft-Maske), Schein zaehlt genau eine Absendung (auch eine Runde spaeter)', async () => {
    await steuer('aktion=ms&an=1');                    // setzt msAbsendungen auf 0
    await cdp.tabSchliessen(PORT, tab.id);
    tab = await tabOeffnen(); merk = {};
    const verlauf = [];
    let token = false, n = 0;
    while (n < 6 && !token) {
      const r = await runde(); n++;
      verlauf.push(r.jeBaum ? 'Daten' : r.grund);
      token = await mit(async (s) => (await liga.ligaZustand(s)).token);
    }
    const r = await runde();
    const abs = ((await steuer('aktion=zustand')) || {}).msAbsendungen;
    await steuer('aktion=ms&an=0');
    return [token && /Microsoft/.test(verlauf[0] || '') && abs === 1 && alleOk(r),
      n + ' Runden: ' + verlauf.join(' > ') + ' | Token ' + token + ' | Absendungen ' + abs + ' | danach ' + kurz(r)];
  });

  await pruefe('5 ligaBereich(kabel, heute-3, gestern): 3 Tage, jeder Snapshot nurCalls === true, byAgent mit c > 0, kein Feld cs', async () => {
    const d = new Date(), tag = (k) => regeln.datumIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - k));
    const soll = [tag(3), tag(2), tag(1)];
    const r = await mit((s) => liga.ligaBereich(s, 'kabel', soll[0], soll[2]));
    const tage = Object.keys(r.tage || {}).sort();
    const snaps = tage.map((t) => r.tage[t]);
    const je = snaps.map((x) => Object.values(x.byAgent || {}));
    return [r.art === 'ok' && JSON.stringify(tage) === JSON.stringify(soll) && snaps.every((x) => x.nurCalls === true) &&
      je.every((a) => a.length > 0 && a.every((v) => v.c > 0 && !('cs' in v))),
      r.art + (r.grund ? ' "' + r.grund + '"' : '') + ' | Tage ' + tage.join(',') + ' | nurCalls ' + snaps.map((x) => x.nurCalls).join(',') +
      ' | Agenten je Tag ' + je.map((a) => a.length).join(',') + ' | Felder ' + (je[0] && je[0][0] ? Object.keys(je[0][0]).join(',') : '-')];
  });

  await pruefe('6 Schein aus: Fehlerseite erkannt; Runde bei +5 s laedt NICHT neu (20-s-Regel); nach 25 s wieder an, naechste Runde laedt neu und liefert ok', async () => {
    await scheinBeenden();
    const z1 = await mit(async (s) => { await laden(s, () => s.befehl('Page.reload', {})); return liga.ligaZustand(s); });
    const r1 = await runde();                           // sieht die Fehlerseite zum ersten Mal: wartet
    const seit = merk.fehlerSeit;
    await mit((s) => s.seite(() => { window.__rcMessFehlerseite = 1; }));   // ein Neuladen loescht die Marke
    await warte(Math.max(0, 5000 - (Date.now() - seit)));
    const alter2 = Date.now() - seit;
    const r2 = await runde();
    const [z2, marke] = await mit(async (s) => [await liga.ligaZustand(s), await s.seite(() => window.__rcMessFehlerseite === 1)]);
    await warte(Math.max(0, 25000 - (Date.now() - seit)));
    scheinStarten();
    const bereit = await scheinBereit();
    const alter3 = Date.now() - seit;
    const r3 = await runde();
    return [z1.fehlerseite === true && !r1.jeBaum && /Fehlerseite/.test(r1.grund) && alter2 < 20000 &&
      !r2.jeBaum && /Neuladen nach 20 s/.test(r2.grund) && z2.fehlerseite === true && marke === true &&
      bereit && alter3 >= 20000 && alleOk(r3),
      'Fehlerseite ' + z1.fehlerseite + ' (' + z1.fehlerCode + ') | erste: ' + kurz(r1) + ' | +' + Math.round(alter2 / 1000) + ' s: ' + kurz(r2) +
      ', noch Fehlerseite ' + z2.fehlerseite + ', Marke ' + marke + ' | Schein wieder da ' + bereit + ' | +' + Math.round(alter3 / 1000) + ' s: ' + kurz(r3)];
  });

  // Microsoft-Ruecksprung ohne Token und ohne erkannte Maske: state, code, login_hint (Mailadresse) duerfen nicht
  // in grund, Rueckgaben oder Ausgaben landen - sie gehen in Log und Stand-Datei.
  await pruefe('7 Adresse mit Query ohne Token und ohne Maske: GEHEIM steht in keiner Rueckgabe (ligaZustand, ligaRunde, ligaBereich), href nur Ursprung + Pfad', async () => {
    const pfad = MS_BASIS + '/common/oauth2/authorize';
    await mit((s) => laden(s, () => s.befehl('Page.navigate', { url: pfad + '?state=GEHEIM&code=GEHEIM&login_hint=GEHEIM' })));
    const gestern = regeln.datumIso(new Date(Date.now() - 864e5));
    const [z, r, b] = await mit(async (s) => [await liga.ligaZustand(s), await liga.ligaRunde(s, merk), await liga.ligaBereich(s, 'kabel', gestern, gestern)]);
    const alles = JSON.stringify([z, r, b]);
    return [!/GEHEIM/.test(alles) && z.href === pfad && !r.jeBaum && /ohne Token/.test(r.grund),
      'href ' + z.href + ' | ' + kurz(r) + ' | Bereich ' + b.art + ' "' + b.grund + '" | GEHEIM ' + (/GEHEIM/.test(alles) ? 'GEFUNDEN' : 'nirgends')];
  });

  // R8: der Absende-Deckel gilt dienstweit (2 je 30 Min), nicht je Tab. Der Aufrufer reicht merk.msZeiten
  // bei Tab-Ersatz weiter; ein falsches Kennwort darf so nicht 2 Absendungen je neuem Tab kosten.
  await pruefe('8 R8 falsches Kennwort (ms&an=1&falsch=1): Tab 1 schickt genau 2x ab; neuer Tab mit NEUEM merk, aber demselben msZeiten -> keine dritte Absendung', async () => {
    await steuer('aktion=ms&an=1&falsch=1');
    await cdp.tabSchliessen(PORT, tab.id);
    tab = await tabOeffnen(); merk = {};
    const v1 = [];
    for (let i = 0; i < 8; i++) v1.push((await runde()).grund);
    const a1 = ((await steuer('aktion=zustand')) || {}).msAbsendungen;
    const zeiten = merk.msZeiten, n1 = Array.isArray(zeiten) ? zeiten.length : -1;
    await cdp.tabSchliessen(PORT, tab.id);
    tab = await tabOeffnen(); merk = { msZeiten: zeiten };
    const v2 = [];
    for (let i = 0; i < 4; i++) v2.push((await runde()).grund);
    const a2 = ((await steuer('aktion=zustand')) || {}).msAbsendungen;
    await steuer('aktion=ms&an=0');
    return [a1 === 2 && n1 === 2 && a2 === 2 && merk.msZeiten === zeiten && zeiten.length === 2 && /Deckel/.test(v2[v2.length - 1] || ''),
      'Tab 1: Absendungen ' + a1 + ', msZeiten ' + n1 + ', zuletzt "' + v1[v1.length - 1] + '" | Tab 2: Absendungen ' + a2 + ', msZeiten ' + (merk.msZeiten || []).length + ', zuletzt "' + v2[v2.length - 1] + '"'];
  });

  // R9: auf der E-Mail-Maske setzt Microsoft den Fokus selbst ins Mailfeld - das ist das Ziel, kein Grund auszusteigen.
  await pruefe('9 R9 zweistufig (ms&an=1&stufen=2, Fokus im Mailfeld): spaetestens nach 6 ligaRunde steht das Token, Schein zaehlt genau eine Kennwort-Absendung', async () => {
    await steuer('aktion=ms&an=1&stufen=2');
    await cdp.tabSchliessen(PORT, tab.id);
    tab = await tabOeffnen(); merk = {};
    let z0 = null;
    for (let i = 0; i < 40 && !(z0 && z0.ms); i++) { try { z0 = await mit((s) => liga.ligaZustand(s)); } catch (e) { } if (!(z0 && z0.ms)) await warte(250); }
    const verlauf = [];
    let token = false, n = 0;
    while (n < 6 && !token) {
      const r = await runde(); n++;
      verlauf.push(r.jeBaum ? 'Daten' : r.grund);
      token = await mit(async (s) => (await liga.ligaZustand(s)).token);
    }
    const r = await runde();
    const abs = ((await steuer('aktion=zustand')) || {}).msAbsendungen;
    await steuer('aktion=ms&an=0');
    const start = z0 && z0.ms ? z0.ms.maske + (z0.ms.imFeld ? ', Fokus im Feld' : '') : 'keine Maske';
    return [!!(z0 && z0.ms && z0.ms.maske === 'E-Mail' && z0.ms.imFeld) && token && abs === 1 && alleOk(r),
      'Start: ' + start + ' | ' + n + ' Runden: ' + verlauf.join(' > ') + ' | Token ' + token + ' | Absendungen ' + abs + ' | danach ' + kurz(r)];
  });

  // Citrix 28./29.10.: auf "Angemeldet bleiben?" liegt der Fokus auf dem Haken (INPUT), und nach der Anmeldung
  // landet CCS auf seiner Startseite LOGIN/start.rb statt auf der Ligaliste - beides liess die Ligaliste stundenlang stehen.
  await pruefe('10 Haken-Fokus auf "Angemeldet bleiben?" + CCS-Startseite (ms&an=1&start=1): Token in hoechstens 6 Runden, Startseite wirklich durchlaufen', async () => {
    await steuer('aktion=ms&an=1&start=1');
    await cdp.tabSchliessen(PORT, tab.id);
    tab = await tabOeffnen(); merk = {};
    const verlauf = [];
    let token = false, n = 0;
    while (n < 6 && !token) {
      const r = await runde(); n++;
      verlauf.push(r.jeBaum ? 'Daten' : r.grund);
      token = await mit(async (s) => (await liga.ligaZustand(s)).token);
    }
    const r = await runde();
    const zust = (await steuer('aktion=zustand')) || {};
    const start = JSON.stringify(zust.log || []).indexOf('ccs-start') >= 0;
    await steuer('aktion=ms&an=0');
    return [token && start && zust.msAbsendungen === 1 && alleOk(r),
      n + ' Runden: ' + verlauf.join(' > ') + ' | Token ' + token + ' | Startseite durchlaufen ' + start + ' | Absendungen ' + zust.msAbsendungen + ' | danach ' + kurz(r)];
  });
}

// ---------------------------------------------------------------- fall=dienst
if (DIENST_FALL) {
  const DPORT = 8797, DIENST = 'http://127.0.0.1:' + DPORT;
  if (await freierPort(DPORT) !== DPORT) { console.log('Port ' + DPORT + ' ist belegt - bitte selbst beenden.'); await ende(2); }
  // Testordner = Kopie des Dienstes OHNE Gastseite (eine echte v22-Seite meldete beim Start ihr Projekt per
  // /api/projekt und stellte Pruefung 5 zurueck) und OHNE Mitarbeiter-Excel (Pruefung 9). Log und Sperre liegen
  // dort wie im Betrieb neben esl_dienst.js; Profil (Wegwerf) und Datenordner kommen ueber die Umgebung.
  dienstOrdner = mkdtempSync(path.join(tmpdir(), 'esl-dienst-ordner-'));
  for (const f of ['esl_dienst.js', 'esl_dienst_regeln.js', 'esl_dienst_buendel.js', 'esl_dienst_cdp.js', 'esl_dienst_edge.js',
    'esl_dienst_esl.js', 'esl_dienst_liga.js', 'esl_live_arena_v22.js', 'kpi_crawler.js',
    // fall=alles: die ECHTE Gastseite und die echte Mitarbeiter-Excel (das Schein-ESL baut seine Mobile-Agenten daraus)
    ...(FALL === 'alles' ? ['ESL_Live_Arena.html', 'Mitarbeiter_IDS_Final_komplett.xlsx'] : [])]) copyFileSync(path.join(WURZEL, f), path.join(dienstOrdner, f));
  const DATEN = path.join(dienstOrdner, 'Dienst_Daten'), LOG = path.join(dienstOrdner, 'esl_dienst.log'), STAND = path.join(DATEN, 'stand.json');
  const env = Object.assign({}, process.env, {
    ESL_DIENST_PORT: String(DPORT), ESL_DIENST_CDP: String(PORT), ESL_DIENST_ESL_BASIS: ESL_BASIS, ESL_DIENST_CCS_BASIS: LIGA_BASIS,
    ESL_DIENST_PROFIL: profil, ESL_DIENST_DATEN: DATEN, ESL_DIENST_TAKT_SEK: '5', ESL_DIENST_LIGA_JEDE: '3',
    ESL_DIENST_EDGE_EXTRA: JSON.stringify(['--headless=new', '--disable-sync', '--disable-gpu', ...(FALL === 'alles' ? ['--window-size=1920,1080'] : []),
      '--host-resolver-rules=MAP esl.regiocom.net 127.0.0.1,MAP ccs.vodafone.de 127.0.0.1,MAP login.microsoftonline.com 127.0.0.1',
      '--unsafely-treat-insecure-origin-as-secure=' + [ESL_BASIS, LIGA_BASIS, MS_BASIS].join(','), '--disable-features=HttpsUpgrades'])
  });
  let ausgabe = '';   // Konsole des Dienstes (Pruefung 7)
  const starten = () => {
    const k = spawn(process.execPath, [path.join(dienstOrdner, 'esl_dienst.js')], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    k.stdout.on('data', (d) => { ausgabe += d; });
    k.stderr.on('data', (d) => { ausgabe += d; });
    k.on('error', () => { /* zeigt sich als fehlende Antwort */ });
    dienstKind = k;
  };
  const beenden = () => {
    const k = dienstKind; dienstKind = null;
    if (!k) return Promise.resolve();
    const weg = new Promise((r) => { if (k.exitCode !== null) return r(); k.once('exit', r); setTimeout(r, 10000); });
    try { k.kill(); } catch (e) { }
    return weg;
  };
  const lies = (f) => { try { return readFileSync(f, 'utf8'); } catch (e) { return ''; } };
  const stand = () => { try { return JSON.parse(readFileSync(STAND, 'utf8')); } catch (e) { return null; } };
  const warteBis = async (fn, ms, takt = 1000) => {
    for (const t = Date.now(); Date.now() - t < ms; await warte(takt)) { let r = null; try { r = await fn(); } catch (e) { } if (r) return r; }
    return null;
  };
  const host = (u) => { try { return new URL(u).host; } catch (e) { return ''; } };
  const ART = { dash: (t) => t.url.startsWith(DIENST + '/'), esl: (t) => host(t.url) === host(ESL_BASIS), liga: (t) => [host(LIGA_BASIS), host(MS_BASIS)].includes(host(t.url)) };
  const seiten = async () => cdp.seitenTabs(await cdp.cdpListe(PORT));
  // Anfragen AUS DEM DASHBOARD-TAB: gleiche Herkunft, das HttpOnly-Cookie reist mit.
  const imDash = async (fn, arg, frist = 30000) => {
    const t = (await seiten()).find(ART.dash);
    if (!t) throw new Error('kein Dashboard-Tab');
    return cdp.mitSitzung(t.webSocketDebuggerUrl, (s) => s.seite(fn, arg, frist), frist + 5000);
  };
  const hole = (pfad) => imDash(async (p) => {
    try {
      const r = await fetch(p, { cache: 'no-store' });
      const b = new Uint8Array(await r.arrayBuffer());
      return { status: r.status, kopf: String.fromCharCode(b[0] || 0, b[1] || 0), text: new TextDecoder().decode(b.slice(0, 400)), laenge: b.length };
    } catch (e) { return { status: 0, text: String(e) }; }
  }, pfad);
  const holeJson = (pfad) => imDash(async (p) => {
    try { const r = await fetch(p, { cache: 'no-store' }); return { status: r.status, j: r.ok ? await r.json() : null }; } catch (e) { return { status: 0 }; }
  }, pfad);
  const sende = (pfad, daten, frist) => imDash(async (a) => {
    const r = await fetch(a.pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a.daten) });
    let j = null;
    try { j = await r.json(); } catch (e) { }
    return { status: r.status, j };
  }, { pfad, daten }, frist);
  // Das Geheimnis steht nur im HttpOnly-Cookie von Edge: ueber die Browser-Verbindung lesen.
  const geheimnis = async () => {
    const r = await cdp.mitSitzung(await cdp.cdpBrowserWs(PORT), (s) => s.befehl('Storage.getCookies', {}), 15000);
    const c = ((r && r.cookies) || []).find((x) => x.name === 'rcDienst');
    return c ? c.value : '';
  };
  // Edge des Dienstes: Besitzer des Debug-Ports MIT unserem Wegwerf-Profil (nur diese pid wird je beendet).
  const dienstEdge = async () => {
    const b = await edge.portBesitzer(PORT);
    if (!(b > 0)) return 0;
    const p = ((await edge.prozesseLesen()) || []).find((x) => x.ProcessId === b);
    return p && p.CommandLine && p.CommandLine.includes(profil) ? b : 0;
  };
  const kurzStand = (s) => !s ? 'kein Stand' : 'nr ' + s.nr + ', aktiv ' + s.aktiv + ', Runden ' + (s.dienst || {}).runden + ' | ESL ' +
    regeln.PROJEKTE.map((p) => p + ' ' + s.esl[p].nr + ':' + (s.esl[p].art || '-')).join(' ') + ' | Liga ' + s.liga.nr + ':' + (s.liga.art || '-') + (s.liga.grund ? ' "' + s.liga.grund + '"' : '');
  const geheim = [];
  let halt = null;   // fall=alles: gehaltene CDP-Sitzung auf dem Dashboard-Tab (haelt die Spion-Registrierung am Leben)
  const gleichT = (a, b) => !!a && JSON.stringify(a) === JSON.stringify(b);
  // Bei FEHL: das Ende des Dienst-Logs gleich mit ausgeben (der Testordner wird am Ende geloescht).
  const logRest = (ok, n = 14) => ok ? '' : '\n         Log: ' + lies(LOG).trim().split('\n').slice(-n).join('\n              ');

  try {
    const t0 = Date.now();
    starten();

    if (FALL === 'dienst') {
    await pruefe('1 zweiter Start mit demselben Ordner: Code 2 und "laeuft bereits"; die Sperre des ersten bleibt stehen', async () => {
      const oben = await warteBis(async () => (await fetch(DIENST + '/api/stand', { signal: AbortSignal.timeout(2000) })).status === 403, 30000, 250);
      const z = spawnSync(process.execPath, [path.join(dienstOrdner, 'esl_dienst.js')], { env, encoding: 'utf8', timeout: 60000, windowsHide: true });
      const text = ((z.stdout || '') + (z.stderr || '')).trim();
      let sp = {};
      try { sp = JSON.parse(lies(path.join(dienstOrdner, 'esl_dienst.lock'))); } catch (e) { }
      return [!!oben && z.status === 2 && /laeuft bereits/.test(text) && !!dienstKind && sp.pid === dienstKind.pid,
        'erster oben ' + !!oben + ' | zweiter: Code ' + z.status + ', "' + text.split('\n').pop() + '" | Sperre pid ' + sp.pid + ' (erster ' + (dienstKind && dienstKind.pid) + ')'];
    });

    await pruefe('2 ohne Cookie -> 403; fetch(/api/stand) aus dem Dashboard-Tab -> 200', async () => {
      const ohne = await fetch(DIENST + '/api/stand', { signal: AbortSignal.timeout(5000) });
      const txt = (await ohne.text()).trim();
      const r = await warteBis(async () => { const x = await hole('/api/stand'); return x.status === 200 ? x : null; }, 60000);
      geheim.push(await geheimnis());
      return [ohne.status === 403 && !!r && !!geheim[0], 'ohne Cookie ' + ohne.status + ' "' + txt + '" | Dashboard-Tab ' + (r ? r.status : 'kein 200') + ' | Cookie ' + (geheim[0] ? geheim[0].length + ' Zeichen' : 'fehlt')];
    });

    await pruefe('3 nach <= 90 s (R1): esl.kabel.art excel, liga.art ok, liga.nr = Anzahl Runden mit rundeNr % 3 === 0', async () => {
      const s3 = await warteBis(async () => { const s = stand(); return s && s.esl.kabel.art === 'excel' && s.liga.art === 'ok' ? s : null; }, Math.max(0, 90000 - (Date.now() - t0)), 500);
      const s = s3 || stand(), n = s ? s.dienst.runden : -1;
      let soll = 0;
      for (let i = 0; i < n; i++) if (i % 3 === 0) soll++;
      return [!!s3 && n > 0 && s.liga.nr === soll, Math.round((Date.now() - t0) / 1000) + ' s | ' + kurzStand(s) + ' | Soll liga.nr ' + soll];
    });

    await pruefe('4 Log: in jeder Runde mit Liga steht die ESL-Zeile VOR der Liga-Zeile (mind. 2 Liga-Runden)', async () => {
      await warteBis(async () => { const s = stand(); return s && s.liga.nr >= 2; }, 60000, 500);
      const esl = {}, liga = {};
      lies(LOG).split('\n').forEach((z, i) => {
        let m = /Runde (\d+) ESL /.exec(z);
        if (m && esl[m[1]] === undefined) esl[m[1]] = i;
        m = /Runde (\d+) Liga/.exec(z);
        if (m && liga[m[1]] === undefined) liga[m[1]] = i;
      });
      const runden = Object.keys(liga), falsch = runden.filter((n) => !(esl[n] < liga[n]));
      return [runden.length >= 2 && falsch.length === 0, 'Liga-Runden ' + runden.join(',') + ' | ESL nicht davor: ' + (falsch.join(',') || 'keine')];
    });

    await pruefe("5 POST /api/runde {projekt:'mobile'} -> ok in R5-Form; danach aktiv mobile, esl.mobile.art excel", async () => {
      const r = await sende('/api/runde', { projekt: 'mobile' }, 170000);
      const j = r.j || {}, s = stand();
      const form = typeof j.nr === 'number' && !!j.esl && typeof j.esl.nr === 'number' && !!j.liga && typeof j.liga.nr === 'number' && typeof j.liga.agenten === 'number';
      return [r.status === 200 && j.ok === true && form && j.esl.art === 'excel' && j.liga.art === 'ok' && j.liga.agenten > 0 &&
        s.aktiv === 'mobile' && s.esl.mobile.art === 'excel' && j.esl.nr <= s.esl.mobile.nr,
        'HTTP ' + r.status + ' ' + JSON.stringify(j) + ' | ' + kurzStand(s)];
    });

    await pruefe('6 Dienst beenden und neu starten: Nummern >= vorher, /api/esl/kabel.xlsx sofort mit PK, Log nennt die Startargumente des eigenen Edge', async () => {
      const vorher = stand();
      await beenden();
      const logVor = lies(LOG).length, t = Date.now();
      starten();
      const r = await warteBis(async () => { const x = await holeJson('/api/stand'); return x.status === 200 ? x : null; }, 30000, 250);
      const dauer = Date.now() - t, nach = r && r.j;
      const x = await hole('/api/esl/kabel.xlsx');
      const flags = /Edge-Startargumente: erfuellt/.test(lies(LOG).slice(logVor));
      geheim.push(await geheimnis());
      return [!!nach && nach.nr >= vorher.nr && nach.liga.nr >= vorher.liga.nr && regeln.PROJEKTE.every((p) => nach.esl[p].nr >= vorher.esl[p].nr) &&
        x.status === 200 && x.kopf === 'PK' && flags && dauer < 20000,
        'erste Antwort nach ' + dauer + ' ms | vorher ' + kurzStand(vorher) + ' | nachher ' + kurzStand(nach) + ' | kabel.xlsx ' + x.status + ' ' + JSON.stringify(x.kopf) + ' ' + x.laenge + ' B | Flags im Log ' + flags];
    });

    await pruefe('7 weder Log noch stand.json noch Konsole enthalten das Geheimnis, SCHEIN oder eine Adresse mit ?/;', async () => {
      const texte = { log: lies(LOG), stand: lies(STAND), konsole: ausgabe }, funde = [];
      for (const [n, t] of Object.entries(texte)) {
        if (geheim.some((g) => g && t.includes(g))) funde.push(n + ': Geheimnis');
        if (t.includes('SCHEIN')) funde.push(n + ': SCHEIN');
        const a = /https?:\/\/[^\s"'<>]*[?;][^\s"'<>]*/.exec(t);
        if (a) funde.push(n + ': Adresse ' + a[0].slice(0, 90));
      }
      return [geheim.length === 2 && geheim.every(Boolean) && geheim[0] !== geheim[1] && texte.log.length > 0 && texte.stand.length > 0 && !funde.length,
        'Geheimnisse ' + geheim.length + (geheim[0] !== geheim[1] ? ' (je Start neu)' : ' (GLEICH)') + ' | Log ' + texte.log.length + ' B, Stand ' + texte.stand.length + ' B, Konsole ' + texte.konsole.length + ' B | Funde: ' + (funde.join('; ') || 'keine')];
    });

    // Fix-Runde 1: Erholungszeit wird ausgegeben, und die Startargumente des neuen Edge (zwei PowerShell-Abfragen)
    // werden erst NACH den Tabs gemessen - sie duerfen die Wiederherstellung nicht aufhalten.
    let t8da = Date.now();
    await pruefe('8 Edge per taskkill beendet -> in <= 150 s wieder da, genau drei Portal-/Dashboard-Tabs, Dashboard-Tab bekommt /api/stand mit 200; Startargumente erst nach den Tabs geprueft', async () => {
      const alt = await dienstEdge();
      if (!alt) return [false, 'Edge des Dienstes nicht gefunden'];
      pid = alt;
      const logVor = lies(LOG).length, t = Date.now();
      edgeBeenden();
      let n = null;
      const da = await warteBis(async () => {
        const s = await seiten();
        n = { dash: s.filter(ART.dash).length, esl: s.filter(ART.esl).length, liga: s.filter(ART.liga).length };
        if (n.dash !== 1 || n.esl !== 1 || n.liga !== 1) return null;
        return (await holeJson('/api/stand')).status === 200;
      }, 150000);
      const dauer = Date.now() - t;
      t8da = Date.now();
      await warteBis(async () => lies(LOG).slice(logVor).includes('Edge-Startargumente'), 60000, 500);
      const neu = lies(LOG).slice(logVor), iTab = neu.search(/-Tab angelegt/), iFlags = neu.indexOf('Edge-Startargumente');
      const reihe = iTab >= 0 && iFlags > iTab;
      pid = await dienstEdge();
      const ok = !!da && pid > 0 && pid !== alt && reihe;
      const lebt = dienstKind && dienstKind.exitCode === null ? 'laeuft' : 'BEENDET (' + (dienstKind && dienstKind.exitCode) + ', Ausgabe: ' + ausgabe.slice(-300) + ')';
      return [ok, 'ERHOLUNG ' + Math.round(dauer / 1000) + ' s (wieder da: ' + !!da + ') | Tabs ' + JSON.stringify(n) + ' | Edge-pid ' + alt + ' -> ' + pid +
        ' | Startargumente nach den Tabs: ' + reihe + ' (Tab-Zeile ' + iTab + ', Argumente ' + iFlags + ') | Dienst ' + lebt + logRest(ok, 25)];
    });

    await pruefe('9 Mitarbeiter-Excel fehlt im Testordner -> /api/mapping.xlsx 503 mit Grund', async () => {
      const x = await hole('/api/mapping.xlsx');
      const ok = !existsSync(path.join(dienstOrdner, 'Mitarbeiter_IDS_Final_komplett.xlsx')) && x.status === 503 && /Mitarbeiter_IDS_Final_komplett\.xlsx/.test(x.text) && /fehlt/.test(x.text);
      return [ok, x.status + ' "' + String(x.text).trim() + '"' + logRest(ok)];
    });

    // R15: ein langsamer Liga-Teil (bis 330 s) darf die ESL-Lieferung derselben Runde nicht zurueckhalten. Die Logzeile
    // "Runde n ESL p nr k" steht NACH dem Zwischenstand; solange die Liga-Zeile dieser Runde fehlt, laeuft der Liga-Teil.
    await pruefe('10 R15 Schein-Liga 15 s je Abfrage: waehrend der Liga-Teil einer Runde laeuft, zeigt /api/stand schon deren ESL-nr', async () => {
      await steuer('aktion=langsam&ms=15000', LIGA_DEF);
      const sah = await warteBis(async () => {
        let m = null;
        for (const z of lies(LOG).split('\n')) { const x = /Runde (\d+) ESL (\w+) nr (\d+):/.exec(z); if (x) m = x; }
        if (!m || +m[1] % 3 !== 0 || lies(LOG).includes('Runde ' + m[1] + ' Liga')) return null;   // juengste Runde ist eine Liga-Runde, Liga laeuft
        const s = await holeJson('/api/stand');
        if (lies(LOG).includes('Runde ' + m[1] + ' Liga')) return null;    // inzwischen fertig: nicht beweiskraeftig
        return { runde: +m[1], p: m[2], nrLog: +m[3], nrStand: s.j ? s.j.esl[m[2]].nr : null, status: s.status };
      }, 120000, 1000);
      await steuer('aktion=langsam&ms=0', LIGA_DEF);
      const ok = !!sah && sah.status === 200 && sah.nrStand === sah.nrLog;
      return [ok, (sah ? 'Runde ' + sah.runde + ' (Liga-Teil laeuft): ESL ' + sah.p + ' nr im Log ' + sah.nrLog + ', in /api/stand ' + sah.nrStand : 'keine laufende Liga-Runde beobachtet') + logRest(ok)];
    });

    // R8: der Microsoft-Absende-Deckel gilt DIENSTWEIT. Ein neuer Liga-Tab (hier: vom Nutzer geschlossen, der Dienst
    // legt ihn neu an) bekommt ein neues merk, aber dasselbe msZeiten - sonst kostete jeder Tab 2 neue Fehlversuche.
    await pruefe('11 R8 falsches Kennwort (ms&an=1&falsch=1): 2 Absendungen; Liga-Tab geschlossen -> der neue Tab schickt nichts mehr ab (Deckel)', async () => {
      const ligaTab = async () => (await seiten()).find(ART.liga);
      const abs = async () => ((await steuer('aktion=zustand', LIGA_DEF)) || {}).msAbsendungen;
      await steuer('aktion=ms&an=1&falsch=1', LIGA_DEF);
      const t1 = await ligaTab();
      if (t1) await cdp.tabSchliessen(PORT, t1.id);   // der neue Tab laedt die Liga-Seite neu -> Umleitung zur Anmeldung
      const zwei = await warteBis(async () => (await abs()) >= 2, 180000, 2000);
      const t2 = await ligaTab(), n0 = stand().liga.nr;
      const zu = t2 ? await cdp.tabSchliessen(PORT, t2.id) : false;
      await warteBis(async () => stand().liga.nr >= n0 + 4, 150000, 2000);
      const a = await abs(), s = stand(), t3 = await ligaTab();
      await steuer('aktion=ms&an=0', LIGA_DEF);
      const ok = !!zwei && zu && !!t3 && t3.id !== t2.id && a === 2 && s.liga.nr >= n0 + 4 && /Deckel/.test(s.liga.grund);
      return [ok, 'Absendungen bis Tab-Ersatz 2: ' + !!zwei + ' | Tab geschlossen ' + zu + ', neuer Tab ' + !!(t3 && t3.id !== (t2 && t2.id)) + ' | danach ' + (s.liga.nr - n0) + ' Liga-Runden, Absendungen ' + a + ' | Grund "' + s.liga.grund + '"' + logRest(ok)];
    });

    // Fix-Runde 1: ein Start, der ohne Antwort stirbt (z. B. an ein sich beendendes Edge uebergeben), darf die
    // 120-s-Drossel nicht scharf machen. Nachgestellt: Debug-Port sofort besetzen (das neue Edge bekommt keine
    // Fernsteuerung) und das neue Edge beenden, sobald es da ist; danach Port frei. Erwartet: naechster Versuch in der
    // naechsten Runde, nicht nach 120 s.
    await pruefe('12 erster Neustart stirbt ohne Antwort -> kein 120-s-Warten: drei Tabs, /api/stand 200 und neue ESL-Lieferung (excel) in <= 60 s', async () => {
      await warte(Math.max(0, t8da + 122000 - Date.now()));   // die Drossel des ERFOLGREICHEN Starts aus Pruefung 8 gilt zu Recht
      const alt = await dienstEdge();
      if (!alt) return [false, 'Edge des Dienstes nicht gefunden'];
      const s0 = stand(), aktiv = s0.aktiv, nr0 = s0.esl[aktiv].nr, logVor = lies(LOG).length;
      pid = alt;
      const t = Date.now();
      edgeBeenden();
      const besetzt = net.createServer((c) => c.destroy());
      let belegt = false;
      for (let i = 0; i < 20 && !belegt; i++) {
        belegt = await new Promise((ja) => { besetzt.once('error', () => ja(false)); besetzt.listen(PORT, '127.0.0.1', () => ja(true)); });
        if (!belegt) await warte(100);
      }
      const getoetet = [];
      let fehlversuch = '';
      for (const bis = Date.now() + 45000; belegt && Date.now() < bis && !fehlversuch;) {
        // nur der Browser-Prozess mit UNSEREM Wegwerf-Profil (geprueft ueber die Kommandozeile)
        const p = ((await edge.prozesseLesen()) || []).find((x) => x.ProcessId !== alt && /^msedge\.exe$/i.test(x.Name || '') && x.CommandLine && x.CommandLine.includes(profil) && !/--type=/.test(x.CommandLine));
        if (p && !getoetet.includes(p.ProcessId)) { spawnSync('taskkill', ['/PID', String(p.ProcessId), '/T', '/F'], { stdio: 'ignore' }); getoetet.push(p.ProcessId); }
        const m = /Edge: gestartet \(PID \d+\), [^\r\n|]*/.exec(lies(LOG).slice(logVor));
        if (m) fehlversuch = m[0].trim(); else await warte(200);
      }
      if (belegt) await new Promise((r) => besetzt.close(r));
      let n = null;
      const da = await warteBis(async () => {
        const s = await seiten();
        n = { dash: s.filter(ART.dash).length, esl: s.filter(ART.esl).length, liga: s.filter(ART.liga).length };
        if (n.dash !== 1 || n.esl !== 1 || n.liga !== 1 || (await holeJson('/api/stand')).status !== 200) return null;
        const x = stand();
        return x && x.esl[aktiv].art === 'excel' && x.esl[aktiv].nr > nr0;
      }, 150000);
      const dauer = Date.now() - t;
      pid = await dienstEdge();
      const ok = belegt && !!fehlversuch && !!da && dauer <= 60000;
      return [ok, 'ERHOLUNG ' + Math.round(dauer / 1000) + ' s (wieder da: ' + !!da + ') | Port besetzt ' + belegt + ' | beendete Fehlstarts ' + getoetet.length + ' | Dienst meldete "' + (fehlversuch || '-') + '" | Tabs ' + JSON.stringify(n) + logRest(ok, 20)];
    });
    }

    if (FALL === 'bereich') {
      const XLSX = require(path.join(WURZEL, 'node_modules', 'xlsx'));
      const esl = require(path.join(WURZEL, 'esl_dienst_esl.js'));
      const PROJ = regeln.PROJEKTE, d0 = new Date(), heute = regeln.datumIso(d0);
      const wand = (k) => regeln.datumIso(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - k));
      // Die Tage, die das Schein-ESL hat: 10 Vortage, gerechnet wie dort (Date.now() - n Tage).
      const scheinTage = Array.from({ length: 10 }, (_, i) => regeln.datumIso(new Date(Date.now() - (i + 1) * 86400000)));
      const imBereich = (von, bis) => scheinTage.filter((t) => t >= von && t <= bis).sort();
      const alleTage = (von, bis) => { const r = []; for (let t = Date.parse(von); t <= Date.parse(bis); t += 86400000) r.push(new Date(t).toISOString().slice(0, 10)); return r; };
      // Tage (JJJJ-MM-TT, sortiert, ohne Wiederholung) aller Zeilen einer Mappe auf der Platte; null = nicht lesbar.
      const mappenTage = (f) => {
        try {
          const wb = XLSX.read(readFileSync(f), { type: 'buffer' });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
          const i = rows[0].map((h) => String(h).toLowerCase().trim()).indexOf('datum');
          return [...new Set(rows.slice(1).filter((r) => r.some((x) => x !== '')).map((r) => String(r[i]).slice(0, 10)))].sort();
        } catch (e) { return null; }
      };
      const ligaTage = (p) => { try { return Object.keys(JSON.parse(lies(path.join(DATEN, 'vortage_' + p + '_liga.json'))).tage).sort(); } catch (e) { return null; } };
      const gleich = (a, b) => !!a && JSON.stringify(a) === JSON.stringify(b);
      const anmeldungen = async () => ((await steuer('aktion=zustand')) || {}).anmeldungen;
      const eslSeite = async () => { const t = (await seiten()).find(ART.esl); return cdp.mitSitzung(t.webSocketDebuggerUrl, (s) => esl.eslZustand(s), 30000); };
      const bereich = regeln.vortageBereich(d0);
      let vorher = null;   // Stand, als die taeglichen Vortage fertig waren

      await pruefe('1 Tagesstart: nach <= 5 Min haben alle drei Projekte Vortage - ESL excel mit genau den Tagen des Bereichs, Liga ok mit jedem Tag', async () => {
        if (!bereich) return [false, 'heute ist nichts zu holen (Montag, der 1.) - die Messung geht heute nicht'];
        const s = await warteBis(async () => { const x = stand(); return x && PROJ.every((p) => x.vortage[p].esl.art === 'excel') ? x : null; }, 300000, 1000) || stand();
        vorher = s;
        const sollESL = imBereich(bereich.von, bereich.bis), sollLiga = alleTage(bereich.von, bereich.bis);
        const je = PROJ.map((p) => {
          const v = s.vortage[p], t = mappenTage(path.join(DATEN, 'vortage_' + p + '.xlsx')), lt = ligaTage(p);
          const ok = v.nr === 1 && v.von === bereich.von && v.bis === bereich.bis && v.esl.art === 'excel' && sollESL.length > 0 && gleich(t, sollESL) &&
            v.liga.art === 'ok' && v.liga.tage === sollLiga.length && gleich(lt, sollLiga);
          return { p, ok, text: p + ' nr ' + v.nr + ' ' + v.von + '..' + v.bis + ' | ESL ' + v.esl.art + ' ' + (t ? t.length + ' Tage' : 'Datei fehlt') + ' | Liga ' + v.liga.art + ' ' + v.liga.tage + ' Tage' };
        });
        return [je.every((x) => x.ok), Math.round((Date.now() - t0) / 1000) + ' s | Soll ESL ' + sollESL.length + ' Tage, Liga ' + sollLiga.length + ' Tage | ' + je.map((x) => (x.ok ? '' : 'FALSCH ') + x.text).join(' || ') + logRest(je.every((x) => x.ok), 20)];
      });

      await pruefe('2 R1: Vortage erst nach der ersten vollstaendigen Runde; vor JEDEM Projektschritt lief eine Runde (Live-Takt hat Vorrang)', async () => {
        const L = lies(LOG).split('\n');
        const erste = L.findIndex((z) => /Runde 0 Liga/.test(z));
        const ende = [];   // Zeile, in der ein Projektschritt fertig wurde
        L.forEach((z, i) => { if (/Bereich (kabel|mobile|um) nr 1 /.test(z)) ende.push(i); });
        const dazwischen = (a, b) => L.slice(a + 1, b).filter((z) => /Runde \d+ ESL /.test(z)).length;
        const rundenVor = ende.map((e, k) => dazwischen(k === 0 ? erste : ende[k - 1], e));
        const ok = erste >= 0 && ende.length === 3 && ende[0] > erste && rundenVor.every((n) => n >= 1);
        return [ok, 'Runde 0 Liga in Zeile ' + erste + ' | Schritte fertig in Zeile ' + ende.join(',') + ' | Runden vor jedem Schritt ' + rundenVor.join(',')];
      });

      await pruefe('3 danach: aktives Projekt liefert wieder Excel, die ESL-Seite steht auf heute, der Tag ist als erledigt gemerkt und nur einmal geholt', async () => {
        const nr0 = vorher.esl[vorher.aktiv].nr;
        const s = await warteBis(async () => { const x = stand(); return x && x.aktiv === vorher.aktiv && x.esl[x.aktiv].nr > nr0 && x.esl[x.aktiv].art === 'excel' ? x : null; }, 60000, 500) || stand();
        const z = await eslSeite();
        const mal = lies(LOG).split('\n').filter((l) => /Bereich kabel nr \d+ /.test(l)).length;
        const ok = s.esl[s.aktiv].nr > nr0 && s.esl[s.aktiv].art === 'excel' && z.datumHeute === true && s.dienst.vortage.tag === heute && mal === 1;
        return [ok, 'aktiv ' + s.aktiv + ' ESL nr ' + nr0 + ' -> ' + s.esl[s.aktiv].nr + ':' + s.esl[s.aktiv].art + ' | datumHeute ' + z.datumHeute + ' | Tag gemerkt "' + s.dienst.vortage.tag + '" (heute ' + heute + ') | Vortage-Lauf kabel ' + mal + 'x'];
      });

      await pruefe("4 POST /api/bereich {von: heute-3, bis: gestern, projekte:['um']}: R5-Antwort, nur UM neu, Datei mit genau diesen Tagen, danach steht die Seite auf heute", async () => {
        const von = wand(3), bis = wand(1), soll = imBereich(von, bis), sollLiga = alleTage(von, bis);
        // Die Sitzung auf dem ESL-Tab steht schon, bevor die Antwort kommt: der Zustand wird in wenigen ms danach gelesen,
        // noch bevor die naechste (schon wartende) Runde die Seite von selbst auf heute zurueckstellen kann.
        const [r, z] = await cdp.mitSitzung((await seiten()).find(ART.esl).webSocketDebuggerUrl,
          async (s) => [await sende('/api/bereich', { von, bis, projekte: ['um'] }, 600000), await esl.eslZustand(s)], 700000);
        const j = r.j || {}, u = (j.projekte || {}).um || {}, s = stand(), v = s.vortage;
        const t = mappenTage(path.join(DATEN, 'vortage_um.xlsx')), lt = ligaTage('um');
        const form = r.status === 200 && j.ok === true && Object.keys(j.projekte || {}).join() === 'um' && u.nr === 2 && u.esl.art === 'excel' && u.liga.art === 'ok' && u.liga.tage === sollLiga.length;
        const ok = form && soll.length >= 3 && v.um.nr === 2 && v.um.von === von && v.um.bis === bis && gleich(t, soll) && gleich(lt, sollLiga) && v.kabel.nr === 1 && v.mobile.nr === 1 && z.datumHeute === true;
        return [ok, 'HTTP ' + r.status + ' ' + JSON.stringify(j) + ' | UM ' + v.um.von + '..' + v.um.bis + ' nr ' + v.um.nr + ', Datei-Tage ' + JSON.stringify(t) + ' (Soll ' + JSON.stringify(soll) + '), Liga-Tage ' + JSON.stringify(lt) + ' | kabel nr ' + v.kabel.nr + ', mobile nr ' + v.mobile.nr + ' | datumHeute ' + z.datumHeute];
      });

      await pruefe('5 das Schein-ESL zaehlt in der ganzen Messung genau EINE Anmeldung (Vortage melden nicht neu an)', async () => {
        const n = await anmeldungen();
        return [n === 1, 'abgeschickte Anmeldungen ' + n];
      });
    }

    // ------------------------------------------------------------ fall=alles
    // Ende zu Ende: der Dienst mit der ECHTEN Gastseite (ESL_Live_Arena.html + v22) in Edge, beide Schein-Portale.
    // Spione: Page.addScriptToEvaluateOnNewDocument lebt nur, solange die Verbindung offen ist -> eine gehaltene Sitzung.
    // location.reload laesst sich nicht ueberschreiben (unveraenderliche Eigenschaft); statt dessen zaehlt der Spion jedes
    // neue Dokument des Tabs (sessionStorage) - ohne eigene Neuladungen des Geraets darf es nur EINES je Tab geben.
    if (FALL === 'alles') {
      const XLSX = require(path.join(WURZEL, 'node_modules', 'xlsx'));
      const d0 = new Date(), heute = regeln.datumIso(d0);
      const wand = (k) => regeln.datumIso(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - k));
      const sek = (t) => Math.round((Date.now() - t) / 1000);
      const SPION = '(' + (function () {
        if (window !== window.top) return;
        var K = '__rcSpy', lies = function () { try { return JSON.parse(sessionStorage.getItem(K) || '{}'); } catch (e) { return {}; } };
        var schreib = function (S) { try { sessionStorage.setItem(K, JSON.stringify(S)); } catch (e) { } };
        var S = lies(); S.docs = (S.docs || 0) + 1; S.open = S.open || 0; schreib(S);
        var o = window.open;
        window.open = function () { var T = lies(); T.open = (T.open || 0) + 1; schreib(T); return o.apply(this, arguments); };
      }).toString() + ')()';
      let eigene = 0, tabA = null;   // eigene Neuladungen des Geraets im aktuellen Tab; Stand der Spione von Tab A (vor Edge-Ende)
      const spion = () => imDash(() => { try { return JSON.parse(sessionStorage.getItem('__rcSpy') || '{}'); } catch (e) { return {}; } }, undefined, 15000);
      const anhaengen = async (laeuftSchon) => {
        const t = (await seiten()).find(ART.dash);
        if (!t) throw new Error('kein Dashboard-Tab');
        let los; const frei = new Promise((r) => { los = r; });
        const s = await new Promise((ja, nein) => { cdp.mitSitzung(t.webSocketDebuggerUrl, async (x) => { ja(x); await frei; }, 3 * 3600e3).catch(nein); });
        halt = { s, los };
        await s.befehl('Page.enable');   // ohne Page.enable laeuft die Registrierung bei der naechsten Navigation NICHT (am Edge gemessen)
        await s.befehl('Page.addScriptToEvaluateOnNewDocument', { source: SPION });
        if (laeuftSchon) await s.auswerten(SPION); else { await s.befehl('Page.reload', { ignoreCache: true }); eigene++; }
      };
      const neuladen = async () => { await halt.s.befehl('Page.reload', { ignoreCache: true }); eigene++; };
      const lage = () => imDash(() => {
        const D = window.rcProjektDaten || {}, G = window.rcDienstGesehen || {}, L = window.rcDienstLage || {};
        const t = (id) => (document.getElementById(id) || {}).textContent || '';
        const daten = {}; Object.keys(D).forEach((k) => { daten[k] = (D[k] && D[k].zeit) || 0; });
        return { daten, kpi: Object.keys(window.rcKpiData || {}).length, esl: t('rcZeitEsl'), liga: t('rcZeitLiga'), fehlserie: window.rcEslFehlserie || 0,
          dienstFehler: L.fehler === undefined ? null : L.fehler, vortage: G.vortage || null, aktiv: window.rcAktivProjekt,
          ligaZeit: window.rcKpiLastUpdate ? +window.rcKpiLastUpdate : 0, dashboards: document.querySelectorAll('#rcLiveDashboard').length, bereit: !!window.rcDienstInterval };
      }, undefined, 20000);
      const uhr = /\d{1,2}:\d{2}/;
      const mappenTage = (f) => {
        try {
          const wb = XLSX.read(readFileSync(f), { type: 'buffer' });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
          const i = rows[0].map((h) => String(h).toLowerCase().trim()).indexOf('datum');
          return [...new Set(rows.slice(1).filter((r) => r.some((x) => x !== '')).map((r) => String(r[i]).slice(0, 10)))].sort();
        } catch (e) { return null; }
      };
      // Bei FEHL: lebt der Dienst (HTTP), arbeitet er (CPU-Sekunden im Abstand von 3 s), wo stehen die Tabs? (Hinweis auf einen Haenger)
      const diagRest = async (ok) => {
        if (ok) return '';
        try {
          const cpu = () => { const r = spawnSync('powershell', ['-NoProfile', '-Command', '(Get-Process -Id ' + (dienstKind ? dienstKind.pid : 0) + ').CPU'], { encoding: 'utf8', timeout: 15000, windowsHide: true }); return String(r.stdout || '').trim().slice(0, 12); };
          const c1 = cpu(); await warte(3000); const c2 = cpu();
          const h = await holeJson('/api/stand').then((r) => 'HTTP ' + r.status, (e) => 'keine Antwort');
          // je Tab: Adresse und ob der Renderer in 3 s antwortet (ein haengender Tab fiele hier auf)
          const tabs = (await Promise.all((await seiten()).map(async (x) => {
            let u = x.url.slice(0, 40); try { const p = new URL(x.url); u = p.host + p.pathname; } catch (e) { }
            let zustand = 'kein Zugriff';
            try { zustand = await cdp.mitSitzung(x.webSocketDebuggerUrl, (s) => s.seite(() => document.readyState, undefined, 3000), 5000); } catch (e) { }
            return u + ' [' + zustand + ']';
          }))).join(' ; ');
          return '\n         Diagnose: Dienst ' + h + ', CPU ' + c1 + ' -> ' + c2 + ' s | Tabs ' + tabs;
        } catch (e) { return '\n         Diagnose scheiterte: ' + e.message; }
      };
      const bereichZeilen = () => (lies(LOG).match(/Bereich (kabel|mobile|um) nr \d+ /g) || []).length;

      await pruefe('1 Start: in <= 90 s rcProjektDaten.kabel gefuellt, rcKpiData nicht leer, #rcZeitEsl und #rcZeitLiga zeigen eine Uhrzeit', async () => {
        const da = await warteBis(async () => (await seiten()).some(ART.dash), 60000, 500);
        if (!da) return [false, 'kein Dashboard-Tab' + logRest(false, 12)];
        await anhaengen(false);
        let x = null;
        const ok = await warteBis(async () => { x = await lage(); return x.daten.kabel && x.kpi > 0 && uhr.test(x.esl) && uhr.test(x.liga) ? x : null; }, Math.max(1000, 90000 - (Date.now() - t0)), 1000);
        const sp = await spion().catch(() => ({}));
        return [!!ok && sp.docs === 1, sek(t0) + ' s | Spion: Dokumente ' + sp.docs + ' (Soll 1) | ' + JSON.stringify(ok || x) + logRest(!!ok, 16)];
      });

      // Kein Teil der 13: erst die Vortage des Tagesstarts abwarten, damit die Pruefungen 2 bis 6 nicht gegen deren Arbeit messen.
      {
        const tv = Date.now();
        const f = await warteBis(async () => { const x = stand(); return x && x.dienst.vortage.tag === heute; }, 300000, 1000);
        console.log('  (Tagesstart-Vortage des Dienstes: ' + (f ? 'fertig nach ' + sek(tv) + ' s' : 'nicht fertig nach 5 Min') + ')');
      }

      await pruefe('2 echter Klick auf den Mobile-Knopf: stand.aktiv mobile, rcProjektDaten.mobile.zeit neuer als der Klick', async () => {
        const pos = await warteBis(async () => imDash(() => {
          const b = document.querySelector('#rcProjWahl [data-rc-proj="mobile"]');
          if (!b) return null;
          const r = b.getBoundingClientRect();
          if (!(r.width > 0 && r.height > 0)) return null;
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, undefined, 15000), 60000, 1000);
        if (!pos) return [false, 'Mobile-Knopf nicht sichtbar'];
        const tKlick = Date.now();
        await cdp.echterKlick(halt.s, pos.x, pos.y);
        const s = await warteBis(async () => { const x = stand(); return x && x.aktiv === 'mobile' ? x : null; }, 60000, 500);
        let l = null;
        const dran = await warteBis(async () => { l = await lage(); return l.daten.mobile > tKlick && l.aktiv === 'mobile'; }, 90000, 1000);
        return [!!s && !!dran, 'Klick bei (' + Math.round(pos.x) + ',' + Math.round(pos.y) + ') | stand.aktiv ' + (s ? s.aktiv : '-') + ' | Dashboard aktiv ' + (l && l.aktiv) + ', mobile.zeit ' + (l && l.daten.mobile > tKlick ? '+' + (l.daten.mobile - tKlick) + ' ms' : 'nicht neuer') + logRest(!!s && !!dran, 14)];
      });

      await pruefe('3 Schein-ESL abmelden: genau eine Anmeldung mehr, Daten in <= 2 Runden wieder da (Dienst-Stand UND Dashboard)', async () => {
        // Auf eine Rundengrenze warten: eine gerade laufende Runde (Phase des Takts) zaehlte sonst als eine der zwei Runden
        // (gemessen: 2 Runden oder 3, je nachdem, wo im Takt abgemeldet wurde). Danach ist die naechste Runde die Anmelderunde.
        const rr = stand().dienst.runden;
        await warteBis(async () => stand().dienst.runden > rr, 30000, 200);
        const s0 = stand(), p = s0.aktiv, r0 = s0.dienst.runden, a0 = ((await steuer('aktion=zustand', ESL_DEF)) || {}).anmeldungen;
        const tAb = Date.now();
        await steuer('aktion=abmelden', ESL_DEF);
        // erst die Anmeldung abwarten, dann die Lieferung der Runde, in der sie stattfand
        const angemeldet = await warteBis(async () => ((await steuer('aktion=zustand', ESL_DEF)) || {}).anmeldungen === a0 + 1, 90000, 500);
        const n1 = stand().esl[p].nr;
        const s = angemeldet && await warteBis(async () => { const x = stand(); return x.esl[p].nr > n1 && x.esl[p].art === 'excel' ? x : null; }, 60000, 500);
        let l = null;
        const dran = !!s && await warteBis(async () => { l = await lage(); return l.daten[p] > tAb; }, 30000, 1000);
        const a1 = ((await steuer('aktion=zustand', ESL_DEF)) || {}).anmeldungen;
        const runden = s ? s.dienst.runden - r0 : -1;
        const ok = a1 === a0 + 1 && !!s && !!dran && runden <= 2;
        return [ok, 'Anmeldungen ' + a0 + ' -> ' + a1 + ' | ' + p + ' wieder excel nach ' + sek(tAb) + ' s, ' + runden + ' Runde(n) (Soll <= 2) | Dashboard ' + (dran ? 'hat die Daten' : 'ohne neue Daten') + logRest(ok, 16)];
      });

      await pruefe('4 Schein-ESL 30 s aus: rcEslFehlserie >= 3 im Dashboard, nach der Rueckkehr wieder 0', async () => {
        const p = stand().aktiv, t = Date.now();
        let max = 0, l = null;
        try {
          await scheinBeenden(ESL_DEF);
          await warteBis(async () => { l = await lage(); max = Math.max(max, l.fehlserie); return Date.now() - t >= 30000 && max >= 3; }, 120000, 1000);
        } finally { scheinStarten(ESL_DEF); }
        const bereit = await scheinBereit(30000, ESL_DEF);
        const tZurueck = Date.now();
        const heil = await warteBis(async () => { l = await lage(); return l.fehlserie === 0 && l.daten[p] > tZurueck ? l : null; }, 120000, 1000);
        return [max >= 3 && bereit && !!heil, 'aus ' + Math.round((tZurueck - t) / 1000) + ' s | Fehlserie max ' + max + ' | zurueck: Fehlserie ' + (l && l.fehlserie) + ', ' + p + ' neue Daten nach ' + sek(tZurueck) + ' s' + logRest(max >= 3 && !!heil, 16) + await diagRest(max >= 3 && !!heil)];
      });

      await pruefe('5 Schein-Liga tot: Liga-Tab ersetzt (neue Target-Id), nach lebt wieder Daten', async () => {
        const id0 = ((await seiten()).find(ART.liga) || {}).id, n0 = stand().liga.nr;
        await steuer('aktion=tot', LIGA_DEF);
        const id1 = await warteBis(async () => { const x = (await seiten()).find(ART.liga); return x && x.id !== id0 ? x.id : null; }, 150000, 1000);
        const tLebt = Date.now();
        await steuer('aktion=lebt', LIGA_DEF);
        let l = null;
        const s = await warteBis(async () => { const x = stand(); return x.liga.nr > n0 && x.liga.art === 'ok' && x.liga.zeit > tLebt ? x : null; }, 150000, 1000);
        const dran = !!s && await warteBis(async () => { l = await lage(); return l.ligaZeit > tLebt && l.kpi > 0; }, 30000, 1000);
        const ok = !!id1 && !!s && !!dran;
        return [ok, 'Tab ' + String(id0).slice(0, 6) + ' -> ' + String(id1 || '-').slice(0, 6) + ' | Liga ' + (s ? s.liga.art + ' nr ' + s.liga.nr + ' nach ' + sek(tLebt) + ' s' : 'nicht wieder ok') + ' | Dashboard ' + (dran ? 'hat die Daten' : 'ohne neue Liga') + logRest(ok, 16)];
      });

      await pruefe('6 Schein-ESL gestern (naechste Seite steht auf gestern): die naechsten Lieferungen enthalten nur heutige Zeilen', async () => {
        const p = stand().aktiv, nr0 = stand().esl[p].nr;
        await steuer('aktion=gestern&an=1', ESL_DEF);
        const t = (await seiten()).find(ART.esl);
        await cdp.mitSitzung(t.webSocketDebuggerUrl, (s) => s.befehl('Page.reload', {}), 20000);   // frische Seite = steht auf gestern
        const s = await warteBis(async () => { const x = stand(); return x.esl[p].nr >= nr0 + 2 && x.esl[p].art === 'excel' ? x : null; }, 120000, 500);
        const verbraucht = ((await steuer('aktion=zustand', ESL_DEF)) || {}).gestern === false;   // eine gestern-Seite wurde wirklich angelegt
        const tage = mappenTage(path.join(DATEN, 'esl_' + p + '.xlsx'));
        const ok = !!s && verbraucht && gleichT(tage, [heute]);
        return [ok, p + ' nr ' + nr0 + ' -> ' + (s ? s.esl[p].nr : '-') + ' | Tage in der Datei ' + JSON.stringify(tage) + ' (Soll ["' + heute + '"]) | gestern-Seite angelegt ' + verbraucht + logRest(ok, 14)];
      });

      await pruefe('7 Export-Dialog, Zeitraum heute-3 bis gestern: Mappe abgefangen, stand.vortage.kabel.nr gestiegen', async () => {
        const nr0 = stand().vortage.kabel.nr, von = wand(3), bis = wand(1);
        const a = await imDash(async (z) => {
          window.__abg = null;
          window.rcXlsxAbfangen = (b, fn) => { window.__abg = { laenge: (b && (b.byteLength || b.length)) || 0, name: fn || '' }; };
          window.rcOpenExportWahl();
          await new Promise((r) => setTimeout(r, 600));
          const frei = document.querySelector('input[name="rcExWahlZeit"][value="frei"]');
          if (!frei) return { fehler: 'Radio "frei" fehlt' };
          frei.checked = true; frei.dispatchEvent(new Event('change', { bubbles: true }));
          document.getElementById('rcExWahlVon').value = z.von; document.getElementById('rcExWahlBis').value = z.bis;
          document.getElementById('rcExWahlGo').click();
          return { ok: true };
        }, { von, bis }, 30000);
        if (a.fehler) return [false, a.fehler];
        let g = null;
        await warteBis(async () => { g = await imDash(() => ({ abg: window.__abg, status: (document.getElementById('rcExWahlStatus') || {}).textContent || '' }), undefined, 15000); return g.abg; }, 300000, 2000);
        const n1 = stand().vortage.kabel.nr;
        const ok = !!(g && g.abg && g.abg.laenge > 1000) && n1 > nr0;
        return [ok, 'Zeitraum ' + von + '..' + bis + ' | abgefangen ' + JSON.stringify(g && g.abg) + ' | vortage.kabel.nr ' + nr0 + ' -> ' + n1 + ' | Status "' + String(g && g.status).slice(0, 160) + '"' + logRest(ok, 16)];
      });

      await pruefe('8 Seite neu laden WAEHREND POST /api/bereich laeuft: kein zweiter Bereichsauftrag im Log, Vortage danach in der neuen Seite eingespeist', async () => {
        const z0 = bereichZeilen(), nr0 = {}; regeln.PROJEKTE.forEach((p) => { nr0[p] = stand().vortage[p].nr; });
        await imDash(async (z) => {
          window.rcOpenRange();
          await new Promise((r) => setTimeout(r, 600));
          document.getElementById('rcRgFrom').value = z.von; document.getElementById('rcRgTo').value = z.bis;
          document.getElementById('rcRgLoad').click();
        }, { von: wand(3), bis: wand(1) }, 20000);
        await warte(2000);                         // der POST ist unterwegs, der erste Projektschritt noch nicht fertig
        const vorReload = bereichZeilen() - z0;
        await neuladen();
        const fertig = await warteBis(async () => { const x = stand(); return regeln.PROJEKTE.every((p) => x.vortage[p].nr === nr0[p] + 1) ? x : null; }, 240000, 1000);
        await warte(15000);                        // ein zweiter Auftrag wuerde sich jetzt zeigen
        const z1 = bereichZeilen() - z0, s = stand();
        let l = null;
        const drin = await warteBis(async () => { l = await lage(); return l.vortage && regeln.PROJEKTE.every((p) => l.vortage[p] === s.vortage[p].nr) ? l : null; }, 60000, 1000);
        const ok = vorReload === 0 && !!fertig && z1 === 3 && !!drin;
        return [ok, 'Projektschritte im Log vor dem Neuladen ' + vorReload + ', insgesamt ' + z1 + ' (Soll 3) | vortage.nr ' + JSON.stringify(regeln.PROJEKTE.map((p) => nr0[p] + '->' + s.vortage[p].nr)) + ' | neue Seite hat eingespeist ' + JSON.stringify(l && l.vortage) + logRest(ok, 16)];
      });

      await pruefe('9 Dienst neu starten: rcDienstLage.fehler wieder leer in <= 30 s, ohne dass die Seite neu laedt', async () => {
        const docs0 = (await spion()).docs;
        await beenden();
        let gesehen = '';
        await warteBis(async () => { const x = await lage(); if (x.dienstFehler) gesehen = x.dienstFehler; return gesehen; }, 30000, 500);
        const t = Date.now();
        starten();
        let l = null;
        const ok = await warteBis(async () => { l = await lage(); return l.dienstFehler === '' ? l : null; }, 30000, 500);
        const docs1 = (await spion()).docs;
        return [!!gesehen && !!ok && typeof docs0 === 'number' && docs0 === docs1, 'Ausfall gesehen "' + String(gesehen).slice(0, 80) + '" | wieder leer nach ' + sek(t) + ' s | Dokumente ' + docs0 + ' -> ' + docs1 + logRest(!!ok, 12)];
      });

      await pruefe('10 Seite neu laden: rcProjektDaten.kabel in <= 10 s wieder da', async () => {
        const t = Date.now();
        await neuladen();
        let l = null;
        const ok = await warteBis(async () => { l = await lage(); return l.daten && l.daten.kabel ? l : null; }, 10000, 250);
        return [!!ok, 'nach ' + (Date.now() - t) + ' ms | ' + JSON.stringify(ok || l)];
      });

      await pruefe('11 Re-Inject im Dashboard-Tab: genau 1 #rcLiveDashboard, ein Empfangs-Zeitgeber (2-s-Takt, nicht doppelt)', async () => {
        const warteDash = await warteBis(async () => (await lage()).bereit, 30000, 500);
        const r = await imDash(async () => {
          const src = await (await fetch('/esl_live_arena_v22.js', { cache: 'no-store' })).text();
          const alt = window.rcDienstInterval;
          (0, eval)(src);
          await new Promise((ja) => setTimeout(ja, 8000));
          performance.clearResourceTimings();
          await new Promise((ja) => setTimeout(ja, 9000));
          const n = performance.getEntriesByType('resource').filter((e) => e.name.indexOf('/api/stand') >= 0).length;
          return { alt, neu: window.rcDienstInterval, dash: document.querySelectorAll('#rcLiveDashboard').length, abfragen: n, groesse: src.length };
        }, undefined, 90000);
        // 9 s bei einem Takt von 2 s: 4 bis 5 Abfragen; zwei Zeitgeber waeren 8 bis 10
        return [!!warteDash && r.dash === 1 && !!r.neu && r.neu !== r.alt && r.abfragen >= 3 && r.abfragen <= 6, JSON.stringify(r)];
      });

      await pruefe('12 Edge beenden: in <= 150 s wieder Daten im (neuen) Dashboard-Tab', async () => {
        // Stand der Spione des alten Tabs sichern, dann Edge des Dienstes (nur diese pid) beenden
        tabA = Object.assign({ eigene }, await spion());
        const alt = await dienstEdge();
        if (!alt) return [false, 'Edge des Dienstes nicht gefunden'];
        pid = alt;
        const t = Date.now();
        edgeBeenden();
        try { halt.los(); } catch (e) { }
        halt = null; eigene = 0;
        const tab = await warteBis(async () => { const x = (await seiten()).find(ART.dash); return x && x.id ? x : null; }, 150000, 250);
        if (!tab) return [false, 'kein neuer Dashboard-Tab nach 150 s' + logRest(false, 20)];
        const tTab = sek(t);
        await anhaengen(true);                // Spione sofort (das Dokument laeuft schon: zaehlt als Dokument 1)
        let l = null;
        const ok = await warteBis(async () => { l = await lage(); return l.daten[l.aktiv] > t && l.kpi > 0 ? l : null; }, Math.max(1000, 150000 - (Date.now() - t)), 1000);
        pid = await dienstEdge();
        return [!!ok, 'Tab nach ' + tTab + ' s, neue Daten (' + (l && l.aktiv) + ', Liga ' + (l && l.kpi) + ' Agenten) nach ' + sek(t) + ' s' + ' | Edge-pid ' + alt + ' -> ' + pid + ' | ' + JSON.stringify(l) + logRest(!!ok, 20)];
      });

      await pruefe('13 Spione: window.open und location.reload (jedes unbestellte neue Dokument) wurden im Dashboard-Tab nie ausgeloest', async () => {
        const b = await spion();
        const open = (tabA.open || 0) + (b.open || 0);
        // Tab A: ein Dokument je eigener Neuladung des Geraets (Anhaengen, Pruefungen 8 und 10); Tab B: nur das laufende
        const ok = open === 0 && tabA.docs === tabA.eigene && b.docs === 1;
        return [ok, 'window.open: Tab A ' + (tabA.open || 0) + ', Tab B ' + (b.open || 0) + ' | Dokumente Tab A ' + tabA.docs + ' (eigene Neuladungen ' + tabA.eigene + '), Tab B ' + b.docs + ' (Soll 1)'];
      });
    }
  } finally {
    if (halt) try { halt.los(); } catch (e) { }
    await beenden();
    pid = pid || await dienstEdge();   // nur die gepruefte eigene pid
    edgeBeenden();
    await warte(1500);
    for (const d of [dienstOrdner, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'regiocom_ESL_Cache', path.basename(profil))]) {
      if (d) try { rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch (e) { console.log('  (blieb liegen: ' + d + ')'); }
    }
    dienstOrdner = null;
  }
}

console.log('MESSUNG fall=' + FALL + ': ' + gut + ' von ' + gesamt + ' OK');
await ende(gut === gesamt && gesamt > 0 ? 0 : 1);
