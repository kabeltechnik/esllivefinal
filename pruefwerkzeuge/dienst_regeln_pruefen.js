/* ============================================================================
   DIENST-REGELN PRUEFEN
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/dienst_regeln_pruefen.js

   Prueft esl_dienst_regeln.js, die reinen Regeln des Datendienstes (keine
   Ein-/Ausgabe, kein Portal). Die Funktionen werden direkt aufgerufen - ein
   Nachbau wuerde nur seine eigene Kopie bewachen.

   Zu den kritischen Regeln gehoert je eine GEGENPROBE: die naheliegende, aber
   falsche Bauart wird hier nachgebaut und muss durchfallen. Sonst weiss man
   nicht, ob die Pruefung den echten Fehler ueberhaupt erkennen wuerde.
============================================================================ */
'use strict';

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}

const R = require('../esl_dienst_regeln.js');
const T = (j, m, d) => new Date(j, m - 1, d);
const t = Date.now();
const J = (x) => JSON.stringify(x);

console.log('DIENST-REGELN PRUEFEN');
console.log('');

console.log('1) Datum');
pruefe('PROJEKTE', J(R.PROJEKTE) === '["kabel","mobile","um"]');
pruefe('datumIso einstellig aufgefuellt', R.datumIso(T(2026, 1, 5)) === '2026-01-05');
pruefe('datumIso zweistellig', R.datumIso(T(2026, 10, 27)) === '2026-10-27');
pruefe('isoZuDe', R.isoZuDe('2026-10-27') === '27.10.2026');
pruefe('isoZuYmd', R.isoZuYmd('2026-10-07') === '20261007');

console.log('');
console.log('2) Vortage-Bereich');
pruefe('Di 27.10.: Monatsanfang', J(R.vortageBereich(T(2026, 10, 27))) === '{"von":"2026-10-01","bis":"2026-10-26"}');
pruefe('Do 01.10.: Woche reicht in den Vormonat', J(R.vortageBereich(T(2026, 10, 1))) === '{"von":"2026-09-28","bis":"2026-09-30"}');
pruefe('Mo 01.06.: nichts zu holen', R.vortageBereich(T(2026, 6, 1)) === null);
pruefe('Mo 26.10.: bis ist gestern (Sonntag)', J(R.vortageBereich(T(2026, 10, 26))) === '{"von":"2026-10-01","bis":"2026-10-25"}');
pruefe('So 04.10.: Montag liegt im Vormonat', J(R.vortageBereich(T(2026, 10, 4))) === '{"von":"2026-09-28","bis":"2026-10-03"}');
pruefe('Fr 01.01.2027: Jahreswechsel', J(R.vortageBereich(T(2027, 1, 1))) === '{"von":"2026-12-28","bis":"2026-12-31"}');
pruefe('Mi 02.12.: Montag (30.11.) liegt vor dem Monatsanfang', J(R.vortageBereich(T(2026, 12, 2))) === '{"von":"2026-11-30","bis":"2026-12-01"}');
// Gegenprobe: die naheliegende, falsche Regel "von = Montag dieser Woche" holt am
// 27.10. nur den 26.10. - der Rest des Monats fehlte in Woche/Monat.
function vortageNurMontag(heute) {
  const dow = (heute.getDay() + 6) % 7;
  const von = R.datumIso(new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() - dow));
  const bis = R.datumIso(new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() - 1));
  return von > bis ? null : { von, bis };
}
pruefe('Gegenprobe: "von = Montag" liefert den 27.10. falsch',
  J(vortageNurMontag(T(2026, 10, 27))) !== '{"von":"2026-10-01","bis":"2026-10-26"}',
  'Die nachgebaute Fehlregel stimmt zufaellig mit der richtigen ueberein - die Pruefung waere blind.');

