# Bauplan: Update-Paket als eine einzige Textdatei

Übergabe-Dokument für eine KI-Sitzung in einem **anderen** Projekt. Vorlage und
Referenz-Umsetzung: `bundle_bauen.js` im Ordner `CRAW ESL/LIVE ARENA`.

---

## 1. Der Auftrag in einem Satz

Ein Node-Skript soll mehrere Projektdateien Base64-kodiert in **eine** HTML-Datei
legen, die auf einem abgeschotteten Zielrechner im Browser geöffnet wird und die
Dateien dort unter ihren echten Namen wieder herausschreibt — ohne Installation,
ohne Bibliothek, ohne Internetzugang.

---

## 2. Vorprüfung: passt das Verfahren überhaupt?

Nicht ungefragt bauen. Das Verfahren lohnt nur, wenn **alle drei** Punkte zutreffen:

1. Der Zielrechner ist abgeschottet (Citrix, VDI, gesperrter Client) — kein Git,
   kein Netzlaufwerk, kein USB.
2. Der einzige Transportweg ist E-Mail, und der Filter lehnt `.js`, `.cmd`, `.ps1`,
   `.exe` ab — **auch innerhalb von ZIP-Archiven**, weil er hineinschaut.
3. Es geht um mehrere Dateien, die regelmäßig zusammen aktualisiert werden.

Trifft nur einer davon nicht zu, ist der einfachere Weg besser: Git-Repo,
Netzlaufwerk, Cloud-Ordner oder schlicht eine ZIP. Dann diesen Plan verwerfen und
das dem Nutzer sagen.

Gesamtgröße prüfen: Base64 bläht um **+33 %** auf. Bei Gmail liegt die Grenze bei
25 MB pro Mail — also höchstens rund **18 MB Nutzdaten**. Darüber muss aufgeteilt
oder ein anderer Weg gewählt werden.

---

## 3. Was vorab vom Nutzer zu klären ist

1. **Welche Dateien** gehören ins Paket, und welche davon sind Pflicht?
   (Pflicht = fehlt sie, bricht der Bau ab — lieber kein Paket als ein halbes.)
2. **Wohin** gehören sie auf dem Zielrechner — alle in einen Ordner, oder in eine
   Struktur? (Bei Unterordnern: der Einzel-Download kann keine Ordner anlegen,
   dann braucht es den ZIP-Weg mit Pfaden in den Einträgen.)
3. **Wie wird gestartet** nach dem Update? Der Schlusshinweis in der HTML muss den
   konkreten Schritt nennen, sonst steht der Nutzer mit acht Dateien da.

---

## 4. Der Generator (Node, ohne Abhängigkeiten)

Ablauf:

1. Datei-Liste als Konstante am Kopf: `{ name, zweck, pflicht }`.
2. Jede Datei mit `fs.readFileSync` als **Buffer** lesen (nicht als String —
   sonst sind Binärdateien wie `.xlsx` hinterher kaputt).
3. Je Datei berechnen: `sha256` (erste 12 Zeichen, als Transportkontrolle),
   Größe, Änderungsdatum.
4. Fehlt eine Pflichtdatei → Fehlermeldung und `process.exit(1)`.
5. Zeitstempel `JJJJMMTT_HHMM` bilden, Ausgabename daraus.
6. HTML als Template-String zusammensetzen, mit `fs.writeFileSync(..., 'utf8')`
   schreiben.
7. Auf der Konsole ausgeben, was aufgenommen wurde und wie es weitergeht.

Die Nutzdaten kommen als JSON in einen eigenen Block:

```html
<script id="nutzdaten" type="application/json">[{"n":"…","z":"…","d":"<base64>"}]</script>
```

`n` = echter Dateiname, `z` = Name im ZIP, `d` = Base64. Base64 enthält niemals
die Zeichenfolge `</script>`, deshalb ist hier kein weiteres Escaping nötig — der
sonst übliche Escaping-Aufwand entfällt bewusst.

---

## 5. Die erzeugte HTML

