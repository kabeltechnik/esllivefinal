// ============================================================================
//  portal_zeitraum_pruefen.js — "Portal steht auf 01.-12.08, heute ist 13.08"
//                               (Live-Befund 13.08., 0 Live-Zeilen den ganzen Tag)
//
//  Nutzer-Log, ueber Stunden im 20-Sekunden-Takt wiederholt:
//    "Portal steht auf 2026-08-01, ..., 2026-08-12, heute ist 2026-08-13 —
//     es kommen KEINE Zahlen von heute. Der Zeitraum wird auf heute zurueckgestellt."
//    "v22: 0 Zeilen verarbeitet | BNT 0 · KIP 0 · MOB 0 · VVL 0"
//
//  ZWEI getrennte Ursachen, beide meldeten Erfolg, waehrend nichts geschah —
//  deshalb stand es tagelang so da, ohne dass eine Fehlermeldung darauf zeigte.
//
//  (a) rcPortalAufHeute klickte den FALSCHEN Knopf.
//      Sein Sucher war 'button[type="submit"], input[type="submit"]' mit einer
//      Textpruefung auf innerText||value. Der echte "Liste aktualisieren"-Knopf
//      von PrimeFaces ist aber type="button" (AJAX-Handler statt Submit) und
//      icon-only — sein Text steht im title, innerText ist leer. Gefunden wurde
//      stattdessen ein anderer Submit-Knopf, der auf /suchen|anzeigen/ passte.
//      Weil ein Knopf gefunden WURDE, kam nie die Warnung, sondern die Meldung
//      "gestellt und Suche ausgeloest" — vor dem Klick abgesetzt.
//
//  (b) Die Rueckstellung in rcFetchRangeViaUIIntern griff auf TOTE DOM-Knoten.
//      vonI/bisI/updBtn wurden EINMAL oben geholt. Dazwischen liegen der erste
//      updBtn.click() und 6 s PrimeFaces-Ajax — der rendert das Formular neu,
//      die alten Knoten haengen danach nicht mehr im Dokument. Ein Klick auf
//      einen abgehaengten Knoten loest keinen Ajax und kein Server-Commit aus.
//      Der erste Klick (frische Knoten) setzte den Bereich also, der zweite
//      stellte NICHTS zurueck — der Server blieb auf 01.-13.08 stehen.
//
//  Beide Funktionen werden hier ECHT ausgefuehrt (per Klammer-Zaehlung aus
//  esl_live_arena_v22.js geschnitten), gegen ein PrimeFaces-Formular, das sich
//  beim Commit-Klick genauso neu aufbaut wie das Portal. Gemessen wird nur eins:
//  auf welchem Zeitraum der SERVER danach steht.
// ============================================================================
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const dash = fs.readFileSync(path.join(WURZEL, 'esl_live_arena_v22.js'), 'utf8');

let ok = 0, fehl = 0;
function pruef(name, bed, ist) {
  if (bed) { ok++; console.log('  ok   ' + name); }
  else { fehl++; console.log('  FEHL ' + name + (ist !== undefined ? '  -> ' + ist : '')); }
}
function schneide(src, kopf) {
  const i = src.indexOf(kopf);
  if (i < 0) return '';
  let tiefe = 0, start = src.indexOf('{', i);
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') tiefe++;
    else if (src[j] === '}') { tiefe--; if (!tiefe) return src.slice(i, j + 1); }
  }
  return '';
}

const heute = (d => String(d.getDate()).padStart(2,'0') + '.' +
                    String(d.getMonth()+1).padStart(2,'0') + '.' + d.getFullYear())(new Date());

