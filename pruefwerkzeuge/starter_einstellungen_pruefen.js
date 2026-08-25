// ============================================================================
//  starter_einstellungen_pruefen.js — Einstellungen in der Starter-Datei
//                                     (Nutzer-Vorgabe 14.08.2026)
//
//  "Ich moechte einfach, dass man in der Starter Datei einstellen kann, ob ich
//   zum Beispiel Genesis eingeschaltet haben will, ob ich das Radarfeld
//   eingeschaltet haben will. Alle Einstellungen, die ich einstellen kann,
//   moechte ich in der Starter-Datei entscheiden koennen auch."
//
//  Die Gefahr dabei ist eine ganz bestimmte: In ESL_Start.cmd stehen die
//  Schalternamen als ZEICHENKETTEN, die auf Funktionen in esl_live_arena_v22.js
//  zeigen. Wird dort eine umbenannt, merkt das niemand - man stellt in der
//  .cmd etwas ein und im Dashboard passiert stillschweigend nichts. Genau die
//  Fehlerklasse, die dieses Projekt schon mehrfach getroffen hat ("gebaut, aber
//  nirgends aufgerufen" / "aufgerufen, aber nie definiert").
//
//  Deshalb ist der Kern dieses Werkzeugs ein ABGLEICH ueber beide Dateien:
//  jeder Name, den der Starter benutzt, muss im Dashboard existieren - und
//  umgekehrt darf kein Schalter in der .cmd stehen, der nirgends ankommt.
//
//  Zusaetzlich wird der zusammengebaute JavaScript-Text ECHT geparst. Er
//  entsteht in PowerShell durch Zeichenketten-Verkettung; ein falsch gesetztes
//  Anfuehrungszeichen faellt sonst erst am Zielrechner auf.
// ============================================================================
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const cmd  = fs.readFileSync(path.join(WURZEL, 'ESL_Start.cmd'), 'utf8');
const ps1  = fs.readFileSync(path.join(WURZEL, 'ESL_Start.ps1'), 'utf8');
const dash = fs.readFileSync(path.join(WURZEL, 'esl_live_arena_v22.js'), 'utf8');
const auto = fs.readFileSync(path.join(WURZEL, 'esl_autopilot.user.js'), 'utf8');

let ok = 0, fehl = 0;
function pruef(name, bed, ist) {
  if (bed) { ok++; console.log('  ok   ' + name); }
  else { fehl++; console.log('  FEHL ' + name + (ist !== undefined ? '  -> ' + ist : '')); }
}
function schneide(s, kopf) {
  const i = s.indexOf(kopf);
  if (i < 0) return '';
  let tiefe = 0, start = s.indexOf('{', i);
  for (let j = start; j < s.length; j++) {
    if (s[j] === '{') tiefe++;
    else if (s[j] === '}') { tiefe--; if (!tiefe) return s.slice(i, j + 1); }
  }
  return '';
}

const fn = schneide(cmd, 'function WendeEinstellungenAn($ziele)');

// ============================================================================
console.log('\n-- 1. Die Funktion ist da UND wird aufgerufen --');
pruef('WendeEinstellungenAn existiert', !!fn);
// Erste Pruefung bei jedem neuen Baustein dieses Projekts: ruft das ueberhaupt
// jemand? esl_mail_report.ps1 und EinAnmeldeVersuch lagen beide fertig da und
// wurden von keiner Stelle gerufen.
const aufrufe = (cmd.match(/(?<!function )WendeEinstellungenAn \$/g) || []).length;
pruef('  ... und wird aus der Hauptschleife gerufen', aufrufe >= 1, String(aufrufe));
pruef('  ... innerhalb von while ($true)',
  cmd.indexOf('while ($true)') < cmd.indexOf('WendeEinstellungenAn $alle'));
pruef('  ... abgesichert, damit ein Fehler den Waechter nicht beendet',
  /try \{ WendeEinstellungenAn \$alle \} catch \{ \}/.test(cmd));
// Die .ps1 wird aus der .cmd ERZEUGT. Wer das vergisst, hat zwei Staende.
pruef('die erzeugte ESL_Start.ps1 ist auf demselben Stand',
  ps1.includes('function WendeEinstellungenAn') && ps1.includes('__rcStarterCfg'));

