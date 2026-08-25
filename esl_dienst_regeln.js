/* ============================================================================
   ESL-DIENST: REINE REGELN
   ---------------------------------------------------------------------------
   Alles, was der Datendienst ENTSCHEIDET, ohne etwas zu tun: keine Datei, kein
   Netz, kein Prozess, keine Uhr (die Zeit kommt als Argument). Die anderen
   Dienstmodule rufen das hier auf und bleiben dadurch duenn.

   Geprueft von pruefwerkzeuge/dienst_regeln_pruefen.js. Zeiten sind
   Millisekunden (Date.now()), Datumsangaben ISO-Strings 'YYYY-MM-DD'.
============================================================================ */
'use strict';

const PROJEKTE = ['kabel', 'mobile', 'um'];

// ---------- Datum ----------
const pad2 = (n) => (n < 10 ? '0' : '') + n;
function datumIso(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function isoZuDe(iso) { const [j, m, t] = iso.split('-'); return t + '.' + m + '.' + j; }
function isoZuYmd(iso) { return iso.split('-').join(''); }

// Vortage, die Woche UND Monat brauchen: ab dem FRUEHEREN von Monatsanfang und
// Montag dieser Woche (am Do 01.10. liegt der Montag im Vormonat), bis gestern.
// Nur der Montag reichte am 27.10. nicht: der Rest des Monats fehlte.
function vortageBereich(heute) {
  const y = heute.getFullYear(), m = heute.getMonth(), d = heute.getDate();
  const montag = new Date(y, m, d - (heute.getDay() + 6) % 7);
  const monat = new Date(y, m, 1);
  const von = datumIso(montag < monat ? montag : monat);
  const bis = datumIso(new Date(y, m, d - 1));
  return von > bis ? null : { von, bis };
}

// ---------- Takte und Deckel ----------
function ligaFaellig(rundeNr, jede) { return jede <= 1 || rundeNr % jede === 0; }

// merk = { tag: letzter ERLEDIGTER Tag, versuchUm: letzter Versuch (auch ein
// gescheiterter) }. Erledigt gilt erst, wenn alle drei Projekte geliefert haben
// (das entscheidet der Aufrufer, wenn er merk.tag setzt).
function vortageFaellig(heuteIso, merk, jetzt, wiederholMin = 60) {
  if (!merk) return true;
  if (merk.tag === heuteIso) return false;
  return !(merk.versuchUm && jetzt - merk.versuchUm < wiederholMin * 60e3);
}

// Kontosperr-Schutz: hoechstens max abgeschickte Anmeldungen im Fenster.
function anmeldungErlaubt(zeiten, jetzt, max = 3, fensterMin = 30) {
  return zeiten.filter((z) => jetzt - z < fensterMin * 60e3).length < max;
}

function ligaErsatzErlaubt(letzter, jetzt, abstandMin = 10) {
  return !letzter || jetzt - letzter >= abstandMin * 60e3;
}

// seit = wann die Fehlerseite des Browsers zuerst gesehen wurde (null = nicht dort).
function fehlerseiteNeuladen(seit, jetzt, warteSek = 20) {
  return seit != null && jetzt - seit >= warteSek * 1000;
}

// ---------- Antwort der Ligaliste ----------
// Reihenfolge wie verwerteAntwort in kpi_crawler.js. Ein 200 ohne Tabelle und
// ohne Fehlermuster (dort 'keine-tabelle') ist UNBEKANNT, keine ehrliche
// leere Antwort: es wird 'http', damit der Baum als nicht geliefert gilt statt
// als rows: [] (sonst fielen seine Agenten still aus dem Bestand). 'leer' gibt es
// nur MIT Tabelle und 0 Zeilen.
function ligaAntwortArt({ status, auszug, hatTabelle, zeilen }) {
  if (status === 401 || status === 403) return 'sitzung-tot';
  if (!hatTabelle) {
    const text = String(auszug || '');
    if (/ORA-\d{5}/.test(text)) return 'ora';
    if (/keine Berechtigung|Sitzung|password|login/i.test(text)) return 'sitzung-tot';
  }
  if (status !== 200 || !hatTabelle) return 'http';
  return zeilen > 0 ? 'ok' : 'leer';
}

// jeBaum[p] = { rows: object[]|null, zeit, art, grund }. Gleiche ccsId in zwei
// Baeumen: das groessere callCount gewinnt (bei Gleichstand der frueheren Baum).
function ligaZusammenfuehren(jeBaum) {
  const platz = new Map(), payload = [], fehlend = [];
  for (const p of PROJEKTE) {
    const rows = jeBaum && jeBaum[p] && jeBaum[p].rows;
    if (!Array.isArray(rows)) { fehlend.push(p); continue; }
    for (const r of rows) {
      const neu = Object.assign({}, r, { projekt: p });
      const i = r.ccsId == null ? undefined : platz.get(r.ccsId);
      if (i === undefined) {
        if (r.ccsId != null) platz.set(r.ccsId, payload.length);
        payload.push(neu);
      } else if ((r.callCount || 0) > (payload[i].callCount || 0)) payload[i] = neu;
    }
  }
  return { payload, vollstaendig: fehlend.length === 0, fehlend };
}

// ---------- Auftraege ----------
// Gleicher Schluessel = gleiche Arbeit. Quelle und Reihenfolge der Projekte
// gehoeren bewusst nicht dazu.
function auftragSchluessel(a) {
  return [a.art, a.projekt || '', a.liga ? 'liga' : '', a.von || '', a.bis || '',
    (a.projekte || []).slice().sort().join(',')].join('|');
}

// Haengt an die Liste an (veraendert sie), ausser dieselbe Arbeit wartet schon.
function einreihen(liste, auftrag) {
  const k = auftragSchluessel(auftrag);
  const da = liste.find((x) => auftragSchluessel(x) === k);
  if (da) return { neu: false, auftrag: da };
  liste.push(auftrag);
  return { neu: true, auftrag };
}

// ---------- Edge ----------
const FLAGS_PFLICHT = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const FEATURES_PFLICHT = ['Translate', 'IntensiveWakeUpThrottling', 'CalculateNativeWinOcclusion'];
const FEATURES_ARG = '--disable-features=';

// --disable-features darf nur EINMAL vorkommen: ein zweites ueberschreibt das
// erste vollstaendig. Extra-Listen werden deshalb in die eine Liste gemischt.
// Nichts wird gequotet (die Argumente gehen als Feld an spawn). Die Adressen
// stehen zuletzt. Kein --remote-allow-origins, kein --disable-popup-blocking.
function edgeArgumente({ port, profil, cacheDir, extra = [], urls = [] }) {
  const features = FEATURES_PFLICHT.slice();
  const sonst = [];
  for (const x of extra) {
    if (!x.startsWith(FEATURES_ARG)) { sonst.push(x); continue; }
    for (const f of x.slice(FEATURES_ARG.length).split(',')) if (f.trim() && !features.includes(f.trim())) features.push(f.trim());
  }
  return [
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profil,
    '--no-first-run', '--no-default-browser-check',
    ...(cacheDir ? ['--disk-cache-dir=' + cacheDir, '--disk-cache-size=314572800'] : []),
    ...FLAGS_PFLICHT,
    FEATURES_ARG + features.join(','),
    ...sonst,
    ...urls
  ];
}

// Drei Zustaende: erfuellt / verletzt / nicht pruefbar ("nicht messbar" ist nie
// "in Ordnung"). Bei zwei --disable-features gilt nur die letzte Liste, welche
// Features fehlen, ist dann nebensaechlich - der Fehler ist das Doppelte.
function flagZustand(kommandozeile) {
  if (!kommandozeile) return { zustand: 'nicht-pruefbar', fehlt: [] };
  const fehlt = [];
  for (const f of FLAGS_PFLICHT) if (!new RegExp('(^|[\\s"])' + f + '(?=[\\s"]|$)').test(kommandozeile)) fehlt.push(f);
  const listen = [...kommandozeile.matchAll(/--disable-features=("?)([^"\s]*)\1/g)].map((m) => m[2]);
  if (listen.length > 1) fehlt.push('disable-features doppelt');
  else {
    const drin = (listen[0] || '').split(',');
    for (const f of FEATURES_PFLICHT) if (!drin.includes(f)) fehlt.push('disable-features: ' + f);
  }
  return { zustand: fehlt.length ? 'verletzt' : 'erfuellt', fehlt };
}

