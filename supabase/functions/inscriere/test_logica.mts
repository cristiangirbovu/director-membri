// Test local pentru logica.ts, pe baza reala de referinta.
//   node test_logica.mts
// Ruleaza aceleasi cazuri ca testul original din Apps Script.

import { readFileSync } from 'node:fs';
import { evalueaza, cheieNume, normAutorizatie, valideaza, type Candidat } from './logica.ts';

const CSV = '../../../../microsoft/MJ_referinta_completa.csv';
const rows: Candidat[] = [];
for (const ln of readFileSync(new URL(CSV, import.meta.url), 'utf8').split(/\r?\n/).slice(1)) {
  if (!ln.trim()) continue;
  const c = ln.match(/("([^"]*)"|[^,]*)(,|$)/g)!.map((s) => s.replace(/,$/, '').replace(/^"|"$/g, ''));
  rows.push({ nume: c[0], autorizatie: c[1], limbi: c[2], curte: c[3], cheie: c[5] });
}
const byAuth = new Map<string, Candidat[]>(), byKey = new Map<string, Candidat[]>();
for (const r of rows) {
  const a = normAutorizatie(r.autorizatie);
  if (!byAuth.has(a)) byAuth.set(a, []); byAuth.get(a)!.push(r);
  if (!byKey.has(r.cheie)) byKey.set(r.cheie, []); byKey.get(r.cheie)!.push(r);
}
console.log('referinta incarcata: ' + rows.length + '\n');

const verifica = (d: { nume: string; autorizatie: string; limbi: string[] }) =>
  evalueaza(d, byAuth.get(normAutorizatie(d.autorizatie)) || [], byKey.get(cheieNume(d.nume)) || []);

const pol = rows.find((r) => r.nume.startsWith('Polakowski'))!;
const neerl = rows.find((r) => r.limbi === 'Neerlandeză')!;
const multi = rows.find((r) => r.limbi.split(',').length === 3)!;
const L = (s: string) => s.split(',').map((x) => x.trim());

let ok = 0, pica = 0;
function T(et: string, d: { nume: string; autorizatie: string; limbi: string[] }, asteptat: string) {
  const r = verifica(d);
  const bine = r.verdict === asteptat;
  bine ? ok++ : pica++;
  console.log((bine ? '  OK   ' : '  PICA ') + et.padEnd(50) + r.verdict.padEnd(14) + (bine ? '' : '(asteptat ' + asteptat + ')'));
}

console.log('--- ACCEPTATE ---');
T('nume si numar exacte',            { nume: pol.nume, autorizatie: pol.autorizatie, limbi: L(pol.limbi) }, 'ACCEPTAT');
T('ordine inversata',                { nume: pol.nume.split(' ').reverse().join(' '), autorizatie: pol.autorizatie, limbi: L(pol.limbi) }, 'ACCEPTAT');
T('fara diacritice',                 { nume: pol.nume.normalize('NFD').replace(/[̀-ͯ]/g, ''), autorizatie: pol.autorizatie, limbi: L(pol.limbi) }, 'ACCEPTAT');
T('numar "8422/2005"',               { nume: pol.nume, autorizatie: pol.autorizatie + '/2005', limbi: L(pol.limbi) }, 'ACCEPTAT');
T('numar "nr. 8422"',                { nume: pol.nume, autorizatie: 'nr. ' + pol.autorizatie, limbi: L(pol.limbi) }, 'ACCEPTAT');
T('declara mai putine limbi',        { nume: multi.nume, autorizatie: multi.autorizatie, limbi: [L(multi.limbi)[0]] }, 'ACCEPTAT');
T('eticheta exacta MJ',              { nume: neerl.nume, autorizatie: neerl.autorizatie, limbi: ['Neerlandeză'] }, 'ACCEPTAT');

