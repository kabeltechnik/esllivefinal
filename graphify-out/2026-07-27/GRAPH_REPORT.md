# Graph Report - ESLLIVE  (2026-07-27)

## Corpus Check
- 17 files · ~1,397,850 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 473 nodes · 978 edges · 29 communities (23 shown, 6 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4a949989`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- esl_live_arena_v21.js
- STANDORT_METADATA Mapping (Code→Name/Nation/Color)
- esl_live_arena_v22.js
- kpi_crawler.js
- rcLgP
- ESL Live-Arena — Projektanweisungen
- normalizeStandort
- REGIOCOM SALES LEAGUE — Finaler Plan (v1.1, 16.07.2026)
- holeExcelVomServer
- rcWarUpdate
- getFlagSvg
- CR-Berechnung Dokument
- AQ (Auflegerquote) ≥85%
- Call-Volumen ≥40 Calls/Tag
- DDS (Deep Detractor Share) ≤5%
- FF7 (Final Fix 7 Tage / Erstlösungsquote) ≥80%
- FQ (Feedbackquote) ≥30%
- package.json
- esc
- restore
- start
- wireBody
- buildHtml
- rcCarouselShow
- makeOrder
- rcWarEnsureBases
- rcSetAutoRot

## God Nodes (most connected - your core abstractions)
1. `save()` - 23 edges
2. `restore()` - 23 edges
3. `wireBody()` - 20 edges
4. `rcWarUpdate()` - 16 edges
5. `esc()` - 15 edges
6. `renderBody()` - 14 edges
7. `reconcileCustom()` - 13 edges
8. `el()` - 13 edges
9. `parseKpiTable()` - 13 edges
10. `normalizeStandort()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `renderMarquee()` --indirect_call--> `q()`  [INFERRED]
  esl_live_arena_v21.js → esl_live_arena_v22.js
- `tickClock()` --calls--> `pad2()`  [INFERRED]
  esl_live_arena_v22.js → kpi_crawler.js
- `rcRowDayKey()` --calls--> `pad2()`  [INFERRED]
  esl_live_arena_v22.js → kpi_crawler.js
- `rcAggregateDayBuffer()` --calls--> `pad2()`  [INFERRED]
  esl_live_arena_v22.js → kpi_crawler.js
- `rcHarvestEslHistory()` --calls--> `pad2()`  [INFERRED]
  esl_live_arena_v22.js → kpi_crawler.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Qualitäts-KPI Zielwerte** — esl_live_kpis_cs, esl_live_kpis_tnps, esl_live_kpis_aht, esl_live_kpis_dds, esl_live_kpis_fq, esl_live_kpis_aq, esl_live_kpis_ff7, esl_live_kpis_call_volumen [EXTRACTED 1.00]
- **Master-Satellite BroadcastChannel Architecture** — esl_live_setup_broadcastchannel_master_tab, esl_live_setup_broadcastchannel_satellite_tab, esl_live_setup_broadcastchannel_broadcastchannel, esl_live_setup_broadcastchannel_esl_portal, esl_live_setup_broadcastchannel_ligaliste [EXTRACTED 1.00]
- **Alle Regiocom Standorte** — esl_live_standort_alanya, esl_live_standort_serres, esl_live_standort_alexandroupolis, esl_live_standort_berlin, esl_live_standort_potsdam, esl_live_standort_essen, esl_live_standort_zeitwert, esl_live_standort_neubrandenburg, esl_live_standort_sakarya [EXTRACTED 1.00]
- **Agent Identity Mapping (CCS-ID → VO-Nummer → Standort)** — esl_live_mitarbeiternamen_ccs_id, esl_live_mitarbeiternamen_vo_nummer, esl_live_mitarbeiternamen_schema [EXTRACTED 1.00]

## Communities (29 total, 6 thin omitted)

### Community 0 - "esl_live_arena_v21.js"
Cohesion: 0.06
Nodes (26): addTicker(), animateCount(), decorate(), detectDataIssues(), flatSheet(), getFlagSvg(), getPortalDateRange(), handleKpiMessage() (+18 more)

### Community 1 - "STANDORT_METADATA Mapping (Code→Name/Nation/Color)"
Cohesion: 0.05
Nodes (41): Multi-Monitor BroadcastChannel Pattern (Offline Dashboard), Citrix Profil-Persistenz (IndexedDB bleibt erhalten), Virtual Scrolling (Citrix-sicheres Large-Dataset Rendering), CR-BNT (Cross-Selling Conversion Rate), CR-VVL (Vertragsverlängerungs Conversion Rate), Neuvertrag (Cross-Selling Abschluss), VVL-Potenzial (Verlängerungsberechtigte Kontakte), BCR-relevant Flag (Ergebnis-Klassifikation) (+33 more)

### Community 2 - "esl_live_arena_v22.js"
Cohesion: 0.05
Nodes (13): animateCount(), decorate(), flatSheet(), getPortalDateRange(), handleKpiMessage(), ingestKpi(), keyOf(), rcLgAgentGoals() (+5 more)

### Community 3 - "kpi_crawler.js"
Cohesion: 0.16
Nodes (35): rcDetailDays(), tickClock(), buildColumnMap(), cellNum(), cellText(), cleanText(), currentDaterange(), datumKey() (+27 more)

### Community 4 - "rcLgP"
Cohesion: 0.19
Nodes (14): rcLgCineBg(), rcLgConfetti(), rcLgCrowd(), rcLgFeed(), rcLgGoal(), rcLgHash(), rcLgImpact(), rcLgP() (+6 more)

### Community 5 - "ESL Live-Arena — Projektanweisungen"
Cohesion: 0.09
Nodes (20): Harte Leitplanken für dieses Modul, Wie du arbeitest, Wo der Code sitzt (esl_live_arena_v22.js, aktuelle Zeilen — bei Änderungen mit grep neu verifizieren), Zwingende Reihenfolge: Erst kritisch prüfen, dann kreativ werden, Aktueller Stand (v22, Juli 2026), Architektur / Cross-Origin, Datenformate (aus echten Exporten verifiziert), ESL Live-Arena — Projektanweisungen (+12 more)

### Community 6 - "normalizeStandort"
Cohesion: 0.09
Nodes (33): classify(), eslOf(), eslOfDay(), ligaOf(), ligaOfDay(), normalizeStandort(), parseDateTime(), rcAccumRow() (+25 more)

### Community 7 - "REGIOCOM SALES LEAGUE — Finaler Plan (v1.1, 16.07.2026)"
Cohesion: 0.10
Nodes (20): 0. Die fünf Grundgesetze (nicht verhandelbar), 1. Liga-Struktur, 2. Tor- und Punktregeln (40/20/20/20 übersetzt), 3. Tagesdramaturgie — vier Akte statt Eliminierung, 4.1 Architektur: Rebuild statt Speicherstand (Citrix-fest), 4.2 Determinismus-Regel für Paarungen und Underdog, 4.3 Spielplan der Woche, 4. Wochenmodus (Stufe 2 — „Champions Week") (+12 more)

### Community 8 - "holeExcelVomServer"
Cohesion: 0.24
Nodes (10): detectDataIssues(), holeExcelVomServer(), rcDlgVisible(), rcJq(), rcKeepAliveTick(), rcNowStamp(), rcSessionLost(), rcSessionWatchTick() (+2 more)

### Community 9 - "rcWarUpdate"
Cohesion: 0.24
Nodes (14): rcWarAddFeed(), rcWarAddFx(), rcWarBoteChip(), rcWarClang(), rcWarDust(), rcWarFloat(), rcWarImpactDamage(), rcWarKingBurst() (+6 more)

### Community 10 - "getFlagSvg"
Cohesion: 0.13
Nodes (20): addTicker(), getFlagSvg(), processCelebrationQueue(), queueCelebration(), rankClass(), rcCkBntSum(), rcCkFilters(), rcCkGesamt() (+12 more)

### Community 17 - "package.json"
Cohesion: 0.18
Nodes (10): author, description, keywords, license, main, name, scripts, test (+2 more)

### Community 18 - "esc"
Cohesion: 0.11
Nodes (31): computeStats(), crocoToast(), D(), el(), enforceOrder(), ensureCrocoPage(), ensureHeaderButton(), ensureModal() (+23 more)

### Community 19 - "restore"
Cohesion: 0.14
Nodes (34): classifyStatus(), rcLgAmbient(), rcLgBall(), rcLgBanner(), rcLgBigBall(), rcLgBigMan(), rcLgCineDraw(), rcLgCineGoal() (+26 more)

### Community 20 - "start"
Cohesion: 0.46
Nodes (8): end(), _pickPair(), rcWarChronik(), rcWarCinema(), rcWarMarkDirty(), rcWarTryFreikauf(), start(), tick()

### Community 21 - "wireBody"
Cohesion: 0.11
Nodes (34): applyAllCustom(), applyCustomStructure(), applyLayout(), applyRadar(), boot(), customFields(), discover(), ensureCustomPages() (+26 more)

### Community 22 - "buildHtml"
Cohesion: 0.27
Nodes (12): buildHtml(), buildPng(), buildXlsx(), collect(), dl(), download(), pad(), rcBuildStandSheets() (+4 more)

### Community 25 - "rcCarouselShow"
Cohesion: 0.33
Nodes (7): on(), rcAutoScrollArm(), rcCarouselAdvance(), rcCarouselShow(), rcCarouselSyncTitle(), rcMarkFilters(), updateTeamFilter()

### Community 26 - "makeOrder"
Cohesion: 0.18
Nodes (11): ageDaysOf(), baseDate(), classifyOrder(), findHeaderRow(), makeOrder(), matchCol(), orderFromObject(), p2() (+3 more)

### Community 27 - "rcWarEnsureBases"
Cohesion: 0.33
Nodes (6): rcWarApplyDayState(), rcWarDayKey(), rcWarEnsureBases(), rcWarPickTarget(), rcWarSaveDayState(), rcWarSpawnBote()

### Community 28 - "rcSetAutoRot"
Cohesion: 0.50
Nodes (4): rcAutoRotSyncBtns(), rcAutoRotToggleQuali(), rcSetAutoRot(), switchPage()

## Knowledge Gaps
- **71 isolated node(s):** `name`, `version`, `description`, `main`, `test` (+66 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `q()` connect `wireBody` to `esl_live_arena_v21.js`, `esl_live_arena_v22.js`, `normalizeStandort`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `renderMarquee()` connect `esl_live_arena_v21.js` to `wireBody`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `pad2()` connect `kpi_crawler.js` to `normalizeStandort`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _71 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `esl_live_arena_v21.js` be split into smaller, more focused modules?**
  _Cohesion score 0.058673469387755105 - nodes in this community are weakly interconnected._
- **Should `STANDORT_METADATA Mapping (Code→Name/Nation/Color)` be split into smaller, more focused modules?**
  _Cohesion score 0.0524390243902439 - nodes in this community are weakly interconnected._
- **Should `esl_live_arena_v22.js` be split into smaller, more focused modules?**
  _Cohesion score 0.051515151515151514 - nodes in this community are weakly interconnected._