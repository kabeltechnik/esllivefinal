// ============================================================================
//  umbau_0708_pruefen.js — nagelt den Umbau vom 07.08.2026 fest
//
//  Abgedeckt:
//    1. Croco ist restlos raus (und die zwei Intervall-Namen sind ABSICHTLICH da)
//    2. EINE Steuerungs-Seite — kein Umschalter, kein Seitenschluessel 'mgmt'
//    3. Layout-System: Zone, Breite, Hoehe je nativer Karte
//    4. Fernsicht: Zoom-Automatik nach Fensterbreite, keine Schrift unter 10px
//    5. Warteschlange: animierte Figuren, kein roter Vollflaechen-Banner
//    6. Radar-Seite abschaltbar
//    7. Excel: die vier Rechenfehler aus dem Audit
//
//  Laeuft ohne Portal, ohne Installation. Zu jeder Regel gehoert eine
//  Gegenprobe — eine Pruefung, die nichts prueft, ist schlimmer als keine.
// ============================================================================
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(WURZEL, 'esl_live_arena_v22.js'), 'utf8');
const ap = fs.readFileSync(path.join(WURZEL, 'esl_autopilot.user.js'), 'utf8');
const starter = fs.readFileSync(path.join(WURZEL, 'ESL_Start.cmd'), 'latin1');
const bundle = fs.readFileSync(path.join(WURZEL, 'bundle_bauen.js'), 'utf8');

let ok = 0, fehl = 0;
function pruef(name, bedingung, ist) {
  if (bedingung) { ok++; console.log('  ok   ' + name); }
  else { fehl++; console.log('  FEHL ' + name + (ist !== undefined ? '  -> ' + ist : '')); }
}

// ---------------------------------------------------------------------------
// Kommentare und Zeichenketten entfernen, wo es um ECHTEN Code geht.
// Zwei Fallen aus der Projekt-Historie: (a) Pruefungen treffen die eigenen
// Erklaertexte, (b) ein naiver Tokenizer haelt das " in .replace(/[&<>"]/g, ...)
// fuer den Beginn einer Zeichenkette und verschluckt tausende Zeilen. Ein '/'
// beginnt einen Regex, wenn davor ein Operator oder Satzzeichen steht; nach
// Name, Zahl oder ')' ist es eine Division.
// ---------------------------------------------------------------------------
function ohneKommentare(s) {
  let out = '', i = 0, letzterEcht = '';
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < s.length && s[i] !== q) { if (s[i] === '\\') { out += s[i]; i++; } out += s[i]; i++; }
      out += q; i++; letzterEcht = q; continue;
    }
    if (c === '/' && !/[\w$)\]]/.test(letzterEcht)) {
      out += c; i++;
      while (i < s.length && s[i] !== '/') { if (s[i] === '\\') { out += s[i]; i++; } out += s[i]; i++; }
      out += '/'; i++; letzterEcht = '/'; continue;
    }
    if (!/\s/.test(c)) letzterEcht = c;
    out += c; i++;
  }
  return out;
}
const code = ohneKommentare(src);

// ============================================================================
console.log('\n-- 0. Das Werkzeug selbst --');
pruef('Kommentar-Entferner laesst Regex-Literale heil',
  ohneKommentare('var x = s.replace(/[&<>"]/g, "-"); var y = 1;').indexOf('var y = 1') > 0);
pruef('Kommentar-Entferner wirft Zeilenkommentare weg',
  ohneKommentare('var a=1; // weg\nvar b=2;').indexOf('weg') < 0);

