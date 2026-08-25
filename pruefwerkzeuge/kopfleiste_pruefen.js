/* ============================================================================
   KOPFLEISTE PRUEFEN
   ---------------------------------------------------------------------------
   Aufruf:  node pruefwerkzeuge/kopfleiste_pruefen.js

   Nutzer-Befund 05.10.: "Jetzt ist aufgrund des neuen Buttons oben im Header
   das Einstellungsmenue gar nicht mehr sichtbar ... Das ganze Visuelle regt
   mich auf, dass sich hin- und her verschiebt."

   Gemessen (headless, 1920 px, Zoom-Automatik 150 % = 1280 px nutzbar): die
   Bedienung brauchte 1352 px, das Werkzeug-Menue lag bei x = 2002 ausserhalb
   des Bildes. Und jeder Filterklick verschob alle Bedienelemente um 26 px,
   weil der Reset-Knopf per display ein- und ausgeblendet wurde.

   Drei Regeln, hier festgenagelt:
   1. Menue und Schliessen stehen am rechten Rand und werden nie verdraengt
      (Bedienung rechtsbuendig, Ueberstand wird LINKS beschnitten).
   2. rcKopfEinpassen blendet vorher nach Rangfolge ganze Elemente aus.
   3. Nichts, was erscheint oder seinen Text wechselt, verschiebt ein anderes
      Bedienelement (reservierter Platz, feste Breiten, Zaehler ganz links).

   Die Lage im echten Browser misst dieses Werkzeug NICHT — das war die
   Messung vom 05.10. (zehn Fensterbreiten, drei Zoomstufen, Re-Inject).
   Hier wird die Logik funktional geprueft und die Verdrahtung bewacht.
============================================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'esl_live_arena_v22.js'), 'utf8');

let fehler = 0, geprueft = 0;
function pruefe(name, ok, hinweis) {
  geprueft++;
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FEHL ' + name + (hinweis ? '\n         ' + hinweis : '')); fehler++; }
}
function schneide(quelle, startMarke) {
  const i = quelle.indexOf(startMarke);
  if (i < 0) return null;
  const auf = quelle.indexOf('{', i);
  if (auf < 0) return null;
  let tiefe = 0;
  for (let j = auf; j < quelle.length; j++) {
    const c = quelle[j];
    if (c === '{') tiefe++;
    else if (c === '}') { tiefe--; if (tiefe === 0) return quelle.slice(i, j + 1); }
  }
  return null;
}

console.log('KOPFLEISTE PRUEFEN');

/* ---------------------------------------------------------------------------
   1) Aufbau: drei Bereiche, Menue und Schliessen am rechten Rand
--------------------------------------------------------------------------- */
console.log('\n1) Aufbau der Leiste');

// Auf das Geruest der Leiste eingrenzen (Regel 18: Block, nicht Datei).
const hA = SRC.indexOf('<div class="rc-header">'), hE = SRC.indexOf('<div class="rc-kpi-strip">');
const KOPF = (hA > 0 && hE > hA) ? SRC.slice(hA, hE) : '';
pruefe('Geruest der Kopfleiste gefunden', KOPF.length > 500);

const iMarke = KOPF.indexOf('<div class="rc-header-brand">'), iInfo = KOPF.indexOf('<div class="rc-header-info">'), iCtl = KOPF.indexOf('<div class="rc-header-ctl">');
pruefe('drei Bereiche in der Reihenfolge Marke, Info, Bedienung', iMarke > 0 && iInfo > iMarke && iCtl > iInfo);
pruefe('kein Bereich traegt sein Layout inline (inline schlaegt jede Klassenregel, Fallstrick 20)',
  !/<div style="display:flex/.test(KOPF),
  'Die Bedienung stand bis 05.10. als <div style="display:flex; ..."> im Geruest — sie liess sich per Klasse nicht umstellen.');
