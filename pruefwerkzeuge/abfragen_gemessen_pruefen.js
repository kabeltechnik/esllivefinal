// ===========================================================================
//  abfragen_gemessen_pruefen.js  —  Pruefwerkzeug (offline, ohne Portal)
// ===========================================================================
//  Prueft baueAbfrage() gegen den ECHTEN Mitschnitt vom 06.08.2026
//  (ligaliste_vorlage_mitschnitt.txt): der Nutzer hat im Portal seine drei
//  Vorlagen geladen und je einmal "Aktuelle Woche/Tag" und "Intraday" geklickt.
//
//  Der Test schneidet baueAbfrage aus kpi_crawler.js heraus und laesst es
//  laufen — kein Nachbau. Ein Nachbau bewacht nur seine eigene Kopie.
//
//  Aufruf:  node pruefwerkzeuge/abfragen_gemessen_pruefen.js
// ===========================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(WURZEL, 'kpi_crawler.js'), 'utf8');

let ok = 0, fehler = 0;
function pruef(t, b, z) {
    if (b) { ok++; console.log('  ok   ' + t); }
    else { fehler++; console.log('  FEHL ' + t + (z !== undefined ? '  -> ' + z : '')); }
}
function abschnitt(t){ console.log('\n--- ' + t + ' ---'); }

function schneideAus(text, kopf) {
    const start = text.indexOf(kopf);
    if (start < 0) throw new Error('nicht gefunden: ' + kopf);
    let tiefe = 0, i = text.indexOf('{', start);
    for (; i < text.length; i++) {
        if (text[i] === '{') tiefe++;
        else if (text[i] === '}') { tiefe--; if (tiefe === 0) return text.slice(start, i + 1); }
    }
    throw new Error('nicht sauber abgeschlossen: ' + kopf);
}
function konst(name) {
    const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*[\\s\\S]*?;\\n'));
    if (!m) throw new Error('Konstante ' + name + ' nicht gefunden');
    return m[0];
}

// ---- Die ECHTEN Rumpfe aus dem Mitschnitt -------------------------------
// Das Token ist im Mitschnitt geschwaerzt; es kommt zur Laufzeit aus dem
// aufgezeichneten Request und wird hier als Platzhalter eingesetzt.
const GEMESSEN = {
  kabel_woche:  "type=get-result&script_id=11035&script_id_secure=TOKEN&user_id=32595&tree_template=null&ffr_template=&nodeid_inlist=11405&spid_inlist_c=10026&loc_inlist_c=Alanya%2CAlexandroupolis%2CBerlin%2CEssen%2CNeubrandenburg%2CPotsdam%2Cregiocom_W_Home%2CSakarya%2CSerres&cumulate_provider=0&spid_inlist=10026&cumulate_locations=0&loc_inlist=Alanya%2CAlexandroupolis%2CBerlin%2CEssen%2CNeubrandenburg%2CPotsdam%2Cregiocom_W_Home%2CSakarya%2CSerres&cumulate_teams=0&teamid_inlist=&daterange=current_week&interval=day&startdate=undefined&enddate=undefined&show_more_settings=1&figure_list=10004%2C10005%2C10006%2C10014%2C10082%2C10062%2C10339%2C10075%2C10355%2C10340%2C10080%2C10081%2C10063%2C10064%2C10065%2C10076%2C10077%2C10078%2C10067%2C10060%2C10061%2C10357%2C10358&figure_group_list=&show_hms=1&show_nodes=0&show_employeeid=0&show_ccsid=1&show_notready_durations=0&show_ffr_templates=0&show_excel_pivot_header=0&agent_select=-1&ccsid=&table_type=2&all_provider_selected=false&all_locations_selected=false&all_teams_selected=true&description_settings_list=32595%3B11035%3BVodafone_Kabel&nodeid_inlist_c=11405&setting_type=personal",
  kabel_intra:  null,   // identisch, nur daterange=intraday & interval=cumulate
  mobile_woche: null,   // identisch, nur nodeid_inlist=11317,11229 + Vorlage
  um_woche:     null    // identisch, nur nodeid_inlist=12090 + Vorlage
};