// ============================================================================
console.log('\n-- 1. Croco ist raus --');
pruef('kein rcCrocoModule mehr', !/rcCrocoModule/.test(src));
pruef('keine Croco-Modultypen im Konfigurator', !/croco_open|croco_overdue|croco_storno|croco_recon/.test(src));
pruef('isLiveType kennt kein croco_-Praefix mehr', !/\^croco_/.test(src));
pruef('keine Croco-Alarme im Laufband', !/rcCrocoView/.test(src));
pruef('kein rcCrocoTok in der Modul-Selbstheilung', !/_crocoRef/.test(src));
pruef('Autopilot ohne Croco', !/croco/i.test(ap), (ap.match(/.{0,30}croco.{0,30}/i) || [''])[0]);
pruef('Starter ohne Croco', !/croco/i.test(starter));
pruef('Bundle ohne croco_crawler.js', !/croco_crawler/.test(bundle));
pruef('croco_crawler.js ist geloescht', !fs.existsSync(path.join(WURZEL, 'croco_crawler.js')));
pruef('croco_tuner.js ist geloescht', !fs.existsSync(path.join(WURZEL, 'croco_tuner.js')));
// Die zwei Intervall-Namen bleiben ABSICHTLICH stehen: sie kosten nichts
// (if (window[k]) ist bei fehlender Variable ein No-op) und stoppen beim
// Re-Inject das Intervall einer noch laufenden Alt-Fassung im selben Tab.
// Ohne sie baute ein Zombie-Intervall alle 3 s den Croco-Reiter neu auf.
pruef('rcCrocoInterval bleibt in der Clean-State-Liste (Re-Inject)',
  /'rcCrocoInterval'/.test(src) && /'rcCrocoReconcileInterval'/.test(src));
pruef('GEGENPROBE die Suche wuerde einen echten Croco-Rest finden',
  /rcCrocoView/.test('var cv = window.rcCrocoView();'));

// ============================================================================
console.log('\n-- 2. EINE Steuerungs-Seite --');
pruef('kein Seitenschluessel mgmt mehr', !/'mgmt'/.test(src), (src.match(/.{0,40}'mgmt'.{0,40}/) || [''])[0]);
pruef('kein Umschalter rcSteuerUmschalter', !/rcSteuerUmschalter/.test(src));
pruef('kein Umschalter-CSS', !/rc-steuer-switch/.test(src));
pruef('die Bloecke haengen in der Steuerungs-Seite', /id = 'rcMgmtBlocks'/.test(code));
// Live-Befund 08.08.: "die 2 Seiten sind uebereinander". Ursache war, dass der
// Block als Geschwister NEBEN .rc-ck-body hing. #rcPageCockpitContent ist eine
// Flex-Spalte mit overflow:hidden, in der .rc-ck-body bereits flex:1 haelt —
// ein Geschwister bekommt dort keinen Platz und wird abgeschnitten.
pruef('die Bloecke haengen IN der scrollenden .rc-ck-body',
  /var ck = document\.querySelector\('#rcPageCockpitContent \.rc-ck-body'\)/.test(code));
pruef('  ... mit Rueckfall auf den Seiten-Container', /\|\| el\('rcPageCockpitContent'\)/.test(code));
pruef('  ... und der Wrapper haelt denselben Abstand wie die Nachbarbloecke',
  /display:flex; flex-direction:column; gap:11px;/.test(code));
// GEGENPROBE: das alte Anhaengen an den Seiten-Container waere erkennbar.
pruef('GEGENPROBE Anhaengen an den Seiten-Container faellt auf',
  !/rc-ck-body/.test("var ck = el('rcPageCockpitContent'); if(!ck) return;"));
pruef('Reste einer alten eigenen Seite werden entfernt',
  /el\('rcPageMgmtContent'\)/.test(code) && /removeChild\(altC\)/.test(code));
pruef('rcIstLeitungsSeite prueft nur noch cockpit',
  /rcIstLeitungsSeite\(\)\{ return window\.rcActivePage === 'cockpit'; \}/.test(code));
pruef('der Rotations-Eintrag heisst schlicht "Steuerung"',
  /\['cockpit','Steuerung'\]/.test(src));
// Die vier erhaltenen Bloecke — sie haben im Cockpit KEINE Entsprechung.
['rcMChart', 'rcMPrognose', 'rcMZiele', 'rcMProd'].forEach(id =>
  pruef('Block "' + id + '" ist erhalten', src.indexOf(id) > 0));