// Windows-Kommandozeile in Argumente zerlegen; Anfuehrungszeichen schalten nur um
// (tolerant: kein Sonderfall fuer \" , ein Schlussstrich im Pfad bleibt harmlos).
function argumente(zeile) {
  const out = [];
  let cur = '', q = false;
  for (const c of zeile) {
    if (c === '"') q = !q;
    else if (/\s/.test(c) && !q) { if (cur) out.push(cur); cur = ''; }
    else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}
const pfadNorm = (p) => p.toLowerCase().replace(/\//g, '\\').replace(/\\+$/, '');

// Wer hoert auf dem Debug-Port? listenerPid null = niemand. Das Profil im
// Listener-Prozess muss unseres sein, sonst haengt sich der Dienst in fremdes Edge.
function portZustand(listenerPid, prozesse, profil) {
  if (listenerPid == null) return 'frei';
  if (!Array.isArray(prozesse)) return 'nicht-pruefbar';
  const p = prozesse.find((x) => x.ProcessId === listenerPid);
  if (!p || !p.CommandLine) return 'nicht-pruefbar';
  const arg = argumente(p.CommandLine).find((a) => a.startsWith('--user-data-dir='));
  return arg && pfadNorm(arg.slice('--user-data-dir='.length)) === pfadNorm(profil) ? 'eigen' : 'fremd';
}

// ---------- Start: Konflikte und Sperre ----------
const TL_RE = /TL_Starter|tl_dienst\.js/i;
const ALTSTARTER_RE = /ESL_Start(_Mobile|_UM)?\.(cmd|ps1)/i;

// prozesse = [{ProcessId, Name, CommandLine}] oder null (nicht lesbar). Der eigene
// Prozess zaehlt nicht. Lauter leere Kommandozeilen heisst: nicht pruefbar.
function prozessKonflikt(prozesse, eigenePid) {
  if (!Array.isArray(prozesse)) return { art: 'nicht-pruefbar', text: 'Prozessliste nicht lesbar' };
  const andere = prozesse.filter((p) => p.ProcessId !== eigenePid);
  if (andere.length && !andere.some((p) => p.CommandLine)) return { art: 'nicht-pruefbar', text: 'Kommandozeilen nicht lesbar' };
  for (const [art, re, wer] of [['tl', TL_RE, 'TL-Dienst'], ['altstarter', ALTSTARTER_RE, 'Alter Starter']]) {
    const p = andere.find((x) => re.test(x.CommandLine || ''));
    if (p) return { art, text: wer + ' laeuft (PID ' + p.ProcessId + ', ' + p.Name + ')' };
  }
  return { art: null, text: 'kein Konflikt' };
}

const LEBENSZEICHEN_MS = 180e3;

// inhalt = Text der Sperrdatei {pid, port, lebenszeichen} oder null. Belegt nur,
// wenn das Lebenszeichen frisch ist UND der Prozess noch lebt. pidLebt: bool
// oder Funktion (pid) -> bool.
function sperreFrei(inhalt, jetzt, pidLebt) {
  if (!inhalt) return true;
  let l;
  try { l = JSON.parse(inhalt); } catch (e) { return true; }
  if (!l || !(jetzt - l.lebenszeichen < LEBENSZEICHEN_MS)) return true;
  return !(typeof pidLebt === 'function' ? pidLebt(l.pid) : pidLebt);
}

// ---------- Anfragen an den Dienst ----------
// Host genau 127.0.0.1:<port> (gegen DNS-Rebinding) und das Cookie rcDienst.
// shortcut: einfacher Vergleich statt timingSafeEqual, Loopback-Dienst, bei Fernzugriff nachruesten.
function anfrageErlaubt({ host, cookie }, geheimnis, port) {
  if (!geheimnis || host !== '127.0.0.1:' + port) return false;
  return String(cookie || '').split(';').some((c) => c.trim() === 'rcDienst=' + geheimnis);
}

module.exports = {
  PROJEKTE, datumIso, isoZuDe, isoZuYmd, vortageBereich,
  ligaFaellig, vortageFaellig, anmeldungErlaubt, ligaErsatzErlaubt, fehlerseiteNeuladen,
  ligaAntwortArt, ligaZusammenfuehren, auftragSchluessel, einreihen,
  edgeArgumente, flagZustand, portZustand, prozessKonflikt, sperreFrei, anfrageErlaubt
};