// ============================================================================
//  Das Portal-Formular als Stub — nur so viel, wie die Funktionen anfassen.
//
//  Der entscheidende Zug: klickt man den Commit-Knopf, waehrend er im Dokument
//  haengt, uebernimmt der "Server" den Zeitraum UND das Formular wird neu
//  aufgebaut (alle bisherigen Knoten gelten ab da als abgehaengt). Ein Klick auf
//  einen abgehaengten Knoten tut nichts — genau wie im Browser.
// ============================================================================
function baueUmgebung() {
  const zustand = {
    serverZeitraum: ['12.08.2026', '12.08.2026'], // Portal steht auf gestern (Mitternachtsfall)
    commits: 0,
    totKlicks: 0,     // Klicks auf abgehaengte Knoten
    koederKlicks: 0,  // Klicks auf den falschen Knopf
    aufbau: 0
  };

  function knoten(o) { return Object.assign({ abgehaengt: false, title:'', innerText:'', value:'', innerHTML:'', id:'', name:'', type:'' }, o); }

  let form = null;
  function baueForm() {
    zustand.aufbau++;
    const von = knoten({ name:'filterForm:von', value: zustand.serverZeitraum[0], klasse:'hasDatepicker' });
    const bis = knoten({ name:'filterForm:bis', value: zustand.serverZeitraum[1], klasse:'hasDatepicker' });
    von.dispatchEvent = bis.dispatchEvent = function(){};

    // Der ECHTE Commit-Knopf: PrimeFaces, type="button", icon-only, Text im title.
    const upd = knoten({ id:'filterForm:upd', type:'button', title:'Liste aktualisieren',
                         innerHTML:'<span class="ui-icon ui-icon-refresh"></span>' });
    upd.click = function(){
      if (this.abgehaengt) { zustand.totKlicks++; return; }
      zustand.serverZeitraum = [von.value, bis.value];
      zustand.commits++;
      alleAbhaengen(); baueForm();          // PrimeFaces rendert das Formular neu
    };

    // KOEDER: ein echter Submit-Knopf, auf den der ALTE Sucher passte
    // (type=submit + Text "Anzeigen"). Er stellt den Zeitraum NICHT um —
    // deshalb meldete das Dashboard Erfolg, waehrend nichts geschah.
    const koeder = knoten({ id:'filterForm:anz', type:'submit', innerText:'Anzeigen' });
    koeder.click = function(){ if (this.abgehaengt) { zustand.totKlicks++; return; } zustand.koederKlicks++; };

    // Export-Knopf wie am Portal gemessen (28.09.): type="submit", icon-only,
    // title "Liste exportieren". Gesucht wird er nach dem Klick im FRISCHEN Formular.
    const exp = knoten({ id:'filterForm:j_idt640', type:'submit', title:'Liste exportieren',
                         innerHTML:'<span class="ui-icon fa fa-file-excel-o"></span><span class="ui-button-text">Liste exportieren</span>' });
    exp.click = function(){};

    const felder = [von, bis], knoepfe = [upd, koeder, exp];
    form = {
      id:'filterForm', action:'https://esl.regiocom.net/Agents/secure/sis_vodafone.xhtml',
      querySelectorAll(sel) {
        if (sel === 'input.hasDatepicker, .ui-calendar input') return felder;
        if (sel === 'button, input[type="submit"]') return knoepfe;
        // Der ALTE Sucher: PrimeFaces-Knoepfe sind type="button" und fallen heraus.
        if (sel === 'button[type="submit"], input[type="submit"]') return knoepfe.filter(b => b.type === 'submit');
        return [];
      }
    };
    function alleAbhaengen(){ felder.forEach(f => f.abgehaengt = true); knoepfe.forEach(b => b.abgehaengt = true); }
  }
  baueForm();

  return {
    zustand,
    umgebung: {
      document: { getElementById: id => (id === 'filterForm' ? form : null) },
      window: { location: { href: 'https://esl.regiocom.net/Agents/secure/sis_vodafone.xhtml' } },
      Event: function(){ return {}; },
      pad2: n => String(n).padStart(2, '0'),
      rcLog: { log(){}, warn(){}, error(){} },
      // Wartezeiten sofort aufloesen — sonst laeuft die Pruefung 10 Sekunden.
      setTimeout: (f) => { f(); return 0; },
      FormData: function(){ this.set = function(){}; this.append = function(){}; },
      fetch: async () => ({ ok: true, arrayBuffer: async () => Buffer.from('XLSX') })
    }
  };
}

// Schneidet eine Funktion aus der Quelle und macht sie im Stub lauffaehig.
function lade(kopf, umgebung, extra) {
  const txt = schneide(dash, kopf);
  if (!txt) throw new Error('nicht gefunden: ' + kopf);
  const namen = Object.keys(umgebung);
  const rumpf = (extra || '') + '\nreturn (' + txt + ');';
  return new Function(...namen, rumpf)(...namen.map(n => umgebung[n]));
}