console.log('');
console.log('3) Takte: Liga, Vortage, Neuanmeldung, Ersatz, Fehlerseite');
pruefe('Liga Runde 0/1/3', R.ligaFaellig(0, 3) && !R.ligaFaellig(1, 3) && R.ligaFaellig(3, 3));
pruefe('Liga Runde 2/6 bei jede 3', !R.ligaFaellig(2, 3) && R.ligaFaellig(6, 3));
pruefe('Liga jede Runde bei jede 1', R.ligaFaellig(0, 1) && R.ligaFaellig(1, 1) && R.ligaFaellig(7, 1));
pruefe('Vortage: nie gelaufen -> faellig', R.vortageFaellig('2026-10-27', null, t));
pruefe('Vortage: gleicher Tag erledigt -> nicht faellig', !R.vortageFaellig('2026-10-27', { tag: '2026-10-27', versuchUm: t - 5 * 3600e3 }, t));
pruefe('Vortage: anderer Tag, kein Versuch -> faellig', R.vortageFaellig('2026-10-27', { tag: '2026-10-26' }, t));
pruefe('Vortage: Wiederholsperre 10 Min', !R.vortageFaellig('2026-10-27', { tag: '2026-10-26', versuchUm: t - 10 * 60e3 }, t));
pruefe('Vortage: Wiederholsperre abgelaufen 61 Min', R.vortageFaellig('2026-10-27', { tag: '2026-10-26', versuchUm: t - 61 * 60e3 }, t));
pruefe('Vortage: eigene Wiederholfrist 5 Min', R.vortageFaellig('2026-10-27', { tag: '2026-10-26', versuchUm: t - 10 * 60e3 }, t, 5));
pruefe('Deckel: 3 in 30 Min', !R.anmeldungErlaubt([t - 60e3, t - 120e3, t - 180e3], t));
pruefe('Deckel: alte zaehlen nicht', R.anmeldungErlaubt([t - 31 * 60e3, t - 60e3, t - 120e3], t));
pruefe('Deckel: leer erlaubt', R.anmeldungErlaubt([], t));
pruefe('Deckel: eigener Deckel 1', !R.anmeldungErlaubt([t - 60e3], t, 1));
pruefe('Liga-Ersatz: noch nie -> erlaubt', R.ligaErsatzErlaubt(null, t));
pruefe('Liga-Ersatz: vor 5 Min -> gesperrt', !R.ligaErsatzErlaubt(t - 5 * 60e3, t));
pruefe('Liga-Ersatz: vor 11 Min -> erlaubt', R.ligaErsatzErlaubt(t - 11 * 60e3, t));
pruefe('Fehlerseite: nicht darauf -> nichts', !R.fehlerseiteNeuladen(null, t));
pruefe('Fehlerseite: 10 s -> warten', !R.fehlerseiteNeuladen(t - 10e3, t));
pruefe('Fehlerseite: 21 s -> neu laden', R.fehlerseiteNeuladen(t - 21e3, t));
pruefe('Fehlerseite: eigene Wartezeit', R.fehlerseiteNeuladen(t - 6e3, t, 5));

console.log('');
console.log('4) Antwort der Ligaliste');
const art = (status, auszug, hatTabelle, zeilen) => R.ligaAntwortArt({ status, auszug, hatTabelle, zeilen });
pruefe('401 ist tot', art(401, '', false, 0) === 'sitzung-tot');
pruefe('403 ist tot', art(403, 'x', false, 0) === 'sitzung-tot');
pruefe('401 schlaegt eine Tabelle', art(401, '', true, 9) === 'sitzung-tot');
pruefe('ORA vor Sitzung', art(200, 'ORA-00936 login', false, 0) === 'ora');
pruefe('Sitzung abgelaufen ohne Tabelle ist tot', art(200, 'Sitzung abgelaufen', false, 0) === 'sitzung-tot');
pruefe('keine Berechtigung ist tot', art(200, 'Sie haben keine Berechtigung', false, 0) === 'sitzung-tot');
pruefe('Passwortfeld ist tot', art(200, '<input type="password">', false, 0) === 'sitzung-tot');
pruefe('Status 500 ohne Muster ist http', art(500, 'Fehler', false, 0) === 'http');
pruefe('Tabelle ohne Zeilen ist leer', art(200, '', true, 0) === 'leer');
pruefe('Tabelle mit Zeilen ist ok', art(200, '', true, 520) === 'ok');
pruefe('ORA im Text neben echter Tabelle zaehlt nicht', art(200, 'ORA-00936', true, 3) === 'ok');
pruefe('Status 500 mit Tabelle ist http', art(500, '', true, 3) === 'http');
pruefe('200 ohne Tabelle und ohne Muster ist http (unbekannt, nicht leer)', art(200, 'nichts', false, 0) === 'http');
pruefe('200 ohne Tabelle, ganz ohne Auszug ist http', art(200, '', false, 0) === 'http');
pruefe('leer kommt nur MIT Tabelle vor',
  [200, 500, 401].every(s => ['', 'nichts', 'Fehlerseite'].every(a => art(s, a, false, 0) !== 'leer')) && art(200, '', true, 0) === 'leer');
