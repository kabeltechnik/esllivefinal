/* ============================================================================
   ESL-DIENST: KERN
   ---------------------------------------------------------------------------
   Der Datendienst fuer die Live-Arena (node esl_dienst.js, gestartet von
   ESL_Dienst_Start.cmd). Haelt EIN Edge mit drei Tabs (Dashboard, ESL, Ligaliste)
   ueber die Fernsteuerung, faehrt im Takt Runden (erst ESL des aktiven Projekts,
   dann jede n-te Runde die Ligaliste), legt die Lieferungen in Dienst_Daten ab und
   gibt sie ueber eine HTTP-Schnittstelle auf 127.0.0.1 an die Live-Arena-Seite.
   Er ist der EINZIGE Heiler; der Autopilot wird nie eingespielt (er klickte ESL
   auf Kabel zurueck).

   Ein Arbeiter, eine Warteschlange: nie zwei Sitzungen auf demselben Tab
   (esl_dienst_liga.js haelt EIN Seiten-Global je Tab). Jede Anfrage braucht das
   Cookie rcDienst = Geheimnis dieses Starts (anfrageErlaubt). Nach aussen gehen
   von Seitenadressen nur Ursprung + Pfad (sauber), nie das Geheimnis.
   Reihenfolge beim Schreiben: Datei (esl_<p>.xlsx, liga.json) VOR stand.json,
   alles atomar - wer eine neue nr sieht, findet die passende Datei.
   JEDE ESL-Lieferung, auch ein Fehlschlag, zaehlt stand.esl[p].nr hoch (R5).
   Der Microsoft-Absende-Deckel gilt dienstweit (R8): MS_ZEITEN steckt in JEDEM
   Liga-merk, auch nach Tab-Ersatz und Edge-Neustart (tabMerken).
   Vortage (Auftrag bereich): je Projekt ein Schritt (ESL-Bereich -> vortage_<p>.xlsx, Liga-Bereich ->
   vortage_<p>_liga.json); vor jedem Schritt laeuft eine faellige Runde zuerst (R1). Taeglich einmal von selbst,
   erst nach einer Runde mit gutem ESL.
   Geprueft von pruefwerkzeuge/dienst_messen.mjs (fall=dienst).
============================================================================ */
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const R = require('./esl_dienst_regeln');
const { cdpListe, cdpBrowserWs, seitenTabs, mitSitzung, neuerTab, tabSchliessen, cookieSetzen } = require('./esl_dienst_cdp');
const { edgeFinden, cacheOrdner, edgeStarten, prozesseLesen, portBesitzer, profilBelegt } = require('./esl_dienst_edge');
const { ESL_PFADE, eslRunde, eslBereichExport } = require('./esl_dienst_esl');
const { LIGA_PFAD, ligaRunde, ligaBereich } = require('./esl_dienst_liga');
const { postfachStarten } = require('./esl_dienst_postfach');

// ---------------------------------------------------------------- Einstellungen (EINE Stelle)
const ORDNER = __dirname, U = process.env;
const PORT = Number(U.ESL_DIENST_PORT) || 8787;
const CDP = Number(U.ESL_DIENST_CDP) || 9222;
const ESL_BASIS = U.ESL_DIENST_ESL_BASIS || 'https://esl.regiocom.net';
const CCS_BASIS = U.ESL_DIENST_CCS_BASIS || 'https://ccs.vodafone.de';
const PROFIL = U.ESL_DIENST_PROFIL || path.join(ORDNER, 'EdgeProfil');
const DATEN = U.ESL_DIENST_DATEN || path.join(ORDNER, 'Dienst_Daten');
const TAKT_SEK = Number(U.ESL_DIENST_TAKT_SEK) || 20;
const LIGA_JEDE = Number(U.ESL_DIENST_LIGA_JEDE) || 3;
let EDGE_EXTRA = null;
try { EDGE_EXTRA = JSON.parse(U.ESL_DIENST_EDGE_EXTRA || '[]'); } catch (e) { /* unten gemeldet */ }
// Mail-Zentrum: nur "1" schaltet ein (ESL_Dienst_Start.cmd, ab Werk 0). Aus = nie PowerShell/Outlook.
const POSTFACH = U.ESL_DIENST_POSTFACH === '1';
const POSTFACH_TAKT_SEK = Number(U.ESL_DIENST_POSTFACH_TAKT_SEK) || 180;
const POSTFACH_LESER = U.ESL_DIENST_POSTFACH_LESER || path.join(ORDNER, 'postfach_lesen.ps1');
const POSTFACH_AKTION = U.ESL_DIENST_POSTFACH_AKTION || path.join(ORDNER, 'postfach_aktion.ps1');
let postfach = null;

const LOG = path.join(ORDNER, 'esl_dienst.log'), SPERRE = path.join(ORDNER, 'esl_dienst.lock');
const STAND = path.join(DATEN, 'stand.json');
const MAPPING_NAME = 'Mitarbeiter_IDS_Final_komplett.xlsx';
const PROJ = R.PROJEKTE, ESL_GUT = ['excel', 'leer'], LIGA_GUT = ['ok', 'teil'];
const SITZUNG_ESL_MS = 240000, SITZUNG_LIGA_MS = 330000;   // eslRunde bis ~4 Min, ligaRunde 3 x 100 s + Laden
const EDGE_ABSTAND_MS = 120000, EDGE_WARTE_MS = 20000;
const NUR_DIENST = 'Nur über ESL_Dienst_Start.cmd erreichbar';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const SCHLAF = new Int32Array(new SharedArrayBuffer(4));

let GEHEIMNIS = '';
let stand = null, standText = '';
const MS_ZEITEN = [];                 // R8: Microsoft-Absendungen DIENSTWEIT, nie neu zugewiesen
const eslMerk = { zeiten: [] };       // ESL-Anmeldungen (3 je 30 Min) ebenfalls fuer den ganzen Dienst
let ligaMerk = { msZeiten: MS_ZEITEN };