const helferTxt = schneide(dash, 'function rcFilterKnopf(form)');

// ============================================================================
console.log('\n-- 1. Der gemeinsame Knopf-Sucher findet den echten PrimeFaces-Knopf --');
pruef('rcFilterKnopf existiert', !!helferTxt);
pruef('  ... als Funktionsdeklaration (rcFetchRangeViaUIIntern nutzt sie weit unterhalb)',
  /^\s*function rcFilterKnopf\(/m.test(dash));
{
  const { zustand, umgebung } = baueUmgebung();
  const knopf = lade('function rcFilterKnopf(form)', umgebung)(umgebung.document.getElementById('filterForm'));
  pruef('findet den Knopf mit title="Liste aktualisieren"', knopf && knopf.id === 'filterForm:upd',
    knopf ? knopf.id : 'null');
  pruef('  ... obwohl er type="button" ist (kein Submit)', knopf && knopf.type === 'button');
  pruef('  ... und innerText leer ist (icon-only)', knopf && knopf.innerText === '');
  pruef('  ... und nicht den Koeder-Submit "Anzeigen"', knopf && knopf.id !== 'filterForm:anz');
  pruef('ohne Formular liefert er null statt zu werfen',
    lade('function rcFilterKnopf(form)', umgebung)(null) === null);
  void zustand;
}

// GEGENPROBE: der ALTE Sucher — woertlich aus der Fassung vor dem Fix — haette
// hier den Koeder erwischt. Kein Nachbau: exakt der Ausdruck, der dort stand.
{
  const { umgebung } = baueUmgebung();
  const form = umgebung.document.getElementById('filterForm');
  const altGefunden = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'))
    .find(b => /suchen|aktualisieren|filtern|anzeigen/.test((b.innerText||b.value||'').toLowerCase()));
  pruef('GEGENPROBE alter Sucher findet UEBERHAUPT einen Knopf (daher keine Warnung)', !!altGefunden);
  pruef('GEGENPROBE alter Sucher findet den FALSCHEN (den Koeder)',
    altGefunden && altGefunden.id === 'filterForm:anz', altGefunden ? altGefunden.id : 'null');
  pruef('GEGENPROBE alter Sucher verfehlt den echten Commit-Knopf',
    !altGefunden || altGefunden.id !== 'filterForm:upd');
}
// Auf den BLOCK gepruefte Wortliste, nicht auf die ganze Datei: sie kommt an
// zwei weiteren Stellen vor, die absichtlich unveraendert sind (siehe 6.).
pruef('der alte Sucher steht nicht mehr in rcPortalAufHeute',
  !schneide(dash, 'async function rcPortalAufHeute(erzwingen)').includes('suchen|aktualisieren|filtern|anzeigen'));
pruef('  ... und nicht mehr in rcFetchRangeViaUIIntern',
  !schneide(dash, 'async function rcFetchRangeViaUIIntern(fromStr, toStr)').includes('suchen|aktualisieren|filtern|anzeigen'));

// ============================================================================
console.log('\n-- 2. rcPortalAufHeute stellt den SERVER wirklich auf heute --');
{
  const { zustand, umgebung } = baueUmgebung();
  const fn = lade('async function rcPortalAufHeute(erzwingen)', umgebung, helferTxt +
    '\nlet rcTagFixZuletzt = 0;');
  const vorher = zustand.serverZeitraum.slice();
  // Der Rumpf laeuft bis zum Klick ohne await durch — der Zustand steht danach.
  fn(true);
  pruef('Portal stand vorher auf gestern', vorher[0] === '12.08.2026');
  pruef('der Server steht danach auf HEUTE', zustand.serverZeitraum[0] === heute,
    zustand.serverZeitraum.join(' bis '));
  pruef('  ... beide Felder, nicht nur das erste', zustand.serverZeitraum[1] === heute,
    zustand.serverZeitraum[1]);
  pruef('genau EIN Commit (kein Dauerklicken)', zustand.commits === 1, String(zustand.commits));
  pruef('der Koeder wurde NICHT geklickt', zustand.koederKlicks === 0, String(zustand.koederKlicks));
  pruef('kein Klick ging an einen abgehaengten Knoten', zustand.totKlicks === 0, String(zustand.totKlicks));
}

// Die 5-Minuten-Sperre bleibt, sonst klickt der 20-s-Takt das Portal wund.
pruef('5-Minuten-Sperre steht weiterhin', /jetzt - rcTagFixZuletzt < 5 \* 60 \* 1000/.test(dash));
pruef('  ... und erzwingen=true umgeht sie (Mitternacht)', /if \(!erzwingen && jetzt - rcTagFixZuletzt/.test(dash));

// Die Meldung darf erst NACH dem Klick kommen — vorher gemeldet sah sie wie ein
// Erfolg aus, waehrend der falsche Knopf getroffen wurde.
{
  const blk = schneide(dash, 'async function rcPortalAufHeute(erzwingen)');
  pruef('die Erfolgsmeldung steht NACH btn.click()',
    blk.indexOf('btn.click()') < blk.indexOf("rcLog.log('Portal-Zeitraum auf heute"));
  pruef('  ... und behauptet keine bestaetigte Suche mehr',
    !/gestellt und Suche ausgeloest/.test(blk));
}

// ============================================================================
console.log('\n-- 3. Der Historienlauf stellt den Zeitraum zurueck (der eigentliche Fehler) --');
{
  const { zustand, umgebung } = baueUmgebung();
  // Seit 28.09. sucht der Export-Schritt ueber rcExportKnopfFinden im frischen Formular.
  const fn = lade('async function rcFetchRangeViaUIIntern(fromStr, toStr)', umgebung, helferTxt + '\n' + schneide(dash, 'function rcExportKnopfFinden(liste)'));
  const p = fn('01.08.2026', '13.08.2026');
  p.then(buf => {
    pruef('der Bereichs-Export kommt weiter an (Harvest bleibt heil)', !!buf);
    pruef('ZWEI Commits: erst Bereich, dann zurueck auf heute', zustand.commits === 2, String(zustand.commits));
    pruef('der Server steht am Ende auf HEUTE, nicht auf dem Bereich',
      zustand.serverZeitraum[0] === heute && zustand.serverZeitraum[1] === heute,
      zustand.serverZeitraum.join(' bis '));
    pruef('  ... kein einziger Klick ging an einen abgehaengten Knoten',
      zustand.totKlicks === 0, String(zustand.totKlicks));
    pruef('das Formular wurde zwischendurch neu aufgebaut (Ajax nachgestellt)',
      zustand.aufbau >= 3, String(zustand.aufbau));

    // ------------------------------------------------------------------
    // GEGENPROBE: die alte Reihenfolge. Sie ist geloescht, also hier als
    // Nachstellung — sie holt Felder und Knopf EINMAL und benutzt sie nach
    // dem ersten Commit erneut. Zweck ist nur der Nachweis, dass der Stub
    // den echten Fehler ueberhaupt zeigt; eine gruene Pruefung an einem
    // Stub, der nicht durchfallen KANN, waere wertlos.
    console.log('\n-- 4. GEGENPROBE: die alte, stale Reihenfolge faellt durch --');
    const g = baueUmgebung();
    const gForm = g.umgebung.document.getElementById('filterForm');
    const gFelder = gForm.querySelectorAll('input.hasDatepicker, .ui-calendar input');
    const gKnopf = gForm.querySelectorAll('button, input[type="submit"]').find(b => b.title === 'Liste aktualisieren');
    const setVal = (el, v) => { el.value = v; };
    setVal(gFelder[0], '01.08.2026'); setVal(gFelder[1], '13.08.2026');
    gKnopf.click();                              // 1. Commit — Knoten noch frisch
    setVal(gFelder[0], heute); setVal(gFelder[1], heute);
    gKnopf.click();                              // 2. Klick — Knoten sind tot
    pruef('GEGENPROBE der erste Klick setzt den Bereich', g.zustand.commits === 1, String(g.zustand.commits));
    pruef('GEGENPROBE der zweite Klick landet auf einem toten Knoten',
      g.zustand.totKlicks === 1, String(g.zustand.totKlicks));
    pruef('GEGENPROBE der Server bleibt auf dem BEREICH stehen — der Live-Befund',
      g.zustand.serverZeitraum[0] === '01.08.2026',
      g.zustand.serverZeitraum.join(' bis '));

    // ------------------------------------------------------------------
    console.log('\n-- 5. Die Absicherungen am Code --');
    const blk = schneide(dash, 'async function rcFetchRangeViaUIIntern(fromStr, toStr)');
    pruef('vor der Rueckstellung wird das Formular NEU geholt',
      /const form2 = document\.getElementById\('filterForm'\)/.test(blk));
    pruef('  ... und die Datumsfelder ebenfalls', /const felder2 = Array\.from\(form2\.querySelectorAll/.test(blk));
    pruef('  ... und der Knopf ebenfalls', /const updBtn2 = rcFilterKnopf\(form2\)/.test(blk));
    pruef('der Rueckstell-Klick benutzt NICHT mehr den alten updBtn',
      blk.indexOf('updBtn2.click()') > 0 && !/setVal\(vonI, heuteStr\); setVal\(bisI, heuteStr\);/.test(blk));
    // Fehlt der Knopf, ist das ein sichtbarer Ausfall — nicht ein stilles if(updBtn).
    pruef('fehlender Knopf wird gemeldet statt still uebergangen',
      /rcLog\.warn\('Historie\(UI\): kein "Liste aktualisieren"-Knopf fuer die Rueckstellung/.test(blk));
    pruef('  ... und nennt die Folge (Live-Zahlen bleiben 0)', /Live-Zahlen bleiben 0/.test(blk));
    pruef('beide Aufrufer teilen sich EINEN Sucher (keine zweite Fassung)',
      (dash.match(/rcFilterKnopf\(/g) || []).length === 4,   // 1 Deklaration + 3 Aufrufe
      String((dash.match(/rcFilterKnopf\(/g) || []).length));
    pruef('die verwaisten oVon/oBis sind entfernt', !/const oVon = vonI\.value/.test(dash));

    // ------------------------------------------------------------------
    // 27.09.: dritte Stelle rcRahmenExport — dasselbe Abrufprotokoll fuer die
    // Mobile-/UM-Rahmen des Alle-Projekte-Betriebs, ebenfalls ohne Klick.
    // Zwei weitere Stellen tragen dieselbe alte Wortliste. Sie sind ABSICHTLICH
    // unveraendert und das hier haelt es fest, damit sie nicht als "uebersehen"
    // gelten: beide KLICKEN nichts. Sie lesen nur searchBtn.id und bauen daraus
    // einen JSF-Partial-Ajax-POST (javax.faces.source). Trifft der Sucher dort
    // den falschen Knopf, ist das ein wirkungsloser POST — keine Fehlsteuerung
    // wie beim echten Klick. Ohne Beleg am Portal wird der Live-Pfad nicht
    // angefasst; ein falsch gewaehltes javax.faces.source koennte einen
    // funktionierenden Export kaputtmachen.
    console.log('\n-- 6. Bewusst NICHT angefasst (kein Klick, sondern javax.faces.source) --');
    const posts = ['async function holeExcelVomServer()', 'async function rcFetchRangeBuffer(fromStr, toStr, fullMode)',
                   'async function rcRahmenExport(f)'];
    posts.forEach(kopf => {
      const b = schneide(dash, kopf);
      pruef(kopf.replace(/async function |\(.*/g,'') + ' klickt den Knopf nicht', !!b && !/searchBtn\.click\(\)/.test(b));
      pruef('  ... sondern postet ihn als javax.faces.source', /javax\.faces\.source/.test(b));
    });
    // Jedes Vorkommen muss in einer dieser Stellen stehen — ein viertes ausserhalb
    // waere ein ungeprueftes Klick-Risiko.
    pruef('  ... deshalb steht die alte Wortliste dort noch (3 Vorkommen, je eins pro Stelle)',
      (dash.match(/suchen\|aktualisieren\|filtern\|anzeigen/g) || []).length === 3 &&
      posts.every(k => /suchen\|aktualisieren\|filtern\|anzeigen/.test(schneide(dash, k) || '')),
      String((dash.match(/suchen\|aktualisieren\|filtern\|anzeigen/g) || []).length));

    console.log('\n' + (fehl ? '  ' + ok + ' bestanden, ' + fehl + ' FEHLGESCHLAGEN.'
                              : '  ' + ok + ' bestanden, 0 fehlgeschlagen.') + '\n');
    process.exit(fehl ? 1 : 0);
  }).catch(e => { console.log('  FEHL Lauf abgebrochen: ' + e.message); process.exit(1); });
}
