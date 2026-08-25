/* ============================================================================
   POSTFACH-SEITE PRUEFEN (Mail-Zentrum in esl_live_arena_v22.js, 30.10.)
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/postfach_seite_pruefen.js

   Schneidet die reinen Funktionen der Seite (rcPostfachEsc, rcPostfachZahl,
   rcPostfachTeamIndex, rcPostfachTeam, rcPostfachHtml, rcPostfachMailText)
   samt rcPoolQuote und window.rcNormName aus v22 und wertet sie mit
   new Function aus. Dazu statisch: Seite in keiner Rotationsliste, kein
   localStorage, keine Mailinhalte im Logbuch, Empfang nur bei neuer nr.
   GEGENPROBE: dieselbe Seite mit abgeschaltetem Escape muss durchfallen.
============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}
const V = fs.readFileSync(path.join(__dirname, '..', 'esl_live_arena_v22.js'), 'utf8');

// Rumpf ab Startstelle per Klammer-Zaehlung; Zeichenketten und Regex-Literale zaehlen nicht mit.
function rumpf(src, start, name) {
  if (start < 0) throw new Error(name + ' fehlt in v22');
  let tiefe = 0, q = '';
  for (let k = src.indexOf('{', start); k < src.length; k++) {
    const c = src[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = ''; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '/' && src[k + 1] === '/') { k = src.indexOf('\n', k); continue; }
    else if (c === '/' && /[=(,:!&|?{};]\s*$/.test(src.slice(Math.max(0, k - 20), k))) {   // Regex-Literal
      for (k++; k < src.length && src[k] !== '/'; k++) { if (src[k] === '\\') k++; else if (src[k] === '[') { while (src[++k] !== ']') if (src[k] === '\\') k++; } }
    }
    else if (c === '{') tiefe++;
    else if (c === '}' && --tiefe === 0) return src.slice(start, k + 1);
  }
  throw new Error(name + ': Rumpf nicht geschlossen');
}
const fn = (name) => rumpf(V, V.indexOf('function ' + name + '('), name);

let F = null, Fohne = null;
const NAMEN = ['rcPostfachEsc', 'rcPostfachZahl', 'rcPostfachTeamIndex', 'rcPostfachTeam', 'rcPostfachHtml', 'rcPostfachMailText', 'rcPoolQuote'];
function baue(ersatz) {
  const norm = rumpf(V, V.indexOf('window.rcNormName = function'), 'window.rcNormName');
  const teile = NAMEN.map((n) => (ersatz && ersatz[n]) || fn(n));
  return new Function('const window = {};\n' + norm + ';\n' + teile.join('\n') + '\nreturn {' + NAMEN.join(',') + '};')();
}
try { F = baue(); } catch (e) { console.log('ABBRUCH: ' + e.message); process.exit(1); }
Fohne = baue({ rcPostfachEsc: 'function rcPostfachEsc(t){ return String(t == null ? "" : t); }' });

const pad = (n) => String(n).padStart(2, '0');
const jetzt = new Date();
const heute = jetzt.getFullYear() + '-' + pad(jetzt.getMonth() + 1) + '-' + pad(jetzt.getDate());

console.log('\n1 Team-Zuordnung');
const map = { ccsMap: { 1: { name: 'Muster Anna', team: 'T-82', standort: 'Alanya' }, 2: { name: 'Özdemir Ünal', team: 'T-83' } } };
const idx = F.rcPostfachTeamIndex(map);
pruefe('Muster Anna trifft "Muster, Anna"', F.rcPostfachTeam(idx, 'Muster, Anna') === 'T-82');
pruefe('Özdemir Ünal trifft "Özdemir, Ünal"', F.rcPostfachTeam(idx, 'Özdemir, Ünal') === 'T-83');
pruefe('Oezdemir Uenal trifft "Özdemir, Ünal" nicht (rcNormName: ö -> o)', F.rcPostfachTeam(F.rcPostfachTeamIndex({ ccsMap: { 3: { name: 'Oezdemir Uenal', team: 'T-84' } } }), 'Özdemir, Ünal') === '—');
pruefe('unbekannt -> —', F.rcPostfachTeam(idx, 'Unbekannt, Xaver') === '—');
pruefe('ohne Mapping leerer Index', JSON.stringify(F.rcPostfachTeamIndex(null)) === '{}');

console.log('\n2 Seite');
const d = {
  nr: 3, zeit: jetzt.getTime(), ok: true, grund: '', ungelesen: 12,
  mails: [
    { entryId: '00AA', zeit: heute + 'T09:15', absender: 'Projektleitung', email: 'pl@regiocom.com', betreff: '<script>alert(1)</script>', ungelesen: true, vorschau: 'Bitte bis Freitag', kategorie: 'Management', wichtig: 'projektleitung' },
    { entryId: '00BB', zeit: heute + 'T08:50', absender: 'Chef', email: 'chef@firma.de', betreff: 'Besprechung', ungelesen: false, vorschau: '', kategorie: 'Rest', wichtig: 'chef@firma.de' },
    { entryId: '00CC', zeit: heute + 'T08:40', absender: 'Disposition', email: 'vodafone-disposition@regiocom.com', betreff: 'MA: Muster, Anna, Grund: KRV', ungelesen: true, vorschau: '', kategorie: 'Steuerung', wichtig: '' }
  ],
  abwesend: [
    { ma: 'Muster, Anna', grund: 'KRV', von: heute, bis: '', zeit: heute + 'T08:40', entryId: '00CC' },
    { ma: 'Unbekannt, Xaver', grund: 'Urlaub', von: heute, bis: '2099-11-02', zeit: heute + 'T07:00', entryId: '00DD' }
  ],
  infos: [{ ma: 'Probe, Lena', art: 'Auffälligkeit', text: 'AHT hoch', zeit: heute + 'T08:00', entryId: '00EE' }, { ma: '', art: 'nicht lesbar', text: 'MA: kaputt', zeit: heute + 'T07:00', entryId: '00FF' }],
  termine: [{ entryId: '0101', start: '10:30', ende: '11:00', titel: 'Teamleiter-Runde', ganztaegig: false }, { entryId: '0102', start: '', ende: '', titel: 'Feiertag', ganztaegig: true }]
};
const kopf = { nr: 3, zeit: jetzt.getTime(), ok: true, grund: '' };
const teams = [{ team: 'T-82' }, { team: 'T"<83' }];
const h = F.rcPostfachHtml(d, kopf, idx, 'Alle', teams);
pruefe('Betreff escaped', h.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') >= 0 && h.indexOf('<script>alert') < 0);
pruefe('Gegenprobe: ohne Escape steht das Skript im HTML', Fohne.rcPostfachHtml(d, kopf, idx, 'Alle', teams).indexOf('<script>alert') >= 0);
pruefe('Teamname im Attribut escaped', h.indexOf('data-pf-team="T&quot;&lt;83"') >= 0);
pruefe('Kachel ungelesen 12', /data-kachel="ungelesen"[^>]*><b>12<\/b>/.test(h));
pruefe('Kachel wichtig = ungelesen UND wichtig (1)', /data-kachel="wichtig"[^>]*><b>1<\/b>/.test(h));
pruefe('Kachel abwesend 2, Termine 2', /data-kachel="abwesend"[^>]*><b>2<\/b>/.test(h) && /data-kachel="termine"[^>]*><b>2<\/b>/.test(h));
pruefe('Outlook gelesen HH:MM', h.indexOf('Outlook gelesen ' + pad(jetzt.getHours()) + ':' + pad(jetzt.getMinutes())) >= 0);
pruefe('Abwesende mit Team, Unbekannter bleibt sichtbar', h.indexOf('Muster, Anna') >= 0 && h.indexOf('T-82') >= 0 && h.indexOf('Unbekannt, Xaver') >= 0);
pruefe('bis als TT.MM.', h.indexOf('bis 02.11.') >= 0);
pruefe('Infos inkl. "nicht lesbar"', h.indexOf('AHT hoch') >= 0 && h.indexOf('nicht lesbar') >= 0 && h.indexOf('MA: kaputt') >= 0);
pruefe('Termine: Uhrzeit und Ganztaegig', h.indexOf('10:30') >= 0 && h.indexOf('Ganztägig') >= 0 && h.indexOf('Teamleiter-Runde') >= 0);
pruefe('Knoepfe oeffnen/antworten mit Kennung', h.indexOf('data-pf-art="oeffnen" data-pf-id="00AA"') >= 0 && h.indexOf('data-pf-art="antworten" data-pf-id="00AA"') >= 0);
pruefe('Muster-Treffer: kein wichtig_weg, Hinweis mit Muster', h.indexOf('data-pf-eintrag="pl@regiocom.com"') < 0 && h.indexOf('data-pf-muster="projektleitung"') >= 0);
pruefe('exakte Adresse: wichtig_weg', h.indexOf('data-pf-art="wichtig_weg" data-pf-eintrag="chef@firma.de"') >= 0);
pruefe('ohne wichtig: als wichtig markieren', h.indexOf('data-pf-art="wichtig_neu" data-pf-eintrag="vodafone-disposition@regiocom.com"') >= 0);
pruefe('Mail an Team: Knopf je Team', h.indexOf('data-pf-art="entwurf" data-pf-team="T-82"') >= 0);
const hs = F.rcPostfachHtml(d, kopf, idx, 'Steuerung', teams);
pruefe('Filter Steuerung: Chip aktiv, Abwesende unveraendert', /class="rc-pf-chip an" data-pf-filter="Steuerung"/.test(hs) && hs.indexOf('Unbekannt, Xaver') >= 0 && hs.indexOf('Muster, Anna') >= 0);
const posteingang = (x) => x.slice(x.indexOf('data-pf-box="posteingang"'), x.indexOf('data-pf-box="termine"'));
pruefe('Filter Steuerung: Posteingang nur Steuerung', posteingang(hs).indexOf('data-pf-id="00CC"') >= 0 && posteingang(hs).indexOf('data-pf-id="00BB"') < 0);
const hf = F.rcPostfachHtml(d, { nr: 4, zeit: jetzt.getTime(), ok: false, grund: 'Outlook (klassisch) nicht erreichbar' }, idx, 'Alle', teams);
pruefe('Fehlschlag: Grund im Kopf, letzter Stand bleibt', hf.indexOf('Nicht gelesen: Outlook (klassisch) nicht erreichbar') >= 0 && hf.indexOf('data-pf-id="00AA"') >= 0);
let leer = '';
try { leer = F.rcPostfachHtml(null, { nr: 0, zeit: 0, ok: false, grund: 'noch nicht gelesen' }, {}, 'Alle', []); } catch (e) { /* bleibt leer */ }
pruefe('ohne Daten: "wird gelesen" statt Fehler', leer.indexOf('wird gelesen') >= 0);
// Review Important 1: "nie gelesen" darf nicht wie "keine Abwesenheit" aussehen.
const nie = F.rcPostfachHtml({ nr: 2, zeit: jetzt.getTime(), ok: false, grund: 'x', gelesen: false }, { nr: 2, zeit: jetzt.getTime(), ok: false, grund: 'Outlook (klassisch) nicht erreichbar' }, idx, 'Alle', []);
pruefe('nie gelesen: Kacheln "—" statt 0', /data-kachel="abwesend"[^>]*><b>—<\/b>/.test(nie) && /data-kachel="ungelesen"[^>]*><b>—<\/b>/.test(nie));
pruefe('nie gelesen: kein "Heute keine Abwesenheit gemeldet"', nie.indexOf('Heute keine Abwesenheit gemeldet') < 0 && nie.indexOf('Noch keine Daten aus Outlook') >= 0);
pruefe('Fehlschlag mit altem Stand: Uhrzeit des letzten guten Stands', hf.indexOf('letzter Stand ' + pad(jetzt.getHours()) + ':' + pad(jetzt.getMinutes())) >= 0);
const hh = F.rcPostfachHtml(Object.assign({}, d, { hinweise: ['Kalender nicht gelesen: <b>x</b>'] }), kopf, idx, 'Alle', teams);
pruefe('Hinweis des Lesers sichtbar und escaped', hh.indexOf('Kalender nicht gelesen: &lt;b&gt;x&lt;/b&gt;') >= 0);