console.log('\n--- DE VERIFICAT ---');
T('nume de casatorie',               { nume: 'Ionescu ' + pol.nume.split(' ').slice(1).join(' '), autorizatie: pol.autorizatie, limbi: L(pol.limbi) }, 'DE VERIFICAT');
T('nume complet diferit',            { nume: 'Gheorghe Vasilescu Ion', autorizatie: pol.autorizatie, limbi: ['Engleză'] }, 'DE VERIFICAT');
T('limba pe care nu o are',          { nume: pol.nume, autorizatie: pol.autorizatie, limbi: [...L(pol.limbi), 'Japoneză'] }, 'DE VERIFICAT');
T('limba inrudita (Olandeza/Neerl.)', { nume: neerl.nume, autorizatie: neerl.autorizatie, limbi: ['Olandeză'] }, 'DE VERIFICAT');
T('numar gresit, nume in baza',      { nume: pol.nume, autorizatie: '99999', limbi: L(pol.limbi) }, 'DE VERIFICAT');
T('numar lipsa, nume in baza',       { nume: pol.nume, autorizatie: '', limbi: ['Engleză'] }, 'DE VERIFICAT');
T('numar text, nume in baza',        { nume: pol.nume, autorizatie: 'nu stiu', limbi: ['Engleză'] }, 'DE VERIFICAT');

console.log('\n--- RESPINSE ---');
T('numar si nume inexistente',       { nume: 'Qwerty Zxcvbn Asdfgh', autorizatie: '99999', limbi: ['Engleză'] }, 'RESPINS');
T('numar lipsa, nume necunoscut',    { nume: 'Qwerty Zxcvbn Asdfgh', autorizatie: '', limbi: ['Engleză'] }, 'RESPINS');

console.log('\n--- VALIDARE ---');
const v1 = valideaza({ nume: 'Cojocaru Daniela', numar_autorizatie: '1010', limbi: ['Engleză'], judet: 'București',
  localitate: 'București', email: 'Test@Exemplu.RO', consimtamant_prelucrare: true, afisare: 'public' });
console.log((v1.erori.length === 0 ? '  OK   ' : '  PICA ') + 'inscriere valida, email normalizat: ' + v1.date?.email);
const v2 = valideaza({ nume: 'X', limbi: ['Klingoniană'], email: 'nu', afisare: 'ceva' });
console.log((v2.erori.length >= 5 ? '  OK   ' : '  PICA ') + 'inscriere invalida, erori: ' + v2.erori.length);
const v3 = valideaza({ nume: '  Cojocaru   Daniela  ', numar_autorizatie: '1010', limbi: ['Engleză'], judet: 'București',
  localitate: 'B', email: 'a@b.ro', consimtamant_prelucrare: 'true', afisare: 'public' });
console.log((v3.erori.length === 2 ? '  OK   ' : '  PICA ') + 'consimtamant ca string si localitate scurta, erori: ' + v3.erori.join(' | '));

console.log('\n=========================================');
console.log('treceri: ' + ok + '   caderi: ' + pica);
console.log('=========================================');

console.log('\n--- simulare 2.000 inscrieri corecte ---');
let acc = 0, ver = 0, res = 0;
for (let i = 0; i < rows.length; i += Math.floor(rows.length / 2000)) {
  const r = rows[i];
  const v = verifica({ nume: r.nume, autorizatie: r.autorizatie, limbi: L(r.limbi) });
  v.verdict === 'ACCEPTAT' ? acc++ : v.verdict === 'DE VERIFICAT' ? ver++ : res++;
}
console.log(`  ACCEPTAT ${acc}  DE VERIFICAT ${ver}  RESPINS ${res}`);

console.log('\n--- VARIANTE DE DIACRITICE (trebuie toate acceptate si canonice) ---');
for (const [l, j] of [['Engleza', 'Bucuresti'], ['ENGLEZĂ', 'BUCUREŞTI'], ['Engleză'.normalize('NFD'), 'București'.normalize('NFD')]]) {
  const v = valideaza({ nume: 'Cojocaru Daniela', numar_autorizatie: '1010', limbi: [l], judet: j,
    localitate: 'Iași', email: 'a@b.ro', consimtamant_prelucrare: true, afisare: 'public' });
  const ok = v.erori.length === 0 && v.date?.limbi[0] === 'Engleză' && v.date?.judet === 'București';
  console.log((ok ? '  OK   ' : '  PICA ') + JSON.stringify(l) + ' / ' + JSON.stringify(j) + ' -> ' + (v.date ? v.date.limbi[0] + ' / ' + v.date.judet : v.erori.join(' ')));
}
const vx = valideaza({ nume: 'Cojocaru Daniela', numar_autorizatie: '1010', limbi: ['Klingoniană'], judet: 'Atlantida',
  localitate: 'Iași', email: 'a@b.ro', consimtamant_prelucrare: true, afisare: 'public' });
console.log((vx.erori.length === 2 ? '  OK   ' : '  PICA ') + 'limba si judet inexistente -> ' + vx.erori.join(' '));