Vollständig eigenständig: kein CDN, keine externe Schrift, kein Nachladen. Der
Zielrechner hat unter Umständen keinen Netzzugang, und eine Seite, die auf ein
Skript wartet, das nie kommt, sieht aus wie ein Defekt.

Aufbau:

- **Hauptweg oben:** ein großer Knopf „Alle N Dateien nacheinander speichern".
- **Rückfallebene darunter:** ZIP-Knopf, optisch zurückgenommen.
- **Tabelle:** je Datei Name, Zweck, Größe, Prüfsumme und ein „Einzeln"-Knopf.
- **Störungsliste:** die vier Browser-Abfragen, die kommen werden, im Klartext.
- **Schlusszeile:** der konkrete Startschritt.

### Diese vier Funktionen nicht neu erfinden

**Base64 → Bytes.** `TextEncoder` ist hier falsch und zerstört jede Binärdatei:

```js
function b64ZuBytes(b64) {
  var roh = atob(b64), n = roh.length, out = new Uint8Array(n);
  for (var i = 0; i < n; i++) out[i] = roh.charCodeAt(i);
  return out;
}
```

**Speichern.** Objekt-URL erst verzögert freigeben, sonst bricht der Download ab:

```js
function speichern(name, bytes) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
```

**Alle nacheinander — mit Abstand.** Feuert man die Downloads gleichzeitig ab,
verwirft der Browser einen Teil davon **stillschweigend**; es fehlen dann zwei von
acht Dateien und niemand merkt es:

```js
(function naechste() {
  if (i >= DATEIEN.length) { /* fertig melden */ return; }
  var f = DATEIEN[i++];
  try { speichern(f.n, b64ZuBytes(f.d)); } catch (e) {}
  status.textContent = 'Speichere ' + i + '/' + DATEIEN.length + ': ' + f.n;
  setTimeout(naechste, 700);
})();
```

**ZIP ohne Bibliothek.** CRC-32-Tabelle, Methode 0 (unkomprimiert — Windows liest
das nativ), lokaler Dateikopf je Eintrag, danach Zentralverzeichnis, zum Schluss
End-of-Central-Directory. Alle Zahlen Little-Endian. Im Flags-Feld `0x0800`
setzen, sonst verstümmeln Umlaute in Dateinamen. Die fertige Umsetzung steht in
`bundle_bauen.js` unter `baueZip()` und lässt sich unverändert übernehmen.

---

## 6. Fallstricke — jeder einzelne hart erarbeitet

| # | Falle | Warum |
|---|---|---|
| 1 | Ausgabe heißt **`.txt`**, nicht `.html` | Ein HTML-Anhang wird von manchen Mail-Filtern schon abgewiesen. `.txt` kommt überall durch; auf dem Zielrechner umbenennen. |
| 2 | Im ZIP tragen Skriptdateien ein zusätzliches **`.txt`** | Der Windows-Explorer schreibt aus einem Archiv mit „Mark of the Web" ausführbare Typen gar nicht erst heraus: „Der Zugriff auf die Datei wurde aus Sicherheitsgründen blockiert". |
| 3 | **Einzel-Download ist der Hauptweg**, ZIP die Rückfallebene | Umgekehrt zur Intuition. Ein direkter Browser-Download wird nur mit „Behalten?" abgefragt, nicht blockiert — und die Datei behält ihren echten Namen, es muss nichts umbenannt werden. |
| 4 | Downloads **sequenziell mit ~700 ms** | Parallel abgefeuerte Downloads verwirft der Browser teilweise ohne Meldung. |
| 5 | Dateien als **Buffer** lesen, `atob` byteweise zurück | Ein String-Umweg oder `TextEncoder` zerstört jede Binärdatei (`.xlsx`, `.png`). Fällt bei reinen Textprojekten nie auf. |
| 6 | **Pflicht/optional** unterscheiden, bei Pflichtfehler abbrechen | Ein halbes Paket, das erst auf dem Zielrechner auffällt, kostet einen weiteren Mail-Umlauf. |
| 7 | **Keine externen Ressourcen** | Zielrechner ohne Netz zeigt sonst eine halb geladene Seite. |
| 8 | **Zeitstempel im Dateinamen** | Sonst liegen im Postfach drei Pakete gleichen Namens und keiner weiß, welches aktuell ist. |
| 9 | **SHA-256 (12 Zeichen) je Datei** anzeigen | Einzige Möglichkeit, eine unterwegs beschädigte Datei zu erkennen. |
| 10 | Die **Browser-Abfragen im Voraus** erklären | „Mehrere Dateien herunterladen?" und „Datei kann Ihrem Gerät schaden" sind Standardabfragen. Wer sie nicht erwartet, bricht ab und meldet einen Virenfund. |
| 11 | Hinweis: **Dateinamenerweiterungen einschalten** | Blendet Windows sie aus, benennt der Nutzer beim ZIP-Weg falsch um und wundert sich. |
| 12 | ZIP-Knopf in `try/catch`, Fehler sichtbar melden | Schlägt der ZIP-Bau fehl, muss der Text auf die Einzel-Knöpfe verweisen, statt still nichts zu tun. |
| 13 | Nach dem Bau **Gegenprobe** (siehe unten) | Ein Paket mit dem alten Stand sieht identisch aus und fällt erst auf dem Zielrechner auf. |

