// ============================================================================
//  handbetrieb_pruefen.js — die drei Nutzer-Vorgaben vom 14.08.2026
//
//  Woertlich: "ich moechte manuel gehen aber ich brauche ein button wo ich das
//  dashboard starten kann! ich werde bis projekte -> stack waehlen etc. dann
//  moechte ich diese scheiss popups was komt bei bnt oder vvl weg! endgueltig!
//  und ich moechte auch dass Genesysmonitor sich nicht automatisch oeffnet!"
//
//  1) HANDBETRIEB. Der Autopilot darf im Handbetrieb NICHTS mehr anklicken —
//     sonst klickt er dem Nutzer die Auswahl weg, waehrend der gerade Projekt
//     und Stack waehlt. Der Ausstieg muss deshalb VOR allen Navigationszweigen
//     stehen. Die Anmeldehilfe bleibt bewusst an (Edge gibt das gespeicherte
//     Passwort erst nach einer echten Geste frei — das von Hand zu machen war
//     nicht gemeint).
//  2) STARTKNOPF. Ohne once()-Sperre: once() setzt seine Sperre schon beim
//     PRUEFEN, ein Fehlversuch wuerde den Nutzer sonst dauerhaft aussperren.
//  3) ABSCHLUSS-BUEHNE AUS. Es gab window.rcNoCelebrate, aber das ist ein
//     LAUFZEIT-Schalter: nach jedem Seitenaufbau wieder weg. "Endgueltig"
//     heisst Browser-Speicher, und ab Werk aus.
//  4) GENESYS OEFFNET NICHT MEHR SELBST. Ein geaenderter Vorgabewert allein
//     bewirkt hier NICHTS — loadCfg fuellt nur FEHLENDE Schluessel auf, und in
//     rcQueueCfg_v1 steht autoQuelle:true schon drin. Es braucht die Migration
//     mit Marker (derselbe Fallstrick wie bei rotMigriert/texteMigriert2).
// ============================================================================
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const dash = fs.readFileSync(path.join(WURZEL, 'esl_live_arena_v22.js'), 'utf8');
const AUTOS = {
  master: 'esl_autopilot.user.js',
  mobile: 'esl_autopilot_mobile.user.js',
  um:     'esl_autopilot_um.user.js'
};
const auto = fs.readFileSync(path.join(WURZEL, AUTOS.master), 'utf8');

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
// Minimaler localStorage-Ersatz — Citrix erlaubt keine Installation, also kein jsdom.
function speicher(start) {
  const m = Object.assign({}, start || {});
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m };
}