const INFO = KOPF.slice(iInfo, iCtl), CTL = KOPF.slice(iCtl);
pruefe('Statuszeile und "Letzter Abschluss" liegen im Info-Bereich (der kuerzt, statt zu draengen)',
  /id="rcFetchStatus"/.test(INFO) && /id="rcLastSale"/.test(INFO) && !/id="rcFetchStatus"|id="rcLastSale"/.test(KOPF.slice(iMarke, iInfo)));

// Reihenfolge der Bedienelemente: der Zaehler zuerst, Menue und Schliessen zuletzt.
const ordnung = ['id="rcOhneStackChip"', 'id="rcQuellenZeit"', 'class="rc-clock"', 'class="rc-pageswitch"', 'id="rcProjWahl"', 'id="rcBtnJetzt"',
  'id="rcBtnAutoRot"', 'id="rcBtnAutoRotQuali"', 'class="rc-filtergroup"', 'class="rc-tools"', 'id="rcBtnToggle"'].map(m => CTL.indexOf(m));
pruefe('alle elf Bedienelemente stehen in der Bedienung', ordnung.every(i => i > 0), ordnung.join(','));
pruefe('der Zaehler "ohne Stack" ist das ERSTE Element (ganz links: sein Erscheinen verschiebt nichts)',
  ordnung[0] > 0 && ordnung.slice(1).every(i => i > ordnung[0]));
pruefe('Werkzeug-Menue und Schliessen sind die LETZTEN Elemente (rechter Rand)',
  ordnung[9] > Math.max.apply(null, ordnung.slice(0, 9)) && ordnung[10] > ordnung[9]);
{
  const fA = CTL.indexOf('<div class="rc-filtergroup"'), fE = CTL.indexOf('<div class="rc-tools">');
  const FLT = CTL.slice(fA, fE);
  pruefe('der Zaehler steht NICHT mehr im Filterblock', fA > 0 && fE > fA && !/rcOhneStackChip/.test(FLT),
    'Dort schob er alle Knoepfe links davon — und bei 150 % das Menue aus dem Bild.');
  pruefe('GEGENPROBE die Bauart bis 05.10. (Zaehler hinter dem Reset-Knopf) wuerde erkannt',
    /rcOhneStackChip/.test(FLT.replace('</div>', '<button class="rc-flt-ohne" id="rcOhneStackChip" style="display:none;"></button></div>')));
  pruefe('der Reset-Knopf startet unsichtbar, aber mit reserviertem Platz (visibility, nicht display)',
    /id="rcFltReset"[^>]*style="visibility:hidden;"/.test(FLT) && !/id="rcFltReset"[^>]*display:none/.test(FLT));
}

/* ---------------------------------------------------------------------------
   2) Stylesheet: rechtsbuendig, links beschnitten, feste Breiten
--------------------------------------------------------------------------- */
console.log('\n2) Stylesheet');

const regel = sel => { const i = SRC.indexOf('\n        ' + sel + '{'); return i < 0 ? '' : SRC.slice(i, SRC.indexOf('}', i) + 1); };
const rCtl = regel('.rc-header-ctl'), rInfo = regel('.rc-header-info'), rMarke = regel('.rc-header-brand');
pruefe('Bedienung: rechtsbuendig und schrumpfbar (justify-content:flex-end, min-width:0)',
  /justify-content:flex-end/.test(rCtl) && /min-width:0/.test(rCtl) && /flex:0 1 auto/.test(rCtl));
pruefe('Bedienung: Ueberstand wird beschnitten, das Aufklapp-Menue darunter bleibt sichtbar (clip nur waagerecht)',
  /overflow-x:clip/.test(rCtl) && /overflow-y:visible/.test(rCtl),
  'overflow:hidden schnitte das Werkzeug-Menue ab, das unter der Leiste aufklappt.');
