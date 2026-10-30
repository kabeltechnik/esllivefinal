// Gemeinsamer Baustein der Pruefwerkzeuge (05.10.2026) — KEIN eigenes Pruefwerkzeug
// (heisst bewusst nicht *_pruefen.js, damit der Sammel-Einzeiler ihn nicht mitzieht).
//
// Seit 05.10. steht die Stack-Zuordnung an EINER Stelle in esl_live_arena_v22.js
// (Mapping, sonst eindeutiger Anker; Filterwert 'P:<projekt>' = ganzes Projekt).
// Jede Funktion, die ein Werkzeug per Klammer-Zaehlung herausschneidet und mit
// new Function auswertet (rcAggAusRows, rcBuildAggSheets, modScopeText, der
// Parser-Vorlauf ...), ruft diese Regel jetzt auf — sie muss also mit in den
// ausgewerteten Quelltext. Damit nicht jedes Werkzeug seine eigene Liste fuehrt
// (und beim naechsten neuen Helfer genau eines vergessen wird), steht sie hier.
//
// quelltext(v22) liefert die ECHTEN Funktionen aus der Quelldatei, kein Nachbau.
// Sie lesen window.rcWcaMapping / rcKpiData / rcRohTeamStack / rcTeamProjekt /
// rcVoProjekt — das aufrufende Werkzeug muss ein `window` bereitstellen.
'use strict';

const KOEPFE = [
    'function rcLigaTeamStack(', 'function rcStackRegel(', 'function rcStackVonTeam(',
    'function rcIstProjektFilter(', 'function rcProjektVonTeam(', 'function rcProjektVonAgent(',
    'function rcStackFilterPasst(', 'function rcStackFilterText(', 'function rcStackName(',
    'function rcProjRahmenListe(', 'function rcProjEintrag(', 'function rcProjektVonStack('
];

function schneide(src, kopf) {
    const a = src.indexOf(kopf);
    if (a < 0) return '';
    let i = src.indexOf('{', a), t = 0;
    for (; i < src.length; i++) { if (src[i] === '{') t++; else if (src[i] === '}' && --t === 0) break; }
    return src.slice(a, i + 1);
}

function quelltext(v22) {
    return KOEPFE.map(function (k) {
        const t = schneide(v22, k);
        if (!t) throw new Error('Stack-Regel: "' + k + '" steht nicht (mehr) in esl_live_arena_v22.js');
        return t;
    }).join('\n');
}

// Zusaetzlich fuer Werkzeuge, die rcBuildAggSheets auswerten: das Blatt
// "Ohne Stack" (05.10.) liest die Liste der Agenten ohne Stack-Zuordnung.
const KOEPFE_BLATT = ['function pad2(', 'function rcTodayKey(', 'function rcOhneStackListe(', 'function rcLueckeGrund(', 'function rcLueckeName('];
function quelltextBlatt(v22) {
    return quelltext(v22) + '\n' + KOEPFE_BLATT.map(function (k) {
        const t = schneide(v22, k);
        if (!t) throw new Error('Stack-Regel: "' + k + '" steht nicht (mehr) in esl_live_arena_v22.js');
        return t;
    }).join('\n');
}

module.exports = { quelltext, quelltextBlatt, KOEPFE, KOEPFE_BLATT, schneide };
