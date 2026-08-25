'use strict';
// Mail-Zentrum (Vorhaben 3): Outlook-Ergebnis einstufen, Wichtig-Datei pflegen, Lesen takten.
// Beim require startet nichts. Mailinhalte bleiben im Speicher; nach aussen (Log, Stand) nur Zahlen.
const fs = require('fs');
const { execFile } = require('child_process');
const { datumIso } = require('./esl_dienst_regeln');

// ---------------------------------------------------------------- Regeln
// Gleiche Regel wie window.rcNormName in v22 (Teile sortiert: "Muster, Anna" = "Anna Muster").
function normName(s) {
  if (!s) return '';
  return String(s).toLowerCase().replace(/[.,]/g, ' ')
    .replace(/[äàáâ]/g, 'a').replace(/[öòóô]/g, 'o').replace(/[üùúû]/g, 'u').replace(/ß/g, 'ss')
    .split(/\s+/).filter(Boolean).sort().join(' ');
}

const pad2 = (n) => (n < 10 ? '0' : '') + n;
// "dd.MM.yyyy", "d.M.yyyy", "dd.MM." oder "dd.MM" (ohne Jahr = jahr). Ungueltig -> null.
function datumLesen(text, jahr) {
  const m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{4})?)?$/.exec(String(text == null ? '' : text).trim());
  if (!m) return null;
  const t = +m[1], mo = +m[2], j = m[3] ? +m[3] : jahr;
  const d = new Date(j, mo - 1, t);
  if (d.getFullYear() !== j || d.getMonth() !== mo - 1 || d.getDate() !== t) return null;
  return j + '-' + pad2(mo) + '-' + pad2(t);
}

const DISPO_RX = /MA:\s*([^,]+,\s*[^,]+),\s*(Grund|Auff[^:]*):\s*([^,]+)(?:,\s*von:\s*([^,]+))?(?:,\s*bis:\s*([^,]+))?/i;
// Null = keine Dispo-Meldung (kein "MA:" als eigenes Wort, oder Antwort/Weiterleitung).
function dispoLesen(betreff, eingangIso) {
  const b = String(betreff == null ? '' : betreff);
  if (/^\s*(aw|wg|re|fw|fwd)\s*:/i.test(b)) return null;
  if (!/(?:^|[^a-zäöüß])ma:/i.test(b)) return null;   // "Thema:" ist keine Meldung
  const jahr = +String(eingangIso).slice(0, 4) || new Date().getFullYear();
  const m = DISPO_RX.exec(b);
  if (!m) return { ma: '', typ: 'unlesbar', grund: '', von: eingangIso, bis: '' };
  const rohVon = m[4] ? m[4].trim() : '', rohBis = m[5] ? m[5].trim() : '';
  let von = rohVon ? datumLesen(rohVon, jahr) : null, bis = rohBis ? datumLesen(rohBis, jahr) : null;
  const ohneJahr = (t) => !/\.\d{4}$/.test(t);
  // Ohne Jahr ueber den Jahreswechsel: "von: 29.12." im Januar ist Vorjahr, "bis: 02.01." nach "von: 29.12." Folgejahr.
  if (von && ohneJahr(rohVon) && Date.parse(von) - Date.parse(eingangIso) > 180 * 864e5) von = (+von.slice(0, 4) - 1) + von.slice(4);
  const vonEff = von || eingangIso;
  if (bis && ohneJahr(rohBis) && bis < vonEff) bis = (+vonEff.slice(0, 4) + 1) + bis.slice(4);
  const r = { ma: m[1].trim(), typ: /^grund$/i.test(m[2].trim()) ? 'grund' : 'auff', grund: m[3].trim(), von: vonEff, bis: bis || '' };
  if ((rohVon && !von) || (rohBis && !bis)) r.datumUnlesbar = true;   // steht zusaetzlich unter Mitarbeiterinfos
  return r;
}