pruefe('die Bedienelemente selbst schrumpfen nicht', /\.rc-header-ctl > \*\{flex:0 0 auto;\}/.test(SRC));
pruefe('Marke: feste Breite, weicht nie', /flex:0 0 auto/.test(rMarke));
pruefe('Info: nimmt den Rest, einzeilig, kuerzt mit Auslassungspunkten',
  /flex:1 1 0/.test(rInfo) && /min-width:0/.test(rInfo) && /overflow:hidden/.test(rInfo) && /white-space:nowrap/.test(rInfo) &&
  /\.rc-header-info > span\{[^}]*text-overflow:ellipsis/.test(SRC));
pruefe('Filter-Auswahlen haben eine FESTE Breite (nicht max-width: die wuchs mit dem laengsten Eintrag)',
  /\.rc-filtergroup \.rc-flt\{width:112px;/.test(SRC) && !/\.rc-filtergroup \.rc-flt\{max-width/.test(SRC));
pruefe('Quellen-Zeit: Mindestbreite fuer den laengsten Text ("23:59 · vor 89 Min" = 73 px gemessen)',
  /\.rc-quellen b\{[^}]*display:inline-block; min-width:7[4-9]px;/.test(SRC));
pruefe('"Auto" / "Auto AN": Mindestbreite, sonst ruecken die Knoepfe links davon (59 px gemessen)',
  /\.rc-header-ctl #rcBtnAutoRot\{min-width:6\dpx;/.test(SRC));

// Die Stufen duerfen NUR ausblenden, was entbehrlich ist — nie Menue, Schliessen, Filter, Seiten, Projekt.
{
  const stufenRegeln = SRC.match(/\n        \.rc-header\.rc-eng\d[^{]*\{[^}]*\}/g) || [];
  pruefe('vier Enge-Stufen im Stylesheet', [1, 2, 3, 4].every(n => stufenRegeln.some(r => r.indexOf('.rc-eng' + n) > 0)), stufenRegeln.length + ' Regeln');
  const versteckt = stufenRegeln.filter(r => /display:none/.test(r)).map(r => r.slice(0, r.indexOf('{'))).join(' , ');
  pruefe('ausgeblendet werden nur: LIVE, Zusatztext des Zaehlers, Uhr, +Q, Schriftzug, Auto, Quellen-Zeit',
    /rc-live-pill/.test(versteckt) && /rc-flt-ohne span/.test(versteckt) && /rc-clock/.test(versteckt) && /rcBtnAutoRotQuali/.test(versteckt) &&
    /rc-arena-tag/.test(versteckt) && /rc-quellen/.test(versteckt));
  pruefe('NIE ausgeblendet: Werkzeug-Menue, Schliessen, Filter, Seitenwahl, Projektwahl, Jetzt',
    !/rc-tools|rcToolsBtn|rcBtnToggle|rc-filtergroup[^.]*$|rc-pageswitch|rcProjWahl|rcBtnJetzt|rc-flt-reset/.test(versteckt) &&
    !/\.rc-filtergroup(\s*,|\s*$)/.test(versteckt), versteckt);
  pruefe('der Zaehler selbst bleibt in jeder Stufe stehen (nur sein Zusatztext faellt weg)',
    !/\.rc-flt-ohne(\s*,|\s*$)/.test(versteckt), versteckt);
}

/* ---------------------------------------------------------------------------
   3) rcKopfEinpassen — funktional am Original
--------------------------------------------------------------------------- */
console.log('\n3) Einpassen — funktional');

const fitSrc = schneide(SRC, 'function rcKopfEinpassen(){');
pruefe('rcKopfEinpassen laesst sich ausschneiden', !!fitSrc);
pruefe('Funktionsdeklaration, am window abrufbar', /window\.rcKopfEinpassen = rcKopfEinpassen;/.test(SRC));

// Modell der Leiste. Breiten je Stufe aus der Browser-Messung vom 05.10. (Bedienung
// voll belegt mit Projekt-Knoepfen; fester Teil der Marke). Die Bedienung ist
// rechtsbuendig: ihr erstes Element sitzt bei (rechter Rand - Bedarf).
const BEDARF = [1461, 1376, 1134, 1076, 924], MARKE = [197, 128, 128, 32, 32];
function modell(W, opt) {
  opt = opt || {};
  const klassen = new Set(opt.klassen || []);
  const stufe = () => { let s = 0; for (let i = 1; i <= 4; i++) if (klassen.has('rc-eng' + i)) s = i; return s; };
  const rechts = W - 13, links = () => 13 + MARKE[stufe()] + 20;
  const kind = sichtbar => ({ getClientRects: () => (sichtbar ? [1] : []), getBoundingClientRect: () => ({ left: sichtbar ? rechts - BEDARF[stufe()] : -99999 }) });
  const kinder = opt.kinder ? opt.kinder.map(kind) : [kind(true)];
  const ctl = { children: kinder, scrollWidth: 800, clientWidth: 800,
    getBoundingClientRect: () => ({ left: Math.max(links(), rechts - BEDARF[stufe()]) }) };
  const hd = { classList: { toggle: (k, an) => { if (an) klassen.add(k); else klassen.delete(k); } }, querySelector: s => (s === '.rc-header-ctl' && !opt.ohneCtl ? ctl : null) };
  const win = {};
  const doc = { querySelector: s => (s === '#rcLiveDashboard .rc-header' ? hd : null) };
  return { win, doc, klassen, lauf: quell => new Function('window', 'document', quell + '\nreturn rcKopfEinpassen();')(win, doc) };
}
if (fitSrc) {
  const lauf = (W, opt) => { const m = modell(W, opt); const r = m.lauf(fitSrc); return { r, m }; };
  let x = lauf(1920);
  pruefe('1920 px: Stufe 0, keine Enge-Klasse', x.r === 0 && x.m.klassen.size === 0 && x.m.win.rcKopfStufe === 0);
  x = lauf(1600);
  pruefe('1600 px: Stufe 1', x.r === 1 && x.m.klassen.has('rc-eng1') && !x.m.klassen.has('rc-eng2'), 'ist ' + x.r);
  x = lauf(1366);
  pruefe('1366 px: Stufe 2 — die Klassen sind kumulativ (eng1 UND eng2)', x.r === 2 && x.m.klassen.has('rc-eng1') && x.m.klassen.has('rc-eng2') && !x.m.klassen.has('rc-eng3'), 'ist ' + x.r);
  x = lauf(1280);
  pruefe('1280 px (= 1920 bei 150 %): Stufe 3', x.r === 3, 'ist ' + x.r);
  x = lauf(1100);
  pruefe('1100 px: Stufe 4', x.r === 4 && x.m.klassen.size === 4, 'ist ' + x.r);
  x = lauf(900);
  pruefe('900 px: passt auch in Stufe 4 nicht — bleibt bei 4 (nicht 5), alle Klassen gesetzt', x.r === 4 && x.m.klassen.size === 4 && x.m.win.rcKopfStufe === 4, 'ist ' + x.r);
  x = lauf(1920, { klassen: ['rc-eng1', 'rc-eng2', 'rc-eng3'] });
  pruefe('wird es wieder breit, faellt die Stufe zurueck auf 0 (jeder Lauf beginnt bei 0)', x.r === 0 && x.m.klassen.size === 0);
  x = lauf(1366, { kinder: [false, true] });
  pruefe('ein ausgeblendetes erstes Element (Zaehler bei 0) wird uebersprungen — gemessen wird am ersten SICHTBAREN', x.r === 2, 'ist ' + x.r);
  x = lauf(1366, { kinder: [false, false] });
  pruefe('ohne sichtbares Bedienelement: Stufe 0, kein Absturz', x.r === 0);
  x = lauf(1366, { ohneCtl: true });
  pruefe('ohne Bedienung (Leiste noch nicht gebaut): 0, kein Absturz', x.r === 0);
  // GEGENPROBE: scrollWidth taugt hier nicht. Die Bedienung ist rechtsbuendig, der
  // Ueberstand liegt LINKS — und den zaehlt scrollWidth nicht mit (im Browser
  // gemessen: scrollWidth === clientWidth trotz 98 px Ueberstand).
  const blind = fitSrc.replace('erstes.getBoundingClientRect().left >= ctl.getBoundingClientRect().left - 0.5', 'ctl.scrollWidth <= ctl.clientWidth');
  pruefe('GEGENPROBE laesst sich bauen', blind !== fitSrc);
  const b = modell(1366); const rb = b.lauf(blind);
  pruefe('GEGENPROBE eine Messung ueber scrollWidth bliebe bei 1366 px blind auf Stufe 0', rb === 0, 'ist ' + rb);
}
pruefe('gemessen wird ueber getBoundingClientRect auf BEIDEN Seiten (derselbe Massstab — der Zoom faellt heraus, Fallstrick 22a)',
  !!fitSrc && /erstes\.getBoundingClientRect\(\)\.left >= ctl\.getBoundingClientRect\(\)\.left - 0\.5/.test(fitSrc) && !/offsetWidth|offsetLeft|innerWidth/.test(fitSrc));

/* ---------------------------------------------------------------------------
   4) Ausloeser: ResizeObserver, Re-Inject-fest, nie im Rueckruf selbst
--------------------------------------------------------------------------- */
console.log('\n4) Ausloeser');
{
  const a = SRC.indexOf('window.rcKopfEinpassen = rcKopfEinpassen;');
  // Ende = der Aufruf auf Blockebene (Zeilenanfang) — derselbe Text steht auch IM Rueckruf des Beobachters.
  const ENDE = '\n    try { rcKopfEinpassen(); } catch(e){}';
  const e = SRC.indexOf(ENDE, a);
  const BLOCK = (a > 0 && e > a) ? SRC.slice(a, e + ENDE.length) : '';
  // Kommentare heraus, sonst trifft die Pruefung ihre eigene Erklaerung (Falle 1 beim Schreiben der Werkzeuge).
  const CODE = BLOCK.split('\n').filter(z => !/^\s*\/\//.test(z)).join('\n');
  pruefe('Block gefunden', CODE.length > 200);
  pruefe('der alte Beobachter wird VOR dem Neuanlegen getrennt (Re-Inject)',
    CODE.indexOf('window.__rcKopfRO.disconnect()') > 0 && CODE.indexOf('window.__rcKopfRO.disconnect()') < CODE.indexOf('new ResizeObserver('));
  pruefe('ohne ResizeObserver kein Absturz (typeof-Wache)', /if \(typeof ResizeObserver === 'function'\) \{/.test(CODE));
  pruefe('beobachtet werden die Leiste UND jedes Bedienelement (neue Reiter, Projekt-Knoepfe, Zaehler)',
    /window\.__rcKopfRO\.observe\(kopf\);/.test(CODE) && /querySelectorAll\('\.rc-header-ctl > \*'\)/.test(CODE));
  const rueckruf = schneide(CODE, 'new ResizeObserver(function(){') || '';
  pruefe('im Rueckruf wird NICHT direkt eingepasst, sondern per setTimeout danach',
    /setTimeout\(function\(\)\{ kopfWartet = false; try \{ rcKopfEinpassen\(\); \} catch\(e\)\{\} \}, 0\);/.test(rueckruf) &&
    rueckruf.replace(/setTimeout\(function\(\)\{[^\n]*/, '').indexOf('rcKopfEinpassen(') === -1,
    'Ein Groessenwechsel im Rueckruf wirft "ResizeObserver loop"-Fehler — die landen im Flugschreiber.');
  pruefe('kein requestAnimationFrame (steht in Hintergrund-Tabs)', CODE.indexOf('requestAnimationFrame') === -1);
  pruefe('mehrere Meldungen im selben Takt loesen EINEN Lauf aus (kopfWartet)', /if \(kopfWartet\) return;\s*\n\s*kopfWartet = true;/.test(rueckruf));
  pruefe('einmal sofort beim Aufbau', /try \{ rcKopfEinpassen\(\); \} catch\(e\)\{\}\s*$/.test(CODE.trim()));
}

/* ---------------------------------------------------------------------------
   5) Reset-Knopf und Zaehler — funktional
--------------------------------------------------------------------------- */
console.log('\n5) Reset-Knopf und Zaehler — funktional');
{
  const mf = schneide(SRC, 'function rcMarkFilters(){');
  pruefe('rcMarkFilters laesst sich ausschneiden', !!mf);
  const lauf = (quell, werte) => {
    const els = {};
    ['rcStandortFilter', 'rcStackFilter', 'rcTeamFilter'].forEach((id, i) => { els[id] = { disabled: false, value: werte[i], classList: { toggle: () => {} } }; });
    els.rcFltReset = { style: {} };
    new Function('document', quell + '\nrcMarkFilters();')({ getElementById: id => els[id] || null });
    return els.rcFltReset.style;
  };
  if (mf) {
    let st = lauf(mf, ['AL', 'ALL', 'ALL']);
    pruefe('Filter gesetzt: Reset-Knopf sichtbar ueber visibility', st.visibility === 'visible', JSON.stringify(st));
    pruefe('  ... und display wird NICHT angefasst (der Platz bleibt reserviert)', !('display' in st), JSON.stringify(st));
    st = lauf(mf, ['ALL', 'ALL', 'ALL']);
    pruefe('kein Filter: Reset-Knopf unsichtbar, Platz bleibt', st.visibility === 'hidden' && !('display' in st), JSON.stringify(st));
    st = lauf(mf, ['ALL', 'P:kabel', 'ALL']);
    pruefe('auch "<Projekt> gesamt" zaehlt als gesetzter Filter', st.visibility === 'visible');
    // GEGENPROBE: die Bauart bis 05.10. — der Knopf nahm beim Erscheinen 26 px und verschob alles links davon.
    const alt = mf.replace(/const rst = document\.getElementById\('rcFltReset'\);[^\n]*/, "const rst = document.getElementById('rcFltReset'); if (rst) rst.style.display = any ? '' : 'none';");
    pruefe('GEGENPROBE laesst sich bauen', alt !== mf);
    const sa = lauf(alt, ['AL', 'ALL', 'ALL']);
    pruefe('GEGENPROBE die alte Bauart schaltet display (das war der 26-px-Sprung)', 'display' in sa && !('visibility' in sa), JSON.stringify(sa));
  }
  const chip = schneide(SRC, 'function rcOhneStackChip(){');
  pruefe('rcOhneStackChip laesst sich ausschneiden', !!chip);
  if (chip) {
    const lauf2 = n => {
      const el = { style: {}, innerHTML: '', textContent: '', title: '' };
      const liste = []; for (let i = 0; i < n; i++) liste.push({ stueck: 2 });
      new Function('document', 'window', 'rcOhneStackListe', 'rcIstProjektFilter', chip + '\nrcOhneStackChip();')(
        { getElementById: id => (id === 'rcOhneStackChip' ? el : null) }, { rcActiveScope: () => ({ std: 'ALL', stack: 'ALL', team: 'ALL' }) }, () => liste, () => false);
      return el;
    };
    let el = lauf2(67);
    pruefe('Zaehler: Zahl + Zusatz in eigenem <span> (bei Enge bleibt nur die Zahl)', el.innerHTML === '67<span> ohne Stack</span>' && el.style.display === '', el.innerHTML);
    pruefe('  ... der Tooltip nennt Anzahl und Stueck', /67 Agent\(en\) ohne Stack-Zuordnung, 134 St/.test(el.title), el.title.slice(0, 60));
    el = lauf2(0);
    pruefe('Zaehler: bei 0 ausgeblendet', el.style.display === 'none');
  }
}

/* ------------------------------------------------------------------------ */
console.log('');
if (fehler === 0) console.log('ALLE ' + geprueft + ' PRUEFUNGEN BESTANDEN');
else { console.log(fehler + ' von ' + geprueft + ' PRUEFUNGEN FEHLGESCHLAGEN'); process.exitCode = 1; }
