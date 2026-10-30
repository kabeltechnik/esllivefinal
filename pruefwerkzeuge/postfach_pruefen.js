/* ============================================================================
   POSTFACH PRUEFEN (Mail-Zentrum, Vorhaben 3, 30.10.)
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/postfach_pruefen.js

   1 Regeln       Dispo-Betreff, Datum, "Abwesend heute", Einstufen, Wichtig-Datei
   2 Laufsteuerung  Takt, Frist, letzter guter Stand, Aktionen (Schein-Skripte)
   3 Skripte      postfach_lesen.ps1 / postfach_aktion.ps1 (BOM, kein Send, Parser)
   4 Einbau       esl_dienst.js, Starter, .gitignore, bundle_bauen.js

   esl_dienst_postfach.js startet beim require nichts und wird direkt geladen.
   Zu jeder Regel eine Gegenprobe: die alte/kaputte Fassung muss durchfallen.
   Kein Outlook noetig.
============================================================================ */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}
const WURZEL = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pruefen-'));

function abschnitt1() {
  console.log('\n1 Regeln');
  const P = require('../esl_dienst_postfach.js');

  pruefe('Grund mit von/bis', JSON.stringify(P.dispoLesen('MA: Muster, Anna, Grund: KRV, von: 28.10.2026, bis: 31.10.2026', '2026-10-28')) ===
    JSON.stringify({ ma: 'Muster, Anna', typ: 'grund', grund: 'KRV', von: '2026-10-28', bis: '2026-10-31' }));
  pruefe('ohne von: Eingangsdatum', P.dispoLesen('MA: Muster, Anna, Grund: KRV', '2026-10-29').von === '2026-10-29');
  pruefe('dd.MM. ohne Jahr', P.datumLesen('05.11.', 2026) === '2026-11-05');
  pruefe('d.M.yyyy', P.datumLesen('5.1.2027', 2026) === '2027-01-05');
  pruefe('ungueltiges Datum null', P.datumLesen('32.13.2026', 2026) === null && P.datumLesen('ab sofort', 2026) === null);
  pruefe('Auffaelligkeit ohne Umlaut', P.dispoLesen('MA: Probe, Lena, Auffaelligkeit: AHT hoch', '2026-10-30').typ === 'auff');
  pruefe('Auffälligkeit mit Umlaut', P.dispoLesen('MA: Probe, Lena, Auffälligkeit: AHT hoch', '2026-10-30').typ === 'auff');
  pruefe('grund klein geschrieben', P.dispoLesen('MA: Probe, Lena, grund: UF', '2026-10-30').typ === 'grund');
  pruefe('AW: ist keine Meldung', P.dispoLesen('AW: MA: Muster, Anna, Grund: KRV', '2026-10-30') === null);
  pruefe('wg: ist keine Meldung', P.dispoLesen('wg: MA: Muster, Anna, Grund: KRV', '2026-10-30') === null);
  pruefe('RE:/FW: sind keine Meldung', P.dispoLesen('RE: MA: A, B, Grund: X', '2026-10-30') === null && P.dispoLesen('FW: MA: A, B, Grund: X', '2026-10-30') === null);
  pruefe('unlesbar bleibt', (P.dispoLesen('MA: kaputt ohne Komma', '2026-10-30') || {}).typ === 'unlesbar');
  pruefe('ohne MA: null', P.dispoLesen('Newsletter IT', '2026-10-30') === null);
  // Gegenprobe: dieselbe Regex ohne den Praefix-Ausschluss liest eine Antwort als Meldung.
  const RX = /MA:\s*([^,]+,\s*[^,]+),\s*(Grund|Auff[^:]*):\s*([^,]+)(?:,\s*von:\s*([^,]+))?(?:,\s*bis:\s*([^,]+))?/i;
  pruefe('Gegenprobe: ohne Praefix-Ausschluss waere AW: eine Meldung', RX.test('AW: MA: Muster, Anna, Grund: KRV'));

  // Review Important 2: ein vorhandenes, aber unlesbares Datum darf die Meldung nicht still verschwinden lassen.
  const zj = P.dispoLesen('MA: X, Y, Grund: Urlaub, von: 27.10.26, bis: 31.10.26', '2026-10-27');
  pruefe('zweistelliges Jahr: als "Datum nicht lesbar" markiert', zj && zj.datumUnlesbar === true);
  const jw = P.dispoLesen('MA: X, Y, Grund: Urlaub, von: 29.12., bis: 02.01.', '2026-12-28');
  pruefe('Jahreswechsel ohne Jahr: bis ins Folgejahr', jw.von === '2026-12-29' && jw.bis === '2027-01-02' && !jw.datumUnlesbar, JSON.stringify(jw));
  const jv = P.dispoLesen('MA: X, Y, Grund: Urlaub, von: 29.12., bis: 05.01.', '2027-01-02');
  pruefe('Jahreswechsel: von ins Vorjahr', jv.von === '2026-12-29' && jv.bis === '2027-01-05', JSON.stringify(jv));
  pruefe('ueber Neujahr heute abwesend', P.abwesendHeute([Object.assign({}, jw, { zeit: '2026-12-28T08:00', entryId: 'J' })], '2027-01-01').length === 1);
  const Eu = P.einstufen({ ok: true, dispo: [{ entryId: 'U1', zeit: '2026-10-27T08:00', betreff: 'MA: X, Y, Grund: Urlaub, von: 27.10.26' }] }, [], '2026-10-27');
  pruefe('Datum nicht lesbar steht unter Mitarbeiterinfos', Eu.infos.length === 1 && Eu.infos[0].art === 'Datum nicht lesbar' && Eu.infos[0].text.indexOf('27.10.26') > 0, JSON.stringify(Eu.infos));
  pruefe('hinweise des Lesers durchgereicht', JSON.stringify(P.einstufen({ ok: true, hinweise: ['Kalender nicht gelesen: X'] }, [], '2026-10-27').hinweise) === '["Kalender nicht gelesen: X"]');

  const A = (o) => Object.assign({ typ: 'grund', grund: 'KRV', bis: '', entryId: 'X' }, o);
  const H = '2026-10-30';
  pruefe('von heute ohne bis', P.abwesendHeute([A({ ma: 'A, B', von: H, zeit: H + 'T08:00' })], H).length === 1);
  pruefe('von gestern ohne bis = nicht heute', P.abwesendHeute([A({ ma: 'A, B', von: '2026-10-29', zeit: '2026-10-29T08:00' })], H).length === 0);
  pruefe('Zeitraum deckt heute', P.abwesendHeute([A({ ma: 'A, B', von: '2026-10-27', bis: '2026-10-31', zeit: '2026-10-27T08:00' })], H).length === 1);
  pruefe('Zeitraum vorbei', P.abwesendHeute([A({ ma: 'A, B', von: '2026-10-20', bis: '2026-10-29', zeit: '2026-10-20T08:00' })], H).length === 0);
  pruefe('kuenftig nicht heute', P.abwesendHeute([A({ ma: 'A, B', von: '2026-11-02', bis: '2026-11-05', zeit: '2026-10-29T08:00' })], H).length === 0);
  pruefe('bis vor von wird ignoriert', P.abwesendHeute([A({ ma: 'A, B', von: H, bis: '2026-10-01', zeit: H + 'T08:00' })], H).length === 1);
  pruefe('juengste gewinnt (auch bei anderer Namensreihenfolge)', P.abwesendHeute([
    A({ ma: 'Muster, Anna', von: '2026-10-27', bis: '2026-10-31', zeit: '2026-10-27T08:00' }),
    A({ ma: 'Anna Muster', grund: 'Urlaub', von: '2026-11-03', zeit: '2026-10-29T09:00' })], H).length === 0);
  pruefe('Auffaelligkeit zaehlt nicht als abwesend', P.abwesendHeute([A({ typ: 'auff', ma: 'A, B', von: H, zeit: H + 'T08:00' })], H).length === 0);
  const sortiert = P.abwesendHeute([A({ ma: 'Zett, A', von: H, zeit: H + 'T08:00' }), A({ ma: 'Aal, B', von: H, zeit: H + 'T09:00' })], H);
  pruefe('sortiert nach Name', sortiert[0].ma === 'Aal, B');
  pruefe('normName wie rcNormName', P.normName('Müller, Jörg') === P.normName('Jorg Muller') && P.normName('Groß') === 'gross');

  pruefe('BOM und CRLF', JSON.stringify(P.wichtigLesen('\uFEFF# Kopf\r\nBritta\r\n\r\nchef@firma.de\r\n')) === JSON.stringify(['britta', 'chef@firma.de']));
  pruefe('Treffer im Namen', P.wichtigTreffer(['britta'], 'Britta Beispiel', 'b@x.de') === 'britta');
  pruefe('Treffer in der Adresse', P.wichtigTreffer(['chef@firma.de'], 'Chef', 'Chef@Firma.de') === 'chef@firma.de');
  pruefe('kein Treffer', P.wichtigTreffer(['britta'], 'Anna', 'a@x.de') === '');

  const roh = {
    ok: true, ungelesen: 7,
    mails: [
      { entryId: 'E1', zeit: H + 'T09:31', absender: 'Vodafone Disposition', email: 'vodafone-disposition@regiocom.com', betreff: 'MA: Muster, Anna, Grund: KRV', ungelesen: true, vorschau: 'v1', inhalt: 'GEHEIM' },
      { entryId: 'E2', zeit: H + 'T09:15', absender: 'Projektleitung', email: 'pl@regiocom.com', betreff: 'Zielvorgabe November', ungelesen: true, vorschau: 'v2' },
      { entryId: 'E3', zeit: H + 'T09:02', absender: 'Reporting', email: 'r@regiocom.com', betreff: 'PIX Auswertung KW 44', ungelesen: false, vorschau: 'v3' },
      { entryId: 'E4', zeit: H + 'T08:40', absender: 'IT', email: 'it@regiocom.com', betreff: 'Newsletter', ungelesen: false, vorschau: 'v4' },
      { entryId: 'E5', zeit: H + 'T08:30', absender: 'Steuerung Britta', email: 's@regiocom.com', betreff: 'Info', ungelesen: false, vorschau: 'v5' }
    ],
    dispo: [
      { entryId: 'D1', zeit: H + 'T09:31', betreff: 'MA: Muster, Anna, Grund: KRV' },
      { entryId: 'D2', zeit: H + 'T08:00', betreff: 'MA: Probe, Lena, Auffaelligkeit: AHT hoch' },
      { entryId: 'D3', zeit: '2026-10-29T08:00', betreff: 'MA: kaputt' },
      { entryId: 'D4', zeit: H + 'T10:00', betreff: 'AW: MA: Muster, Anna, Grund: KRV' }
    ]
  };
  const E = P.einstufen(roh, ['projektleitung', 'britta'], H);
  const kat = (id) => (E.mails.find((m) => m.entryId === id) || {}).kategorie;
  pruefe('Kategorie Steuerung', kat('E1') === 'Steuerung');
  pruefe('Kategorie Management', kat('E2') === 'Management');
  pruefe('Kategorie Performance', kat('E3') === 'Performance');
  pruefe('Kategorie Rest', kat('E4') === 'Rest');
  const e5 = E.mails.find((m) => m.entryId === 'E5');
  pruefe('Steuerung schlaegt Management, wichtig bleibt gesetzt', e5.kategorie === 'Steuerung' && e5.wichtig === 'britta');
  pruefe('kein Feld inhalt im Ergebnis', JSON.stringify(E).indexOf('inhalt') < 0 && JSON.stringify(E).indexOf('GEHEIM') < 0);
  pruefe('fehlende termine = []', Array.isArray(E.termine) && E.termine.length === 0);
  pruefe('ungelesen durchgereicht', E.ungelesen === 7 && E.ok === true && E.grund === '');
  pruefe('abwesend aus dispo (Antwort zaehlt nicht doppelt)', E.abwesend.length === 1 && E.abwesend[0].ma === 'Muster, Anna' && E.abwesend[0].entryId === 'D1');
  pruefe('infos: Auffaelligkeit + nicht lesbar, neueste zuerst', E.infos.length === 2 && E.infos[0].art === 'Auffälligkeit' && E.infos[1].art === 'nicht lesbar' && E.infos[1].text === 'MA: kaputt');
  pruefe('Roh ohne Arrays bricht nicht', (() => { try { const x = P.einstufen({ ok: true }, [], H); return x.mails.length === 0 && x.abwesend.length === 0; } catch (e) { return false; } })());

  // Wichtig-Datei
  const datei = path.join(TMP, 'Postfach_Wichtig.txt');
  const z = P.wichtigSichern(datei);
  pruefe('fehlende Datei wird angelegt', fs.existsSync(datei) && z.includes('britta') && z.includes('özdemir'));
  pruefe('Vorlage beginnt ohne BOM', fs.readFileSync(datei)[0] !== 0xEF);
  pruefe('Vorlage ist CRLF', fs.readFileSync(datei, 'utf8').indexOf('\r\n') > 0);
  pruefe('neu', P.wichtigAendern(datei, 'neu', ' Chef@Firma.de ').ok && P.wichtigSichern(datei).includes('chef@firma.de'));
  const vorher = fs.readFileSync(datei, 'utf8');
  pruefe('doppelt schreibt nicht', P.wichtigAendern(datei, 'neu', 'chef@firma.de').ok && fs.readFileSync(datei, 'utf8') === vorher);
  pruefe('weg', P.wichtigAendern(datei, 'weg', 'chef@firma.de').ok && !P.wichtigSichern(datei).includes('chef@firma.de'));
  const nv = P.wichtigAendern(datei, 'weg', 'gibts@nicht.de');
  pruefe('weg nicht vorhanden', !nv.ok && nv.grund === 'nicht in Postfach_Wichtig.txt');
  pruefe('ungueltig (Zeilenumbruch)', P.wichtigAendern(datei, 'neu', 'a\nb').grund === 'Eintrag ungueltig');
  pruefe('ungueltig (zu kurz)', P.wichtigAendern(datei, 'neu', 'ab').grund === 'Eintrag ungueltig');
  pruefe('weg einer Adresse laesst Muster stehen', !P.wichtigAendern(datei, 'weg', 'b@x.de').ok && P.wichtigSichern(datei).includes('britta'));
  pruefe('Kopfzeilen bleiben nach Aendern', fs.readFileSync(datei, 'utf8').indexOf('# Postfach_Wichtig.txt') === 0);
  const notepad = path.join(TMP, 'np.txt');
  fs.writeFileSync(notepad, '\uFEFFBritta\r\nchef@x.de\r\n');
  pruefe('mit BOM gespeicherte Datei: weg findet die erste Zeile', P.wichtigAendern(notepad, 'weg', 'britta').ok && P.wichtigSichern(notepad).join() === 'chef@x.de');
  pruefe('gesperrt/Ordner statt Datei: Lesefehler -> [] statt Wurf', (() => { try { return P.wichtigSichern(TMP).length === 0; } catch (e) { return false; } })());
}

