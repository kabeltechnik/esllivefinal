/* ============================================================================
   ESL-DIENST: LIGA-ABRUF
   ---------------------------------------------------------------------------
   Faehrt den Ligalisten-Tab (ccs.vodafone.de) ueber die Fernsteuerung: je Takt
   eine Intraday-Abfrage je Referenzbaum (Kabel, Mobile, UM), Vortage ueber
   user_defined/day, Hilfe bei der Microsoft-Anmeldung davor und die Heilung
   (Fehlerseite des Browsers, tote Sitzung -> Tab ersetzen). Der Dienst-Kern
   ruft ligaRunde im Takt.

   Abfrage und Tabellen-Lesen laufen ueber die ORIGINAL-Funktionen aus
   kpi_crawler.js (baueAbfrage, parseKpiTable, snapshotOf, datumKey; Buendel
   aus esl_dienst_buendel.js), nicht ueber einen Nachbau. Das Buendel lebt im
   Dokument und wird vor jeder Abfrage geprueft und bei Bedarf eingespielt.

   Seitenfunktionen (...InSeite) sind echte Funktionen dieses Moduls (node
   --check erfasst sie) und laufen per s.seite(fn, arg) IM Tab - sie duerfen
   nichts aus dem Modul benutzen. Jedes Warten hat eine Frist. Von den
   Anmeldefeldern verlassen nur Laengen die Seite, nie Werte; von Adressen nur
   Ursprung + Pfad (Microsoft-Ruecksprungadressen tragen state, code, login_hint).
   merk gehoert dem Aufrufer, EINES je Tab (ein neuer Tab bekommt ein neues):
   { fehlerSeit, msZeiten, msVorschlag, msWeiterUm, msWarum }.
   AUSNAHME msZeiten (Zeitpunkte der Microsoft-Absendungen): gilt DIENSTWEIT -
   der Aufrufer reicht das Array beim Ersetzen des Tabs ins neue merk weiter
   (merk = { msZeiten: alt.msZeiten }). Nur so bleibt es bei hoechstens 2
   Absendungen je 30 Min; ein Zaehler je Tab erlaubte bei falschem Kennwort und
   Tab-Ersatz alle 10 Min bis zu 12 echte Fehlversuche je Stunde (Kontosperre).
   Sitzungsbudget: ligaRunde braucht im schlechtesten Fall 3 x 100 s (Abfrage-
   frist je Baum) plus Laden - die Sitzung (mitSitzung) entsprechend bemessen.
   Geprueft von pruefwerkzeuge/dienst_messen.mjs (fall=liga) gegen die
   Schein-Ligaliste.
============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { echterKlick, taste } = require('./esl_dienst_cdp');
const { ligaBuendel } = require('./esl_dienst_buendel');
const { PROJEKTE, isoZuYmd, fehlerseiteNeuladen, ligaAntwortArt, anmeldungErlaubt } = require('./esl_dienst_regeln');

const LIGA_PFAD = '/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/liga_listen.rb?script_id=11035';
const GET_DATA_PFAD = '/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/scripts/get_data.rb';
const KPI = path.join(__dirname, 'kpi_crawler.js');
const ABFRAGE_FRIST = 90000;                 // fetch samt Lesen der Antwort (wie ABRUF_FRIST_MS im Crawler)
const VORTAG_FIGUREN = '10004,10006';         // ACD, AHT: traegt den Call-Nenner, sonst nichts
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- Buendel
// Neu geschnitten nur, wenn sich kpi_crawler.js geaendert hat.
let buendel = null;
function buendelHolen() {
  const mtime = fs.statSync(KPI).mtimeMs;
  if (!buendel || buendel.mtime !== mtime) {
    const text = ligaBuendel(fs.readFileSync(KPI, 'utf8'));
    buendel = { mtime, text, version: (/\.version === '([0-9a-f]+)'/.exec(text) || [])[1] };
  }
  return buendel;
}
async function buendelSicher(s) {
  const b = buendelHolen();
  if (!await s.seite((v) => !!(window.__rcDienstLiga && window.__rcDienstLiga.version === v), b.version)) await s.auswerten(b.text);
}

// ---------------------------------------------------------------- Navigation (wie in esl_dienst_esl.js)
// Wartet auf ein NEUES, fertig geladenes Dokument: die Marke im alten verschwindet mit ihm.
async function neuesDokument(s, ausloesen, fristMs = 15000) {
  try { await s.seite(() => { window.__rcDienstAltDok = 1; }, null, 3000); } catch (e) { /* Seite wechselt schon */ }
  await ausloesen();
  return geladen(s, fristMs, true);
}
// Ein frisch angelegter Tab steht zuerst auf about:blank (fertig geladen) - das ist noch nicht die Seite.
async function geladen(s, fristMs = 15000, neu = false) {
  for (const bis = Date.now() + fristMs; Date.now() < bis; await warte(250)) {
    try {
      if (await s.seite((n) => document.readyState === 'complete' && location.href !== 'about:blank' && !(n && window.__rcDienstAltDok), neu, 3000)) return true;
    } catch (e) { /* Dokument wechselt */ }
  }
  return false;
}

