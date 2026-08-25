'use strict';
// Ersatz fuer postfach_aktion.ps1 in Pruefungen: schreibt die Argumente ins Protokoll (PF_SCHEIN_PROTOKOLL).
require('fs').appendFileSync(process.env.PF_SCHEIN_PROTOKOLL, JSON.stringify(process.argv.slice(2)) + '\n');
process.stdout.write(JSON.stringify({ ok: true }));