// ============================================================================
console.log('\n-- 2. Jeder Schalter existiert wirklich im Dashboard --');
// Bewusst als ausgeschriebene Liste, nicht generisch abgeleitet: so steht hier
// schwarz auf weiss, was der Starter anfassen darf, und ein NEUER Name faellt
// unten in Abschnitt 3 auf, statt sich lautlos dazuzumogeln.
const ERWARTET = [
  { name: 'rcQueueAutoQuelle',   art: 'funktion', wozu: 'Genesys selbst oeffnen' },
  { name: 'rcQueueAus',          art: 'funktion', wozu: 'Warteschleifen-Seite' },
  { name: 'rcRadarSeite',        art: 'funktion', wozu: 'Radar-Seite' },
  { name: 'rcFeier',             art: 'funktion', wozu: 'Abschluss-Buehne' },
  { name: 'rcVertriebNurBcr',    art: 'funktion', wozu: 'Vertrieb nur BCR' },
  { name: 'rcQueueGlobalAb',     art: 'funktion', wozu: 'Warnstreifen ab Rang' },
  { name: 'rcMgmtTopN',          art: 'funktion', wozu: 'Fuehrung Top-N' },
  { name: 'rcSetAutoRot',        art: 'funktion', wozu: 'Auto-Seitenwechsel' },
  { name: 'rcLiveInterval',      art: 'flagge',   wozu: 'laeuft das Dashboard?' },
  { name: 'rcZielErinnerungAus', art: 'flagge',   wozu: 'Ziel-Erinnerungen' },
  { name: 'rcAutoKpiOff',        art: 'flagge',   wozu: 'Ligaliste selbst oeffnen' },
  { name: 'rcAutoRotPages',      art: 'flagge',   wozu: 'Wechsel-Seiten' },
  { name: 'rcAutoRotSec',        art: 'flagge',   wozu: 'Wechsel-Takt' },
  { name: 'rcAutoRot',           art: 'flagge',   wozu: 'Zustand der Rotation' },
  { name: 'rcStarterCfg',        art: 'marke',    wozu: 'einmal je Aufbau' }
];
ERWARTET.forEach(e => {
  if (e.art === 'marke') return;
  // Eine Funktion kann auf ZWEI Arten am window haengen: direkt als Literal
  // (window.rcFeier = function...) oder als Verweis auf eine Deklaration
  // (window.rcSetAutoRot = rcSetAutoRot). Beides ist gueltig — nur nach dem
  // ersten zu suchen war eine falsche Erwartung meinerseits, kein Fehler.
  const alsFunktion = new RegExp('window\\.' + e.name + '\\s*=\\s*(function|' + e.name + '\\b)').test(dash);
  // Flaggen stehen IMMER als window.name — der Lookbehind (?<![\w$.]) sperrte
  // den Punkt aus und fand deshalb ausgerechnet die richtige Schreibweise nicht.
  const ueberhaupt = new RegExp('window\\.' + e.name + '(?![\\w$])').test(dash);
  if (e.art === 'funktion') {
    pruef(e.name + ' ist im Dashboard eine Funktion (' + e.wozu + ')', alsFunktion);
  } else {
    pruef(e.name + ' kommt im Dashboard vor (' + e.wozu + ')', ueberhaupt);
  }
});
// rcZielErinnerungAus und rcAutoKpiOff werden vom Dashboard nur GELESEN — sie
// muessen also an einer Stelle abgefragt werden, sonst setzt der Starter etwas,
// das niemand ausliest.
pruef('rcZielErinnerungAus wird im Dashboard auch ABGEFRAGT',
  /!window\.rcZielErinnerungAus/.test(dash));
pruef('rcAutoKpiOff wird im Dashboard auch ABGEFRAGT',
  /rcAutoKpiOff/.test(dash) && (dash.match(/rcAutoKpiOff/g) || []).length >= 2);
// Handbetrieb liest der AUTOPILOT, nicht das Dashboard.
pruef('rcAutoManuell wird vom Autopiloten gelesen',
  /localStorage\.getItem\('rcAutoManuell'\)/.test(auto));

// ============================================================================
console.log('\n-- 3. Kein Name mogelt sich dazu --');
const benutzt = Array.from(new Set((fn.match(/window\.(rc[A-Za-z]+)/g) || [])
  .map(s => s.replace('window.', ''))));
const erlaubt = new Set(ERWARTET.map(e => e.name).concat(['rcStarterCfg']));
const fremd = benutzt.filter(n => !erlaubt.has(n) && n !== 'rcStarterCfg');
pruef('alle benutzten window.rc*-Namen stehen in der Liste', fremd.length === 0, fremd.join(', '));
pruef('  ... und es sind auch wirklich welche dabei', benutzt.length >= 10, String(benutzt.length));