// Je Person gewinnt die juengste Grund-Meldung; heute abwesend, wenn von <= heute und
// (bis >= heute, ohne bis: von = heute). Ein bis vor von ist ein Tippfehler und zaehlt nicht.
function abwesendHeute(dispo, heuteIso) {
  const je = new Map();
  for (const d of dispo || []) {
    if (!d || d.typ !== 'grund') continue;
    const k = normName(d.ma), alt = je.get(k);
    if (!alt || String(d.zeit) > String(alt.zeit)) je.set(k, d);
  }
  const aus = [];
  for (const d of je.values()) {
    const bis = d.bis && d.bis >= d.von ? d.bis : '';
    if (d.von <= heuteIso && (bis ? bis >= heuteIso : d.von === heuteIso)) aus.push({ ma: d.ma, grund: d.grund, von: d.von, bis, zeit: d.zeit, entryId: d.entryId });
  }
  return aus.sort((a, b) => a.ma.localeCompare(b.ma, 'de'));
}

function wichtigLesen(text) {
  return String(text == null ? '' : text).replace(/^\uFEFF/, '').split(/\r?\n/)
    .map((z) => z.trim().toLowerCase()).filter((z) => z && z[0] !== '#');
}
function wichtigTreffer(zeilen, absender, email) {
  const s = (String(absender || '') + ' ' + String(email || '')).toLowerCase();
  return (zeilen || []).find((z) => s.includes(z)) || '';
}

const PERFORMANCE_RX = /pix|wca|croco|storno|audit|connect|mystery|provision|ligaliste|zielvereinbarung/i;
const liste = (x) => (Array.isArray(x) ? x : []);
// Felder werden einzeln uebernommen: was der Leser zusaetzlich schickt (z. B. inhalt), faellt weg.
function einstufen(roh, zeilen, heuteIso) {
  roh = roh || {};
  const mails = liste(roh.mails).map((m) => {
    const absender = String(m.absender || ''), email = String(m.email || ''), betreff = String(m.betreff || '');
    const wichtig = wichtigTreffer(zeilen, absender, email);
    const steuerung = /vodafone-disposition|disposition|steuerung/.test((absender + ' ' + email).toLowerCase()) || /^\s*ma:/i.test(betreff);
    const kategorie = steuerung ? 'Steuerung' : wichtig ? 'Management' : PERFORMANCE_RX.test(betreff) ? 'Performance' : 'Rest';
    return { entryId: String(m.entryId || ''), zeit: String(m.zeit || ''), absender, email, betreff, ungelesen: !!m.ungelesen, vorschau: String(m.vorschau || ''), kategorie, wichtig };
  });
  const dispo = [];
  for (const d of liste(roh.dispo)) {
    const zeit = String(d.zeit || ''), r = dispoLesen(d.betreff, zeit.slice(0, 10));
    if (r) dispo.push(Object.assign(r, { zeit, entryId: String(d.entryId || ''), betreff: String(d.betreff || '') }));
  }
  // Auffaelligkeiten, unlesbare Betreffe und Abwesenheiten mit unlesbarem Datum: nichts verschwindet still.
  const infos = dispo.filter((d) => d.typ !== 'grund' || d.datumUnlesbar)
    .sort((a, b) => (a.zeit < b.zeit ? 1 : a.zeit > b.zeit ? -1 : 0))
    .map((d) => ({ ma: d.ma, art: d.typ === 'auff' ? 'Auffälligkeit' : d.typ === 'unlesbar' ? 'nicht lesbar' : 'Datum nicht lesbar',
      text: d.typ === 'auff' ? d.grund : d.betreff, zeit: d.zeit, entryId: d.entryId }));
  const termine = liste(roh.termine).map((t) => ({ entryId: String(t.entryId || ''), start: String(t.start || ''), ende: String(t.ende || ''), titel: String(t.titel || ''), ganztaegig: !!t.ganztaegig }));
  return { ok: true, grund: '', ungelesen: Number.isFinite(roh.ungelesen) ? roh.ungelesen : null, mails, abwesend: abwesendHeute(dispo, heuteIso), infos, termine,
    hinweise: liste(roh.hinweise).map(String) };
}