// rcPostfachAnnehmen: eine Lieferung ohne Lesestand (Dienst-Neustart, Outlook weg) behaelt die alten Daten.
const annehmen = (src) => {
  const w = { rcPostfachDaten: { alt: true }, rcPostfachFehler: 'f' };
  const a = new Function('window', 'rcPostfachZeichnen', src + '\nreturn rcPostfachAnnehmen;')(w, () => {});
  a({ gelesen: false, nr: 0 });
  const behalten = w.rcPostfachDaten && w.rcPostfachDaten.alt === true;
  a({ gelesen: true, mails: [] });
  return { behalten, ersetzt: w.rcPostfachDaten && w.rcPostfachDaten.gelesen === true };
};
const an = annehmen(fn('rcPostfachAnnehmen'));
pruefe('Annehmen: gelesen:false behaelt den letzten guten Stand', an.behalten);
pruefe('Annehmen: echte Lieferung ersetzt', an.ersetzt);
pruefe('Gegenprobe: alte Fassung ueberschreibt mit dem Leerstand', !annehmen('function rcPostfachAnnehmen(d){ window.rcPostfachDaten = d; window.rcPostfachFehler = ""; rcPostfachZeichnen(); }').behalten);

console.log('\n3 Mail an Team');
const t = { team: 'T-82', calls: 120, ansp: 30, bnt: 4, vvl: 7, z: { cs: 9, tnps: 5, fq: 25 }, n: { cs: 10, tnps: 8, fq: 80 }, q: { cs: [], tnps: [], fq: [] } };
const m = F.rcPostfachMailText('T-82', t, '14:05');
const dat = pad(jetzt.getDate()) + '.' + pad(jetzt.getMonth() + 1) + '.' + jetzt.getFullYear();
pruefe('Betreff', m.betreff === 'Teamwerte T-82 ' + dat, m.betreff);
pruefe('Text exakt', m.text === ['Hallo Team T-82,', '', 'hier eure Werte von heute (Stand 14:05):', 'Calls: 120', 'Ansprachen: 30', 'BNT: 4', 'VVL: 7', 'CS: 90,0', 'TNPS: 62,5', 'FQ: 31,3 %', '', 'Viele Grüße'].join('\n'), JSON.stringify(m.text));
const m2 = F.rcPostfachMailText('T-82', Object.assign({}, t, { z: { cs: null, tnps: 5, fq: 25 } }), '14:05');
pruefe('ohne CS-Wert: CS: —', m2.text.indexOf('CS: —') >= 0);