// ============================================================================
console.log('\n-- 4. $null heisst NICHT ANFASSEN --');
// Ohne diese dritte Moeglichkeit waere jeder Starterlauf ein Zuruecksetzen
// dessen, was jemand im Dashboard umgestellt hat.
// lastIndexOf, NICHT indexOf: die Ueberschrift wird im Kommentar von
// WendeEinstellungenAn zitiert, und das steht weiter OBEN in der Datei. Mit
// indexOf begann der Ausschnitt dort und zog $DauerTaktSek, $AnmeldungenMax
// und $AnmeldeFensterMin mit hinein — Variablen, die mit den Dashboard-
// Einstellungen nichts zu tun haben.
const BLOCK = cmd.slice(cmd.lastIndexOf('>>> DASHBOARD-EINSTELLUNGEN <<<'),
                        cmd.indexOf('#  Stundenmail (04.08.2026)'));
const variablen = Array.from(new Set((BLOCK.match(/^\$([A-Za-z]+)\s*=/gm) || [])
  .map(s => s.replace(/^\$/, '').replace(/\s*=$/, ''))));
pruef('der Einstellungsblock ist auffindbar', BLOCK.length > 500);
pruef('  ... und enthaelt mehrere Schalter', variablen.length >= 10, String(variablen.length));
variablen.forEach(v => {
  const re = new RegExp('\\$null -ne \\$' + v + '(?![A-Za-z])');
  pruef('$' + v + ' wird nur bei ungleich $null angefasst', re.test(fn));
});
pruef('kein Schalter im Block ohne Wirkung (jeder wird auch benutzt)',
  variablen.every(v => fn.indexOf('$' + v) > 0),
  variablen.filter(v => fn.indexOf('$' + v) < 0).join(', '));

// ============================================================================
console.log('\n-- 5. Nur EINMAL je Dashboard-Aufbau --');
pruef('vor dem Schreiben wird die Marke geprueft', /window\.__rcStarterCfg \? "schon" : "offen"/.test(fn));
pruef('  ... und nur bei "offen" weitergemacht', /if \(\$lage -ne 'offen'\) \{ return \}/.test(fn));
pruef('  ... die Marke wird danach gesetzt', /window\.__rcStarterCfg = \{ gesetzt:g, unbekannt:u \}/.test(fn));
pruef('es wird erst geschrieben, wenn das Dashboard laeuft',
  /if\(!window\.rcLiveInterval\) return "kein-dashboard"/.test(fn));