// ---------------------------------------------------------------- Wichtig-Datei
const WICHTIG_VORLAGE = [
  '# Postfach_Wichtig.txt - Absender, deren Mails als "wichtig" gelten.',
  '# Eine Zeile = ein Muster (Teil des Namens oder der Adresse), Gross/klein egal.',
  '# Zeilen mit # und leere Zeilen zaehlen nicht. Aenderungen wirken ohne Neustart.',
  'projektleitung', 'standortleitung', 'britta', 'uensal', 'ünsal', 'tanju', 'oezdemir', 'özdemir', ''
].join('\r\n');

const SCHLAF = new Int32Array(new SharedArrayBuffer(4));
// tmp + rename wie schreibeAtomar im Dienst; scheitert es endgueltig, bleibt kein .tmp mit Adressen liegen.
function schreibe(datei, text) {
  const tmp = datei + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, datei); return; } catch (e) {
      if (i < 5 && ['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { Atomics.wait(SCHLAF, 0, 0, 100); continue; }
      try { fs.unlinkSync(tmp); } catch (x) { /* schon weg */ }
      throw e;
    }
  }
}
// Legt die Datei bei Bedarf an; wirft nie (Editor sperrt die Datei, Laufwerk voll -> []).
function wichtigSichern(datei) {
  try {
    if (!fs.existsSync(datei)) schreibe(datei, WICHTIG_VORLAGE);
    return wichtigLesen(fs.readFileSync(datei, 'utf8'));
  } catch (e) { return []; }
}
function wichtigAendern(datei, art, eintrag) {
  const e = String(eintrag == null ? '' : eintrag).trim().toLowerCase();
  if (e.length < 3 || e.length > 200 || /[\x00-\x1f]/.test(e)) return { ok: false, grund: 'Eintrag ungueltig' };
  wichtigSichern(datei);
  let zeilen;
  try { zeilen = fs.readFileSync(datei, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/); } catch (x) { return { ok: false, grund: 'Datei nicht lesbar (' + (x.code || x.message) + ')' }; }
  const gleich = (z) => z.trim()[0] !== '#' && z.trim().toLowerCase() === e;
  if (art === 'neu') {
    if (zeilen.some(gleich)) return { ok: true };
    if (zeilen.length && zeilen[zeilen.length - 1] === '') zeilen.splice(zeilen.length - 1, 0, e); else zeilen.push(e, '');
  } else if (art === 'weg') {
    if (!zeilen.some(gleich)) return { ok: false, grund: 'nicht in Postfach_Wichtig.txt' };
    zeilen = zeilen.filter((z) => !gleich(z));
  } else return { ok: false, grund: 'unbekannte Aenderung' };
  try { schreibe(datei, zeilen.join('\r\n')); } catch (x) { return { ok: false, grund: 'Datei nicht schreibbar (' + (x.code || x.message) + ')' }; }
  return { ok: true };
}

// ---------------------------------------------------------------- Laufsteuerung
// Ein Skript starten (.js mit Node fuer Pruefungen, sonst PowerShell) und seine JSON-Ausgabe lesen.
// Ergebnis: {art:'json', j} | {art:'frist'} | {art:'fehler', grund}. Wirft nie.
function skriptStarten(skript, args, fristMs) {
  const js = /\.js$/i.test(skript);
  const prog = js ? process.execPath : 'powershell.exe';
  const alle = js ? [skript].concat(args) : ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', skript].concat(args);
  return new Promise((ja) => {
    execFile(prog, alle, { windowsHide: true, encoding: 'utf8', timeout: fristMs, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return ja({ art: 'fehler', grund: 'Leser-Antwort zu gross' });
      if (err && err.killed) return ja({ art: 'frist' });
      if (err) return ja({ art: 'fehler', grund: (String(stderr || '').trim().split(/\r?\n/)[0] || err.message).slice(0, 200) });
      try { return ja({ art: 'json', j: JSON.parse(String(stdout).replace(/^\uFEFF/, '').trim()) }); } catch (e) { return ja({ art: 'fehler', grund: 'Leser-Antwort nicht lesbar' }); }
    });
  });
}

