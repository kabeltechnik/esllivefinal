/* =====================================================================
   liga_diagnose.js  (v2)  —  findet heraus, WELCHER Parameter kippt
   =====================================================================
   ANLASS (05.08.): Der Ligalisten-Replay antwortet mit
       HTTP 500  ORA-00936: Ausdruck fehlt
   Der Crawler aendert vier Dinge gleichzeitig (Zeitraum, Kennzahlen,
   Referenzbaum, Standorte) — welches davon der Server ablehnt, steht
   nirgends. Dieses Werkzeug schaltet sie EINZELN dazu.

   v2: braucht KEINEN laufenden Crawler mehr. Die erste Fassung hing an
   window.__rcLastGetData (dem Mitschnitt des Crawler-Hooks); ist der
   Crawler in diesem Tab nicht aktiv, gibt es den nicht. Jetzt wird der
   Request selbst gebaut — Token und Benutzerkennung stehen als versteckte
   Felder in der Seite (#script_id_secure, #user_id).

   AENDERT NICHTS an der Seite. Schickt nur Testanfragen und liest sie.

   BENUTZUNG
     1. Im Ligalisten-Tab F12, Reiter "Konsole".
     2. Beim ersten Mal verlangt Edge, dass man "allow pasting" tippt.
     3. Diesen ganzen Text einfuegen, Enter. Dauert ~10 Sekunden.
     4. Ausgabe herschicken.
   ===================================================================== */