// ============================================================================
console.log('\n-- 6. Die Umkehrungen stimmen --');
// rcQueueAus(true) schaltet das Modul AUS - der Starter fragt aber, ob die
// Seite AN sein soll. Wer das verwechselt, schaltet genau das Gegenteil.
pruef('Warteschleife: rcQueueAus wird invertiert aufgerufen',
  /rcQueueAus\(' \+ \(& \$B \(-not \$Warteschleife\)\)/.test(fn));
pruef('Ziel-Erinnerungen: rcZielErinnerungAus wird invertiert gesetzt',
  /rcZielErinnerungAus = ' \+ \(& \$B \(-not \$Zielerinnerungen\)\)/.test(fn));
pruef('Ligaliste: rcAutoKpiOff wird invertiert gesetzt',
  /rcAutoKpiOff = ' \+ \(& \$B \(-not \$LigaSelbstOeffnen\)\)/.test(fn));
// Radar/Genesys/Feier sind NICHT invertiert - Gegenprobe, damit nicht aus
// Versehen ueberall ein -not landet.
pruef('Radar wird NICHT invertiert', /rcRadarSeite\(' \+ \(& \$B \$RadarSeite\)/.test(fn));
pruef('Genesys wird NICHT invertiert', /rcQueueAutoQuelle\(' \+ \(& \$B \$Genesys\)/.test(fn));
pruef('Abschluss-Buehne wird NICHT invertiert', /rcFeier\(' \+ \(& \$B \$AbschlussPopups\)/.test(fn));

// ============================================================================
console.log('\n-- 7. Reihenfolge beim Seitenwechsel --');
// Erst Liste und Takt, dann ein/aus: sonst laeuft die Rotation mit der alten
// Liste weiter. Und ein geaenderter Takt greift nur ueber den Neustart
// (dieselbe Folge wie im Konfigurator, v22.js: rcSetAutoRot(false)/(true)).
pruef('Seitenliste steht vor dem Ein/Aus-Schalter',
  fn.indexOf('rcAutoRotPages') < fn.indexOf('s("Auto-Seitenwechsel"'));
pruef('Takt steht vor dem Ein/Aus-Schalter',
  fn.indexOf('rcAutoRotSec') < fn.indexOf('s("Auto-Seitenwechsel"'));
pruef('ein geaenderter Takt startet die Rotation neu',
  /rcSetAutoRot\(false\); window\.rcSetAutoRot\(true\)/.test(fn));

// ============================================================================
console.log('\n-- 8. Der zusammengebaute JavaScript-Text ist gueltig --');
// Er entsteht durch PowerShell-Verkettung; ein falsches Anfuehrungszeichen
// faellt sonst erst am Zielrechner auf - und dort sieht es aus wie
// "die Einstellung wirkt nicht".
{
  const von = fn.indexOf("$js = 'var g=[]");
  const bis = fn.indexOf('$antwort = AmDashboard');
  pruef('der JS-Bauabschnitt ist auffindbar', von > 0 && bis > von);
  let region = fn.slice(von, bis);
  // Die Zeile, die $liste baut, ist KEIN JS-Text — sie enthaelt aber die
  // Zeichenketten '[' ',' und ']'. Beim Einsammeln landeten die mitten im
  // Code und ergaben "[,]": daher der Parserfehler. Sie gehoert heraus.
  region = region.replace(/^[^\n]*\$liste = [^\n]*$/m, '');
  // PowerShell-Ausdruecke zwischen den Zeichenketten durch gueltige Werte ersetzen
  region = region
    .replace(/\$\(if \(\$Handbetrieb\)[\s\S]*?\}\)/g, "'\"1\"'")
    .replace(/\(&\s*\$B[^\n]*?\)\)/g, "'true'")
    .replace(/\(&\s*\$B \$[A-Za-z]+\)/g, "'true'")
    .replace(/\(\[int\]\$[A-Za-z]+\)/g, "'1'")
    .replace(/\$liste/g, '\'["arena","radar"]\'');
  // alle einfach-gequoteten PowerShell-Zeichenketten in Reihenfolge einsammeln
  const stuecke = (region.match(/'((?:[^']|'')*)'/g) || [])
    .map(s => s.slice(1, -1).replace(/''/g, "'"));
  const js = stuecke.join('');
  pruef('  ... und ergibt einen nicht-leeren Text', js.length > 400, String(js.length));
  let gut = true, grund = '';
  try { new Function(js); } catch (e) { gut = false; grund = e.message; }
  pruef('der erzeugte JavaScript-Text parst', gut, grund);
  pruef('  ... er meldet Gesetztes und Unbekanntes zurueck',
    /JSON\.stringify\(\{ gesetzt:g, unbekannt:u \}\)/.test(js));
  // Jeder Schalter wird VOR dem Setzen auf Existenz geprueft.
  const wrapper = (js.match(/s\("/g) || []).length;
  const geprueft = (js.match(/typeof window\.rc[A-Za-z]+!=="function"/g) || []).length;
  pruef('jeder Schalter laeuft durch den s()-Mantel', wrapper >= 12, String(wrapper));
  pruef('  ... und jede Funktion wird vorher auf Existenz geprueft',
    geprueft >= 8, String(geprueft));
}

// ============================================================================
console.log('\n-- 9. Der Nutzer erfaehrt, was passiert ist --');
// Ein Schalter, der still nicht ankommt, ist schlimmer als keiner: man stellt
// etwas ein und sucht den Fehler ueberall, nur nicht hier.
pruef('Gesetztes wird im Starterfenster genannt', /Dashboard-Einstellungen aus dieser Datei uebernommen/.test(fn));
pruef('Unbekanntes wird als WARNUNG gemeldet', /Warn "Dashboard-Einstellungen NICHT anwendbar/.test(fn));
pruef('  ... mit Hinweis auf die wahrscheinliche Ursache', /aeltere Fassung im Tab/.test(fn));
pruef('"nichts vorgegeben" wird ebenfalls gesagt', /nichts vorgegeben/.test(fn));
pruef('eine unlesbare Antwort bricht nicht still ab', /Antwort unlesbar/.test(fn));

console.log('\n  ' + ok + ' bestanden, ' + (fehl ? fehl + ' FEHLGESCHLAGEN.' : '0 fehlgeschlagen.') + '\n');
process.exit(fehl ? 1 : 0);