// ============================================================================
console.log('\n-- 1. Abschluss-Buehne: ab Werk AUS und dauerhaft --');
{
  const txt = schneide(dash, 'function rcFeierAus()');
  const setter = schneide(dash, 'window.rcFeier = function (an)');
  pruef('rcFeierAus existiert', !!txt);
  pruef('  ... als Funktionsdeklaration (processDataStream ruft sie weit unterhalb)',
    /^\s*function rcFeierAus\(\)/m.test(dash));

  const bau = (ls) => new Function('localStorage', 'window', txt + '\n' + setter + '\nreturn { aus: rcFeierAus, setz: window.rcFeier };')(ls, {});
  let ls = speicher();                       // frischer Browser, kein Schluessel
  pruef('ohne gespeicherten Wert ist die Buehne AUS', bau(ls).aus() === true);
  ls = speicher({ rcFeierAus: '0' });
  pruef('rcFeierAus="0" schaltet sie AN', bau(ls).aus() === false);
  ls = speicher({ rcFeierAus: '1' });
  pruef('rcFeierAus="1" laesst sie AUS', bau(ls).aus() === true);

  ls = speicher();
  let api = bau(ls);
  api.setz(true);
  pruef('rcFeier(true) schreibt in den Speicher', ls._m.rcFeierAus === '0', ls._m.rcFeierAus);
  pruef('  ... und wirkt sofort', bau(ls).aus() === false);
  api.setz(false);
  pruef('rcFeier(false) schaltet dauerhaft aus', bau(ls).aus() === true);
  pruef('rcFeier() ohne Argument liest nur (schreibt nicht)',
    typeof bau(speicher()).setz() === 'string' && speicher()._m.rcFeierAus === undefined);
  // Ein defekter/gesperrter Speicher darf nicht dazu fuehren, dass die Buehne
  // ploetzlich wieder aufpoppt — im Zweifel AUS.
  const kaputt = { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('gesperrt'); } };
  pruef('bei gesperrtem Speicher bleibt sie AUS (kein Rueckfall auf AN)', bau(kaputt).aus() === true);
}
{
  // Die Buehne haengt an GENAU EINER Stelle — und die muss den Schalter fragen.
  const zeile = (dash.match(/if \(isBnt && isBcr &&[^\n]*queueCelebration\([^\n]*\)/) || [])[0] || '';
  pruef('der Ausloeser fragt rcFeierAus() ab', /!rcFeierAus\(\)/.test(zeile), zeile.slice(0, 90));
  pruef('  ... zusaetzlich zum alten Laufzeit-Schalter rcNoCelebrate', /!window\.rcNoCelebrate/.test(zeile));
  // Es darf nur EINEN automatischen Weg auf die Buehne geben — ein zweiter
  // wuerde den Schalter umgehen und der Nutzer haette die Popups weiter.
  // Der dritte Treffer ist die Definition, der vierte simulateFakeSale: das
  // haengt am Test-Knopf (rcBtnTest) und feuert nur auf ausdruecklichen Klick.
  // Es bleibt bewusst ungebremst — wer "Test" drueckt, will die Buehne sehen.
  const rufe = (dash.match(/(?<![\w$.])queueCelebration\(/g) || []).length;
  pruef('genau drei Fundstellen: Definition, Test-Knopf, ein Ausloeser', rufe === 3, String(rufe));
  pruef('  ... der zweite Aufrufer ist die Test-Funktion',
    /queueCelebration\(names\[/.test(schneide(dash, 'window.simulateFakeSale = function()')));
  pruef('  ... und die haengt an einem Knopf, laeuft also nie von selbst',
    /getElementById\('rcBtnTest'\)\.addEventListener\('click'/.test(dash));
  pruef('  ... im Live-Parser gibt es nur diesen EINEN Aufruf',
    (schneide(dash, 'window.processDataStream = function').match(/queueCelebration\(/g) || []).length === 1);
  // Der Nutzer sprach von "bnt oder vvl" — fuer VVL gab es nie eine Buehne.
  pruef('fuer VVL feuert die Buehne unveraendert NICHT (isBnt ist Bedingung)', /if \(isBnt && isBcr/.test(zeile));
}

// ============================================================================
console.log('\n-- 2. Genesys-Monitor oeffnet sich nicht mehr selbst --');
{
  pruef('Vorgabewert steht auf false', /autoQuelle: false,\s+\/\/ Monitor-Fenster selbst oeffnen/.test(dash));
  const mig = schneide(dash, 'if (!c.autoQuelleAusMigriert)');
  pruef('es gibt eine Migration mit Marker', !!mig);
  pruef('  ... sie setzt autoQuelle auf false', /c\.autoQuelle = false;/.test(mig));
  pruef('  ... und setzt den Marker', /c\.autoQuelleAusMigriert = 1;/.test(mig));
  pruef('  ... und sichert das Ergebnis', /localStorage\.setItem\(CFGK/.test(mig));

  // Funktional: genau EINMAL. Wer danach bewusst wieder einschaltet, behaelt es.
  const lauf = (c) => {
    const ls = speicher();
    new Function('c', 'CFGK', 'localStorage', mig)(c, 'rcQueueCfg_v1', ls);
    return c;
  };
  let c = lauf({ autoQuelle: true });
  pruef('alte Konfiguration mit true wird einmalig umgestellt', c.autoQuelle === false, String(c.autoQuelle));
  pruef('  ... und traegt danach den Marker', c.autoQuelleAusMigriert === 1);
  c.autoQuelle = true;                          // Nutzer schaltet bewusst wieder ein
  c = lauf(c);
  pruef('ein bewusstes Wiedereinschalten bleibt erhalten (Marker greift)',
    c.autoQuelle === true, String(c.autoQuelle));
  // Der zweite Weg, das Fenster loszuwerden, bleibt bestehen.
  pruef('das Fenster laesst sich weiterhin von Hand oeffnen', /rcOpenQueueQuelle/.test(dash));
  pruef('der Haken im Konfigurator bedient weiterhin denselben Schluessel',
    /CFG\.autoQuelle = el\('rcQCfgAutoQ'\)\.checked/.test(dash));
  pruef('autoQuelle() steigt bei false sofort aus', /function autoQuelle\(\)\{\s*\n?\s*if\(!CFG\.autoQuelle\) return;/.test(dash));
}

// ============================================================================
console.log('\n-- 3. Handbetrieb: der Autopilot fasst nichts mehr an --');
{
  const flow = auto.slice(auto.indexOf('function eslFlow()'));
  const posKnopf   = flow.indexOf('startKnopf();');
  const posManuell = flow.indexOf('if (manuell())');
  const posExport  = flow.indexOf("if (id('filterForm') && aufSollProjekt())");
  const posMenue   = flow.indexOf("id('frmMainMenu:mainMenu')");
  const posLogin   = flow.indexOf('if (pw && usable(pw)');
  pruef('der Handbetrieb-Ausstieg steht im Ablauf', posManuell > 0);
  pruef('er steht VOR der Export-Ansicht-Weiche', posManuell < posExport, posManuell + ' / ' + posExport);
  pruef('er steht VOR dem Projekt-Menue', posManuell < posMenue, posManuell + ' / ' + posMenue);
  pruef('aber NACH der Anmeldehilfe (die bleibt an)', posLogin > 0 && posLogin < posManuell);
  pruef('der Startknopf wird vor dem Ausstieg gebaut', posKnopf > 0 && posKnopf < posManuell);
  pruef('der Ausstieg kehrt zurueck (klickt also nichts mehr)',
    /if \(manuell\(\)\) \{[\s\S]{0,260}?return;\s*\}/.test(flow));

  const mTxt = schneide(auto, 'function manuell()');
  const bauM = (ls) => new Function('localStorage', mTxt + '\nreturn manuell;')(ls);
  pruef('ohne gespeicherten Wert ist der Handbetrieb AUS', bauM(speicher())() === false);
  pruef('rcAutoManuell="1" schaltet ihn AN', bauM(speicher({ rcAutoManuell: '1' }))() === true);
  pruef('jeder andere Wert gilt als AUS', bauM(speicher({ rcAutoManuell: 'ja' }))() === false);
  pruef('gesperrter Speicher heisst AUS (Automatik bleibt der Normalfall)',
    bauM({ getItem() { throw new Error('nein'); } })() === false);
}

// ============================================================================
console.log('\n-- 4. Der Startknopf tut, was draufsteht --');
{
  const teile = [
    schneide(auto, 'function knopfWeg()'),
    schneide(auto, 'window.rcAutoStartJetzt = function ()')
  ];
  pruef('rcAutoStartJetzt existiert', !!teile[1]);

  function bau(lage) {
    const spur = { banner: [], gestartet: 0, dialog: 0, knopfDa: true };
    const fenster = { rcLiveInterval: lage.laeuft ? 1 : null, rcAutoSaveDashboard: function(){} };
    const doc = {
      getElementById: (x) => (x === 'rcAutoStartBtn' && spur.knopfDa
        ? { parentNode: { removeChild(){ spur.knopfDa = false; } } }
        : null)
    };
    const rumpf = `
      function id(x){ return lage.filterForm && x === 'filterForm' ? {} : null; }
      function banner(msg, col){ spur.banner.push({ msg: msg, col: col || '' }); }
      function bannerAction(msg, label, fn){ spur.dialog++; }
      function runStored(){ spur.gestartet++; if (lage.hinterlegt) { window.rcLiveInterval = 1; return true; } return false; }
      var CFG = { LS_DASH: 'rcDashboardCode' };
      ${teile.join('\n')}
      return window.rcAutoStartJetzt;
    `;
    const fn = new Function('window', 'document', 'lage', 'spur', rumpf)(fenster, doc, lage, spur);
    return { fn, spur, fenster };
  }

  let { fn, spur } = bau({ filterForm: false, hinterlegt: true });
  let r = fn();
  pruef('ohne Export-Ansicht wird NICHT gestartet', r === false && spur.gestartet === 0);
  pruef('  ... und der Nutzer erfaehrt, was zu tun ist',
    /Export Projektergebnisse/.test(spur.banner[0].msg), spur.banner[0].msg);
  pruef('  ... in Gelb (Hinweis), nicht in Rot', spur.banner[0].col === '#FFB84D');
  pruef('  ... und der Knopf bleibt stehen (zweiter Anlauf moeglich)', spur.knopfDa === true);
  // Genau der Punkt: KEINE once()-Sperre — ein Fehlversuch darf nicht aussperren.
  fn(); fn();
  pruef('mehrfaches Druecken bleibt moeglich (keine once()-Sperre)', spur.banner.length === 3, String(spur.banner.length));

  ({ fn, spur } = bau({ filterForm: true, hinterlegt: true }));
  r = fn();
  pruef('mit Export-Ansicht startet das Dashboard', r === true && spur.gestartet === 1);
  pruef('  ... und der Knopf verschwindet', spur.knopfDa === false);

  ({ fn, spur } = bau({ filterForm: true, hinterlegt: false }));
  r = fn();
  pruef('ohne hinterlegte Datei kommt der Datei-Dialog', r === false && spur.dialog === 1);
  pruef('  ... und der Knopf bleibt stehen', spur.knopfDa === true);

  ({ fn, spur } = bau({ filterForm: true, hinterlegt: true, laeuft: true }));
  r = fn();
  pruef('laeuft das Dashboard schon, wird nicht doppelt gestartet',
    r === true && spur.gestartet === 0, String(spur.gestartet));
  pruef('  ... und der Knopf raeumt sich ab', spur.knopfDa === false);
}

// ============================================================================
console.log('\n-- 5. Alle drei Autopilot-Fassungen tragen den Stand --');
Object.keys(AUTOS).forEach(k => {
  const t = fs.readFileSync(path.join(WURZEL, AUTOS[k]), 'utf8');
  pruef(k + ': Handbetrieb-Schalter', /window\.rcAutoManuell = function/.test(t));
  pruef(k + ': Startknopf', /function startKnopf\(\)/.test(t) && /window\.rcAutoStartJetzt = function/.test(t));
  pruef(k + ': Ausstieg im Ablauf', /if \(manuell\(\)\) \{/.test(t));
  pruef(k + ': Startzeile nennt die neuen Befehle', /rcAutoManuell\(true\) . rcAutoStartJetzt\(\)/.test(t));
});

// ============================================================================
console.log('\n-- 6. Der Weg ZURUECK zum Selbst-Oeffnen --');
// Ein Vorgabewert, den man nur ueber einen Dialog zuruecknehmen kann, ist eine
// Sackgasse: der Haken sitzt im Warteschleifen-Konfigurator, und genau das
// Modul laesst sich mit rcQueueAus(true) samt Dialog abschalten. Nutzer-Frage
// vom 14.08.: "wo kann ich das wieder aktivieren?"
{
  const txt = schneide(dash, 'window.rcQueueAutoQuelle = function(an)');
  pruef('rcQueueAutoQuelle existiert', !!txt);
  const bau = (start) => {
    const spur = { gespeichert: 0, gefahren: 0, versuche: 7 };
    const rumpf = `
      var CFG = { autoQuelle: ${start} };
      var autoQuelleVersuche = spur.versuche;
      function saveCfg(){ spur.gespeichert++; }
      function autoQuelle(){ spur.gefahren++; spur.versuche = autoQuelleVersuche; }
      ${txt}
      return { setz: window.rcQueueAutoQuelle, cfg: CFG };
    `;
    const r = new Function('window', 'spur', rumpf)({}, spur);
    return { setz: r.setz, cfg: r.cfg, spur };
  };
  let a = bau(false);
  pruef('ohne Argument wird nur gelesen', typeof a.setz() === 'string' && a.spur.gespeichert === 0);
  pruef('  ... und die Auskunft nennt den Befehl zum Einschalten',
    /rcQueueAutoQuelle\(true\)/.test(a.setz()), a.setz());
  a = bau(false);
  const rein = a.setz(true);
  pruef('rcQueueAutoQuelle(true) setzt den Schalter', a.cfg.autoQuelle === true);
  pruef('  ... und sichert ihn', a.spur.gespeichert === 1);
  pruef('  ... und faehrt sofort los statt bis zum naechsten Takt zu warten', a.spur.gefahren === 1);
  pruef('  ... mit zurueckgesetztem Zaehler (alte Versuchsreihe gilt nicht weiter)',
    a.spur.versuche === 0, String(a.spur.versuche));
  pruef('  ... und meldet es im Klartext', /oeffnet sich wieder selbst/.test(rein));
  a = bau(true);
  a.setz(false);
  pruef('rcQueueAutoQuelle(false) schaltet wieder aus', a.cfg.autoQuelle === false);
  pruef('  ... und startet dabei NICHTS', a.spur.gefahren === 0);
  pruef('der Haken im Konfigurator bleibt der zweite Weg',
    /id="rcQCfgAutoQ"/.test(dash) && /el\('rcQCfgAutoQ'\)\.checked = !!CFG\.autoQuelle/.test(dash));
}

// ============================================================================
console.log('\n-- 7. Startknopf als Lesezeichen (ohne Starter) --');
{
  const p = path.join(WURZEL, 'Dashboard_Lesezeichen.html');
  pruef('die Seite liegt im Ordner', fs.existsSync(p));
  const html = fs.readFileSync(p, 'utf8');
  const m = html.match(/<textarea id="src" readonly>([\s\S]*?)<\/textarea>/);
  pruef('sie enthaelt genau ein Lesezeichen-Feld', !!m);
  const bm = (m ? m[1] : '').trim();
  pruef('  ... und das ist ein javascript:-Lesezeichen', bm.indexOf('javascript:') === 0);
  const js = bm.replace(/^javascript:/, '');
  let syntaxOk = true, grund = '';
  try { new Function(js); } catch (e) { syntaxOk = false; grund = e.message; }
  pruef('der Lesezeichen-Code ist gueltiges JavaScript', syntaxOk, grund);
  pruef('er startet nur auf der Export-Ansicht (filterForm)', /getElementById\('filterForm'\)/.test(js));
  pruef('  ... und nicht doppelt, wenn das Dashboard laeuft', /W\.rcLiveInterval/.test(js));
  pruef('er nimmt zuerst die mitgelieferte Datei, dann den Speicher',
    js.indexOf('__rcFiles') < js.indexOf('rcDashboardCode'));
  pruef('fehlt beides, fragt er nach der Datei', /type='file'/.test(js) && /FileReader/.test(js));
  pruef('  ... und prueft, ob es wirklich das Dashboard ist',
    /live-arena/.test(js) && /rcLiveDashboard/.test(js));
  pruef('  ... und merkt sie sich fuer das naechste Mal', /localStorage\.setItem\('rcDashboardCode'/.test(js));
  // Citrix hat oft kein Netz fuer Fremdquellen — und eine Startseite, die von
  // aussen nachlaedt, ist genau dann tot, wenn man sie braucht.
  pruef('die Seite laedt nichts aus dem Netz nach',
    !/src\s*=\s*["']https?:/i.test(html) && !/href\s*=\s*["']https?:/i.test(html));
  pruef('  ... und enthaelt keine Emojis (Corporate Design)',
    !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html));
  pruef('das Paket nimmt sie mit',
    /Dashboard_Lesezeichen\.html/.test(fs.readFileSync(path.join(WURZEL, 'bundle_bauen.js'), 'utf8')));

  // Die beiden Crawler-Lesezeichen (16.08.). Anlass: in der Ligaliste stand
  // "gar nichts in der Konsole" - ohne Autopilot in der Seite startet dort auch
  // kein Crawler, und es gab keinen Weg, ihn ohne die ganze Starter-Kette
  // hineinzubekommen.
  const CRAWLER = [
    { feld: 'srcKpi', name: 'KPI-Crawler',  seite: 'liga_listen',
      laeuft: 'kpiCrawlerInterval', schluessel: 'rcWcaCrawlerSrc', quelle: 'kpi',
      marker: 'KPI-Crawler' },
    { feld: 'srcGm',  name: 'Genesys',      seite: 'gm2.rb',
      laeuft: 'RC_GM',              schluessel: 'rcGmCrawlerSrc',  quelle: 'gm',
      marker: 'Warteschleifen-Crawler' },
  ];
  CRAWLER.forEach(c => {
    const mm = html.match(new RegExp('<textarea id="' + c.feld + '" readonly>([\\s\\S]*?)</textarea>'));
    pruef(c.name + '-Lesezeichen ist vorhanden', !!mm);
    if (!mm) return;
    const code = mm[1].trim().replace(/^javascript:/, '');
    let okS = true, gr = '';
    try { new Function(code); } catch (e) { okS = false; gr = e.message; }
    pruef('  ' + c.name + ': gueltiges JavaScript', okS, gr);
    pruef('  ' + c.name + ': laeuft nur auf der richtigen Seite',
      code.indexOf(c.seite) > 0);
    pruef('  ' + c.name + ': startet nicht doppelt',
      new RegExp('W\\.' + c.laeuft).test(code));
    pruef('  ' + c.name + ': erst mitgelieferte Datei, dann Speicher',
      code.indexOf('__rcFiles') < code.indexOf(c.schluessel));
    pruef('  ' + c.name + ': prueft den Marker der gewaehlten Datei',
      code.indexOf("'" + c.marker + "'") > 0,
      'Sonst laesst sich jede beliebige .js einspielen.');
    pruef('  ' + c.name + ': merkt sie sich fuer das naechste Mal',
      new RegExp("setItem\\('" + c.schluessel + "'").test(code));
  });
  // Jeder Knopf braucht seinen href - der wird am Ende der Seite gesetzt.
  ['bm', 'bmKpi', 'bmGm'].forEach(id => {
    pruef('Knopf ' + id + ' bekommt seinen href gesetzt',
      new RegExp("'" + id + "'").test(html) && /setAttribute\('href'/.test(html));
  });
  pruef('der opener-Hinweis steht dabei (ohne ihn funkt der Crawler ins Leere)',
    /window\.opener|<code>window\.opener<\/code>/.test(html));
}

console.log('\n  ' + ok + ' bestanden, ' + (fehl ? fehl + ' FEHLGESCHLAGEN.' : '0 fehlgeschlagen.') + '\n');
process.exit(fehl ? 1 : 0);