// Gegenprobe: die alte Regel (200 ohne Tabelle -> leer) macht aus einer Fehlerseite mit
// HTTP 200 eine ehrliche leere Antwort; der Baum zaehlte dann als geliefert (rows: []).
function artAlt({ status, auszug, hatTabelle, zeilen }) {
  if (status === 401 || status === 403) return 'sitzung-tot';
  if (!hatTabelle) {
    const text = String(auszug || '');
    if (/ORA-d{5}/.test(text)) return 'ora';
    if (/keine Berechtigung|Sitzung|password|login/i.test(text)) return 'sitzung-tot';
  }
  if (status !== 200) return 'http';
  return hatTabelle && zeilen > 0 ? 'ok' : 'leer';
}
pruefe('Gegenprobe: die alte Regel (200 ohne Tabelle -> leer) wird erkannt',
  artAlt({ status: 200, auszug: 'nichts', hatTabelle: false, zeilen: 0 }) === 'leer' && art(200, 'nichts', false, 0) !== 'leer',
  'Faellt die alte Fassung nicht auf, misst die Pruefung "leer nur mit Tabelle" nichts.');

console.log('');
console.log('5) Drei Baeume zusammenfuehren');
const z = R.ligaZusammenfuehren({ kabel: { rows: [{ ccsId: '1', callCount: 5 }] }, mobile: { rows: [{ ccsId: '1', callCount: 9 }, { ccsId: '2', callCount: 1 }] }, um: { rows: null, art: 'ora' } });
pruefe('Zusammenfuehren: max calls', z.payload.find(r => r.ccsId === '1').projekt === 'mobile' && z.payload.length === 2);
pruefe('Zusammenfuehren: fehlender Baum', z.vollstaendig === false && z.fehlend.join() === 'um');
pruefe('Zusammenfuehren: Zeile 2 traegt ihr Projekt', z.payload.find(r => r.ccsId === '2').projekt === 'mobile');
const e1 = { ccsId: '1', callCount: 5 };
const z2 = R.ligaZusammenfuehren({ kabel: { rows: [e1] }, mobile: { rows: [] }, um: { rows: [{ ccsId: '7', callCount: 0 }] } });
pruefe('Zusammenfuehren: leerer Baum zaehlt als geliefert', z2.vollstaendig === true && z2.fehlend.length === 0 && z2.payload.length === 2);
pruefe('Zusammenfuehren: Eingabe bleibt unberuehrt', e1.projekt === undefined);
const z3 = R.ligaZusammenfuehren({ kabel: { rows: [{ ccsId: '1', callCount: 4 }] }, mobile: { rows: [{ ccsId: '1', callCount: 4 }] }, um: { rows: [] } });
pruefe('Zusammenfuehren: Gleichstand behaelt den ersten', z3.payload.length === 1 && z3.payload[0].projekt === 'kabel');
const z4 = R.ligaZusammenfuehren({ kabel: { rows: [{ ccsId: '1' }] }, mobile: { rows: [{ ccsId: '1', callCount: 1 }] }, um: { rows: [] } });
pruefe('Zusammenfuehren: fehlendes callCount zaehlt 0', z4.payload.length === 1 && z4.payload[0].projekt === 'mobile');
const z5 = R.ligaZusammenfuehren({ kabel: { rows: null }, mobile: { rows: null }, um: undefined });
pruefe('Zusammenfuehren: nichts geliefert', z5.payload.length === 0 && z5.vollstaendig === false && z5.fehlend.join() === 'kabel,mobile,um');
const z6 = R.ligaZusammenfuehren({ kabel: { rows: [{ name: 'a' }, { name: 'b' }] }, mobile: { rows: [] }, um: { rows: [] } });
pruefe('Zusammenfuehren: Zeilen ohne ccsId bleiben alle', z6.payload.length === 2);