// Liest sofort und dann alle taktSek; nie zwei Lesen gleichzeitig. Ein Fehlschlag laesst die letzten
// guten Daten stehen. Jede Lieferung (auch ein Fehlschlag) zaehlt nr hoch und geht an beiLieferung.
function postfachStarten(opt) {
  const kopf = { nr: 0, zeit: 0, ok: false, grund: 'noch nicht gelesen' };
  let roh = null, daten = null, laeuft = null;
  function melden(ok, grund) {
    kopf.nr++; kopf.zeit = Date.now(); kopf.ok = ok; kopf.grund = ok ? '' : grund;
    opt.beiLieferung(Object.assign({}, kopf));
  }
  const neuEinstufen = () => { daten = einstufen(roh, wichtigSichern(opt.datei), datumIso(new Date())); };
  function lesen() {
    if (laeuft) return laeuft;
    const t0 = Date.now();
    laeuft = skriptStarten(opt.leser, [], opt.fristMs).then((r) => {
      if (r.art === 'json' && r.j && r.j.ok === true) {
        roh = r.j;
        neuEinstufen();
        opt.log('Postfach gelesen: ' + daten.mails.length + ' Mails, ' + liste(roh.dispo).length + ' Dispo, ' + daten.termine.length + ' Termine (' + Math.round((Date.now() - t0) / 1000) + ' s)');
        return melden(true, '');
      }
      const grund = r.art === 'frist' ? 'Frist ' + Math.round(opt.fristMs / 1000) + ' s abgelaufen'
        : r.art === 'json' ? String((r.j && r.j.grund) || 'Leser-Antwort nicht lesbar') : r.grund;
      opt.log('Postfach nicht gelesen: ' + grund);
      melden(false, grund);
    }).catch((e) => opt.log('Postfach: Auswertung gescheitert: ' + ((e && e.message) || e))).finally(() => { laeuft = null; });
    return laeuft;
  }
  async function aktion(d) {
    d = d || {};
    const art = d.art;
    if (art === 'wichtig_neu' || art === 'wichtig_weg') {
      const r = wichtigAendern(opt.datei, art === 'wichtig_neu' ? 'neu' : 'weg', d.eintrag);
      if (r.ok && roh) { neuEinstufen(); melden(kopf.ok, kopf.grund); }
      return r;
    }
    let args;
    if (art === 'oeffnen' || art === 'antworten') {
      if (!/^[0-9A-Fa-f]{16,1024}$/.test(String(d.entryId || ''))) return { ok: false, grund: 'Mail-Kennung ungueltig' };
      args = ['-Art', art, '-EntryId', d.entryId];
    } else if (art === 'entwurf') {
      const e = d.entwurf || {};
      if (typeof e.betreff !== 'string' || typeof e.text !== 'string' || e.betreff.length > 300 || e.text.length > 20000) return { ok: false, grund: 'Entwurf ungueltig' };
      args = ['-Art', 'entwurf', '-Daten', Buffer.from(JSON.stringify({ betreff: e.betreff, text: e.text }), 'utf8').toString('base64')];
    } else return { ok: false, grund: 'unbekannte Aktion' };
    const r = await skriptStarten(opt.aktionSkript, args, opt.aktionFristMs);
    if (r.art === 'frist') return { ok: false, grund: 'Outlook antwortet nicht (' + Math.round(opt.aktionFristMs / 1000) + ' s)' };
    if (r.art !== 'json') return { ok: false, grund: r.grund };
    return r.j && r.j.ok === true ? { ok: true } : { ok: false, grund: String((r.j && r.j.grund) || 'Outlook-Aktion gescheitert') };
  }
  wichtigSichern(opt.datei);   // Datei liegt ab dem Start bereit, auch wenn Outlook fehlt
  const uhr = setInterval(lesen, opt.taktSek * 1000);
  lesen();
  return {
    kopf: () => Object.assign({}, kopf),
    daten: () => Object.assign({}, daten ? Object.assign({ gelesen: true }, daten) : { gelesen: false }, { nr: kopf.nr, zeit: kopf.zeit, ok: kopf.ok, grund: kopf.grund }),
    aktion, lesen,
    stoppen: () => clearInterval(uhr)
  };
}

module.exports = { postfachStarten, normName, datumLesen, dispoLesen, abwesendHeute, wichtigLesen, wichtigTreffer, einstufen, WICHTIG_VORLAGE, wichtigSichern, wichtigAendern };
