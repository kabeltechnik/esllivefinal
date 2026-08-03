# 🚀 ESL Live-Arena v21 + KPI-Website Integration via BroadcastChannel

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (Citrix-Session)               │
├─────────────────────────┬─────────────────────────────────┤
│                         │                                 │
│  TAB 1: ESL-Portal      │   TAB 2: KPI-Website            │
│  ┌───────────────────┐  │   ┌──────────────────────────┐   │
│  │ esl_live_arena    │  │   │  kpi_crawler.js (injiz) │   │
│  │ v21.js (Master)   │  │   │  (Satellite)             │   │
│  │                   │  │   │                          │   │
│  │ - Empfänger       │  │   │ - Scraper der Tabelle    │   │
│  │ - BroadcastChannel│◄─┼───┼─┐ BroadcastChannel Sender│   │
│  │   Listener        │  │   │ └─ sendet alle 30s       │   │
│  │ - Alarm-Logic     │  │   │                          │   │
│  │ - Dashboard-      │  │   └──────────────────────────┘   │
│  │   Render          │  │                                 │
│  └───────────────────┘  │                                 │
│                         │                                 │
└─────────────────────────┴─────────────────────────────────┘
         Same Origin? JA!
      (Citrix-Sandbox)
         ✅ BroadcastChannel funktioniert
         ✅ Keine CORS-Probleme
         ✅ 100% Client-seitig
```

---

## Einsatz-Anleitung

### **Schritt 1: ESL-Dashboard starten (TAB 1)**

Im **WCA/ESL-Portal** (`https://ccs.vodafone.de/...`):

```javascript
// In der Browser-Konsole (F12) einfügen:
// (oder als Bookmarklet speichern)

// Kopiere den KOMPLETTEN Inhalt von: esl_live_arena_v21.js
// und füge ihn in die Konsole ein, dann Enter

// Output: "regiocom esl live-arena v21.0 gestartet"
```

**Ergebnis:**
- ✅ Dashboard lädt auf der rechten Seite
- ✅ Standort-Battle angezeigt
- ✅ Verkaufszahlen live
- ✅ KPI-Empfänger wartet auf Daten

---

### **Schritt 2: KPI-Crawler starten (TAB 2)**

Im **gleichen Browser**, aber in **neuem Tab**:

Navigiere zu: `https://ccs.vodafone.de/cgi-bin/AGENTEN_KENNZAHLEN_2/LIGA_LISTEN_NEW/dist/liga_listen.rb?script_id=11035`

Dann in der Konsole (F12):

```javascript
// Kopiere den KOMPLETTEN Inhalt von: kpi_crawler.js
// und füge ihn in die Konsole ein, dann Enter

// Output: "[KPI Crawler] Gestartet. Polling alle 30s via BroadcastChannel"
```

**Ergebnis:**
- ✅ Crawler lädt
- ✅ Parst die Ligalisten-Tabelle
- ✅ Sendet KPI-Daten alle 30 Sekunden via BroadcastChannel

---

## Was passiert nach dem Start

### **KPI-Datenfluss (alle 30s):**

```
TAB 2 (KPI-Website)
    ↓
Crawler parsed HTML-Tabelle
    ↓
Extrahiert für jeden Agent:
  - agentName: "Ay Vedat"
  - callCount: 26 (aus AHT Nenner)
  - ahtTime: "03:08:47"
  - cs: 88.9%
  - tnps: 12.5%
    ↓
BroadcastChannel.postMessage({
  type: 'KPI_UPDATE',
  payload: { ... }
})
    ↓ (same origin, in-memory)
    ↓
TAB 1 (ESL-Dashboard)
    ↓
rcKpiChannel.onmessage empfängt Daten
    ↓
window.rcKpiData["Ay Vedat"] = { ... }
    ↓
ALARM-CHECK:
  IF callCount >= 20 AND ansprachen < 20% THEN
    ⚠️ WARNUNG: "Nur 15% Ansprachen!"
    (in Console + später im Dashboard)
```

---

## KPI-Metriken erklärt