// ---------------------------------------------------------------- Protokoll
// Nach aussen (Log, Stand, Ereignisse, Antworten) von Adressen nur Ursprung + Pfad (R12): Query, Fragment und
// ;jsessionid fallen weg (Microsoft-Ruecksprung traegt state/code, JSF kann die Sitzung in der Adresse tragen).
function sauber(text) {
  let t = String(text == null ? '' : text).replace(/(https?:\/\/[^\s'"<>?#;]*)[^\s'"<>]*/gi, '$1').replace(/\s*[\r\n]+\s*/g, ' | ');
  if (GEHEIMNIS) t = t.split(GEHEIMNIS).join('***');
  return t;
}
let logGroesse = 0;
try { logGroesse = fs.statSync(LOG).size; } catch (e) { /* noch kein Log */ }
function log(text) {
  const d = new Date(), zeile = R.datumIso(d) + ' ' + d.toTimeString().slice(0, 8) + ' ' + sauber(text);
  console.log(zeile);
  try {
    if (logGroesse > 2 * 1024 * 1024) { fs.renameSync(LOG, LOG + '.1'); logGroesse = 0; }
    fs.appendFileSync(LOG, zeile + '\n');
    logGroesse += Buffer.byteLength(zeile) + 1;
  } catch (e) { /* ein volles Laufwerk darf den Dienst nicht anhalten */ }
}
// Ereignis = Logzeile + Eintrag im Stand (Ring 50, nr laeuft ueber Neustarts weiter); die Seite schreibt es ins Logbuch.
function ereignis(art, text) {
  const t = sauber(text), E = stand.ereignisse;
  log((art === 'W' ? 'WARNUNG: ' : '') + t);
  E.push({ nr: (E.length ? E[E.length - 1].nr : 0) + 1, zeit: Date.now(), art, text: t });
  if (E.length > 50) E.splice(0, E.length - 50);
}
// Ereignis nur beim WECHSEL des Zustands einer Quelle (sonst stuende der Ring nach 17 Min voller Wiederholungen).
const zuletzt = {};
function wechsel(quelle, gut, text) {
  const k = text.replace(/\d+/g, '#');
  if (zuletzt[quelle] === k) return;
  zuletzt[quelle] = k;
  ereignis(gut ? 'E' : 'W', text);
}

// ---------------------------------------------------------------- Dateien und Stand
// .tmp + rename; ein kurz gehaltener Zugriff (Virenscanner) bekommt ein paar Wiederholungen.
function schreibeAtomar(datei, inhalt) {
  const tmp = datei + '.tmp';
  fs.writeFileSync(tmp, inhalt);
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, datei); return; } catch (e) {
      if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      Atomics.wait(SCHLAF, 0, 0, 100);
    }
  }
}