console.log('\n4 Verdrahtung');
const a = V.indexOf('// ---- MAIL-ZENTRUM (Postfach)'), e = V.indexOf('// ---- ENDE MAIL-ZENTRUM');
pruefe('Block mit Markern', a > 0 && e > a);
const block = V.slice(a, e);
const code = block.split('\n').filter((z) => !/^\s*\/\//.test(z)).join('\n');   // Kommentare zaehlen nicht
pruefe('Block ohne localStorage', code.indexOf('localStorage') < 0);
pruefe('Block legt nichts in die Rotation', code.indexOf('rcAutoRotPages') < 0);
const logZeilen = code.split('\n').filter((z) => /rcLog|rcLogEreignis/.test(z));
pruefe('Logbuch ohne Mailinhalte', logZeilen.every((z) => !/betreff|absender|vorschau|\.ma\b|email/i.test(z)), logZeilen.join(' | '));
pruefe('Rotation ab Werk ohne postfach', /window\.rcAutoRotPages = \['arena', 'radar'\];/.test(V));
const rot1 = V.split('\n').find((z) => z.indexOf("['queue','Warteschleife']") >= 0) || '';
const rot2 = V.split('\n').find((z) => z.indexOf("['queue'],['info']]") >= 0) || '';
pruefe('Konfigurator-Rotationslisten ohne postfach', rot1 && rot2 && rot1.indexOf('postfach') < 0 && rot2.indexOf('postfach') < 0);
pruefe('rcDienstGesehen kennt postfach', /window\.rcDienstGesehen = \{[^}]*\}[^;]*postfach:\s*0/.test(V));
const tick = fn('rcDienstEmpfangTick');
pruefe('Empfang: nur mit S.postfach, Abruf bei neuer nr (!==)', /S\.postfach/.test(tick) && /PF\.nr !== G\.postfach/.test(tick) && tick.indexOf("rcDienstHole('/api/postfach'") > 0);
pruefe('Clean-State leert die Postfach-Daten', /window\.rcPostfachDaten = null;/.test(V.slice(V.indexOf('// 2. CLEAN-STATE'))));
const fl = fn('wickleFetch');
pruefe('Flugschreiber wertet nur FormData-POSTs aus (zeichnet /api/postfach nicht auf)', /AKTIV && m === 'POST' && istFormData\(body\)/.test(fl));
pruefe('Seite wird nie gemerkt (kein Speicher fuer rcActivePage)', !/localStorage[^\n]*rcActivePage|rcActivePage[^\n]*localStorage/.test(V));

console.log('');
console.log('----------------------------------------------------');
console.log(fehler === 0 ? 'ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN.' : fehler + ' von ' + geprueft + ' Pruefungen FEHLGESCHLAGEN.');
process.exit(fehler === 0 ? 0 : 1);
