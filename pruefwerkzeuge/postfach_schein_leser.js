'use strict';
// Ersatz fuer postfach_lesen.ps1 in Pruefungen und Messungen (ESL_DIENST_POSTFACH_LESER).
// Modus aus PF_SCHEIN: ok | umlaut | fehler | kaputt | exit | haengt. Kein Outlook noetig.
const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
const heute = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const tag = pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
const modus = process.env.PF_SCHEIN || 'ok';

function ergebnis(umlaut) {
  return {
    ok: true, ungelesen: 12,
    mails: [
      { entryId: '00AA11BB22CC33DD', zeit: heute + 'T09:15', absender: umlaut ? 'Özdemir, Ünal' : 'Projektleitung', email: 'pl@regiocom.com', betreff: umlaut ? 'Prüfung Größe' : 'Zielvorgabe November', ungelesen: true, vorschau: 'Bitte bis Freitag die Teamziele' },
      { entryId: '00AA11BB22CC33EE', zeit: heute + 'T08:50', absender: 'Chef Beispiel', email: 'chef@firma.de', betreff: 'Besprechung Qualitaet', ungelesen: false, vorschau: 'Kurze Runde heute 14 Uhr' },
      { entryId: '00AA11BB22CC33FF', zeit: heute + 'T09:31', absender: 'Vodafone Disposition', email: 'vodafone-disposition@regiocom.com', betreff: 'MA: Muster, Anna, Grund: KRV, von: ' + tag, ungelesen: true, vorschau: '' }
    ],
    dispo: [
      { entryId: '00AA11BB22CC33FF', zeit: heute + 'T09:31', betreff: 'MA: Muster, Anna, Grund: KRV, von: ' + tag },
      { entryId: '00AA11BB22CC3400', zeit: heute + 'T08:00', betreff: 'MA: Probe, Lena, Auffaelligkeit: AHT hoch' }
    ],
    termine: [{ entryId: '00AA11BB22CC3401', start: '10:30', ende: '11:00', titel: 'Teamleiter-Runde', ganztaegig: false }]
  };
}

if (modus === 'fehler') process.stdout.write(JSON.stringify({ ok: false, grund: 'Outlook (klassisch) nicht erreichbar: Test' }));
else if (modus === 'kaputt') process.stdout.write('kein json');
else if (modus === 'exit') { process.stderr.write('Kaputt XY\nzweite Zeile'); process.exitCode = 3; }
else if (modus === 'haengt') setTimeout(() => process.stdout.write(JSON.stringify(ergebnis(false))), 20000);
else process.stdout.write('\uFEFF' + JSON.stringify(ergebnis(modus === 'umlaut')));   // BOM wie bei einer falsch eingestellten Konsole