console.log('');
console.log('6) Auftraege einreihen');
const q = [];
const r1 = R.einreihen(q, { art: 'runde' });
const r2 = R.einreihen(q, { art: 'runde' });
pruefe('einreihen: erste Runde neu', r1.neu === true && q.length === 1);
pruefe('einreihen: zweite Runde entdoppelt, liefert die wartende', r2.neu === false && r2.auftrag === r1.auftrag && q.length === 1);
pruefe('einreihen: Liga-Runde ist eine andere Runde', R.einreihen(q, { art: 'runde', liga: true }).neu === true && q.length === 2);
const b1 = R.einreihen(q, { art: 'bereich', von: '2026-10-01', bis: '2026-10-26', projekte: ['kabel', 'um'], quelle: 'vortage' });
const b2 = R.einreihen(q, { art: 'bereich', von: '2026-10-01', bis: '2026-10-26', projekte: ['um', 'kabel'], quelle: 'nutzer' });
pruefe('einreihen: gleicher Bereich (Reihenfolge/Quelle egal) entdoppelt', b1.neu === true && b2.neu === false && b2.auftrag === b1.auftrag);
pruefe('einreihen: anderer Bereich ist neu', R.einreihen(q, { art: 'bereich', von: '2026-10-01', bis: '2026-10-20', projekte: ['kabel', 'um'] }).neu === true);
pruefe('einreihen: andere Projekte sind neu', R.einreihen(q, { art: 'bereich', von: '2026-10-01', bis: '2026-10-26', projekte: ['kabel'] }).neu === true);
pruefe('einreihen: Abruf je Projekt', R.einreihen(q, { art: 'abruf', projekt: 'kabel' }).neu === true && R.einreihen(q, { art: 'abruf', projekt: 'mobile' }).neu === true && R.einreihen(q, { art: 'abruf', projekt: 'kabel' }).neu === false);
pruefe('Schluessel ist ein String', typeof R.auftragSchluessel({ art: 'runde' }) === 'string' && R.auftragSchluessel({ art: 'runde' }) !== R.auftragSchluessel({ art: 'abruf', projekt: 'um' }));