async function abschnitt2() {
  console.log('\n2 Laufsteuerung');
  const P = require('../esl_dienst_postfach.js');
  if (typeof P.postfachStarten !== 'function') { pruefe('postfachStarten exportiert', false, 'postfachStarten is not a function'); return; }
  const LESER = path.join(__dirname, 'postfach_schein_leser.js'), AKTION = path.join(__dirname, 'postfach_schein_aktion.js');
  const PROT = path.join(TMP, 'aktionen.txt');
  process.env.PF_SCHEIN_PROTOKOLL = PROT;
  const protokoll = () => { try { return fs.readFileSync(PROT, 'utf8').trim().split('\n').filter(Boolean).map((z) => JSON.parse(z)); } catch (e) { return []; } };
  function starte(modus, extra) {
    process.env.PF_SCHEIN = modus;
    const logs = [], lief = [];
    const s = P.postfachStarten(Object.assign({ datei: path.join(TMP, 'w2.txt'), leser: LESER, aktionSkript: AKTION, taktSek: 3600, fristMs: 8000, aktionFristMs: 8000,
      log: (t) => logs.push(t), beiLieferung: (k) => lief.push(k) }, extra));
    return { s, logs, lief };
  }

  let x = starte('ok');
  await x.s.lesen();
  const k = x.s.kopf(), dt = x.s.daten();
  pruefe('ok: Startlauf liefert', k.nr === 1 && k.ok === true && k.grund === '' && x.lief.length === 1, JSON.stringify(k));
  pruefe('ok: drei Mails, BOM der Ausgabe stoert nicht', dt.mails.length === 3 && dt.ungelesen === 12);
  pruefe('ok: abwesend und infos eingestuft', dt.abwesend.length === 1 && dt.abwesend[0].ma === 'Muster, Anna' && dt.infos.length === 1);
  pruefe('ok: daten traegt den Kopf', dt.nr === 1 && dt.ok === true && typeof dt.zeit === 'number' && dt.zeit > 0 && dt.gelesen === true);
  pruefe('Kopf hat genau nr, zeit, ok, grund', JSON.stringify(Object.keys(k).sort()) === JSON.stringify(['grund', 'nr', 'ok', 'zeit']));
  const fremd = ['Zielvorgabe', 'Projektleitung', 'Chef', 'Muster', 'Probe', 'Besprechung', 'Teamleiter'];
  pruefe('Log ohne Betreff/Absender/Namen', x.logs.length > 0 && x.logs.every((l) => fremd.every((w) => l.indexOf(w) < 0)), JSON.stringify(x.logs));
  pruefe('Log nennt Zahlen', /Postfach gelesen: 3 Mails, 2 Dispo, 1 Termine/.test(x.logs.join('|')), JSON.stringify(x.logs));

  // letzter guter Stand
  process.env.PF_SCHEIN = 'fehler';
  await x.s.lesen();
  pruefe('Fehlschlag: Kopf meldet Grund, nr zaehlt', x.s.kopf().nr === 2 && x.s.kopf().ok === false && /nicht erreichbar/.test(x.s.kopf().grund));
  pruefe('Fehlschlag: letzter guter Stand bleibt', x.s.daten().mails.length === 3 && x.s.daten().ok === false);
  const leerBeiFehler = (alt, r) => (r.ok ? r : { mails: [] });
  pruefe('Gegenprobe: Leeren bei Fehlschlag faellt durch', leerBeiFehler({ mails: [1, 2, 3] }, { ok: false }).mails.length !== 3);

  // Aktionen (Schein-Aktion protokolliert die Argumente)
  const id = '00AB'.repeat(8);
  let r = await x.s.aktion({ art: 'oeffnen', entryId: id });
  pruefe('oeffnen: Argumente', r.ok && JSON.stringify(protokoll().pop()) === JSON.stringify(['-Art', 'oeffnen', '-EntryId', id]));
  r = await x.s.aktion({ art: 'antworten', entryId: id });
  pruefe('antworten: Argumente', r.ok && protokoll().pop()[1] === 'antworten');
  const n0 = protokoll().length;
  r = await x.s.aktion({ art: 'oeffnen', entryId: 'x; rm' });
  pruefe('ungueltige Kennung: abgelehnt, kein Aufruf', !r.ok && protokoll().length === n0);
  r = await x.s.aktion({ art: 'entwurf', entwurf: { betreff: 'Teamwerte T-82', text: 'Grüße an Ünal' } });
  const a = protokoll().pop();
  const dek = a && a[3] ? JSON.parse(Buffer.from(a[3], 'base64').toString('utf8')) : {};
  pruefe('entwurf: Base64-JSON mit Umlauten', r.ok && a[1] === 'entwurf' && a[2] === '-Daten' && dek.betreff === 'Teamwerte T-82' && dek.text === 'Grüße an Ünal');
  r = await x.s.aktion({ art: 'entwurf', entwurf: { betreff: 'x'.repeat(301), text: '' } });
  pruefe('entwurf: zu langer Betreff abgelehnt', !r.ok);
  r = await x.s.aktion({ art: 'senden' });
  pruefe('unbekannte Aktion', !r.ok && r.grund === 'unbekannte Aktion');

  // Wichtig per Knopf: sofort neu eingestuft, ohne Outlook neu zu lesen
  const nrVor = x.s.kopf().nr;
  r = await x.s.aktion({ art: 'wichtig_neu', eintrag: 'Chef@Firma.de' });
  const chef = x.s.daten().mails.find((m) => m.email === 'chef@firma.de');
  pruefe('wichtig_neu: Datei, Einstufung, nr', r.ok && fs.readFileSync(path.join(TMP, 'w2.txt'), 'utf8').indexOf('chef@firma.de') > 0 &&
    chef && chef.wichtig === 'chef@firma.de' && x.s.kopf().nr === nrVor + 1);
  pruefe('wichtig_neu nach Fehlschlag: Kopf bleibt "nicht gelesen"', x.s.kopf().ok === false);
  r = await x.s.aktion({ art: 'wichtig_weg', eintrag: 'chef@firma.de' });
  pruefe('wichtig_weg', r.ok && x.s.daten().mails.find((m) => m.email === 'chef@firma.de').wichtig === '');
  x.s.stoppen();

  x = starte('umlaut');
  await x.s.lesen();
  pruefe('Umlaute unverfaelscht', x.s.daten().mails[0].absender === 'Özdemir, Ünal' && x.s.daten().mails[0].betreff === 'Prüfung Größe');
  x.s.stoppen();

  x = starte('kaputt');
  await x.s.lesen();
  pruefe('kein JSON -> Leser-Antwort nicht lesbar', x.s.kopf().grund === 'Leser-Antwort nicht lesbar');
  // Review Important 1: "nie gelesen" darf nicht wie "keine Abwesenheit" aussehen -> gelesen:false, keine Listen.
  pruefe('vor erstem Erfolg: gelesen:false, keine Listen', x.s.daten().gelesen === false && x.s.daten().mails === undefined && x.s.daten().abwesend === undefined);
  x.s.stoppen();

  const neuDatei = path.join(TMP, 'start_wichtig.txt');
  x = starte('fehler', { datei: neuDatei });
  pruefe('Wichtig-Datei entsteht beim Start, auch ohne Outlook', fs.existsSync(neuDatei));
  await x.s.lesen();
  x.s.stoppen();

  x = starte('exit');
  await x.s.lesen();
  pruefe('Exit-Code != 0 -> erste stderr-Zeile', x.s.kopf().grund === 'Kaputt XY', x.s.kopf().grund);
  x.s.stoppen();

  x = starte('haengt', { fristMs: 1500 });
  const t0 = Date.now();
  const p1 = x.s.lesen(), p2 = x.s.lesen();
  await Promise.all([p1, p2]);
  pruefe('Frist: Abbruch mit Grund', x.s.kopf().grund === 'Frist 2 s abgelaufen' && Date.now() - t0 < 6000, x.s.kopf().grund + ' nach ' + (Date.now() - t0) + ' ms');
  pruefe('kein Doppel-Lesen', x.lief.length === 1);
  x.s.stoppen();
}