// Seit Layout-Engine v2 (14.08.) tragen die Titel eine id — der Regex laesst
// die Attribute zwischen Klasse und Titeltext deshalb offen.
pruef('als .rc-card, damit der Konfigurator sie erreicht',
  (src.match(/rc-card-title"[^>]*>(Tagesverlauf|Tagesende|Zielerreichung je Standort|Produkte mit BCR-Anteil)/g) || []).length === 4,
  (src.match(/rc-card-title"[^>]*>(Tagesverlauf|Tagesende|Zielerreichung je Standort|Produkte mit BCR-Anteil)/g) || []).length);
// Der Konfigurator-Schluessel ist seit v2 die Titel-id (Seite+id). Zwei Karten
// gleichen Namens kollidieren damit nie mehr — der Titel bleibt trotzdem
// einmalig, sonst verwirrt das Einstellen.
pruef('kein Kartentitel doppelt vergeben',
  (src.match(/rc-card-title"[^>]*>Meistverkaufte Produkte/g) || []).length === 1,
  (src.match(/rc-card-title"[^>]*>Meistverkaufte Produkte/g) || []).length);
// Waisen der Verschmelzung: delta() und der Gestern-Vergleich haengten
// ausschliesslich an den gestrichenen KPI-Kacheln.
pruef('delta() ist mit den KPI-Kacheln entfallen', !/function delta\(jetzt, vorher\)/.test(code));
pruef('der Gestern-Block ist entfallen', !/gestern: gestern/.test(code));
// Die gestrichenen Doppelungen
pruef('KPI-Kacheln der Fuehrungssicht sind weg (Cockpit-Streifen zeigt sie)',
  !/rcMKpis/.test(src));
pruef('Standort-Balken sind weg (Cockpit-Tabelle ist reicher)', !/rcMStd'/.test(src));
pruef('Team-Rangliste ist weg (Cockpit-Vergleich ist sortierbar)', !/rcMTeams/.test(src));
pruef('Qualitaets-Tabelle ist weg (Qualitaets-Seite zeigt sie)', !/rcMQual/.test(src));
pruef('einblenden() samt Opacity-Eintritt ist weg', !/function einblenden\(\)/.test(code));

console.log('\n-- 2b. Die drei Rechenfehler der Fuehrungssicht --');
pruef('rcLetzteStats.kontakte wird nicht mehr gelesen (Feld existiert nicht)',
  !/rcLetzteStats\.kontakte/.test(src));
pruef('rcTeamQualiAgg poolt statt zu mitteln', /const pool = \(zk, nk, qk\)/.test(code));
pruef('  ... und nur bei Nenner > 0', /if \(k\[zk\] != null && k\[nk\] > 0\)/.test(code));
pruef('  ... AHT mit eigenem Nenner', /ahtN > 0 \? ahtW\/ahtN/.test(code));
pruef('topProdukte achtet auf den Filter', /if\(sc\.std\s+!== 'ALL' && s\.standort !== sc\.std\) return;/.test(code));
pruef('GEGENPROBE ungewichtetes Mittel waere erkennbar',
  /reduce\(\(s,k\)=>s\+k\[key\],0\)\/v\.length/.test('const mean = key => v.reduce((s,k)=>s+k[key],0)/v.length;'));

// ============================================================================
console.log('\n-- 3. Layout: Zone, Breite, Hoehe --');
// ABGELOEST 14.08. (Layout-Engine v2): das Zonen/wh-System vom 07.08. machte
// Karten in flex-Spalten HOEHER statt breiter und war der Kern des
// Nutzer-Befunds "funktioniert nicht richtig". v2 = 12er-Raster, order-basiert.
// Die frueheren v1-Pruefungen stehen jetzt als GEGENPROBEN (die Falle darf
// nicht zurueckkommen); die Mechanik selbst bewacht layout_engine_pruefen.js.
pruef('CFG kennt zone und wh (nur noch Migrations-Quelle)', /c\.zone=c\.zone\|\|\{\}; c\.wh=c\.wh\|\|\{\}/.test(code));
pruef('v2: rcLayAnwenden ersetzt das Zonen-Schieben (kein appendChild im Anwenden)',
  /function rcLayAnwenden\(\)/.test(code) && !/cont=zoneContainer\(pd\[0\], z\)/.test(code));
// v3 (16.08. abends): Reihenfolge = DOM-Reihenfolge (dock/insertBefore).
// CSS order im Anwenden war die v2-Raster-Bauart und ist raus.
pruef('v3: Reihenfolge laeuft ueber DOM-Docking (insertBefore), nicht mehr ueber CSS order',
  /cont\.insertBefore\(el, ref\)/.test(code) && !/el\.style\.order=String\(pos\[m\.key\]\)/.test(code));
// Seit 16.08. laeuft die feste Hoehe ueber laySetzeHoehe() — EINE Stelle, an
// der auch die Einpass-Skala einfliesst. Verhalten unveraendert: Stufe > 0 =
// feste Hoehe, Inhalt scrollt innen.
pruef('v2: Hoehenstufe setzt eine FESTE Hoehe (innen scrollt), min-height war wirkungslos',
  /laySetzeHoehe\(el, RC_LAY_HOEHE\[/.test(code) && !/m\.el\.style\.minHeight = wh\.h \?/.test(code));
pruef('v3: Breite wirkt nur, wo sie wirken kann — Grid-Span (auf Spuren gekappt) oder Reihen-Gewicht; die v1-flexGrow-Falle (Karten werden in Spalten HOEHER) bleibt draussen',
  /gridColumn='span '\+Math\.max\(1,Math\.min\(tr,it\.w\)\)/.test(code) && /flexDirection\.indexOf\('row'\)===0/.test(code) && !/style\.flexGrow=String\(wh\.b\)/.test(code));
pruef('Setz-Funktionen in der v3-Signatur (zoneNative traegt jetzt die Seite)',
  /function zoneNative\(page,key,zone\)/.test(code) && /function breiteNative\(page,key,d\)/.test(code) && /function hoeheNative\(page,key,d\)/.test(code));
// Die Zwei-Listen-Falle: Aufbau UND Handler, sonst laesst sich nichts speichern.
pruef('Zone-Auswahl im AUFBAU der Modulzeile', /class="rc-cfg-zone"/.test(src));
pruef('Zone-Auswahl im CHANGE-HANDLER', /rowEl\.querySelector\('\.rc-cfg-zone'\)/.test(code));
pruef('Breiten-Knoepfe im Aufbau', /data-br="-1"/.test(src) && /data-br="1"/.test(src));
pruef('Breiten-Knoepfe im Handler', /bt\.hasAttribute\('data-br'\)/.test(code));
pruef('Hoehen-Knoepfe im Aufbau', /data-ho="-1"/.test(src) && /data-ho="1"/.test(src));
pruef('Hoehen-Knoepfe im Handler', /bt\.hasAttribute\('data-ho'\)/.test(code));
// v3 (16.08. abends): Zonen sind wieder ECHTE Plaetze im gewachsenen Layout —
// Arena UND Quali haben links/Mitte/rechts, der "Platz"-Select ist der Weg in
// eine andere Spalte ohne Drag.
pruef('v3: Arena und Quali haben wieder echte Zonen (links/Mitte/rechts)',
  /if\(page==='arena'\|\|page==='quali'\) return \[\['links','Links'\],\['mitte','Mitte'\],\['rechts','Rechts'\]\]/.test(code));
pruef('  ... und der Ist-Platz wird aus dem DOM ermittelt (zoneVon, kleinster Container gewinnt)',
  /function zoneVon\(page, el\)/.test(code) && /bestCont\.contains\(cont\)/.test(code));
pruef('GEGENPROBE ein fehlender Handler waere erkennbar',
  !/rowEl\.querySelector\('\.rc-cfg-gibtsnicht'\)/.test(code));

// ============================================================================
console.log('\n-- 4. Fernsicht (20 Zoll, 3 Meter) --');
const zuKlein = (src.match(/font-size:\s*([0-9.]+)px/g) || [])
  .map(x => parseFloat(x.match(/([0-9.]+)px/)[1])).filter(v => v < 10);
pruef('keine Schriftgroesse unter 10px mehr', zuKlein.length === 0, zuKlein.join(', '));
pruef('Zoom-Obergrenze auf 3.0 angehoben', /RC_ZOOM_MAX = 3\.0/.test(code));
pruef('Zoom-Automatik vorhanden', /function rcZoomAutoWert\(\)/.test(code));
pruef('  ... richtet sich nach der Fensterbreite', /const b = window\.innerWidth \|\| RC_ZOOM_BASIS/.test(code));
// Seit 05.10. ab Werk AUS (Nutzer-Vorgabe: "immer auf 100 % Zoom und nicht 150") —
// funktional geprueft in zoom_pruefen.js, Abschnitt 2b.
pruef('  ... ist ab Werk AUS (nur ein ausdrueckliches "1" schaltet sie an)',
  /localStorage\.getItem\('rcZoomAuto'\) === '1'/.test(code) && !/localStorage\.getItem\('rcZoomAuto'\) !== '0'/.test(code));
pruef('der Hand-Regler schaltet die Automatik ab',
  /const rcZoomBy = d => \{ try \{ localStorage\.setItem\('rcZoomAuto', '0'\)/.test(code));
pruef('Fenstergroesse wird nachgezogen', /addEventListener\('resize'/.test(code));
// Ohne Entprellung waere das eine Schleife: rcApplyZoom loest selbst ein
// resize aus (fuer rcWarResize), das wieder rcApplyZoom riefe.
pruef('  ... entprellt (rcApplyZoom loest selbst ein resize aus)',
  /clearTimeout\(t\);\s*\n\s*t = setTimeout/.test(code));
pruef('Schalter im Konfigurator: AUFBAU', /cfgZoomAuto/.test(src));
pruef('Schalter im Konfigurator: HANDLER', /on\(q\('cfgZoomAuto'\),'change'/.test(code));
pruef('GEGENPROBE eine 9px-Schrift wuerde auffallen',
  parseFloat('font-size:9px'.match(/([0-9.]+)px/)[1]) < 10);

// ============================================================================
console.log('\n-- 5. Warteschlange --');
pruef('Buehne im Geruest', /rc-q-buehne/.test(src) && /id="rcQReihe"/.test(src));
pruef('Figuren werden gebaut', /function figurBauen\(i\)/.test(code));
pruef('Zeichenfunktion vorhanden', /function zeichneSchlange\(v, rang\)/.test(code));
pruef('  ... wird aus zeigeBanner gerufen (kennt Stufe UND Werte)',
  /try \{ zeichneSchlange\(v, veraltet \? 0 : \(stufe \? stufe\.rang : 0\)\); \} catch\(e\)\{\}/.test(code));
// Ein innerHTML je Takt wuerde alle laufenden Animationen neu starten.
pruef('nur nachziehen statt neu bauen', /for\(var i = vorhanden; i < zeig; i\+\+\)/.test(code));
pruef('Deckel bei 18 Figuren, Rest als Zahl', /var MAX_FIG = 18/.test(code) && /rc-q-mehr/.test(src));
// Vier Stufen-Regeln fuer die Figuren selbst; die Uhr-Regel darunter nennt
// Rang 2 und 3 ein zweites Mal, deshalb wird auf die Regel mit --takt geprueft.
const stufenRegeln = (src.match(/rc-q-buehne\[data-rang="[0-3]"\] \.rc-q-fig\{--takt:/g) || []);
pruef('vier Nervositaets-Stufen', stufenRegeln.length === 4, stufenRegeln.length);
pruef('  ... der Takt wird von Stufe zu Stufe schneller',
  /data-rang="0"\] \.rc-q-fig\{--takt:4\.2s/.test(src) && /data-rang="3"\] \.rc-q-fig\{--takt:\.82s/.test(src));
pruef('Uhr-Blick ab Stufe 2', /rcQUhr/.test(src));
// Auf einem Wandmonitor liegt das Fenster oft im Hintergrund — dort feuert
// requestAnimationFrame nicht, CSS-Animationen laufen weiter.
pruef('CSS-Animation statt requestAnimationFrame',
  /animation:rcQAtmen/.test(src) && !/requestAnimationFrame[^)]*rcQ/.test(code));
pruef('zustandsfreie Variation statt Math.random',
  /var h = 104 \+ \(\(i\*37\)%5\)\*6/.test(code));
pruef('reduced-motion stellt die Figuren still', /\.rc-q-fig,\.rc-q-fig \.arm,\.rc-q-pkt i\{animation:none!important;\}/.test(src));
pruef('keine Emojis in der Buehne', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(
  (src.match(/rc-q-buehne[\s\S]{0,3000}/) || [''])[0]));
// Der rote Vollflaechen-Banner war die Nutzer-Beschwerde.
pruef('Rang-3-Banner ist keine rote Vollflaeche mehr',
  !/rc-q-banner\[data-rang="3"\]\{background:#E60000/.test(src));
pruef('  ... sondern dunkel mit rotem Akzent',
  /rc-q-banner\[data-rang="3"\]\{background:#2A1414/.test(src));
pruef('der Puls liegt nicht mehr ueber dem Text',
  !/rc-q-banner\[data-rang="3"\]::after\{content:"";position:absolute;inset:0/.test(src));

// ============================================================================
console.log('\n-- 6. Radar abschaltbar --');
pruef('CFG.radarAus vorhanden', /c\.radarAus=!!c\.radarAus/.test(code));
pruef('Anwenden-Funktion vorhanden', /function radarSeiteAnwenden\(\)/.test(code));
pruef('  ... versteckt den Reiter', /btn\.style\.display = CFG\.radarAus \? 'none' : ''/.test(code));
pruef('  ... nimmt die Seite aus der Rotation', /rp\.indexOf\('radar'\); if\(i>=0\) rp\.splice\(i,1\)/.test(code));
pruef('  ... schaltet weg, wenn die Seite gerade offen ist',
  /CFG\.radarAus && window\.rcActivePage==='radar'/.test(code));
pruef('  ... laeuft im Selbstheilungs-Takt mit (idempotent)',
  /function reconcileAll\(\)\{ try\{ radarSeiteAnwenden\(\); \}catch\(e\)\{\}/.test(code));
pruef('Schalter im Konfigurator: AUFBAU', /cfgRadarAn/.test(src));
pruef('Schalter im Konfigurator: HANDLER', /on\(q\('cfgRadarAn'\),'change'/.test(code));
pruef('Konsolen-Weg vorhanden', /window\.rcRadarSeite=function\(an\)/.test(code));

// ============================================================================
console.log('\n-- 7. Excel: die vier Rechenfehler --');
// (1) Der Filter warf jeden Standort und jedes Team ohne ESL-Kontakte aus den
//     Blaettern — auch aus den REINEN Liga-Blaettern. In rcAggAusRows sind
//     `calls` die ESL-Kontakte, nicht die Liga-Calls.
const filter = (code.match(/agg\.(stds|teams)\.filter\([st] => [st]\.calls > 0[^)]*\)/g) || []);
pruef('alle vier Blatt-Filter beziehen die Liga-Calls ein',
  filter.length === 4 && filter.every(f => /lg[ST]\[/.test(f)), filter.length + ' Treffer');
pruef('GEGENPROBE der alte Filter waere erkennbar',
  !/lgS\[/.test('agg.stds.filter(s => s.calls > 0)'));
// (2) AHT ist ein Mittelwert JE CALL und braucht einen eigenen Nenner.
pruef('Stand-Blatt: AHT mit eigenem Nenner', /sum\.ahtW \+= row\.ahtSec \* ac; sum\.ahtN \+= ac;/.test(code));
pruef('Stand-Blatt: geteilt wird durch ahtN', /sum\.ahtN > 0 && sum\.ahtW/.test(code));
pruef('Analyse Teams: AHT mit eigenem Nenner', /t\.ahtW \+= r\.ahtSec \* tac; t\.ahtN \+= tac;/.test(code));
pruef('Analyse Teams: geteilt wird durch ahtN', /t\.ahtN > 0 && t\.ahtW/.test(code));
// (3) RC_PCT1 ist '0.#" %"' — ein Suffix-Format, das NICHT mit 100 multipliziert.
pruef('Blatt Produkte: Anteil wird roh geschrieben', /k\.alles \/ gAlles \* 100/.test(code));
pruef('Blatt Produkte: GESAMT ist 100, nicht 1', /gz\(100, \{ nf:RC_PCT1 \}\)/.test(code));
pruef('GEGENPROBE ein Bruch mit RC_PCT1 waere erkennbar',
  !/\* 100/.test('dz(+(k.alles / gAlles).toFixed(4), { nf:RC_PCT1 })'));
// (4) crF fing nur den fehlenden NENNER ab. Ein fehlender ZAEHLER (null =
//     "keine Produktaufschluesselung") wurde zur harten 0,0 %.
const crfs = (code.match(/const crF = \([^)]*\) =>[^;]*;/g) || []);
pruef('crF faengt auch den fehlenden Zaehler ab (alle Fassungen)',
  crfs.length >= 3 && crfs.every(f => /z == null|z\|\|0/.test(f)), crfs.length + ' Fassungen');

// ============================================================================
console.log('\n' + '='.repeat(60));
console.log('  ' + ok + ' bestanden, ' + fehl + ' fehlgeschlagen.');
console.log('='.repeat(60));
process.exit(fehl ? 1 : 0);