function standLeer() {
  const s = {
    nr: 0, aktiv: 'kabel',
    dienst: { start: 0, edge: '', flags: { zustand: '', fehlt: [] }, runden: 0, anmeldungen: { esl: [], ms: [] }, vortage: { tag: '', versuchUm: 0 } },
    esl: {}, liga: { nr: 0, zeit: 0, versuch: 0, art: '', grund: '', vollstaendig: false, agenten: 0, jeBaum: {} },
    vortage: {}, ereignisse: []
  };
  for (const p of PROJ) {
    s.esl[p] = { nr: 0, zeit: 0, art: '', status: null, grund: '', bytes: 0 };
    s.vortage[p] = { nr: 0, zeit: 0, von: '', bis: '', esl: { art: '', grund: '' }, liga: { art: '', tage: 0, grund: '' } };
  }
  return s;
}
// Nummern und Anmelde-Zeitpunkte ueberleben einen Neustart (sonst rearmierte ein Neustart die Deckel).
function standLaden() {
  const s = standLeer();
  let alt = null;
  try { alt = JSON.parse(fs.readFileSync(STAND, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') log('WARNUNG: stand.json nicht lesbar (' + (e.code || e.message) + '), Nummern beginnen bei 0'); }
  if (alt && typeof alt === 'object') {
    s.nr = Number(alt.nr) || 0;
    if (PROJ.includes(alt.aktiv)) s.aktiv = alt.aktiv;
    for (const p of PROJ) { Object.assign(s.esl[p], alt.esl && alt.esl[p]); Object.assign(s.vortage[p], alt.vortage && alt.vortage[p]); }
    Object.assign(s.liga, alt.liga);
    if (Array.isArray(alt.ereignisse)) s.ereignisse = alt.ereignisse.slice(-50);
    const an = (alt.dienst && alt.dienst.anmeldungen) || {};
    const vm = (alt.dienst && alt.dienst.vortage) || {};
    s.dienst.vortage = { tag: String(vm.tag || ''), versuchUm: Number(vm.versuchUm) || 0 };
    eslMerk.zeiten.push(...(an.esl || []).filter(Number.isFinite));
    MS_ZEITEN.push(...(an.ms || []).filter(Number.isFinite));
  }
  s.dienst.anmeldungen = { esl: eslMerk.zeiten, ms: MS_ZEITEN };   // dieselben Arrays, die die Module fuellen
  return s;
}
let fortschritt = Date.now();   // Haenger-Waechter: misst nur den Arbeiter
// nebenher = Lieferung des Postfachs (eigener Zeitgeber): zaehlt nicht als Fortschritt des Arbeiters.
function standSchreiben(nebenher) {
  if (!nebenher) fortschritt = Date.now();
  stand.nr++;
  standText = JSON.stringify(stand);
  try { schreibeAtomar(STAND, standText); } catch (e) { log('WARNUNG: stand.json nicht geschrieben (' + (e.code || e.message) + ')'); }
}

function eslText(e) { return e.art + (e.bytes ? ' (' + Math.round(e.bytes / 1024) + ' KB)' : '') + (e.grund ? ' - ' + e.grund : ''); }
// r = Ergebnis von eslRunde. Die Datei wird VOR stand.json geschrieben; scheitert sie, gilt die Lieferung als Fehlschlag.
// Auch ein Ergebnis, das kein Objekt ist, ist eine Lieferung: nr zaehlt hoch (R5), art 'fehler'.
function eslAblegen(p, r) {
  if (!r || typeof r !== 'object') r = { art: 'fehler', grund: 'ESL-Runde ohne Ergebnis' };
  const neu = { nr: stand.esl[p].nr + 1, zeit: r.zeit || Date.now(), art: r.art || 'fehler', status: r.status == null ? null : r.status, grund: sauber(r.grund), bytes: 0 };
  if (neu.art === 'excel') {
    try {
      const b = Buffer.from(r.b64, 'base64');
      schreibeAtomar(path.join(DATEN, 'esl_' + p + '.xlsx'), b);
      neu.bytes = b.length;
    } catch (e) { neu.art = 'fehler'; neu.grund = 'ESL-Datei nicht geschrieben (' + (e.code || e.message) + ')'; }
  }
  stand.esl[p] = neu;
  wechsel('esl:' + p, ESL_GUT.includes(neu.art), 'ESL ' + p + ': ' + eslText(neu));
  return neu;
}

// r = Ergebnis von ligaRunde. liga.zeit = letzte (Teil-)Lieferung, versuch = letzter Versuch; ein fehlender Baum
// macht 'teil' (vollstaendig false: die Seite ersetzt den Bestand dann nicht).
function ligaAblegen(r) {
  if (!r || typeof r !== 'object') r = { jeBaum: null, grund: 'Liga-Runde ohne Ergebnis' };
  const L = stand.liga, jetzt = Date.now();
  L.nr++; L.versuch = jetzt; L.grund = sauber(r.grund); L.agenten = 0; L.art = 'fehler'; L.vollstaendig = false;
  if (r.jeBaum) {
    const z = R.ligaZusammenfuehren(r.jeBaum);
    L.jeBaum = {};
    for (const p of PROJ) {
      const b = r.jeBaum[p] || {};
      L.jeBaum[p] = { zeit: b.zeit || jetzt, art: b.art || 'fehler', n: Array.isArray(b.rows) ? b.rows.length : 0, grund: sauber(b.grund) };
    }
    if (z.fehlend.length < PROJ.length) {
      try {
        schreibeAtomar(path.join(DATEN, 'liga.json'), JSON.stringify({ zeit: jetzt, vollstaendig: z.vollstaendig, payload: z.payload }));
        L.art = z.vollstaendig ? 'ok' : 'teil'; L.vollstaendig = z.vollstaendig; L.zeit = jetzt; L.agenten = z.payload.length;
      } catch (e) { L.grund = 'liga.json nicht geschrieben (' + (e.code || e.message) + ')'; }
    }
  }
  const baeume = r.jeBaum ? ' (' + PROJ.map((p) => p + ' ' + L.jeBaum[p].art + ' ' + L.jeBaum[p].n).join(', ') + ')' : '';
  const text = L.art + (LIGA_GUT.includes(L.art) ? ', ' + L.agenten + ' Agenten' : '') + baeume + (L.grund ? ' - ' + L.grund : '');
  wechsel('liga', LIGA_GUT.includes(L.art), 'Ligaliste: ' + text);
  return text;
}

// ---------------------------------------------------------------- Edge und Tabs
const DASH_URL = 'http://127.0.0.1:' + PORT + '/';
const hostVon = (u) => { try { return new URL(u).host; } catch (e) { return ''; } };
const ZIEL = {
  dash: { url: DASH_URL, passt: (u) => u.startsWith(DASH_URL) },
  // main.xhtml statt Anmeldeseite: bei stehender Sitzung keine neue Anmeldung (main leitet sonst selbst dorthin).
  esl: { url: ESL_BASIS + ESL_PFADE.haupt, passt: (u) => hostVon(u) === hostVon(ESL_BASIS) },
  // Die Ligaliste steht nach Ablauf der Sitzung auf der Microsoft-Anmeldung.
  liga: { url: CCS_BASIS + LIGA_PFAD, passt: (u) => hostVon(u) === hostVon(CCS_BASIS) || /^login\.microsoftonline\.com(:\d+)?$/i.test(hostVon(u)) }
};
const TAB = { dash: '', esl: '', liga: '' };   // gemerkte Target-Ids: bei mehreren ESL-Tabs wird nur der gemerkte betreut
let edgeStartUm = 0, toteStarts = 0, edgeGrund = '', cookieFuer = '', ligaErsatzUm = 0, flagsOffen = false;

// Ein neuer Tab bekommt ein neues merk - der Microsoft-Deckel bleibt dienstweit (R8), der ESL-Deckel auch.
function tabMerken(k, id) {
  TAB[k] = id || '';
  if (k === 'esl') eslMerk.fehlerSeit = null;
  if (k === 'liga') ligaMerk = { msZeiten: MS_ZEITEN };
}

async function flagsPruefen(besitzer, prozesse) {
  if (besitzer === undefined) besitzer = await portBesitzer(CDP);
  if (prozesse === undefined) prozesse = await prozesseLesen();
  const p = besitzer > 0 && Array.isArray(prozesse) ? prozesse.find((x) => x.ProcessId === besitzer) : null;
  const f = R.flagZustand(p && p.CommandLine);
  stand.dienst.flags = f;
  const text = 'Edge-Startargumente: ' + f.zustand + (f.fehlt.length ? ' (fehlt: ' + f.fehlt.join(', ') + ')' : '');
  if (f.zustand === 'verletzt') ereignis('W', text + ' - Hintergrund-Tabs koennen gedrosselt werden'); else log(text);
}

// Das Cookie haengt am Edge-Prozess (Sitzungs-Cookie): neu setzen, sobald die Browser-Adresse wechselt (= neues Edge).
async function cookieAktuell() {
  const bws = await cdpBrowserWs(CDP);
  if (!bws || bws === cookieFuer) return;
  if (await cookieSetzen(CDP, { name: 'rcDienst', value: GEHEIMNIS, url: DASH_URL })) cookieFuer = bws;
  else log('WARNUNG: Zugangs-Cookie nicht gesetzt - naechster Versuch in der naechsten Runde');
}

// Drossel der Edge-Starts: hoechstens ein gezaehlter Start je 120 s (geprueft in dienst_kern_pruefen.js).
function startFrei(jetzt) { return jetzt - edgeStartUm >= EDGE_ABSTAND_MS; }
// Nach dem Warten auf einen Start: die Drossel zaehlt einen Start, der antwortete oder noch laeuft (bootet/haengt:
// ein zweiter Start erreichte nur ihn). Starb er ohne Antwort (z. B. an ein sich beendendes Edge uebergeben), folgt der
// naechste Versuch in der naechsten Runde - aber nur einmal (R16): der zweite tote Start in Folge macht die Drossel
// scharf, sonst startete ein dauerhaft sterbendes Edge (kaputtes Profil, Richtlinie) jede Runde neu.
function startVerbuchen(jetzt, antwortete, lebt) {
  if (antwortete) toteStarts = 0;
  if (antwortete || lebt || ++toteStarts >= 2) edgeStartUm = jetzt;
}

function keinEdge(grund) {
  edgeGrund = 'Edge: ' + grund;
  stand.dienst.edge = 'nicht erreichbar';
  wechsel('edge', false, edgeGrund);
  return false;
}

// true = Edge antwortet, Cookie gesetzt, drei Tabs gemerkt. Startet Edge hoechstens alle 120 s (der erste Start in
// Folge, der ohne Antwort starb, zaehlt nicht - R16, startVerbuchen) und wartet bis 20 s.
async function edgeSicher() {
  try {
    let liste = await cdpListe(CDP);
    if (liste) toteStarts = 0;   // R16: antwortet /json (auch ein spaet hochgekommenes Edge), beginnt die Zaehlung neu
    if (!liste) {
      cookieFuer = '';
      const jetzt = Date.now();
      if (!startFrei(jetzt)) return keinEdge('antwortet nicht, naechster Startversuch in ' + Math.ceil((edgeStartUm + EDGE_ABSTAND_MS - jetzt) / 1000) + ' s');
      // Belegt (Edge beendet sich noch, laeuft ohne Fernsteuerung, Ordner gesperrt): ein Start erreichte nur das alte Fenster.
      if (profilBelegt(PROFIL)) return keinEdge('Profil belegt oder gesperrt, kein Neustart (Edge ohne Fernsteuerung?)');
      const exe = edgeFinden();
      if (!exe) return keinEdge('msedge.exe nicht gefunden');
      const pid = edgeStarten(exe, R.edgeArgumente({ port: CDP, profil: PROFIL, cacheDir: cacheOrdner(path.basename(PROFIL)), extra: EDGE_EXTRA, urls: ['about:blank'] }));
      if (!pid) return keinEdge('liess sich nicht starten');
      // Bis 20 s warten; stirbt der gestartete Prozess vorher, nicht weiter warten.
      let lebt = true;
      for (const bis = Date.now() + EDGE_WARTE_MS; !liste && lebt && Date.now() < bis;) { await warte(500); liste = await cdpListe(CDP); lebt = pidLebt(pid); }
      startVerbuchen(jetzt, !!liste, lebt);
      if (!liste) return keinEdge('gestartet (PID ' + pid + '), ' + (lebt ? 'Fernsteuerung antwortet nicht nach 20 s' : 'beendete sich ohne Antwort - naechster Versuch ' + (startFrei(Date.now()) ? 'in der naechsten Runde' : 'in 120 s')));
      stand.dienst.edge = 'neu gestartet';
      ereignis('E', 'Edge gestartet (PID ' + pid + ')');
      flagsOffen = true;
    }
    await cookieAktuell();   // VOR neuen Tabs: das Dashboard laedt sonst ohne Zugang
    const seiten = seitenTabs(liste);
    for (const k of ['dash', 'esl', 'liga']) {
      if (TAB[k] && liste.some((t) => t.id === TAB[k])) continue;
      const frei = seiten.find((t) => ZIEL[k].passt(t.url) && !Object.values(TAB).includes(t.id));
      let id = frei ? frei.id : '';
      if (!id) {
        try { id = await neuerTab(CDP, ZIEL[k].url); } catch (e) { log('WARNUNG: ' + k + '-Tab nicht angelegt (' + e.message + ')'); }
      }
      tabMerken(k, id);
      if (id) log(k + '-Tab ' + (frei ? 'gefunden' : 'angelegt') + ' (' + id.slice(0, 8) + ') ' + (frei ? frei.url : ZIEL[k].url));
    }
    // Edge nimmt Hintergrund-Tabs zeitweise aus /json (Citrix 28./29.10.: Dashboard nach 18 s, ESL nach 15-20 Min),
    // der Dienst legt dann einen neuen an. Taucht der alte wieder auf, ist er ein Doppel: schliessen. Nur Dashboard,
    // ESL und CCS-Start/Ligaliste - andere CCS-Anwendungen und fremde Seiten bleiben stehen.
    const doppel = (u) => ZIEL.dash.passt(u) || ZIEL.esl.passt(u) || (hostVon(u) === hostVon(CCS_BASIS) && /\/LOGIN\/start\.rb|\/LIGA_LISTEN_NEW\//i.test(u));
    for (const t of seiten) {
      if (!Object.values(TAB).includes(t.id) && doppel(t.url) && await tabSchliessen(CDP, t.id)) log('Doppelter Tab geschlossen (' + t.id.slice(0, 8) + ') ' + sauber(t.url));
    }
    if (!TAB.esl || !TAB.liga) return keinEdge('Portal-Tabs fehlen');
    if (stand.dienst.edge === 'nicht erreichbar') stand.dienst.edge = 'eigen';
    edgeGrund = '';
    wechsel('edge', true, 'Edge erreichbar');
    // Startargumente des neuen Edge erst NACH den Tabs messen: zwei PowerShell-Abfragen (kalt bis 20 s je) duerfen die
    // Wiederherstellung nicht aufhalten. Gemessen wird trotzdem (echte Kommandozeile statt der eigenen Annahme).
    if (flagsOffen) { flagsOffen = false; await flagsPruefen(); }
    return true;
  } catch (e) {
    return keinEdge('Pruefung abgebrochen (' + e.message + ')');
  }
}

const wsVon = (id) => 'ws://127.0.0.1:' + CDP + '/devtools/page/' + id;
async function eslHolen(p) {
  try { return await mitSitzung(wsVon(TAB.esl), (s) => eslRunde(s, p, eslMerk), SITZUNG_ESL_MS); } catch (e) {
    return { art: 'fehler', grund: 'ESL-Tab nicht steuerbar: ' + e.message, zeit: Date.now() };
  }
}
async function ligaHolen() {
  try { return await mitSitzung(wsVon(TAB.liga), (s) => ligaRunde(s, ligaMerk), SITZUNG_LIGA_MS); } catch (e) {
    return { jeBaum: null, grund: 'Liga-Tab nicht steuerbar: ' + e.message, ersetzen: false };
  }
}
// Tote Ligalisten-Sitzung (401): Tab ersetzen statt neu laden (heilte am 10.10. nicht), hoechstens alle 10 Min.
async function ligaErsetzen() {
  const jetzt = Date.now();
  if (!R.ligaErsatzErlaubt(ligaErsatzUm, jetzt)) { log('Ligaliste: Sitzung tot, Tab-Ersatz erst ' + Math.ceil((ligaErsatzUm + 600e3 - jetzt) / 60e3) + ' Min nach dem letzten'); return; }
  ligaErsatzUm = jetzt;
  const zu = TAB.liga ? await tabSchliessen(CDP, TAB.liga) : false;
  let id = '';
  try { id = await neuerTab(CDP, ZIEL.liga.url); } catch (e) { /* die naechste Runde legt ihn an */ }
  tabMerken('liga', id);
  ereignis('W', 'Ligaliste: Sitzung abgelaufen, Tab ' + (zu ? 'geschlossen' : 'nicht geschlossen') + ' und ' + (id ? 'neu angelegt' : 'naechste Runde neu angelegt'));
}

// ---------------------------------------------------------------- Auftraege
let rundeNr = 0;
async function rundeFahren(ligaZwang) {
  const n = rundeNr++, p = stand.aktiv;
  const edgeOk = await edgeSicher();
  const e = eslAblegen(p, edgeOk ? await eslHolen(p) : { art: 'fehler', grund: edgeGrund, zeit: Date.now() });
  const mitLiga = ligaZwang || R.ligaFaellig(n, LIGA_JEDE);
  // R15: vor einem Liga-Teil (bis 330 s) den ESL-Stand sofort zeigen; runden zaehlt erst mit der fertigen Runde.
  if (mitLiga) standSchreiben();
  log('Runde ' + n + ' ESL ' + p + ' nr ' + e.nr + ': ' + eslText(e));
  let liga = null;
  if (mitLiga) {
    const r = edgeOk ? await ligaHolen() : { jeBaum: null, grund: edgeGrund, ersetzen: false };
    log('Runde ' + n + ' Liga: ' + ligaAblegen(r));
    const L = stand.liga;
    liga = { nr: L.nr, art: L.art, grund: L.grund, agenten: L.agenten };
    if (r && r.ersetzen) await ligaErsetzen();
  }
  stand.dienst.runden = n + 1;
  vortagePlanen(e.art);
  standSchreiben();
  return { projekt: p, nr: stand.nr, esl: { nr: e.nr, art: e.art, grund: e.grund }, liga };
}
async function abrufFahren(p) {
  const e = eslAblegen(p, await edgeSicher() ? await eslHolen(p) : { art: 'fehler', grund: edgeGrund, zeit: Date.now() });
  log('Abruf ESL ' + p + ': ' + eslText(e));
  standSchreiben();
  return { nr: e.nr, art: e.art, grund: e.grund };
}
// Taegliche Vortage: erst nach einer Runde mit gutem ESL (R1), nach einem Fehlversuch fruehestens in 60 Min wieder.
// versuchUm wird beim Einreihen gesetzt: eine Runde mitten im Auftrag reiht ihn sonst ein zweites Mal ein.
function vortagePlanen(eslArt) {
  const jetzt = Date.now(), heute = R.datumIso(new Date(jetzt)), vm = stand.dienst.vortage;
  if (!ESL_GUT.includes(eslArt) || !R.vortageFaellig(heute, vm, jetzt)) return;
  const b = R.vortageBereich(new Date(jetzt));
  if (!b) { vm.tag = heute; return; }   // Montag, der 1.: nichts zu holen
  vm.versuchUm = jetzt;
  auftrag({ art: 'bereich', von: b.von, bis: b.bis, projekte: PROJ.slice(), quelle: 'vortage', tag: heute });
}
async function eslBereichHolen(p, von, bis) {
  try { return await mitSitzung(wsVon(TAB.esl), (s) => eslBereichExport(s, p, von, bis), SITZUNG_ESL_MS); } catch (e) {
    return { art: 'fehler', grund: 'ESL-Tab nicht steuerbar: ' + e.message };
  }
}
async function ligaBereichHolen(p, von, bis) {
  try { return await mitSitzung(wsVon(TAB.liga), (s) => ligaBereich(s, p, von, bis), SITZUNG_LIGA_MS); } catch (e) {
    return { art: 'fehler', tage: {}, grund: 'Liga-Tab nicht steuerbar: ' + e.message };
  }
}
// Dateien VOR stand.json (atomar); vortage_<p>_liga.json ist die Rueckgabe von ligaBereich unveraendert (R10).
// Jede Lieferung zaehlt nr hoch, auch ein Fehlschlag. Liga: ok = jeder Tag des Bereichs da, teil = nur einige.
function vortageAblegen(p, a, esl, liga) {
  const V = { nr: stand.vortage[p].nr + 1, zeit: Date.now(), von: a.von, bis: a.bis, esl: { art: esl.art || 'fehler', grund: sauber(esl.grund) }, liga: { art: 'fehler', tage: 0, grund: sauber(liga.grund) } };
  if (V.esl.art === 'excel') {
    try { schreibeAtomar(path.join(DATEN, 'vortage_' + p + '.xlsx'), Buffer.from(esl.b64, 'base64')); } catch (e) { V.esl = { art: 'fehler', grund: 'Vortage-Datei nicht geschrieben (' + (e.code || e.message) + ')' }; }
  }
  const n = Object.keys(liga.tage || {}).length, soll = Math.round((Date.parse(a.bis) - Date.parse(a.von)) / 864e5) + 1;
  if (liga.art !== 'ok') V.liga.grund = V.liga.grund || liga.art;
  else if (!n) V.liga.grund = 'Ligaliste lieferte keine Tage';
  else {
    try {
      schreibeAtomar(path.join(DATEN, 'vortage_' + p + '_liga.json'), JSON.stringify(liga));
      V.liga = { art: n >= soll ? 'ok' : 'teil', tage: n, grund: n >= soll ? '' : n + ' von ' + soll + ' Tagen geliefert' };
    } catch (e) { V.liga.grund = 'Liga-Vortage nicht geschrieben (' + (e.code || e.message) + ')'; }
  }
  stand.vortage[p] = V;
  return V;
}
// Ein Projekt je Schritt. Vor jedem Schritt laeuft eine faellige Runde (der Takt hat sie eingereiht) zuerst, damit
// die Live-Zahlen nicht minutenlang stehen (R1); eine laufende Runde bricht nie ab. Nach dem Schritt steht die
// ESL-Seite wieder auf heute (eslBereichExport), die naechste Runde fuehrt zum aktiven Projekt zurueck.
async function bereichFahren(a) {
  const projekte = {}, kurz = (x) => x.art + (x.grund ? ' - ' + x.grund : '');
  log('Bereich ' + a.von + ' bis ' + a.bis + ' (' + a.projekte.join(', ') + ') gestartet');
  for (const p of a.projekte) {
    await faelligeRunde();
    const edgeOk = await edgeSicher(), aus = { art: 'fehler', tage: {}, grund: edgeGrund };
    const esl = edgeOk ? await eslBereichHolen(p, a.von, a.bis) : aus;
    const liga = edgeOk ? await ligaBereichHolen(p, a.von, a.bis) : aus;
    const V = vortageAblegen(p, a, esl, liga);
    projekte[p] = { nr: V.nr, esl: V.esl, liga: V.liga };
    const gut = ESL_GUT.includes(V.esl.art) && LIGA_GUT.includes(V.liga.art);
    log('Bereich ' + p + ' nr ' + V.nr + ' (' + a.von + ' bis ' + a.bis + '): ESL ' + kurz(V.esl) + ' | Liga ' + kurz(V.liga) + (V.liga.tage ? ', ' + V.liga.tage + ' Tage' : ''));
    wechsel('vortage:' + p, gut, 'Vortage ' + p + ': ESL ' + kurz(V.esl) + ' | Liga ' + kurz(V.liga));
    standSchreiben();
  }
  // Erledigt ist der Tag erst, wenn ESL aller drei Projekte geliefert hat (excel oder leer); Liga haelt ihn nicht auf.
  if (a.quelle === 'vortage' && a.projekte.every((p) => ESL_GUT.includes(projekte[p].esl.art))) { stand.dienst.vortage.tag = a.tag; standSchreiben(); }
  return { ok: a.projekte.every((p) => ESL_GUT.includes(projekte[p].esl.art) && LIGA_GUT.includes(projekte[p].liga.art)), projekte };
}

// Ein Arbeiter. einreihen entdoppelt; eine wartende Runde nimmt die Liga eines spaeteren Wunsches mit.
const WARTET = [];
let arbeitet = false;
function auftrag(a) {
  const w = a.art === 'runde' && WARTET.find((x) => x.art === 'runde');
  if (w) { w.liga = w.liga || !!a.liga; return w; }
  const r = R.einreihen(WARTET, a);
  if (r.neu) a.fertig = new Promise((ja) => { a.erledigt = ja; });
  arbeiten();
  return r.auftrag;
}
async function ausfuehren(a) {
  let erg = null;
  try { erg = a.art === 'runde' ? await rundeFahren(!!a.liga) : a.art === 'abruf' ? await abrufFahren(a.projekt) : await bereichFahren(a); } catch (e) { log('WARNUNG: Auftrag ' + a.art + ' abgebrochen: ' + e.message); }
  a.erledigt(erg);
}
async function faelligeRunde() {
  const i = WARTET.findIndex((x) => x.art === 'runde');
  if (i >= 0) await ausfuehren(WARTET.splice(i, 1)[0]);
}
async function arbeiten() {
  if (arbeitet) return;
  arbeitet = true;
  try { while (WARTET.length) await ausfuehren(WARTET.shift()); } finally { arbeitet = false; }
}
const FRIST = { frist: true };
async function warteAuf(a, fristMs) {
  let uhr;
  const r = await Promise.race([a.fertig, new Promise((ja) => { uhr = setTimeout(() => ja(FRIST), fristMs); })]);
  clearTimeout(uhr);
  return r;
}
function projektSetzen(p, wer) {
  if (stand.aktiv === p) return;
  stand.aktiv = p;
  ereignis('E', 'Aktives Projekt: ' + p + ' (' + wer + ')');
}

// ---------------------------------------------------------------- HTTP
const TYP = {
  html: 'text/html; charset=utf-8', js: 'application/javascript; charset=utf-8', png: 'image/png', text: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
function antworte(res, code, typ, inhalt) {
  res.writeHead(code, { 'Content-Type': typ, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(inhalt);
}
const json = (res, code, obj) => antworte(res, code, TYP.json, JSON.stringify(obj));
async function datei(res, f, typ) {
  let b;
  try { b = await fsp.readFile(f); } catch (e) { return antworte(res, 404, TYP.text, 'Nicht vorhanden'); }
  antworte(res, 200, typ, b);
}
const PLATZHALTER = '<!doctype html><meta charset="utf-8"><title>ESL-Datendienst</title><p>Datendienst l&auml;uft. Die Live-Arena-Seite (ESL_Live_Arena.html) fehlt im Ordner.</p>';
// Eine Seite, die vor dem Cookie geladen wurde (Edge stellt alte Tabs wieder her), versucht es alle 10 s selbst.
const ABGELEHNT = '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="10"><title>ESL-Datendienst</title><p>Nur &uuml;ber ESL_Dienst_Start.cmd erreichbar.</p>';

async function bearbeiten(req, res) {
  if (!R.anfrageErlaubt({ host: req.headers.host, cookie: req.headers.cookie }, GEHEIMNIS, PORT)) {
    return /text\/html/.test(req.headers.accept || '') ? antworte(res, 403, TYP.html, ABGELEHNT) : antworte(res, 403, TYP.text, NUR_DIENST);
  }
  const pfad = new URL(req.url, 'http://127.0.0.1').pathname;
  if (req.method === 'GET') {
    if (pfad === '/') {
      try { return antworte(res, 200, TYP.html, await fsp.readFile(path.join(ORDNER, 'ESL_Live_Arena.html'))); } catch (e) { return antworte(res, 200, TYP.html, PLATZHALTER); }
    }
    if (pfad === '/esl_live_arena_v22.js') return datei(res, path.join(ORDNER, 'esl_live_arena_v22.js'), TYP.js);
    if (pfad === '/regiocom.png') return datei(res, path.join(ORDNER, 'regiocom.png'), TYP.png);
    if (pfad === '/api/stand') return antworte(res, 200, TYP.json, standText);
    if (POSTFACH && pfad === '/api/postfach') return json(res, 200, postfach ? postfach.daten() : { ok: false, grund: 'startet' });
    if (pfad === '/api/liga.json') return datei(res, path.join(DATEN, 'liga.json'), TYP.json);
    if (pfad === '/api/mapping.xlsx') {
      try { return antworte(res, 200, TYP.xlsx, await fsp.readFile(path.join(ORDNER, MAPPING_NAME))); } catch (e) {
        return antworte(res, 503, TYP.text, MAPPING_NAME + (e.code === 'ENOENT' ? ' fehlt im Dienstordner' : ' nicht lesbar (' + (e.code || e.message) + ', in Excel geoeffnet?)'));
      }
    }
    let m = /^\/api\/esl\/(kabel|mobile|um)\.xlsx$/.exec(pfad);
    if (m) return datei(res, path.join(DATEN, 'esl_' + m[1] + '.xlsx'), TYP.xlsx);
    m = /^\/api\/vortage\/(kabel|mobile|um)\.(xlsx|liga\.json)$/.exec(pfad);
    if (m) return datei(res, path.join(DATEN, 'vortage_' + m[1] + (m[2] === 'xlsx' ? '.xlsx' : '_liga.json')), m[2] === 'xlsx' ? TYP.xlsx : TYP.json);
  }
  if (req.method === 'POST' && /^\/api\/(runde|abruf|bereich|projekt)$/.test(pfad)) return post(pfad.slice(5), req, res);
  if (POSTFACH && req.method === 'POST' && pfad === '/api/postfach/aktion') {
    let d;
    try { d = await koerper(req); } catch (e) { return json(res, 400, { ok: false, grund: 'Anfrage nicht lesbar' }); }
    if (!postfach) return json(res, 200, { ok: false, grund: 'startet' });
    return json(res, 200, await postfach.aktion(d));
  }
  antworte(res, 404, TYP.text, 'Nicht gefunden');
}

async function koerper(req) {
  const teile = [];
  let n = 0;
  for await (const c of req) { n += c.length; if (n > 65536) throw new Error('zu gross'); teile.push(c); }
  const t = Buffer.concat(teile).toString('utf8');
  return t ? JSON.parse(t) : {};
}
// Antwortformen nach R5. Frist: {ok:false, grund:'Frist abgelaufen', nr:<aktueller Stand>}.
async function post(was, req, res) {
  let d;
  try { d = await koerper(req); } catch (e) { return json(res, 400, { ok: false, grund: 'Anfrage nicht lesbar' }); }
  if (!d || typeof d !== 'object') d = {};
  const gueltig = (p) => PROJ.includes(p);
  const fehlt = (r, nr) => json(res, 200, { ok: false, grund: r ? 'Frist abgelaufen' : 'Auftrag abgebrochen', nr });
  if (was === 'projekt') {
    if (!gueltig(d.projekt)) return json(res, 400, { ok: false, grund: 'unbekanntes Projekt' });
    projektSetzen(d.projekt, 'Dashboard');
    return json(res, 200, { ok: true });
  }
  if (was === 'runde') {
    if (d.projekt != null && d.projekt !== '' && !gueltig(d.projekt)) return json(res, 400, { ok: false, grund: 'unbekanntes Projekt' });
    if (d.projekt) projektSetzen(d.projekt, 'Jetzt');
    const r = await warteAuf(auftrag({ art: 'runde', liga: true }), 150000);
    if (!r || r.frist) return fehlt(r, stand.nr);
    return json(res, 200, { ok: ESL_GUT.includes(r.esl.art) && (!r.liga || LIGA_GUT.includes(r.liga.art)), nr: r.nr, esl: r.esl, liga: r.liga });
  }
  if (was === 'abruf') {
    if (!gueltig(d.projekt)) return json(res, 400, { ok: false, grund: 'unbekanntes Projekt' });
    const r = await warteAuf(auftrag({ art: 'abruf', projekt: d.projekt }), 150000);
    if (!r || r.frist) return fehlt(r, stand.esl[d.projekt].nr);
    return json(res, 200, { ok: ESL_GUT.includes(r.art), nr: r.nr, art: r.art, grund: r.grund });
  }
  const iso = /^\d{4}-\d{2}-\d{2}$/, projekte = d.projekte == null ? PROJ.slice() : d.projekte;
  if (!iso.test(d.von) || !iso.test(d.bis) || d.von > d.bis || !Array.isArray(projekte) || !projekte.length || !projekte.every(gueltig)) {
    return json(res, 400, { ok: false, grund: 'von/bis (JJJJ-MM-TT) oder projekte ungueltig' });
  }
  const r = await warteAuf(auftrag({ art: 'bereich', von: d.von, bis: d.bis, projekte: [...new Set(projekte)], quelle: 'nutzer' }), 900000);
  if (!r || r.frist) return fehlt(r, stand.nr);
  json(res, 200, r);
}

const server = http.createServer((req, res) => {
  bearbeiten(req, res).catch((e) => {
    log('WARNUNG: Anfrage ' + req.method + ' ' + req.url + ' gescheitert: ' + e.message);
    try { json(res, 500, { ok: false, grund: 'Dienstfehler' }); } catch (x) { /* Antwort lief schon */ }
  });
});

// ---------------------------------------------------------------- Start
function abbruch(text) {
  log(text);
  process.exit(2);
}
function pidLebt(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function sperreSchreiben() {
  try { schreibeAtomar(SPERRE, JSON.stringify({ pid: process.pid, port: PORT, lebenszeichen: Date.now() })); } catch (e) { log('WARNUNG: Sperrdatei nicht geschrieben (' + (e.code || e.message) + ')'); }
}
// Nur die EIGENE Sperre wegraeumen (ein abgewiesener zweiter Start darf die des ersten nicht loeschen).
function sperreWeg() {
  try { if (JSON.parse(fs.readFileSync(SPERRE, 'utf8')).pid === process.pid) fs.unlinkSync(SPERRE); } catch (e) { /* keine eigene Sperre */ }
}

async function start() {
  if (!Array.isArray(EDGE_EXTRA) || !EDGE_EXTRA.every((x) => typeof x === 'string')) abbruch('ESL_DIENST_EDGE_EXTRA ist keine JSON-Liste von Texten - nicht gestartet.');
  fs.mkdirSync(DATEN, { recursive: true });
  // 1. Sperre
  let inhalt = null;
  try { inhalt = fs.readFileSync(SPERRE, 'utf8'); } catch (e) { /* keine Sperre */ }
  if (!R.sperreFrei(inhalt, Date.now(), pidLebt)) {
    const l = JSON.parse(inhalt);
    abbruch('ESL-Datendienst laeuft bereits (PID ' + l.pid + ', Port ' + l.port + ') - zweiter Start abgebrochen.');
  }
  // 2. Andere Steuerer desselben Profils
  const prozesse = await prozesseLesen();
  const k = R.prozessKonflikt(prozesse, process.pid);
  if (k.art === 'tl' || k.art === 'altstarter') abbruch(k.text + ' - er steuert dasselbe Edge-Profil. Erst beenden, dann den Datendienst starten.');
  if (k.art === 'nicht-pruefbar') log('WARNUNG: Konfliktpruefung nicht moeglich (' + k.text + ') - Start trotzdem');
  // 3. Fernsteuerungs-Port und Profil
  const besitzer = await portBesitzer(CDP);
  let edge = 'nicht gestartet';
  if (besitzer === null) {
    if (profilBelegt(PROFIL)) abbruch('Edge-Profil ' + PROFIL + ' ist belegt oder gesperrt: vermutlich laeuft Edge mit diesem Profil ohne Fernsteuerung. Edge ganz schliessen, dann neu starten.');
  } else {
    const z = R.portZustand(besitzer, prozesse, PROFIL);
    if (z === 'fremd') abbruch('Fernsteuerungs-Port ' + CDP + ' gehoert einem fremden Programm (PID ' + besitzer + ', anderes Profil) - nicht gestartet.');
    if (z === 'nicht-pruefbar') log('WARNUNG: Besitzer von Port ' + CDP + ' nicht pruefbar - der Dienst haengt sich an, wenn dort Edge antwortet');
    edge = z === 'eigen' ? 'eigen' : 'nicht pruefbar';
  }
  // 4. Den Port belegen, BEVOR irgendetwas angefasst wird: ein zweiter Start, der durchrutscht, endet hier, ohne das
  // Cookie (Geheimnis des ersten) oder stand.json zu ueberschreiben. Bis das Geheimnis steht, antwortet alles 403.
  try {
    await new Promise((ja, nein) => { server.once('error', nein); server.listen(PORT, '127.0.0.1', ja); });
  } catch (e) {
    abbruch('Port ' + PORT + ' ist belegt (' + (e.code || e.message) + ') - nicht gestartet.');
  }

  GEHEIMNIS = crypto.randomBytes(24).toString('hex');
  stand = standLaden();
  stand.dienst.start = Date.now();
  stand.dienst.runden = 0;
  stand.dienst.edge = edge;
  sperreSchreiben();
  process.on('exit', sperreWeg);
  setInterval(sperreSchreiben, 30000);
  ereignis('E', 'Datendienst gestartet (Port ' + PORT + ', Edge ' + edge + ')');
  if (POSTFACH) {
    stand.postfach = { nr: 0, zeit: 0, ok: false, grund: 'noch nicht gelesen' };
  }
  standSchreiben();          // vor dem Cookie: wer das neue Geheimnis hat, bekommt sofort einen vollstaendigen Stand
  if (besitzer !== null) {
    await flagsPruefen(besitzer, prozesse);
    await cookieAktuell();   // die schon offene Seite bekommt das neue Geheimnis
  }
  log('Datendienst laeuft: ' + DASH_URL + ' | Edge-Port ' + CDP + ' | Profil ' + PROFIL + ' | Daten ' + DATEN + ' | Takt ' + TAKT_SEK + ' s, Liga jede ' + LIGA_JEDE + '. Runde | Postfach ' + (POSTFACH ? 'an' : 'aus'));
  // Eigener Zeitgeber, nicht in der Warteschlange: Outlook verzoegert nie ESL oder Ligaliste.
  // stand.json traegt nur den Kopf (nr, zeit, ok, grund), nie Inhalte.
  if (POSTFACH) {
    postfach = postfachStarten({
      datei: path.join(ORDNER, 'Postfach_Wichtig.txt'), leser: POSTFACH_LESER, aktionSkript: POSTFACH_AKTION,
      taktSek: POSTFACH_TAKT_SEK, fristMs: 60000, aktionFristMs: 30000, log,
      beiLieferung: (k) => {
        k.grund = sauber(k.grund);
        stand.postfach = k;
        wechsel('postfach', k.ok, k.ok ? 'Postfach: Outlook gelesen' : 'Postfach: ' + k.grund);
        standSchreiben(true);
      }
    });
  }
  auftrag({ art: 'runde' });
  setInterval(() => auftrag({ art: 'runde' }), TAKT_SEK * 1000);   // reiht nur ein, wenn keine Runde wartet
  // Laengste stille Phase eines Auftrags ist ein Projektschritt (ESL 240 s + Liga 330 s); 20 Min ohne Stand = Haenger.
  // Beenden mit Code 3, ESL_Dienst_Start.cmd startet neu (Ursache zweier Haenger in Messungen ungeklaert).
  setInterval(() => {
    if (!arbeitet || Date.now() - fortschritt < 20 * 60000) return;
    log('FEHLER: Arbeiter steht seit ' + Math.round((Date.now() - fortschritt) / 60000) + ' Min ohne Fortschritt - Dienst beendet sich, der Starter startet ihn neu');
    process.exit(3);
  }, 60000);
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => { log('Datendienst beendet (' + sig + ')'); process.exit(0); });
process.on('uncaughtException', (e) => log('WARNUNG: unerwarteter Fehler: ' + ((e && e.stack) || e)));
process.on('unhandledRejection', (e) => log('WARNUNG: unbehandelte Ablehnung: ' + ((e && e.message) || e)));
start().catch((e) => { log('Start gescheitert: ' + ((e && e.stack) || e)); process.exit(2); });