function abschnitt3() {
  console.log('\n3 Skripte');
  const LESEN = path.join(WURZEL, 'postfach_lesen.ps1'), AKTION = path.join(WURZEL, 'postfach_aktion.ps1');
  const da = fs.existsSync(LESEN) && fs.existsSync(AKTION);
  pruefe('beide Skripte vorhanden', da);
  if (!da) return;
  const bl = fs.readFileSync(LESEN), ba = fs.readFileSync(AKTION);
  const bom = (b) => b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF;
  pruefe('BOM (PowerShell 5.1 liest sonst ANSI)', bom(bl) && bom(ba));
  const tl = bl.toString('utf8'), ta = ba.toString('utf8');
  pruefe('stdout als UTF-8 ohne BOM', tl.indexOf('UTF8Encoding $false') > 0 && ta.indexOf('UTF8Encoding $false') > 0);
  const sendet = (t) => /\.send\s*\(/i.test(t);
  pruefe('kein .Send( in beiden Skripten', !sendet(tl) && !sendet(ta));
  pruefe('Gegenprobe: Send-Regel erkennt $m.Send()', sendet(ta + '\n$m.Send()'));
  pruefe('Lesen holt keinen Mailtext (inhalt)', !/inhalt/i.test(tl));
  pruefe('Lesen: hoechstens 60 Mails', /Min\(60,/.test(tl));
  pruefe('Lesen: Dispo 7 Tage', /AddDays\(-7\)/.test(tl));
  // Review: ein Fehler in Dispo oder Kalender darf die Mails nicht mitreissen und muss sichtbar werden.
  pruefe('Lesen: Dispo und Kalender je eigener Fehlerzweig mit Hinweis', tl.indexOf("'Dispo nicht gelesen: '") > 0 && tl.indexOf("'Kalender nicht gelesen: '") > 0 && /hinweise\s*=\s*\$hinweise/.test(tl));
  pruefe('Aktion: dreimal Display($false)', (ta.match(/Display\(\$false\)/g) || []).length === 3);
  pruefe('Aktion: Entwurf ohne Empfaenger', !/\.To\s*=\s*[^'"\s]/.test(ta.replace(/\.To\s*=\s*''/, '')));
  const { execFileSync } = require('child_process');
  for (const f of [LESEN, AKTION]) {
    let n = null;
    try {
      n = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('" + f + "',[ref]$null,[ref]$e); $e.Count"], { encoding: 'utf8', windowsHide: true }).trim();
    } catch (e) { console.log('  [--] PowerShell-Parserprobe uebersprungen (' + path.basename(f) + '): ' + e.message.split('\n')[0]); continue; }
    pruefe('Parserprobe ' + path.basename(f) + ': 0 Fehler', n === '0', 'Fehler: ' + n);
  }
}

// Funktion samt Rumpf; Klammern in Zeichenketten zaehlen nicht (wie dienst_kern_pruefen.js).
function schneide(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' fehlt');
  let tiefe = 0, q = '';
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = ''; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '{') tiefe++;
    else if (c === '}' && --tiefe === 0) return src.slice(i, k + 1);
  }
  throw new Error(name + ': Rumpf nicht geschlossen');
}

function abschnitt4() {
  console.log('\n4 Einbau');
  const Q = fs.readFileSync(path.join(WURZEL, 'esl_dienst.js'), 'utf8');
  // standSchreiben(true) darf den Haenger-Waechter (fortschritt) nicht fuettern.
  const lassen = (src) => {
    const bau = new Function('src', 'let fortschritt = 5, standText = ""; const stand = { nr: 0 }, STAND = "x", schreibeAtomar = () => {}, log = () => {};' +
      src + '; standSchreiben(true); const a = fortschritt; standSchreiben(); return { nebenher: a, normal: fortschritt, nr: stand.nr };');
    return bau(src);
  };
  let r = null;
  try { r = lassen(schneide(Q, 'standSchreiben')); } catch (e) { pruefe('standSchreiben schneidbar', false, e.message); }
  if (r) {
    pruefe('standSchreiben(true) laesst fortschritt stehen', r.nebenher === 5);
    pruefe('standSchreiben() setzt fortschritt', r.normal > 5);
    pruefe('beide zaehlen stand.nr', r.nr === 2);
  }
  const alt = 'function standSchreiben() {\n  fortschritt = Date.now();\n  stand.nr++;\n  standText = JSON.stringify(stand);\n}';
  pruefe('Gegenprobe: alte Fassung fuettert den Waechter auch nebenher', lassen(alt).nebenher !== 5);

  pruefe('Schalter nur bei "1"', Q.indexOf("U.ESL_DIENST_POSTFACH === '1'") > 0);
  pruefe('GET /api/postfach nur mit Schalter', /if \(POSTFACH && pfad === '\/api\/postfach'\)/.test(Q));
  pruefe('POST /api/postfach/aktion nur mit Schalter', /if \(POSTFACH && req\.method === 'POST' && pfad === '\/api\/postfach\/aktion'\)/.test(Q));
  // Liegt Stelle i in einem noch offenen "if (POSTFACH) {"-Block?
  const imBlock = (i) => {
    const s = Q.lastIndexOf('if (POSTFACH) {', i);
    if (s < 0) return false;
    const t = Q.slice(s, i);
    return (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length > 0;
  };
  const stellen = (wort) => { const a = []; let i = -1; while ((i = Q.indexOf(wort, i + 1)) >= 0) a.push(i); return a; };
  const starts = stellen('postfachStarten(');
  pruefe('postfachStarten( genau einmal, im if (POSTFACH)-Block', starts.length === 1 && imBlock(starts[0]), 'Stellen: ' + starts.length);
  const zuw = stellen('stand.postfach =');
  pruefe('stand.postfach = nur im if (POSTFACH)-Block', zuw.length >= 2 && zuw.every(imBlock), 'Stellen: ' + zuw.length);
  pruefe('Gegenprobe: imBlock erkennt eine Stelle ausserhalb', !imBlock(Q.indexOf('function standLaden')));
  pruefe('standLaden uebernimmt kein altes postfach', schneide(Q, 'standLaden').indexOf('postfach') < 0);

  const cmd = fs.readFileSync(path.join(WURZEL, 'ESL_Dienst_Start.cmd'), 'utf8');
  pruefe('Starter: ab Werk aus', cmd.indexOf('set "ESL_DIENST_POSTFACH=0"') > 0 && cmd.indexOf('set "ESL_DIENST_POSTFACH=1"') < 0);
  pruefe('Starter: Schalter vor dem Node-Aufruf', cmd.indexOf('ESL_DIENST_POSTFACH=0') < cmd.indexOf('esl_dienst.js"'));
  pruefe('.gitignore: Postfach_Wichtig.txt* (auch .tmp-Reste)', /^Postfach_Wichtig\.txt\*\s*$/m.test(fs.readFileSync(path.join(WURZEL, '.gitignore'), 'utf8')));
  const sch = schneide(fs.readFileSync(path.join(WURZEL, 'esl_dienst_postfach.js'), 'utf8'), 'schreibe');
  pruefe('schreibe: Wiederholung bei gesperrter Datei, .tmp wird bei Fehlschlag entfernt', /EBUSY/.test(sch) && /unlinkSync/.test(sch));
  const b = fs.readFileSync(path.join(WURZEL, 'bundle_bauen.js'), 'utf8');
  pruefe('Paket: drei neue Dateien', ['esl_dienst_postfach.js', 'postfach_lesen.ps1', 'postfach_aktion.ps1'].every((n) => b.indexOf("'" + n + "'") > 0));
  pruefe('Paket: Postfach_Wichtig.txt NICHT', b.indexOf('Postfach_Wichtig') < 0);
}

async function main() {
  try {
    abschnitt1();
    await abschnitt2();
    abschnitt3();
    abschnitt4();
  } finally {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* egal */ }
  }
  console.log('');
  console.log('----------------------------------------------------');
  console.log(fehler === 0
    ? 'ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN.'
    : fehler + ' von ' + geprueft + ' Pruefungen FEHLGESCHLAGEN.');
  process.exit(fehler === 0 ? 0 : 1);
}
main().catch((e) => { console.log('ABBRUCH: ' + ((e && e.stack) || e)); process.exit(1); });