(async function () {
  'use strict';
  var L = function () { console.log.apply(console, ['[Diagnose]'].concat([].slice.call(arguments))); };
  var URL_DATA = location.origin +
    '/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/scripts/get_data.rb';

  function feld(id) { var e = document.getElementById(id); return e ? String(e.value || '') : ''; }
  var TOKEN = feld('script_id_secure');
  var UID   = feld('user_id');
  var SCRIPT = feld('script_id') || '11035';
  if (!TOKEN || !UID) {
    console.error('[Diagnose] Token/Benutzerkennung nicht gefunden. Bin ich wirklich auf der ' +
      'Ligalisten-Seite (liga_listen.rb)? Notfalls die Seite einmal neu laden.');
    return;
  }
  L('Seite   :', location.pathname);
  L('Fenstername:', JSON.stringify(String(window.name || '')) +
    '   (leer = nicht vom Dashboard geoeffnet)');
  L('user_id :', UID, ' script_id:', SCRIPT);
  L('Token   :', TOKEN.slice(0, 12) + '…  (gekuerzt)');

  // ---- Vorlagen im Portal auflisten -----------------------------------
  // Der Nutzer pflegt "Kabel TEC" / "MOB CARE" / "VUM CARE". Hier steht,
  // wie sie WIRKLICH heissen und welche Knoten dahinterstehen — genau das
  // liest der Crawler seit 05.08. abends aus.
  L('');
  L('=== Vorlagen im Referenzbaum-Kasten ===');
  var vorlagen = [];
  try {
    document.querySelectorAll('.crtree-templates-list-entry').forEach(function (e) {
      vorlagen.push({ Name: (e.textContent || '').trim(),
                      Knoten: (e.getAttribute('data-node_ids') || '') });
    });
  } catch (e) {}
  if (!vorlagen.length) L('  (keine gefunden — steht der Kasten auf "Baum" statt "Vorlagen"? Egal fuer den Test.)');
  else {
    // Erst die drei gesuchten, dann der Rest.
    var gesucht = ['kabel tec', 'mob care', 'vum care'];
    vorlagen.filter(function (v) { return gesucht.indexOf(v.Name.toLowerCase()) >= 0; })
            .forEach(function (v) { L('  >>> ' + v.Name + '   ->   ' + v.Knoten); });
    L('  (insgesamt ' + vorlagen.length + ' Vorlagen; volle Liste unten)');
    try { console.table(vorlagen); } catch (e) {}
  }

  // ---- Standorte aus der Seite ----------------------------------------
  var alleStd = [];
  try {
    document.querySelectorAll('#location-list option').forEach(function (o) {
      var v = String(o.value || '').trim();
      if (v && v !== '-1' && v !== '0' && v.indexOf('--') !== 0) alleStd.push(v);
    });
  } catch (e) {}
  if (!alleStd.length) alleStd = ['Alanya','Alexandroupolis','Berlin','Essen',
    'Neubrandenburg','Potsdam','regiocom_W_Home','Sakarya','Serres'];
  L('Standorte aus der Seite:', alleStd.length, JSON.stringify(alleStd));

  // ---- Request-Grundgeruest -------------------------------------------
  // 1:1 die Form, die beim Nutzer nachweislich eine Tabelle geliefert hat.
  var FIG = ['10004','10005','10006','10014','10089','10097','10090','10092','10091',
             '10094','10095','10096','10098','10099','10357','10358','10082','10062',
             '10339','10063','10064','10065','10075','10355','10340','10076','10077',
             '10078','10080','10081','10067','10060','10061'];
  var FIG_PORTAL = feld('figure-list-c');   // die im Portal angehakte Auswahl

  function basis(nodes, figures, loc, art, dr, iv) {
    var p = new URLSearchParams();
    p.set('type', 'get-result');
    p.set('script_id', SCRIPT);
    p.set('script_id_secure', TOKEN);
    p.set('user_id', UID);
    p.set('tree_template', 'null');
    p.set('ffr_template', '');
    p.set('nodeid_inlist', nodes);
    p.set('spid_inlist_c', '10026');
    p.set('cumulate_provider', '0');
    p.set('spid_inlist', '10026');
    p.set('cumulate_locations', '0');
    p.set('cumulate_teams', '0');
    p.set('teamid_inlist', '');
    p.set('daterange', dr);
    p.set('interval', iv);
    p.set('startdate', 'undefined');
    p.set('enddate', 'undefined');
    p.set('show_more_settings', '0');
    p.set('figure_list', figures);
    p.set('figure_group_list', '');
    p.set('show_hms', '1');
    p.set('show_nodes', '0');
    p.set('show_employeeid', '0');
    p.set('show_ccsid', '1');
    p.set('show_notready_durations', '0');
    p.set('show_ffr_templates', '0');
    p.set('show_excel_pivot_header', '0');
    p.set('agent_select', '-1');
    p.set('ccsid', '');
    p.set('table_type', '2');
    p.set('all_provider_selected', 'false');
    p.set('all_teams_selected', 'true');
    p.set('description_settings_list', UID + ';' + SCRIPT + ';Diagnose');
    p.set('nodeid_inlist_c', nodes);
    p.set('setting_type', 'personal');
    // Standorte
    if (art === 'leer+flag') {
      p.set('all_locations_selected', 'true');
    } else {
      p.set('loc_inlist', loc.join(','));
      if (art !== 'nur-liste') p.set('loc_inlist_c', loc.join(','));
      p.set('all_locations_selected', 'false');
    }
    return p;
  }

  async function versuch(name, p) {
    var r, text = '';
    try {
      r = await fetch(URL_DATA, {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
                   'accept': '*/*', 'x-requested-with': 'XMLHttpRequest' },
        body: p.toString()
      });
    } catch (e) { L('FEHLER  ' + name + '  -> Netzwerk: ' + e); return; }
    try { text = await r.text(); } catch (e) {}
    var ora = (text.match(/ORA-\d{5}[^<\n"]*/) || [null])[0];
    var zeilen = (text.match(/<tr[\s>]/gi) || []).length;
    var gut = r.ok && zeilen > 1;
    L((gut ? 'OK      ' : 'PROBLEM ') + name + '  ->  HTTP ' + r.status +
      (ora ? '  ' + ora : '') + '  | Zeilen: ' + zeilen);
    if (!gut && !ora) L('           Antwort-Anfang:', text.slice(0, 180).replace(/\s+/g, ' '));
    return gut;
  }

  var STD = 'liste+spiegel';
  L('');
  L('=== Stufentest ===');
  await versuch('1. Baum 11405 (deine Vorlage) + Portal-Kennzahlen + Woche/Tag',
    basis('11405', FIG_PORTAL || FIG.join(','), alleStd, STD, 'current_week', 'day'));
  await versuch('2. + Zeitraum intraday / kumuliert                          ',
    basis('11405', FIG_PORTAL || FIG.join(','), alleStd, STD, 'intraday', 'cumulate'));
  await versuch('3. + eigene Kennzahl-Liste (33 IDs)                         ',
    basis('11405', FIG.join(','), alleStd, STD, 'intraday', 'cumulate'));
  await versuch('4. Baum 11406 statt 11405 (der alte Verdaechtige)           ',
    basis('11406', FIG.join(','), alleStd, STD, 'intraday', 'cumulate'));

  L('');
  L('=== Standort-Schreibweisen (Baum 11405, intraday) ===');
  for (var art of ['liste+spiegel', 'nur-liste', 'leer+flag']) {
    await versuch('5. ' + art.padEnd(38), basis('11405', FIG.join(','), alleStd, art, 'intraday', 'cumulate'));
  }

  L('');
  L('=== Die anderen beiden Stacks ===');
  await versuch('6. Mobile 11233,11248                                       ',
    basis('11233,11248', FIG.join(','), alleStd, STD, 'intraday', 'cumulate'));
  await versuch('7. UM 12809                                                 ',
    basis('12809', FIG.join(','), alleStd, STD, 'intraday', 'cumulate'));

  L('');
  L('FERTIG. Die ERSTE Zeile mit "PROBLEM" nennt die Ursache.');
  L('Bitte ALLES ab "=== Vorlagen" kopieren und zurueckschicken.');
})();