// ---------------------------------------------------------------- Zustand
// Microsoft-Teil wie MsZustand in ESL_Start.cmd. Das Kennwortfeld liegt in der E-Mail-Maske schon im
// DOM, nur per "moveOffScreen" ausserhalb des Bildes: nur ein BRAUCHBARES Feld zaehlt.
function zustandInSeite() {
  const brauchbar = (el) => {
    if (!el || /moveoffscreen/i.test(String(el.className || ''))) return false;
    const r = el.getBoundingClientRect();
    if (!r || r.width <= 1 || r.height <= 1 || r.right <= 0 || r.bottom <= 0) return false;
    if (r.left > (window.innerWidth || 4000) || r.top > (window.innerHeight || 4000)) return false;
    try { const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none') return false; } catch (e) { /* ohne Stil */ }
    return true;
  };
  const mitte = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
  // ECHTES Tippen des Nutzers mitschreiben: der Fokus allein beweist nichts (Microsoft setzt ihn selbst ins Feld).
  if (!window.__rcTastenHorcher) {
    window.__rcTastenHorcher = 1;
    document.addEventListener('keydown', (e) => { if (e && e.isTrusted) window.__rcLetzteTaste = Date.now(); }, true);
  }
  const fehlerseite = location.protocol === 'chrome-error:' || location.hostname === 'chromewebdata';
  const code = document.querySelector('.error-code');
  const mail = document.getElementById('i0116') || document.querySelector('input[type=email],input[name=loginfmt]');
  const pw = Array.from(document.querySelectorAll('input[type=password]')).find(brauchbar) || null;
  const af = document.activeElement;
  const ms = {
    imFeld: !!(af && (af.tagName === 'INPUT' || af.tagName === 'TEXTAREA')),
    tippt: !!(window.__rcLetzteTaste && Date.now() - window.__rcLetzteTaste < 5000),
    mailDa: false, mailLeer: false, pwDa: !!pw, pwLen: pw ? (pw.value || '').length : -1
  };
  if (mail && brauchbar(mail)) { ms.mailDa = true; ms.mailLeer = !(mail.value || '').length; ms.mailPos = mitte(mail); }
  if (pw) ms.pwPos = mitte(pw);
  const weiter = document.getElementById('idSIButton9');   // "Weiter"/"Anmelden"/"Ja": auf allen Masken derselbe Knopf
  if (weiter && brauchbar(weiter)) { ms.btnPos = mitte(weiter); ms.btnAus = !!weiter.disabled; }
  ms.maske = (document.getElementById('idRichContext_DisplaySign') || document.getElementById('idRemoteNGC_DisplaySign')) ? 'Authenticator-Bestaetigung'
    : document.getElementById('idBtn_Back') ? 'Angemeldet bleiben?' : ms.pwDa ? 'Passwort' : ms.mailDa ? 'E-Mail' : '';
  // Ziel ist das Feld der Maske: Kennwortfeld, auf der E-Mail-Maske das Mailfeld (Microsoft setzt den Fokus dort selbst hinein).
  ms.zielFokus = !!af && ((!!pw && af === pw) || (ms.maske === 'E-Mail' && af === mail));
  const t = document.getElementById('script_id_secure');
  return {
    href: location.origin + location.pathname, fehlerseite,
    fehlerCode: fehlerseite && code ? code.textContent.trim() : '',
    ms: ms.maske ? ms : null,
    token: !!(t && t.value)
  };
}
function ligaZustand(s) { return s.seite(zustandInSeite); }

// ---------------------------------------------------------------- Microsoft-Anmeldung
// Wie HilfMsAnmeldung in ESL_Start.cmd: EIN Handgriff je Aufruf, alle als echte Geste (ein click() aus
// JavaScript ist untrusted, Edge gaebe das gespeicherte Kennwort dann nicht frei). Der Dienst tippt NIE
// eine Adresse oder ein Kennwort ein. Liefert '', steht der Grund in merk.msWarum.
async function ligaMsHilfe(s, merk) {
  const z = (await ligaZustand(s)).ms, jetzt = Date.now();
  const nichts = (warum) => { merk.msWarum = warum; return ''; };
  if (!z) return nichts('keine Anmeldemaske');
  if (z.tippt) return nichts('Nutzer tippt gerade, nichts angefasst');
  // "Angemeldet bleiben?" hat kein Textfeld (Fokus liegt auf dem Haken "Nicht mehr anzeigen") - dort sperrt nur echtes Tippen.
  if (z.imFeld && !z.zielFokus && z.maske !== 'Angemeldet bleiben?') return nichts('Fokus steht in einem anderen Eingabefeld, nichts angefasst');
  if (z.maske === 'Authenticator-Bestaetigung') return nichts('wartet auf die Bestaetigung in der Authenticator-App');
  if (z.maske === 'Angemeldet bleiben?') {
    if (!z.btnPos) return nichts('Knopf "Ja" nicht bedienbar');
    await neuesDokument(s, () => echterKlick(s, z.btnPos.x, z.btnPos.y));
    return 'kmsi';
  }
  if (z.maske === 'Passwort') {
    // Kennwort fuer JS gesperrt: INS FELD klicken (der neutrale Klick reichte auf dieser Seite nachweislich nicht).
    if (z.pwLen === 0) { await echterKlick(s, z.pwPos.x, z.pwPos.y); return 'freigabe'; }
    if (!z.btnPos || z.btnAus) return nichts('Anmeldeknopf nicht bedienbar');
    // DIENSTWEIT hoechstens 2 Absendungen je 30 Min (R8): Fehlanmeldungen koennen das Konto sperren.
    merk.msZeiten = merk.msZeiten || [];
    if (!anmeldungErlaubt(merk.msZeiten, jetzt, 2, 30)) return nichts('Absende-Deckel erreicht (2 Absendungen in 30 Min, dienstweit), nichts abgeschickt');
    merk.msZeiten.push(jetzt);                        // vor dem Klick: ein abgerissener Klick zaehlt lieber einmal zu viel
    if (merk.msZeiten.length > 10) merk.msZeiten.splice(0, merk.msZeiten.length - 10);   // im Array selbst: der Aufrufer haelt es
    // Warten, bis die Maske weg ist: eine Runde direkt danach saehe sonst das alte Formular und schickte doppelt.
    await neuesDokument(s, () => echterKlick(s, z.btnPos.x, z.btnPos.y));
    return 'absenden';
  }
  // E-Mail-Maske (R9). Adresse steht (vom Konto vorbelegt): "Weiter" - keine Kennwort-Absendung, also nicht
  // unter dem Deckel, aber hoechstens alle 6 s. Microsoft wechselt danach meist OHNE neues Dokument zur Kennwort-Maske.
  if (!z.mailLeer) {
    if (!z.btnPos || z.btnAus) return nichts('Knopf "Weiter" nicht bedienbar');
    if (merk.msWeiterUm && jetzt - merk.msWeiterUm < 6000) return nichts('"Weiter" vor weniger als 6 s geklickt, warte');
    merk.msWeiterUm = jetzt;
    await echterKlick(s, z.btnPos.x, z.btnPos.y);
    for (const bis = Date.now() + 5000; Date.now() < bis; await warte(250)) {
      try { const m = (await ligaZustand(s)).ms; if (!m || m.maske !== 'E-Mail') break; } catch (e) { /* Dokument wechselt */ }
    }
    return 'weiter';
  }
  // E-Mail leer: Edges eigene Vorschlagsliste (Browser-UI, nicht im DOM) nur per Tastatur. Hoechstens EINMAL
  // je Tab - bei geschlossener Liste wirkt das Enter als Absenden. Nur auf der E-Mail-Maske: auf einer
  // Kennwort-Maske mit Mailfeld schickte das Enter das Kennwort am Deckel vorbei ab.
  if (merk.msVorschlag) return nichts('E-Mail-Feld leer, Edges Vorschlag schon versucht - Adresse bitte von Hand eintragen');
  merk.msVorschlag = true;
  await echterKlick(s, z.mailPos.x, z.mailPos.y);
  await warte(500);
  await taste(s, 'ArrowDown');
  await warte(300);
  await taste(s, 'Enter');
  return 'vorschlag';
}

// ---------------------------------------------------------------- Abfrage
// Baut die Abfrage mit der ORIGINAL-baueAbfrage (Token und Kennung aus der Seite), schickt sie mit Frist
// und liest die Tabelle mit parseKpiTable. Das Ergebnis bleibt als JSON in der Seite (grossHolen).
async function abfrageInSeite(a) {
  const d = window.__rcDienstLiga, erg = { status: 0, auszug: '', hatTabelle: false, zeilen: 0, rows: [] };
  const tok = document.getElementById('script_id_secure'), uid = document.getElementById('user_id');
  if (!tok || !tok.value) erg.keinToken = true;
  else {
    window.__rcLastGetData = { body: new URLSearchParams({ script_id: '11035', script_id_secure: tok.value, user_id: uid ? uid.value : '' }).toString() };
    const p = d.baueAbfrage(a.projekt, a.daterange, a.interval, { startdate: a.startdate, enddate: a.enddate });
    if (a.figuren) p.set('figure_list', a.figuren);
    const ctl = new AbortController(), uhr = setTimeout(() => ctl.abort(), a.frist);
    try {
      const r = await fetch(a.url, {
        method: 'POST', credentials: 'include', signal: ctl.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: p.toString()
      });
      const text = await r.text();
      erg.status = r.status;
      erg.auszug = text.slice(0, 4000);
      const html = d.extractTableHtml(text);
      const doc = html && new DOMParser().parseFromString(html, 'text/html');
      const table = doc && (doc.querySelector('table#result-table') || doc.querySelector('table'));
      if (table) { erg.hatTabelle = true; erg.rows = d.parseKpiTable(table); erg.zeilen = erg.rows.length; }
    } catch (e) {
      erg.auszug = 'Abruf gescheitert: ' + (ctl.signal.aborted ? 'keine Antwort nach ' + Math.round(a.frist / 1000) + ' s' : ((e && e.message) || e));
    } finally { clearTimeout(uhr); }
    if (a.jeTag) {
      const gruppen = {};
      erg.rows.forEach((r) => { const k = d.datumKey(r.datum); if (k) (gruppen[k] = gruppen[k] || []).push(r); });
      erg.tage = {};
      Object.keys(gruppen).forEach((k) => { erg.tage[k] = Object.assign(d.snapshotOf(gruppen[k]), { nurCalls: true }); });
      erg.rows = [];
    }
  }
  window.__rcDienstLigaWert = JSON.stringify(erg);
  return window.__rcDienstLigaWert.length;
}
// Der eingebaute WebSocket von Node bricht Nachrichten ab, die entpackt groesser als 4 MiB sind (siehe
// esl_dienst_esl.js, eslExport). Das Ergebnis bleibt deshalb in der Seite und kommt in 1-MiB-Stuecken.
const STUECK = 1 << 20;
async function grossHolen(s, fn, arg, frist) {
  try {
    const laenge = await s.seite(fn, arg, frist);
    const teile = [];
    for (let i = 0; i < laenge; i += STUECK) teile.push(await s.seite((a) => window.__rcDienstLigaWert.slice(a.von, a.bis), { von: i, bis: i + STUECK }));
    const text = teile.join('');
    if (text.length !== laenge) throw new Error('Liga-Antwort unvollstaendig (' + text.length + ' von ' + laenge + ' Zeichen)');
    return JSON.parse(text);
  } finally {
    try { await s.seite(() => { delete window.__rcDienstLigaWert; }); } catch (e) { /* Seite schon weg */ }
  }
}

function antwortGrund(art, r) {
  if (art === 'ok') return '';
  if (art === 'leer') return 'Ligaliste liefert 0 Zeilen';
  if (art === 'ora') return 'Portal-Fehler: ' + (/ORA-\d{5}[^<\n"]*/.exec(r.auszug) || [''])[0].trim();
  if (art === 'sitzung-tot') return r.status === 401 || r.status === 403 ? 'Sitzung abgelaufen (HTTP ' + r.status + ')' : 'Sitzung abgelaufen / keine Berechtigung';
  if (r.status === 0) return r.auszug || 'keine Antwort';
  return r.status !== 200 ? 'HTTP ' + r.status : 'Antwort ohne Tabelle';
}

// o = { projekt, daterange, interval, startdate, enddate, figuren, jeTag }. jeTag (fuer ligaBereich): statt rows
// je Tag ein snapshotOf mit nurCalls - die Zeilen eines Monats muessen dann nicht durch die Leitung.
async function ligaAbfrage(s, o) {
  await buendelSicher(s);
  const r = await grossHolen(s, abfrageInSeite, Object.assign({ url: GET_DATA_PFAD, frist: ABFRAGE_FRIST }, o), ABFRAGE_FRIST + 10000);
  if (r.keinToken) return { art: 'fehler', grund: 'Ligaliste ohne Token (Seite nicht geladen oder Anmeldung offen)' };
  const art = ligaAntwortArt(r);
  const out = { art, status: r.status, grund: antwortGrund(art, r) };
  if (art === 'ok' || art === 'leer') { if (o.jeTag) out.tage = r.tage; else out.rows = r.rows; }
  return out;
}

// Intraday je Baum, nacheinander. rows nur bei ok/leer, sonst null: ein nicht gelieferter Baum darf nicht
// als "leer" in den Bestand (ligaZusammenfuehren nennt ihn dann fehlend).
async function ligaLive(s) {
  const jeBaum = {};
  for (const p of PROJEKTE) {
    let r;
    try { r = await ligaAbfrage(s, { projekt: p, daterange: 'intraday', interval: 'cumulate' }); } catch (e) { r = { art: 'fehler', grund: 'Abfrage abgebrochen: ' + ((e && e.message) || e) }; }
    jeBaum[p] = { art: r.art, rows: r.rows || null, zeit: Date.now(), grund: r.grund || '' };
  }
  return jeBaum;
}

// Vortage von..bis (ISO) eines Baums; je Tag ein Snapshot nur mit Calls (Figuren ACD, AHT).
async function ligaBereich(s, projekt, von, bis) {
  try {
    const r = await ligaAbfrage(s, { projekt, daterange: 'user_defined', interval: 'day', startdate: isoZuYmd(von), enddate: isoZuYmd(bis), figuren: VORTAG_FIGUREN, jeTag: true });
    return { art: r.art, tage: r.tage || {}, grund: r.grund };
  } catch (e) {
    return { art: 'fehler', tage: {}, grund: 'Liga-Bereich abgebrochen: ' + ((e && e.message) || e) };
  }
}

// ---------------------------------------------------------------- Pflege
// Web Lock: Edge friert eine Seite mit gehaltenem Lock nicht ein. Nie zurueckgegeben, faellt mit der Seite.
function pflegeInSeite(name) {
  if (!window.__rcWachLock && navigator.locks && navigator.locks.request) {
    window.__rcWachLock = { name, seit: Date.now() };
    navigator.locks.request(name, () => new Promise(() => {})).catch(() => { window.__rcWachLock = null; });
  }
  return { lock: !!window.__rcWachLock };
}
function ligaPflege(s, name = 'rc_wach_dienst_liga') { return s.seite(pflegeInSeite, name); }

// ---------------------------------------------------------------- Runde
const MS_TAT = {
  kmsi: '"Angemeldet bleiben?" bestaetigt', freigabe: 'ins Kennwortfeld geklickt (Freigabe des gespeicherten Kennworts)',
  absenden: 'Anmeldung echt abgeschickt', vorschlag: 'gespeicherten Zugang aus Edges Vorschlagsliste uebernommen',
  weiter: 'Adresse steht, "Weiter" geklickt'
};
// Ohne Handgriff nennt ligaMsHilfe den tatsaechlichen Grund in merk.msWarum (Fokus, Tippen, Deckel ...).
function msGrund(ms, tat, merk) {
  return 'Microsoft-Anmeldung (' + ms.maske + '): ' + (MS_TAT[tat] || merk.msWarum || 'nichts zu tun');
}

// -> { jeBaum: {kabel, mobile, um}|null, grund, ersetzen }. ersetzen: ein Baum meldet eine tote Sitzung - der
// Aufrufer ersetzt den Tab (gedeckelt ueber ligaErsatzErlaubt).
async function ligaRunde(s, merk) {
  const nichts = (grund) => ({ jeBaum: null, grund, ersetzen: false });
  try {
    await geladen(s);
    let z = await ligaZustand(s);
    if (z.fehlerseite) {
      const jetzt = Date.now(), code = z.fehlerCode || 'ohne Code';
      if (merk.fehlerSeit == null) merk.fehlerSeit = jetzt;
      if (!fehlerseiteNeuladen(merk.fehlerSeit, jetzt)) return nichts('Fehlerseite des Browsers (' + code + '), Neuladen nach 20 s');
      await neuesDokument(s, () => s.befehl('Page.reload', { ignoreCache: true }), 20000);
      z = await ligaZustand(s);
      if (z.fehlerseite) { merk.fehlerSeit = Date.now(); return nichts('Fehlerseite des Browsers (' + code + '), neu geladen, Portal weiter nicht erreichbar'); }
    }
    merk.fehlerSeit = null;
    if (z.ms) return nichts(msGrund(z.ms, await ligaMsHilfe(s, merk), merk));
    // Nach der Anmeldung landet CCS auf seiner Startseite (LOGIN/start.rb) und bleibt dort (Citrix 28./29.10.):
    // zur Ligaliste fahren. Ohne Sitzung leitet sie zur Anmeldung weiter, die naechste Runde hilft dort.
    if (!z.token && /^https?:\/\/ccs\./i.test(z.href) && z.href.indexOf('/LIGA_LISTEN_NEW/') < 0) {
      await neuesDokument(s, () => s.befehl('Page.navigate', { url: new URL(z.href).origin + LIGA_PFAD }), 20000);
      await geladen(s);
      z = await ligaZustand(s);
    }
    if (!z.token) return nichts('Ligaliste ohne Token (' + z.href + ')');
    const jeBaum = await ligaLive(s);
    try { await ligaPflege(s); } catch (e) { /* Pflege darf die Lieferung nicht verderben */ }
    return {
      jeBaum,
      grund: PROJEKTE.filter((p) => jeBaum[p].art !== 'ok').map((p) => p + ': ' + jeBaum[p].grund).join(' | '),
      ersetzen: PROJEKTE.some((p) => jeBaum[p].art === 'sitzung-tot')
    };
  } catch (e) {
    return nichts('Liga-Runde abgebrochen: ' + ((e && e.message) || e));
  }
}

module.exports = { LIGA_PFAD, GET_DATA_PFAD, ligaZustand, ligaMsHilfe, ligaAbfrage, ligaLive, ligaBereich, ligaPflege, ligaRunde };