console.log('');
console.log('7) Edge-Argumente');
const a = R.edgeArgumente({ port: 9222, profil: 'C:\\x\\EdgeProfil', cacheDir: '', extra: ['--disable-features=HttpsUpgrades', '--headless=new'], urls: ['http://127.0.0.1:8787/'] });
const feat = (arr) => arr.filter(x => x.startsWith('--disable-features='));
pruefe('disable-features genau einmal, gemischt', feat(a).length === 1 && /HttpsUpgrades/.test(a.join(' ')) && /CalculateNativeWinOcclusion/.test(a.join(' ')));
pruefe('kein Cache ohne Ordner, Adresse zuletzt, kein allow-origins', !a.some(x => /disk-cache/.test(x)) && a[a.length - 1] === 'http://127.0.0.1:8787/' && !a.some(x => /remote-allow-origins|disable-popup-blocking/.test(x)));
pruefe('Pflichtliste: Port, Profil ohne Anfuehrungszeichen', a.includes('--remote-debugging-port=9222') && a.includes('--user-data-dir=C:\\x\\EdgeProfil') && a.includes('--no-first-run') && a.includes('--no-default-browser-check'));
pruefe('Pflichtliste: drei Hintergrund-Flags', ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'].every(f => a.includes(f)));
pruefe('Pflichtliste: drei Features', ['Translate', 'IntensiveWakeUpThrottling', 'CalculateNativeWinOcclusion'].every(f => feat(a)[0].split('=')[1].split(',').includes(f)));
pruefe('Zusatz-Flag steht vor der Adresse', a.indexOf('--headless=new') > -1 && a.indexOf('--headless=new') < a.length - 1);
const a2 = R.edgeArgumente({ port: 9223, profil: 'D:\\p', cacheDir: 'C:\\cache\\x', extra: [], urls: ['http://a/', 'http://b/'] });
pruefe('Cache nur mit Ordner: Ordner und Deckel', a2.includes('--disk-cache-dir=C:\\cache\\x') && a2.includes('--disk-cache-size=314572800'));
pruefe('mehrere Adressen bleiben in Reihenfolge am Ende', a2.slice(-2).join() === 'http://a/,http://b/');
pruefe('ohne extra: ein Feature-Arg, genau die drei', feat(a2).length === 1 && feat(a2)[0] === '--disable-features=Translate,IntensiveWakeUpThrottling,CalculateNativeWinOcclusion');
const a3 = R.edgeArgumente({ port: 9222, profil: 'p', cacheDir: '', extra: ['--disable-features=Translate,Foo', '--disable-features=Bar'], urls: [] });
pruefe('mehrere Extra-Listen und Doppeltes: eine Liste, ohne Wiederholung',
  feat(a3).length === 1 && feat(a3)[0].split('=')[1].split(',').filter(x => x === 'Translate').length === 1 && /Foo/.test(feat(a3)[0]) && /Bar/.test(feat(a3)[0]));
pruefe('ohne urls und extra geht auch', Array.isArray(R.edgeArgumente({ port: 1, profil: 'p', cacheDir: '' })));
// Gegenprobe: die naive Verkettung (Basisliste + extra) ergibt ZWEI --disable-features,
// und Chromium nimmt dann nur die letzte - die Haelfte der Schalter ginge verloren.
const naiv = ['--disable-features=Translate,IntensiveWakeUpThrottling,CalculateNativeWinOcclusion'].concat(['--disable-features=HttpsUpgrades']);
pruefe('Gegenprobe: naive Verkettung ergibt zwei --disable-features', feat(naiv).length === 2,
  'Wuerde die Verkettung nur eines liefern, bewiese die Pruefung "genau einmal" nichts.');

console.log('');
console.log('8) Flag-Zustand eines laufenden Edge');
const zeile = '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" ' + R.edgeArgumente({ port: 9222, profil: 'C:\\x\\EdgeProfil', cacheDir: 'C:\\c', extra: [], urls: ['http://127.0.0.1:8787/'] }).map(x => /\s/.test(x) ? '"' + x + '"' : x).join(' ');
pruefe('Flags nicht pruefbar', R.flagZustand(null).zustand === 'nicht-pruefbar');
pruefe('Flags: leere Kommandozeile ist nicht pruefbar', R.flagZustand('').zustand === 'nicht-pruefbar');
pruefe('Flags: eigene Argumente sind erfuellt', R.flagZustand(zeile).zustand === 'erfuellt' && R.flagZustand(zeile).fehlt.length === 0);
pruefe('Flags: mehr Features sind erlaubt', R.flagZustand(zeile.replace('CalculateNativeWinOcclusion', 'CalculateNativeWinOcclusion,HttpsUpgrades')).zustand === 'erfuellt');
const ohneRb = R.flagZustand(zeile.replace('--disable-renderer-backgrounding', ''));
pruefe('Flags: fehlendes Flag ist verletzt und benannt', ohneRb.zustand === 'verletzt' && ohneRb.fehlt.join(' ').includes('--disable-renderer-backgrounding'));
const ohneF = R.flagZustand(zeile.replace('IntensiveWakeUpThrottling,', ''));
pruefe('Flags: fehlendes Feature ist verletzt und benannt', ohneF.zustand === 'verletzt' && ohneF.fehlt.join(' ').includes('IntensiveWakeUpThrottling'));
const ohneAlles = R.flagZustand('msedge.exe --remote-debugging-port=9222');
pruefe('Flags: Edge ohne alles ist verletzt', ohneAlles.zustand === 'verletzt' && ohneAlles.fehlt.length === 6);
const doppelt = R.flagZustand(zeile + ' --disable-features=HttpsUpgrades');
pruefe('Flags: zwei --disable-features ist verletzt', doppelt.zustand === 'verletzt' && doppelt.fehlt.includes('disable-features doppelt'));
pruefe('Flags: Teilname eines Flags zaehlt nicht', R.flagZustand(zeile.replace('--disable-renderer-backgrounding', '--disable-renderer-backgrounding-x')).zustand === 'verletzt');

console.log('');
console.log('9) Prozesse');
const P = (id, name, cl) => ({ ProcessId: id, Name: name, CommandLine: cl });
pruefe('Konflikt: Liste fehlt -> nicht pruefbar', R.prozessKonflikt(null, 1).art === 'nicht-pruefbar');
pruefe('TL erkannt', R.prozessKonflikt([P(9, 'node.exe', 'node tl_dienst.js 8790 1')], 1).art === 'tl');
pruefe('TL-Starter erkannt', R.prozessKonflikt([P(9, 'cmd.exe', 'cmd /c TL_Starter.cmd')], 1).art === 'tl');
pruefe('alter Starter (.cmd) erkannt', R.prozessKonflikt([P(9, 'cmd.exe', 'cmd /c ESL_Start.cmd')], 1).art === 'altstarter');
pruefe('alter Starter Mobile (.ps1) erkannt', R.prozessKonflikt([P(9, 'powershell.exe', 'powershell -File C:\\x\\ESL_Start_Mobile.ps1')], 1).art === 'altstarter');
pruefe('alter Starter UM erkannt', R.prozessKonflikt([P(9, 'cmd.exe', 'cmd /c "C:\\x\\esl_start_um.cmd"')], 1).art === 'altstarter');
pruefe('eigener Start ist kein alter Starter', R.prozessKonflikt([P(9, 'cmd.exe', 'cmd /c ESL_Dienst_Start.cmd')], 1).art === null);
pruefe('eigener Prozess wird uebergangen', R.prozessKonflikt([P(1, 'node.exe', 'node tl_dienst.js'), P(2, 'node.exe', 'node x.js')], 1).art === null);
pruefe('Fremdes node ist kein Konflikt', R.prozessKonflikt([P(9, 'node.exe', 'node irgendwas.js')], 1).art === null);
pruefe('TL gewinnt gegen alten Starter', R.prozessKonflikt([P(8, 'cmd.exe', 'ESL_Start.cmd'), P(9, 'node.exe', 'node tl_dienst.js')], 1).art === 'tl');
pruefe('Nur leere Kommandozeilen: nicht pruefbar', R.prozessKonflikt([P(8, 'a.exe', null), P(9, 'b.exe', '')], 1).art === 'nicht-pruefbar');
pruefe('Einzelne leere Kommandozeile stoert nicht', R.prozessKonflikt([P(8, 'System', null), P(9, 'node.exe', 'node tl_dienst.js')], 1).art === 'tl');
pruefe('Leere Liste: kein Konflikt', R.prozessKonflikt([], 1).art === null);
pruefe('Konflikt-Text nennt den Prozess', /9/.test(R.prozessKonflikt([P(9, 'node.exe', 'node tl_dienst.js')], 1).text));

const PROFIL = 'C:\\x\\EdgeProfil';
pruefe('Port frei', R.portZustand(null, [], PROFIL) === 'frei');
pruefe('Port fremd', R.portZustand(7, [P(7, 'msedge.exe', 'msedge --user-data-dir="D:\\anders"')], PROFIL) === 'fremd');
pruefe('Port nicht pruefbar', R.portZustand(7, [P(7, 'msedge.exe', null)], PROFIL) === 'nicht-pruefbar');
pruefe('Port eigen (Anfuehrungszeichen um den Wert)', R.portZustand(7, [P(7, 'msedge.exe', 'msedge --user-data-dir="C:\\x\\EdgeProfil" --x')], PROFIL) === 'eigen');
pruefe('Port eigen (Anfuehrungszeichen um das ganze Argument)', R.portZustand(7, [P(7, 'msedge.exe', 'msedge "--user-data-dir=C:\\x\\EdgeProfil" --x')], PROFIL) === 'eigen');
pruefe('Port eigen (Gross/Klein, Schlussstrich)', R.portZustand(7, [P(7, 'msedge.exe', 'msedge --user-data-dir=c:\\X\\edgeprofil\\')], PROFIL) === 'eigen');
pruefe('Port eigen (Profil mit Schlussstrich uebergeben)', R.portZustand(7, [P(7, 'msedge.exe', 'msedge --user-data-dir=C:\\x\\EdgeProfil')], PROFIL + '\\') === 'eigen');
pruefe('Port eigen mit Leerzeichen im Pfad', R.portZustand(7, [P(7, 'msedge.exe', 'msedge --user-data-dir="C:\\a b\\EdgeProfil"')], 'C:\\a b\\EdgeProfil') === 'eigen');
pruefe('Port: Listener nicht in der Liste -> nicht pruefbar', R.portZustand(7, [P(5, 'x.exe', 'x')], PROFIL) === 'nicht-pruefbar');
pruefe('Port: Prozessliste fehlt -> nicht pruefbar', R.portZustand(7, null, PROFIL) === 'nicht-pruefbar');
pruefe('Port: Listener ohne Profil-Argument ist fremd', R.portZustand(7, [P(7, 'msedge.exe', 'msedge --remote-debugging-port=9222')], PROFIL) === 'fremd');

console.log('');
console.log('10) Sperrdatei');
const sp = (leb, pid) => J({ pid: pid || 4711, port: 8787, lebenszeichen: leb });
pruefe('Sperre: keine Datei -> frei', R.sperreFrei(null, t, true));
pruefe('Sperre: frisch und Prozess lebt -> belegt', !R.sperreFrei(sp(t - 30e3), t, true));
pruefe('Sperre: frisch, Prozess tot -> frei', R.sperreFrei(sp(t - 30e3), t, false));
pruefe('Sperre: 181 s alt, Prozess lebt -> frei', R.sperreFrei(sp(t - 181e3), t, true));
pruefe('Sperre: 179 s alt, Prozess lebt -> belegt', !R.sperreFrei(sp(t - 179e3), t, true));
pruefe('Sperre: kaputte Datei -> frei', R.sperreFrei('{kaputt', t, true));
pruefe('Sperre: Datei ohne Lebenszeichen -> frei', R.sperreFrei(J({ pid: 1 }), t, true));
pruefe('Sperre: Pruefung als Funktion bekommt die PID', !R.sperreFrei(sp(t - 1e3, 4711), t, (pid) => pid === 4711) && R.sperreFrei(sp(t - 1e3, 4711), t, (pid) => pid === 1));

console.log('');
console.log('11) Anfrage an den Dienst');
pruefe('Anfrage: falscher Host', !R.anfrageErlaubt({ host: 'localhost:8787', cookie: 'rcDienst=g' }, 'g', 8787));
pruefe('Anfrage: Cookie unter mehreren', R.anfrageErlaubt({ host: '127.0.0.1:8787', cookie: 'a=1; rcDienst=g' }, 'g', 8787));
pruefe('Anfrage: nur das Cookie', R.anfrageErlaubt({ host: '127.0.0.1:8787', cookie: 'rcDienst=g' }, 'g', 8787));
pruefe('Anfrage: falscher Port', !R.anfrageErlaubt({ host: '127.0.0.1:9999', cookie: 'rcDienst=g' }, 'g', 8787));
pruefe('Anfrage: Host ohne Port', !R.anfrageErlaubt({ host: '127.0.0.1', cookie: 'rcDienst=g' }, 'g', 8787));
pruefe('Anfrage: kein Cookie', !R.anfrageErlaubt({ host: '127.0.0.1:8787' }, 'g', 8787));
pruefe('Anfrage: falsches Geheimnis', !R.anfrageErlaubt({ host: '127.0.0.1:8787', cookie: 'rcDienst=x' }, 'g', 8787));
pruefe('Anfrage: Geheimnis nur als Anfang', !R.anfrageErlaubt({ host: '127.0.0.1:8787', cookie: 'rcDienst=gX' }, 'g', 8787));
pruefe('Anfrage: fremder Cookie-Name mit gleichem Ende', !R.anfrageErlaubt({ host: '127.0.0.1:8787', cookie: 'xrcDienst=g' }, 'g', 8787));
pruefe('Anfrage: leeres Geheimnis wird nie akzeptiert', !R.anfrageErlaubt({ host: '127.0.0.1:8787', cookie: 'rcDienst=' }, '', 8787));

console.log('');
console.log('----------------------------------------------------');
console.log(fehler === 0
  ? 'ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN.'
  : fehler + ' von ' + geprueft + ' Pruefungen FEHLGESCHLAGEN.');
process.exit(fehler === 0 ? 0 : 1);