| Metrik | Quelle | Bedeutung | Action |
|--------|--------|-----------|--------|
| **callCount** | AHT Nenner | Anzahl Anrufe heute | Basis für Ansprachen-Quote |
| **CS** | KPI-Tabelle | Customer Satisfaction % | Qualität der Kundengespräche |
| **TNPS** | KPI-Tabelle | Net Promoter Score % | Kundenbindung, Empfehlungsbereitschaft |
| **ansprachen** | ESL (BNT) | Anzahl Angebote angenommen | Verkaufsabschlüsse |

### **Ansprache-Quote (berechnet):**

```
Ansprache-Quote = (ansprachen im ESL / callCount aus KPI) * 100

Beispiel:
- 26 Calls gemacht (AHT)
- 5 Ansprachen im ESL
- Quote = (5 / 26) * 100 = 19,2%
- ALARM WENN < 20%: ⚠️ "Zu wenig Ansprachen!"
```

---

## Troubleshooting

### **Problem: Daten kommen nicht an**

1. **Sind beide Tabs im selben Browser?**
   - ✅ Ja → OK
   - ❌ Nein → BroadcastChannel funktioniert nur im GLEICHEN Browser

2. **Sind beide Tabs open?**
   - Einer muss aktiv sein, aber der andere sollte mindestens geladen sein
   - ✅ Ja → OK
   - ❌ Nein → Beide öffnen

3. **KPI-Website lädt korrekt?**
   - Die HTML-Tabelle `<table id='result-table'>` muss sichtbar sein
   - Öffne die Konsole (F12) und check: Gibt es Error-Meldungen?

4. **Check in Konsole von TAB 1 (Dashboard):**
   ```javascript
   console.log(window.rcKpiData)  // Sollte Agent-Objekte zeigen
   console.log(window.rcKpiAlarms) // Sollte Alarm-Status zeigen
   ```

5. **Check in Konsole von TAB 2 (Crawler):**
   ```javascript
   // Solltest sehen: "[KPI Crawler] X KPI-Datensätze gesendet"
   // Wenn nicht: Tabelle wurde nicht gefunden
   ```

---

## Nächste Schritte

### **Im Dashboard anzeigen:**

Die KPI-Daten sind jetzt im `window.rcKpiData` verfügbar. Ich werde noch Code hinzufügen für:

1. **Alarm-Widget** im Dashboard
   - Rote Warnung wenn Ansprache-Quote < 20%
   - Mit Agent-Name und Quote-Prozentsatz

2. **Agent-KPI-Card** in der Leaderboard-Section
   - Zeigt neben Verkaufszahlen auch CS + TNPS
   - Färbung: Grün wenn gut, Gelb wenn mittel, Rot wenn schlecht

3. **Motivations-Ticker**
   - Dynamische Sprüche basierend auf Alarmen
   - z.B. "Ay Vedat: Mehr Ansprachen!" wenn Quote zu niedrig

---

## Bookmarklets (optional)

Um die Scripts schneller zu injizieren:

### **Bookmarklet 1: ESL-Dashboard**
```
javascript:(function(){fetch('https://your-server/esl_live_arena_v21.js').then(r=>r.text()).then(code=>eval(code))})();
```

### **Bookmarklet 2: KPI-Crawler**
```
javascript:(function(){fetch('https://your-server/kpi_crawler.js').then(r=>r.text()).then(code=>eval(code))})();
```

(Ersetze `your-server` mit dem tatsächlichen Pfad)

---

## Sicherheit & Browser-Kompatibilität

✅ **BroadcastChannel API Support:**
- Chrome/Edge ≥ 54
- Firefox ≥ 38
- Safari ≥ 15.4
- **❌ IE11:** nicht unterstützt

✅ **Im Citrix-Sandbox:**
- Same-Origin Policy ✅
- Keine Netzwerk-Calls nötig ✅
- 100% clientseitig ✅

---

## Fragen?

Wenn der Crawler nicht funktioniert, check:
1. Ist die KPI-Tabelle auf der Seite sichtbar?
2. Konsolen-Fehler? (F12 → Console)
3. BroadcastChannel ist eine moderne API — nur auf aktuellen Browsern