---

## 7. Abnahme — vor der Übergabe zu prüfen

1. **Rücklesetest.** Nutzdaten aus dem `<script id="nutzdaten">`-Block dekodieren
   und den SHA-256 jeder Datei gegen das Original prüfen. Muss byteweise gleich sein.
2. **Binärtest.** Mindestens eine Binärdatei (`.xlsx`, `.png`) aufnehmen, aus dem
   Paket herausschreiben und öffnen. Das ist der häufigste stille Fehler.
3. **Inhaltstest.** Auf eine gerade neu eingefügte Zeichenkette prüfen — belegt,
   dass das Paket den aktuellen Stand enthält und nicht einen zwischengespeicherten.
4. **ZIP-Test.** Erzeugtes Archiv in Windows öffnen, Dateinamen mit Umlauten prüfen.
5. **Größentest.** Paketgröße gegen das Mail-Limit halten (Base64 +33 %).

Prüfschritt 1 und 3 in einem Aufruf:

```bash
node -e "const fs=require('fs'),c=require('crypto');const h=fs.readFileSync(process.argv[1],'utf8');const d=JSON.parse(h.match(/<script id=\"nutzdaten\"[^>]*>(.*?)<\/script>/s)[1]);for(const f of d){const b=Buffer.from(f.d,'base64');const o=fs.readFileSync(f.n);console.log(f.n.padEnd(34), b.equals(o)?'identisch':'ABWEICHUNG', b.length)}" veyseLL_Update_JJJJMMTT_HHMM.txt
```

---

## 8. Was projektspezifisch anzupassen ist

- Die **Datei-Liste** samt Zweck-Texten und Pflicht-Kennzeichnung.
- **Paket- und ZIP-Name** (Projektkürzel statt `veyseLL`).
- Der **Schlusshinweis**, wie nach dem Update gestartet wird.
- Optik: Die Vorlage ist dunkel gehalten (`#121212`/`#1D1D1D`, Akzent `#E60000`).
  Farben an das Zielprojekt anpassen, Struktur beibehalten.
- Wenn Unterordner nötig sind: Pfade in die ZIP-Einträge aufnehmen und im Text
  sagen, dass dann der ZIP-Weg der Hauptweg ist — Einzel-Downloads landen alle
  flach im Download-Ordner.

---

## 9. Erwartetes Ergebnis

Ein Skript `bundle_bauen.js` (oder projektüblich benannt), das per `node`
aufgerufen wird, `<Projekt>_Update_JJJJMMTT_HHMM.txt` erzeugt und auf der Konsole
Inhalt, Prüfsummen und die nächsten Schritte ausgibt. Der Bau gehört an das **Ende
jedes Änderungszyklus** — nach Syntaxprüfung und Tests, als letzter Schritt vor der
Rückmeldung an den Nutzer. Eine fertige Änderung ohne frisches Paket erreicht den
Zielrechner nie.
