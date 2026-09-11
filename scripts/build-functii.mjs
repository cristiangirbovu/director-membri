// build-functii.mjs
// Genereaza index.ts (fisierul care se lipeste in dashboard-ul Supabase) din
// logica.ts + server.ts. Editorul din dashboard accepta sigur un singur fisier.
//   node scripts/build-functii.mjs
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const radacina = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(radacina, 'supabase/functions/inscriere');

const logica = readFileSync(resolve(dir, 'logica.ts'), 'utf8');
const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');

// Din server.ts scoatem importul local (logica e inline) si ridicam
// importul npm la inceputul fisierului.
const liniiServer = server.split('\n').filter((l) => !l.startsWith('import { type Candidat'));
const importNpm = liniiServer.find((l) => l.startsWith('import { createClient }'));
const corpServer = liniiServer.filter((l) => l !== importNpm && !l.startsWith('// server.ts') &&
  !l.startsWith('// Invelisul Deno')).join('\n');

// Din logica.ts scoatem antetul de comentarii si cuvantul "export".
const corpLogica = logica.split('\n').slice(5).join('\n').replace(/^export /gm, '');

const out =
  '// index.ts  -  functia de inscriere (Supabase Edge Function, Deno)\n' +
  '// GENERAT din logica.ts + server.ts de scripts/build-functii.mjs. NU se editeaza direct.\n' +
  importNpm + '\n\n' +
  corpLogica.trimEnd() + '\n' +
  corpServer.trimEnd() + '\n';

writeFileSync(resolve(dir, 'index.ts'), out);
console.log('index.ts generat: ' + out.split('\n').length + ' linii');

// copie .txt in folderul proiectului, pentru deschis in Notepad
const txt = resolve(radacina, '..', 'inscriere_index_ts.txt');
if (existsSync(dirname(txt))) { copyFileSync(resolve(dir, 'index.ts'), txt); console.log('copiat: ' + txt); }