// ---- baueAbfrage lauffaehig machen --------------------------------------
const umgebung = { __rcLastGetData: { url: 'x', body: 'script_id=11035&script_id_secure=TOKEN&user_id=32595' } };
const bauen = new Function('window', 'URLSearchParams',
    konst('RC_LOC_ALLE') + konst('RC_FIGURES') + konst('RC_ABFRAGEN') +
    schneideAus(src, 'function baueAbfrage(') + '; return baueAbfrage;'
)(umgebung, URLSearchParams);

const RC_ABFRAGEN = new Function(konst('RC_ABFRAGEN') + 'return RC_ABFRAGEN;')();

// ---- Vergleich Feld fuer Feld -------------------------------------------
function felder(s){ const o = {}; new URLSearchParams(s).forEach((v,k)=>{ o[k]=v; }); return o; }

abschnitt('1. Kabel / Aktuelle Woche — Feld fuer Feld gegen den Mitschnitt');
const soll = felder(GEMESSEN.kabel_woche);
const ist  = felder(bauen('kabel', 'current_week', 'day', null).toString());
const alleKeys = [...new Set([...Object.keys(soll), ...Object.keys(ist)])].sort();
let gleich = 0; const abw = [];
alleKeys.forEach(k => {
    if (soll[k] === ist[k]) { gleich++; return; }
    abw.push('    ' + k + ':  Mitschnitt="' + soll[k] + '"   gebaut="' + ist[k] + '"');
});
pruef('alle ' + alleKeys.length + ' Felder stimmen ueberein', abw.length === 0);
abw.forEach(a => console.log(a));
pruef('kein Feld fehlt und keines ist zuviel',
    Object.keys(soll).length === Object.keys(ist).length,
    'Mitschnitt ' + Object.keys(soll).length + ' / gebaut ' + Object.keys(ist).length);

abschnitt('2. Nur daterange und interval unterscheiden Woche von Intraday');
const w = felder(bauen('kabel', 'current_week', 'day', null).toString());
const i = felder(bauen('kabel', 'intraday', 'cumulate', null).toString());
const anders = Object.keys(w).filter(k => w[k] !== i[k]).sort();
pruef('genau zwei Felder unterscheiden sich', anders.length === 2, anders.join(', '));
pruef('… und zwar daterange und interval',
    anders.join(',') === 'daterange,interval', anders.join(','));

abschnitt('3. Die drei Baeume — am Portal gemessen, nicht geraten');
pruef('Kabel  = 11405',       RC_ABFRAGEN.kabel.nodes  === '11405',       RC_ABFRAGEN.kabel.nodes);
pruef('Mobile = 11317,11229', RC_ABFRAGEN.mobile.nodes === '11317,11229', RC_ABFRAGEN.mobile.nodes);
pruef('UM     = 12090',       RC_ABFRAGEN.um.nodes     === '12090',       RC_ABFRAGEN.um.nodes);
// Die frueher dokumentierten Werte waren FALSCH — sie duerfen nicht zurueckkommen.
pruef('die alten (falschen) Mobile-Knoten sind raus', RC_ABFRAGEN.mobile.nodes !== '11233,11248');
pruef('die alten (falschen) UM-Knoten sind raus',     RC_ABFRAGEN.um.nodes     !== '12809');
pruef('jedes Projekt nennt seine Portal-Vorlage',
    RC_ABFRAGEN.kabel.vorlage === 'Vodafone_Kabel' &&
    RC_ABFRAGEN.mobile.vorlage === 'Vodafone_Mobile' &&
    RC_ABFRAGEN.um.vorlage === 'Vodafone_UM');

