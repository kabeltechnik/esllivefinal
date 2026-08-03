# Prüfwerkzeuge

Kleine Node-Skripte, die beim Nachprüfen des Dashboards helfen. Beide laufen
ohne Portal, ohne Netz und ohne Kosten.

Aufruf jeweils aus diesem Ordner heraus.

## `tdz_pruefen.js` — findet Helfer, die zu früh benutzt werden

```bash
node pruefwerkzeuge/tdz_pruefen.js
```

Sucht Funktionen, die auf IIFE-Ebene per `const`/`let` deklariert sind, aber
weiter oben im Skript schon aufgerufen werden.

**Warum das wichtig ist:** Genau so hat sich das Dashboard beim erneuten
Einfügen in die Konsole selbst lahmgelegt. `tickClock()` läuft sofort beim
Aufbau und benutzt `pad2` — allerdings nur in einem Zweig, den es beim ersten
Laden gar nicht gibt. Auf einem laufenden Wandmonitor gibt es ihn: Das Skript
brach mit `ReferenceError` ab, und alles ab dieser Zeile fehlte — Detail-Modals,
Export, Warteschleife. Ohne Fehlermeldung auf dem Bildschirm.

Sollwert: **0 Treffer**. Jeder Treffer ist eine Zeitbombe, die erst beim
zweiten Einspielen hochgeht.

## `liga_nach_crawlerformat.js` — echte Ligalisten-Daten zum Testen

```bash
node pruefwerkzeuge/liga_nach_crawlerformat.js
```

Liest `ligalisten.xls` und schreibt `liga_echt.json` — genau die Struktur, die
`kpi_crawler.js` ans Dashboard schickt (520 echte Agenten). Damit lässt sich der
Excel-Export mit vollen Daten prüfen, ohne das Portal zu öffnen:

```js
// in der Testseite (test_dashboard_offline.html)
const liga = await (await fetch('liga_echt.json')).json();
window.postMessage({ type: 'KPI_BATCH', payload: liga }, '*');
```

Das Skript meldet nebenbei die Zahlen, an denen sich der First-Time-Fix-Fehler
zeigte:

```
Agenten: 520
  ohne FTF-Basis (Nenner 0/leer): 189
  FTF gepoolt: 66.8 %  (527/789)      <- richtig
  FTF Mittel MIT falschen Nullen: 40.8 %   <- was vorher im Export stand
```

Die 26 Prozentpunkte Unterschied sind die 189 Agenten, die gar keine
First-Time-Fix-Basis haben und trotzdem als „0 %" mitgerechnet wurden.