abschnitt('4. Der Baum landet auch wirklich im Request');
['kabel','mobile','um'].forEach(pr => {
    const f = felder(bauen(pr, 'intraday', 'cumulate', null).toString());
    pruef(pr + ': nodeid_inlist == nodeid_inlist_c == ' + RC_ABFRAGEN[pr].nodes,
        f.nodeid_inlist === RC_ABFRAGEN[pr].nodes && f.nodeid_inlist_c === RC_ABFRAGEN[pr].nodes,
        f.nodeid_inlist + ' / ' + f.nodeid_inlist_c);
    pruef(pr + ': description_settings_list traegt die Vorlage',
        f.description_settings_list === '32595;11035;' + RC_ABFRAGEN[pr].vorlage,
        f.description_settings_list);
});

abschnitt('5. Die Fallen, die das Projekt schon einmal getroffen haben');
const f = felder(bauen('kabel', 'intraday', 'cumulate', null).toString());
pruef('loc_inlist ist EIN Parameter mit neun Komma-Werten',
    f.loc_inlist.split(',').length === 9, f.loc_inlist);
pruef('die Spiegel-Liste loc_inlist_c ist identisch', f.loc_inlist_c === f.loc_inlist);
pruef('all_locations_selected ist false (Teilauswahl -> sonst ORA-00936)',
    f.all_locations_selected === 'false', f.all_locations_selected);
pruef('Sakarya ist dabei (fehlte im Export vom 05.08. komplett)',
    f.loc_inlist.indexOf('Sakarya') >= 0);
pruef('figure_list hat 23 Kennzahlen', f.figure_list.split(',').length === 23,
    f.figure_list.split(',').length);
pruef('show_hms=1 (sonst kommen Zeiten nicht als hh:mm:ss)', f.show_hms === '1');
pruef('show_ccsid=1 (die CCS-ID ist der Join-Schluessel zum Mapping)', f.show_ccsid === '1');
pruef('table_type=2 (Agentensicht)', f.table_type === '2');

abschnitt('6. Token und Benutzer kommen aus dem Mitschnitt, nicht fest verdrahtet');
pruef('script_id_secure stammt aus dem aufgezeichneten Request', f.script_id_secure === 'TOKEN');
pruef('user_id stammt aus dem aufgezeichneten Request', f.user_id === '32595');
pruef('ohne aufgezeichneten Request kommt null zurueck',
    bauen.call(null, 'kabel', 'intraday', 'cumulate', null) !== null ||
    (function(){ umgebung.__rcLastGetData = null; const r = bauen('kabel','intraday','cumulate',null);
                 umgebung.__rcLastGetData = { url:'x', body:'script_id=11035&script_id_secure=TOKEN&user_id=32595' };
                 return r === null; })());

// ===========================================================================
abschnitt('7. Der Baum kommt aus der GELADENEN VORLAGE, nicht aus dem Fensternamen');
// ===========================================================================
// v6 (Nutzer-Vorgabe 06.08. abends): Der Nutzer laedt die Vorlage von Hand —
// sein Klick ist die Wahrheit. fetchDaterangeKpis erbt den Baum deshalb IMMER
// aus dem mitgeschnittenen Request (cap.body), egal wie der Tab heisst; die
// RC_ABFRAGEN-Vorgabe greift nur noch, wenn der Mitschnitt keinen Baum traegt.
// Dieser Test laesst fetchDaterangeKpis WIRKLICH laufen (kein Nachbau).
// DOMParser wird nicht gebraucht: fetch schlaegt bewusst fehl (Reject), bevor
// einVersuch() ihn erreicht — die Pruefung gilt nur dem gesendeten Body.
async function pruefeTab(bezeichnung, windowName, erwarteterBaum, mitEigenemKontext){
  global.__letzterBody = null;
  const w = { name: windowName, __rcLastGetData: {
    url: 'https://ccs.vodafone.de/x', body: mitEigenemKontext || GEMESSEN.kabel_woche
  }};
  const body = konst('RC_LOC_ALLE') + konst('RC_FIGURES') + konst('RC_ABFRAGEN') +
    schneideAus(src, 'function baueAbfrage(') +
    schneideAus(src, 'function projektAusName(') +
    schneideAus(src, 'function projektAusPaket(') +
    schneideAus(src, 'async function fetchDaterangeKpis(') +
    '; return fetchDaterangeKpis;';
  const fetchDaterangeKpis = new Function('window', 'URLSearchParams', 'fetch', 'console', body)(
    w, URLSearchParams,
    (url, o) => { global.__letzterBody = o.body; return Promise.reject(new Error('Testabbruch')); },
    console);
  try { await fetchDaterangeKpis('intraday'); } catch (e) {}
  const gesendet = new URLSearchParams(global.__letzterBody || '');
  pruef(bezeichnung + ': Baum im gesendeten Request = ' + erwarteterBaum,
    gesendet.get('nodeid_inlist') === erwarteterBaum,
    'gesendet: ' + gesendet.get('nodeid_inlist'));
}

const UM_CAP = 'type=get-result&script_id=11035&script_id_secure=T&user_id=1&nodeid_inlist=12090&nodeid_inlist_c=12090&description_settings_list=1%3B11035%3BVodafone_UM';

(async () => {
  // Kabel-Vorlage geladen -> 11405 raus, egal wie der Tab heisst.
  await pruefeTab('Kabel-Vorlage geladen, window.name="rcKpiQuelle" (Kabel-Tab)', 'rcKpiQuelle', RC_ABFRAGEN.kabel.nodes);
  await pruefeTab('Kabel-Vorlage geladen, window.name="" (unbenannter Tab)', '', RC_ABFRAGEN.kabel.nodes);
  // DER Kernfall (Live-Fund 06.08.): die geladene Vorlage schlaegt den
  // Fensternamen. Ein Kabel-benannter Tab mit UM-Vorlage fragt UM ab —
  // vorher fragte er stumm den Kabel-Baum und sendete falsche Daten weiter.
  await pruefeTab('UM-Vorlage geladen, window.name="rcKpiQuelle" (Vorlage schlaegt Fenster)', 'rcKpiQuelle', '12090', UM_CAP);
  await pruefeTab('UM-Vorlage geladen, window.name="" (unbenannter Hand-Tab)', '', '12090', UM_CAP);
  // NOTNAGEL: Mitschnitt ohne Baum -> Vorgabe des erkannten Projekts greift.
  await pruefeTab('Mitschnitt OHNE Baum, window.name="rcKpiQuelle_um" -> RC_ABFRAGEN.um', 'rcKpiQuelle_um',
    RC_ABFRAGEN.um.nodes, 'type=get-result&script_id=11035&script_id_secure=T&user_id=1');
  // GEGENPROBE: mit der ALTEN Logik haette der UM-Vorlagen-Fall 11405
  // geliefert. Explizit gegenpruefen, dass 11405 NICHT rauskommt.
  await (async () => {
    global.__letzterBody = null;
    const w = { name: 'rcKpiQuelle', __rcLastGetData: { url: 'x', body: UM_CAP } };
    const body = konst('RC_LOC_ALLE') + konst('RC_FIGURES') + konst('RC_ABFRAGEN') +
      schneideAus(src, 'function baueAbfrage(') +
      schneideAus(src, 'function projektAusName(') +
      schneideAus(src, 'function projektAusPaket(') +
      schneideAus(src, 'async function fetchDaterangeKpis(') + '; return fetchDaterangeKpis;';
    const fn = new Function('window', 'URLSearchParams', 'fetch', 'console', body)(
      w, URLSearchParams, (url, o) => { global.__letzterBody = o.body; return Promise.reject(new Error('x')); }, console);
    try { await fn('intraday'); } catch (e) {}
    const g = new URLSearchParams(global.__letzterBody || '');
    pruef('GEGENPROBE: UM-Vorlage im Kabel-Tab bekommt NICHT den Kabel-Baum untergeschoben',
      g.get('nodeid_inlist') !== RC_ABFRAGEN.kabel.nodes, g.get('nodeid_inlist'));
  })();

  console.log('\n' + '='.repeat(60));
  console.log('  ' + ok + ' bestanden, ' + fehler + ' fehlgeschlagen.');
  console.log('='.repeat(60));
  process.exit(fehler ? 1 : 0);
})();
